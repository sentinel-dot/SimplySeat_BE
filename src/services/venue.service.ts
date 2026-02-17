import { createLogger } from '../config/utils/logger';
import {
    Venue,
    VenueWithStaff,
    Service,
    StaffMember
} from '../config/utils/types';
import { getConnection } from '../config/database';
import { AvailabilityService } from './availability.service';

const logger = createLogger('venue.service');

export class VenueService
{
    /**
     * Holt alle aktiven Venues, optional gefiltert nach Typ, Ort/PLZ und Verfügbarkeit (Datum, party_size, Zeitfenster).
     * location: Ort oder PLZ – bei nur Ziffern wird postal_code Prefix-Match, sonst city LIKE verwendet.
     * sort: 'name' (default) oder 'distance' (bei gesetztem location: gleiche Stadt/PLZ zuerst).
     */
    static async getAllVenues(options?: {
        type?: Venue['type'];
        date?: string;
        party_size?: number;
        timeWindowStart?: string;
        timeWindowEnd?: string;
        location?: string;
        sort?: 'name' | 'distance';
    }): Promise<Venue[]>
    {
        const typeFilter = options?.type;
        const filterByAvailability = !!options?.date;
        const location = (options?.location ?? '').trim();
        const sort = options?.sort ?? 'name';
        logger.info('Fetching all venues...', {
            type: typeFilter,
            filterByAvailability,
            date: options?.date,
            location: location || undefined,
            sort
        });

        let conn;
        try
        {
            conn = await getConnection();
            logger.debug('Database connection established');

            let query = `
                SELECT id, name, type, email, phone, address, city, postal_code, country,
                    description, image_url, website_url, booking_advance_days, booking_advance_hours, cancellation_hours,
                    require_phone, require_deposit, deposit_amount, is_active, created_at, updated_at
                FROM venues
                WHERE is_active = true
            `;
            const params: (string | number | Venue['type'])[] = [];
            if (typeFilter) {
                query += ' AND type = ?';
                params.push(typeFilter);
            }
            if (location) {
                const isNumeric = /^\d+$/.test(location);
                if (isNumeric) {
                    query += ' AND (postal_code LIKE ? OR city LIKE ?)';
                    params.push(`${location}%`, `%${location}%`);
                } else {
                    query += ' AND (city LIKE ? OR postal_code LIKE ?)';
                    const term = `%${location}%`;
                    params.push(term, term);
                }
            }
            if (sort === 'distance' && location) {
                const isNumeric = /^\d+$/.test(location);
                if (isNumeric) {
                    query += ' ORDER BY (postal_code = ?) DESC, (postal_code LIKE ?) DESC, name ASC';
                    params.push(location, `${location}%`);
                } else {
                    query += ' ORDER BY (city = ?) DESC, (city LIKE ?) DESC, name ASC';
                    params.push(location, `${location}%`);
                }
            } else {
                query += ' ORDER BY name ASC';
            }

            let venues = await conn.query(query, params) as Venue[];

            if (filterByAvailability && venues.length > 0) {
                const date = options!.date!;
                const partySize = options?.party_size != null && options.party_size >= 1 ? options.party_size : 1;
                const slotOptions = {
                    partySize,
                    timeWindowStart: options?.timeWindowStart,
                    timeWindowEnd: options?.timeWindowEnd
                };

                const venueIds = venues.map(v => v.id);
                const servicesByVenue = await conn.query(`
                    SELECT venue_id, id
                    FROM services
                    WHERE venue_id IN (${venueIds.map(() => '?').join(',')})
                    AND is_active = true
                `, venueIds) as { venue_id: number; id: number }[];

                const venueToServiceIds = new Map<number, number[]>();
                for (const row of servicesByVenue) {
                    const list = venueToServiceIds.get(row.venue_id) ?? [];
                    list.push(row.id);
                    venueToServiceIds.set(row.venue_id, list);
                }
                conn.release();
                conn = null!;

                const venueIdsWithAvailability = new Set<number>();
                await Promise.all(venues.map(async (venue) => {
                    const serviceIds = venueToServiceIds.get(venue.id) ?? [];
                    for (const serviceId of serviceIds) {
                        try {
                            const dayAvailability = await AvailabilityService.getAvailableSlots(
                                venue.id,
                                serviceId,
                                date,
                                slotOptions
                            );
                            const hasSlot = (dayAvailability.time_slots ?? []).some(s => s.available);
                            if (hasSlot) {
                                venueIdsWithAvailability.add(venue.id);
                                return;
                            }
                        } catch {
                            // Einzelner Service-Fehler ignorieren, nächsten versuchen
                        }
                    }
                }));

                venues = venues.filter(v => venueIdsWithAvailability.has(v.id));
                logger.info(`${venues.length} Venues with availability on ${date}`);
            } else {
                logger.info(`${venues.length} Venues fetched successfully`);
            }

            return venues;
        }
        catch (error)
        {
            logger.error('Error fetching venues', error);
            throw error;
        }
        finally
        {
            if (conn)
            {
                conn.release();
                logger.debug('Database connection released');
            }
        }
    }

    /**
     * Holt ein spezifisches Venue mit Services und Staff
     */
    static async getVenueById(venueId: number): Promise<VenueWithStaff | null>
    {
        logger.info(`Fetching venue by ID ${venueId}`);

        let conn;
        try 
        {
            conn = await getConnection();
            logger.debug('Database connection established');

            // Venue abrufen
            const venues = await conn.query(`
                SELECT id, name, type, email, phone, address, city, postal_code, country,
                       description, image_url, website_url, booking_advance_days, booking_advance_hours, cancellation_hours,
                       require_phone, require_deposit, deposit_amount, is_active, created_at, updated_at
                FROM venues
                WHERE id = ?
                AND is_active = true
                LIMIT 1`,
                [venueId]
            ) as Venue[];

            if (venues.length === 0)
            {
                logger.warn(`Venue not found`);
                return null;
            }

            const venue = venues[0];
            //logger.debug('Venue found');

            // Services abrufen
            const services = await conn.query(`
                SELECT id, venue_id, name, description, duration_minutes, price,
                       capacity, requires_staff, is_active, created_at, updated_at
                FROM services
                WHERE venue_id = ?
                AND is_active = true
                ORDER BY name ASC`,
                [venueId]
            ) as Service[];

            // Staff-Mitglieder abrufen
            const staffMembers = await conn.query(`
                SELECT id, venue_id, name, email, phone, 
                       description, is_active, created_at, updated_at
                FROM staff_members
                WHERE venue_id = ?
                AND is_active = true
                ORDER BY name ASC`,
                [venueId]
            ) as StaffMember[];

            // Öffnungszeiten: zuerst Venue-Level, sonst aus Staff-Regeln aggregieren
            let openingHours: { day_of_week: number; start_time: string; end_time: string }[] = [];
            const venueRules = await conn.query(`
                SELECT day_of_week, start_time, end_time
                FROM availability_rules
                WHERE venue_id = ?
                AND is_active = true
                ORDER BY day_of_week, start_time`,
                [venueId]
            ) as { day_of_week: number; start_time: string; end_time: string }[];

            if (venueRules.length > 0) {
                openingHours = venueRules;
            } else if (staffMembers.length > 0) {
                const staffIds = staffMembers.map((s) => s.id);
                const placeholders = staffIds.map(() => '?').join(',');
                const staffRules = await conn.query(`
                    SELECT day_of_week, start_time, end_time
                    FROM availability_rules
                    WHERE staff_member_id IN (${placeholders})
                    AND is_active = true
                    ORDER BY day_of_week, start_time`,
                    staffIds
                ) as { day_of_week: number; start_time: string; end_time: string }[];
                openingHours = staffRules;
            }

            // Venue mit Services, Staff und Öffnungszeiten kombinieren
            const venueWithDetails: VenueWithStaff = {
                ...venue,
                services: services,
                staff_members: staffMembers,
                opening_hours: openingHours
            };

            logger.info('Venue details fetched successfully', venueWithDetails);

            return venueWithDetails;
        } 
        catch (error) 
        {
            logger.error('Error fetching venue by ID', error);
            throw error;
        }
        finally
        {
            if (conn)
            {
                conn.release();
                logger.debug('Database connection released');
            }
        }
    }




    /**
     * Fetch all venues (including inactive) for system admin (role admin)
     */
    static async getAllVenuesForAdmin(): Promise<Venue[]> {
        logger.info('Fetching all venues for admin...');
        let conn;
        try {
            conn = await getConnection();
            const venues = await conn.query(`
                SELECT id, name, type, email, phone, address, city, postal_code, country,
                    description, image_url, website_url, booking_advance_days, booking_advance_hours, cancellation_hours,
                    require_phone, require_deposit, deposit_amount, is_active, created_at, updated_at
                FROM venues
                ORDER BY name ASC
            `) as Venue[];
            logger.info(`${venues.length} venues fetched`);
            return venues;
        } catch (error) {
            logger.error('Error fetching all venues for admin', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Create a new venue (system admin only)
     */
    static async createVenue(data: {
        name: string;
        type: Venue['type'];
        email: string;
        phone?: string;
        address?: string;
        city?: string;
        postal_code?: string;
        country?: string;
        description?: string;
        image_url?: string;
        website_url?: string;
        booking_advance_days?: number;
        booking_advance_hours?: number;
        cancellation_hours?: number;
        require_phone?: boolean;
        require_deposit?: boolean;
        deposit_amount?: number;
        is_active?: boolean;
    }): Promise<Venue> {
        logger.info('Creating venue', { name: data.name, email: data.email });
        let conn;
        try {
            conn = await getConnection();
            const result = await conn.query(
                `INSERT INTO venues (
                    name, type, email, phone, address, city, postal_code, country,
                    description, image_url, website_url, booking_advance_days, booking_advance_hours, cancellation_hours,
                    require_phone, require_deposit, deposit_amount, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.name,
                    data.type,
                    data.email,
                    data.phone ?? null,
                    data.address ?? null,
                    data.city ?? null,
                    data.postal_code ?? null,
                    data.country ?? 'DE',
                    data.description ?? null,
                    data.image_url ?? null,
                    data.website_url ?? null,
                    data.booking_advance_days ?? 30,
                    data.booking_advance_hours ?? 48,
                    data.cancellation_hours ?? 24,
                    data.require_phone ?? false,
                    data.require_deposit ?? false,
                    data.deposit_amount ?? null,
                    data.is_active !== false,
                ]
            );
            const insertResult = result as { insertId: number };
            const id = insertResult.insertId;
            const rows = await conn.query(
                'SELECT id, name, type, email, phone, address, city, postal_code, country, description, image_url, website_url, booking_advance_days, booking_advance_hours, cancellation_hours, require_phone, require_deposit, deposit_amount, is_active, created_at, updated_at FROM venues WHERE id = ?',
                [id]
            ) as Venue[];
            return rows[0];
        } catch (error) {
            logger.error('Error creating venue', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Update venue (system admin only)
     */
    static async updateVenue(
        venueId: number,
        updates: {
            name?: string;
            type?: Venue['type'];
            email?: string;
            phone?: string;
            address?: string;
            city?: string;
            postal_code?: string;
            country?: string;
            description?: string;
            image_url?: string;
            website_url?: string;
            booking_advance_days?: number;
            booking_advance_hours?: number;
            cancellation_hours?: number;
            require_phone?: boolean;
            require_deposit?: boolean;
            deposit_amount?: number;
            is_active?: boolean;
        }
    ): Promise<Venue> {
        logger.info('Updating venue', { venueId, updates });
        let conn;
        try {
            conn = await getConnection();
            const existing = await conn.query('SELECT id FROM venues WHERE id = ?', [venueId]) as { id: number }[];
            if (existing.length === 0) {
                throw new Error('Venue not found');
            }
            const fields: string[] = [];
            const values: (string | number | boolean | null)[] = [];
            const map: Record<string, unknown> = {
                name: updates.name,
                type: updates.type,
                email: updates.email,
                phone: updates.phone,
                address: updates.address,
                city: updates.city,
                postal_code: updates.postal_code,
                country: updates.country,
                description: updates.description,
                image_url: updates.image_url,
                website_url: updates.website_url,
                booking_advance_days: updates.booking_advance_days,
                booking_advance_hours: updates.booking_advance_hours,
                cancellation_hours: updates.cancellation_hours,
                require_phone: updates.require_phone,
                require_deposit: updates.require_deposit,
                deposit_amount: updates.deposit_amount,
                is_active: updates.is_active,
            };
            for (const [key, val] of Object.entries(map)) {
                if (val !== undefined) {
                    fields.push(`${key} = ?`);
                    values.push(val as string | number | boolean | null);
                }
            }
            if (fields.length === 0) {
                const rows = await conn.query(
                    'SELECT id, name, type, email, phone, address, city, postal_code, country, description, image_url, website_url, booking_advance_days, booking_advance_hours, cancellation_hours, require_phone, require_deposit, deposit_amount, is_active, created_at, updated_at FROM venues WHERE id = ?',
                    [venueId]
                ) as Venue[];
                return rows[0];
            }
            values.push(venueId);
            await conn.query(
                `UPDATE venues SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
                values
            );
            const rows = await conn.query(
                'SELECT id, name, type, email, phone, address, city, postal_code, country, description, image_url, website_url, booking_advance_days, booking_advance_hours, cancellation_hours, require_phone, require_deposit, deposit_amount, is_active, created_at, updated_at FROM venues WHERE id = ?',
                [venueId]
            ) as Venue[];
            return rows[0];
        } catch (error) {
            logger.error('Error updating venue', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Get venue by ID (including inactive) for system admin (role admin)
     */
    static async getVenueByIdForAdmin(venueId: number): Promise<Venue | null> {
        let conn;
        try {
            conn = await getConnection();
            const venues = await conn.query(`
                SELECT id, name, type, email, phone, address, city, postal_code, country,
                    description, image_url, website_url, booking_advance_days, booking_advance_hours, cancellation_hours,
                    require_phone, require_deposit, deposit_amount, is_active, created_at, updated_at
                FROM venues WHERE id = ?
            `, [venueId]) as Venue[];
            return venues.length > 0 ? venues[0] : null;
        } catch (error) {
            logger.error('Error fetching venue for admin', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Öffentliche Statistiken für Homepage (Social Proof): Anzahl aktiver Venues, Buchungen diesen Monat.
     */
    static async getPublicStats(): Promise<{ venueCount: number; bookingCountThisMonth: number }> {
        let conn;
        try {
            conn = await getConnection();
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const startStr = startOfMonth.toISOString().slice(0, 19).replace('T', ' ');
            const [venueRows, bookingRows] = (await Promise.all([
                conn.query('SELECT COUNT(*) AS c FROM venues WHERE is_active = true'),
                conn.query('SELECT COUNT(*) AS c FROM bookings WHERE created_at >= ? AND status != ?', [startStr, 'cancelled'])
            ])) as { c: number | bigint }[][];
            const venueCount = Number(venueRows[0]?.c ?? 0);
            const bookingCountThisMonth = Number(bookingRows[0]?.c ?? 0);
            return { venueCount, bookingCountThisMonth };
        } catch (error) {
            logger.error('Error fetching public stats', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Prüft ob Venue existiert und aktiv ist
     */
    static async venueExists(venueId: number): Promise<boolean>
    {
        logger.debug(`Checking if venue [${venueId}] exists...`);

        let conn;
        try 
        {
            conn = await getConnection();

            const venues = await conn.query(`
                SELECT id
                FROM venues
                WHERE id = ?
                AND is_active = true
                LIMIT 1`,
                [venueId]
            ) as { id: number }[];

            const exists = venues.length > 0;

            if (!exists) 
            {
                logger.warn('Venue does not exist or is inactive');
            }

            return exists;
        } 
        catch (error) 
        {
            logger.error('Error checking venue existence', error);
            throw error;
        }
        finally
        {
            if (conn)
            {
                conn.release();
            }
        }
    }
}