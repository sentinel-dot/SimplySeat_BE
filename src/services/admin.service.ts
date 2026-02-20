/**
 * Admin Service (System)
 * Venues verwalten, User verwalten, globale Stats. Rolle: admin.
 */

import { getConnection } from '../config/database';
import { createLogger } from '../config/utils/logger';
import { VenueService } from './venue.service';
import { hashPassword } from './auth.service';
import { AdminUserPublic, AdminRole, CustomerPublic } from '../config/utils/types';
import { Venue } from '../config/utils/types';

const VALID_VENUE_TYPES = ['restaurant', 'hair_salon', 'beauty_salon', 'cafe', 'bar', 'spa', 'other'] as const;

export interface CreateVenueFullPayload {
    venue: {
        name: string;
        type: typeof VALID_VENUE_TYPES[number];
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
    };
    owner: {
        email: string;
        password: string;
        name: string;
    };
    /** Indizes der Services (0-basiert), die der Owner durchführt; fehlt oder leer = alle */
    owner_service_indices?: number[];
    staff?: Array<{
        name: string;
        email?: string;
        phone?: string;
        description?: string;
        /** Indices into services array (0-based) for staff_services link */
        service_indices?: number[];
    }>;
    services?: Array<{
        name: string;
        description?: string;
        duration_minutes: number;
        price?: number;
        capacity?: number;
        requires_staff?: boolean;
    }>;
    opening_hours?: Array<{
        day_of_week: number;
        start_time: string;
        end_time: string;
    }>;
}

const logger = createLogger('admin.service');

export interface AdminWithVenue extends AdminUserPublic {
    venue_name: string | null;
    is_active: boolean;
    last_login: Date | null;
    created_at: Date;
}

export interface CustomerWithStats extends CustomerPublic {
    total_bookings: number;
    completed_bookings: number;
    cancelled_bookings: number;
    total_spent: number;
}

export interface GlobalStats {
    venues: { total: number; active: number };
    admins: { total: number; active: number };
    customers: { total: number; active: number };
    /** User-Anzahl pro Rolle (admin = System-Admin, owner, staff) */
    usersByRole: { admin: number; owner: number; staff: number };
    bookings: {
        total: number;
        pending: number;
        confirmed: number;
        cancelled: number;
        completed: number;
        thisMonth: number;
    };
}

export class AdminService {
    static async listVenues(): Promise<Venue[]> {
        return VenueService.getAllVenuesForAdmin();
    }

    static async createVenue(data: Parameters<typeof VenueService.createVenue>[0]): Promise<Venue> {
        return VenueService.createVenue(data);
    }

    static async updateVenue(id: number, updates: Parameters<typeof VenueService.updateVenue>[1]): Promise<Venue> {
        return VenueService.updateVenue(id, updates);
    }

    static async getVenue(id: number): Promise<Venue | null> {
        return VenueService.getVenueByIdForAdmin(id);
    }

    /**
     * Create venue with owner, staff, services and opening hours in one transaction.
     */
    static async createVenueFull(payload: CreateVenueFullPayload): Promise<{ venue: Venue; venueId: number }> {
        const { venue: vData, owner: oData, owner_service_indices: ownerServiceIndices, staff: staffList = [], services: servicesList = [], opening_hours: hoursList = [] } = payload;

        if (!vData?.name || !vData?.type || !vData?.email) {
            throw new Error('Venue: Name, Typ und E-Mail sind erforderlich');
        }
        if (!VALID_VENUE_TYPES.includes(vData.type as typeof VALID_VENUE_TYPES[number])) {
            throw new Error('Ungültiger Venue-Typ');
        }
        if (!oData?.email || !oData?.password || !oData?.name) {
            throw new Error('Owner: E-Mail, Passwort und Name sind erforderlich');
        }
        if (oData.password.length < 8) {
            throw new Error('Owner-Passwort muss mindestens 8 Zeichen haben');
        }
        const validServices = (servicesList ?? []).filter((s) => s.name?.trim() && s.duration_minutes >= 1);
        if (validServices.length === 0) {
            throw new Error('Mindestens ein Service mit Name und Dauer ist erforderlich');
        }

        const conn = await getConnection();
        try {
            await conn.beginTransaction();

            const existingUser = await conn.query('SELECT id FROM users WHERE email = ?', [oData.email.trim().toLowerCase()]) as { id: number }[];
            if (existingUser.length > 0) {
                throw new Error('Owner-E-Mail wird bereits verwendet');
            }

            // Jeder Mitarbeiter muss mindestens einem Service zugeordnet sein (Services können standardmäßig vom Owner durchgeführt werden)
            const servicesCount = servicesList.filter((s) => s.name?.trim() && s.duration_minutes >= 1).length;
            for (const st of staffList) {
                if (!st.name?.trim()) continue;
                const indices = st.service_indices ?? [];
                const validCount = indices.filter((j) => j >= 0 && j < servicesCount).length;
                if (servicesCount > 0 && validCount === 0) {
                    throw new Error('Jeder Mitarbeiter muss mindestens einem Service zugeordnet werden.');
                }
            }

            const venueResult = await conn.query(
                `INSERT INTO venues (
                    name, type, email, phone, address, city, postal_code, country,
                    description, image_url, website_url, booking_advance_days, booking_advance_hours, cancellation_hours,
                    require_phone, require_deposit, deposit_amount, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    vData.name,
                    vData.type,
                    vData.email,
                    vData.phone ?? null,
                    vData.address ?? null,
                    vData.city ?? null,
                    vData.postal_code ?? null,
                    vData.country ?? 'DE',
                    vData.description ?? null,
                    vData.image_url ?? null,
                    vData.website_url ?? null,
                    vData.booking_advance_days ?? 30,
                    vData.booking_advance_hours ?? 48,
                    vData.cancellation_hours ?? 24,
                    vData.require_phone ?? false,
                    vData.require_deposit ?? false,
                    vData.deposit_amount ?? null,
                    vData.is_active !== false,
                ]
            ) as { insertId: number };
            const venueId = venueResult.insertId;

            const password_hash = await hashPassword(oData.password);
            await conn.query(
                `INSERT INTO users (email, password_hash, name, venue_id, role) VALUES (?, ?, ?, ?, ?)`,
                [oData.email.trim().toLowerCase(), password_hash, oData.name.trim(), venueId, 'owner']
            );
            const ownerRows = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [oData.email.trim().toLowerCase()]) as { id: number }[];
            const ownerId = ownerRows[0]?.id;
            if (!ownerId) throw new Error('Owner-User konnte nicht ermittelt werden');

            const serviceIds: number[] = [];
            for (const s of servicesList) {
                if (!s.name || s.duration_minutes == null || s.duration_minutes < 1) continue;
                const r = await conn.query(
                    `INSERT INTO services (venue_id, name, description, duration_minutes, price, capacity, requires_staff) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        venueId,
                        s.name,
                        s.description ?? null,
                        s.duration_minutes,
                        s.price ?? null,
                        s.capacity ?? 1,
                        s.requires_staff ?? false,
                    ]
                ) as { insertId: number };
                serviceIds.push(r.insertId);
            }

            const staffIds: number[] = [];
            for (const st of staffList) {
                if (!st.name?.trim()) continue;
                const r = await conn.query(
                    `INSERT INTO staff_members (venue_id, user_id, name, email, phone, description) VALUES (?, NULL, ?, ?, ?, ?)`,
                    [venueId, st.name.trim(), st.email?.trim() || null, st.phone?.trim() || null, st.description?.trim() || null]
                ) as { insertId: number };
                staffIds.push(r.insertId);
            }

            for (let i = 0; i < staffList.length; i++) {
                const indices = staffList[i].service_indices ?? [];
                for (const j of indices) {
                    if (j >= 0 && j < serviceIds.length) {
                        await conn.query(
                            `INSERT INTO staff_services (staff_member_id, service_id) VALUES (?, ?)`,
                            [staffIds[i], serviceIds[j]]
                        );
                    }
                }
            }

            // Owner als Staff: ein Eintrag mit user_id = Owner, konfigurierbar welche Services er durchführt
            const ownerStaffResult = await conn.query(
                `INSERT INTO staff_members (venue_id, user_id, name, email, phone, description) VALUES (?, ?, ?, ?, NULL, NULL)`,
                [venueId, ownerId, oData.name.trim(), oData.email.trim().toLowerCase() || null]
            ) as { insertId: number };
            const ownerStaffId = ownerStaffResult.insertId;
            const indices = ownerServiceIndices != null && ownerServiceIndices.length > 0
                ? ownerServiceIndices.filter((j) => j >= 0 && j < serviceIds.length)
                : serviceIds.map((_, i) => i);
            for (const j of indices) {
                await conn.query(
                    `INSERT INTO staff_services (staff_member_id, service_id) VALUES (?, ?)`,
                    [ownerStaffId, serviceIds[j]]
                );
            }
            for (const oh of hoursList) {
                const d = Number(oh.day_of_week);
                if (d < 0 || d > 6 || !oh.start_time || !oh.end_time) continue;
                await conn.query(
                    `INSERT INTO availability_rules (venue_id, staff_member_id, day_of_week, start_time, end_time) VALUES (NULL, ?, ?, ?, ?)`,
                    [ownerStaffId, d, oh.start_time, oh.end_time]
                );
            }

            for (const oh of hoursList) {
                const d = Number(oh.day_of_week);
                if (d < 0 || d > 6 || !oh.start_time || !oh.end_time) continue;
                await conn.query(
                    `INSERT INTO availability_rules (venue_id, staff_member_id, day_of_week, start_time, end_time) VALUES (?, NULL, ?, ?, ?)`,
                    [venueId, d, oh.start_time, oh.end_time]
                );
            }

            await conn.commit();

            const rows = await conn.query(
                'SELECT id, name, type, email, phone, address, city, postal_code, country, description, image_url, website_url, booking_advance_days, booking_advance_hours, cancellation_hours, require_phone, require_deposit, deposit_amount, is_active, latitude, longitude, created_at, updated_at FROM venues WHERE id = ?',
                [venueId]
            ) as Venue[];
            return { venue: rows[0], venueId };
        } catch (error) {
            await conn.rollback();
            logger.error('Error in createVenueFull', error);
            throw error;
        } finally {
            conn.release();
        }
    }

    static async listAdmins(): Promise<AdminWithVenue[]> {
        let conn;
        try {
            conn = await getConnection();
            const rows = await conn.query(`
                SELECT a.id, a.email, a.name, a.venue_id, a.role, a.is_active, a.last_login, a.created_at, v.name as venue_name
                FROM users a
                LEFT JOIN venues v ON a.venue_id = v.id
                ORDER BY a.email ASC
            `) as (AdminWithVenue & { venue_name: string })[];
            return rows.map((r) => ({
                id: r.id,
                email: r.email,
                name: r.name,
                venue_id: r.venue_id,
                role: r.role,
                venue_name: r.venue_name ?? null,
                is_active: r.is_active,
                last_login: r.last_login,
                created_at: r.created_at,
            }));
        } catch (error) {
            logger.error('Error listing admins', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async createAdmin(data: {
        email: string;
        password: string;
        name: string;
        venue_id?: number | null;
        role?: AdminRole;
    }): Promise<AdminUserPublic> {
        if (!data.password || data.password.length < 8) throw new Error('Passwort muss mindestens 8 Zeichen haben');
        const role = data.role && data.role !== 'admin' ? data.role : 'owner';
        const venue_id = data.venue_id ?? null;
        const password_hash = await hashPassword(data.password);
        let conn;
        try {
            conn = await getConnection();
            const existing = await conn.query('SELECT id FROM users WHERE email = ?', [data.email]) as { id: number }[];
            if (existing.length > 0) throw new Error('E-Mail wird bereits verwendet');
            await conn.query(
                `INSERT INTO users (email, password_hash, name, venue_id, role) VALUES (?, ?, ?, ?, ?)`,
                [data.email, password_hash, data.name, venue_id, role]
            );
            const insertResult = await conn.query(
                'SELECT id, email, name, venue_id, role FROM users WHERE email = ?',
                [data.email]
            ) as AdminUserPublic[];
            return insertResult[0];
        } catch (error) {
            logger.error('Error creating admin', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async updateAdmin(
        adminId: number,
        updates: { venue_id?: number | null; role?: AdminRole; is_active?: boolean; name?: string; email?: string }
    ): Promise<AdminUserPublic> {
        let conn;
        try {
            conn = await getConnection();
            const existing = await conn.query('SELECT id FROM users WHERE id = ?', [adminId]) as { id: number }[];
            if (existing.length === 0) throw new Error('Admin nicht gefunden');
            if (updates.email !== undefined) {
                const email = String(updates.email).trim().toLowerCase();
                if (!email) throw new Error('E-Mail darf nicht leer sein');
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) throw new Error('Ungültige E-Mail-Adresse');
                const existingEmail = await conn.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, adminId]) as { id: number }[];
                if (existingEmail.length > 0) throw new Error('Diese E-Mail-Adresse wird bereits verwendet');
            }
            const fields: string[] = [];
            const values: (string | number | boolean | null)[] = [];
            if (updates.venue_id !== undefined) { fields.push('venue_id = ?'); values.push(updates.venue_id); }
            if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role); }
            if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active); }
            if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
            if (updates.email !== undefined) { fields.push('email = ?'); values.push(String(updates.email).trim().toLowerCase()); }
            if (fields.length === 0) {
                const rows = await conn.query('SELECT id, email, name, venue_id, role FROM users WHERE id = ?', [adminId]) as AdminUserPublic[];
                return rows[0];
            }
            values.push(adminId);
            await conn.query(`UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
            const rows = await conn.query('SELECT id, email, name, venue_id, role FROM users WHERE id = ?', [adminId]) as AdminUserPublic[];
            return rows[0];
        } catch (error) {
            logger.error('Error updating admin', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async setAdminPassword(adminId: number, newPassword: string): Promise<void> {
        if (!newPassword || newPassword.length < 8) throw new Error('Passwort muss mindestens 8 Zeichen haben');
        const password_hash = await hashPassword(newPassword);
        let conn;
        try {
            conn = await getConnection();
            const [result] = await conn.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [password_hash, adminId]) as { affectedRows: number }[];
            if ((result as { affectedRows?: number })?.affectedRows === 0) throw new Error('Admin nicht gefunden');
        } catch (error) {
            logger.error('Error setting admin password', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async getGlobalStats(): Promise<GlobalStats> {
        let conn;
        try {
            conn = await getConnection();
            const [venueCount] = await conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active FROM venues`) as [{ total: bigint; active: bigint }];
            const [adminCount] = await conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active FROM users`) as [{ total: bigint; active: bigint }];
            const [customerCount] = await conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active FROM customers`) as [{ total: bigint; active: bigint }];
            const [usersByRoleRaw] = await conn.query(`
                SELECT role, COUNT(*) as count FROM users GROUP BY role
            `);
            const usersByRoleRows = Array.isArray(usersByRoleRaw) ? usersByRoleRaw : (usersByRoleRaw ? [usersByRoleRaw] : []);
            const usersByRole = { admin: 0, owner: 0, staff: 0 };
            for (const row of usersByRoleRows) {
                if (row.role in usersByRole) usersByRole[row.role as keyof typeof usersByRole] = Number(row.count ?? 0);
            }
            const [bookingStats] = await conn.query(`
                SELECT COUNT(*) as total,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN MONTH(booking_date) = MONTH(CURDATE()) AND YEAR(booking_date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) as this_month
                FROM bookings
            `) as [{ total: bigint; pending: bigint; confirmed: bigint; cancelled: bigint; completed: bigint; this_month: bigint }];
            return {
                venues: { total: Number(venueCount?.total ?? 0), active: Number(venueCount?.active ?? 0) },
                admins: { total: Number(adminCount?.total ?? 0), active: Number(adminCount?.active ?? 0) },
                customers: { total: Number(customerCount?.total ?? 0), active: Number(customerCount?.active ?? 0) },
                usersByRole,
                bookings: {
                    total: Number(bookingStats?.total ?? 0),
                    pending: Number(bookingStats?.pending ?? 0),
                    confirmed: Number(bookingStats?.confirmed ?? 0),
                    cancelled: Number(bookingStats?.cancelled ?? 0),
                    completed: Number(bookingStats?.completed ?? 0),
                    thisMonth: Number(bookingStats?.this_month ?? 0),
                },
            };
        } catch (error) {
            logger.error('Error fetching global stats', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    // ==================== Customer Management ====================

    /**
     * List all customers with statistics
     */
    static async listCustomers(options?: {
        search?: string;
        active?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<{ customers: CustomerWithStats[]; total: number }> {
        let conn;
        try {
            conn = await getConnection();
            
            let whereClause = '';
            const params: any[] = [];

            if (options?.search) {
                whereClause = 'WHERE (c.email LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)';
                const searchPattern = `%${options.search}%`;
                params.push(searchPattern, searchPattern, searchPattern);
            }

            if (options?.active !== undefined) {
                whereClause += whereClause ? ' AND c.is_active = ?' : 'WHERE c.is_active = ?';
                params.push(options.active);
            }

            // Get total count
            const [countResult] = await conn.query(
                `SELECT COUNT(*) as total FROM customers c ${whereClause}`,
                params
            ) as [{ total: bigint }];

            // Get customers with stats
            const limit = options?.limit || 50;
            const offset = options?.offset || 0;

            const rows = await conn.query(`
                SELECT 
                    c.id,
                    c.email,
                    c.name,
                    c.phone,
                    c.loyalty_points,
                    c.is_active,
                    c.email_verified,
                    c.last_login,
                    c.created_at,
                    COUNT(DISTINCT b.id) as total_bookings,
                    SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
                    SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
                    COALESCE(SUM(CASE WHEN b.status = 'completed' THEN b.total_amount ELSE 0 END), 0) as total_spent
                FROM customers c
                LEFT JOIN bookings b ON c.id = b.customer_id
                ${whereClause}
                GROUP BY c.id
                ORDER BY c.created_at DESC
                LIMIT ? OFFSET ?
            `, [...params, limit, offset]) as CustomerWithStats[];

            // Convert BigInt values to numbers
            const customers = rows.map(row => ({
                ...row,
                total_bookings: Number(row.total_bookings || 0),
                completed_bookings: Number(row.completed_bookings || 0),
                cancelled_bookings: Number(row.cancelled_bookings || 0),
                total_spent: Number(row.total_spent || 0),
                loyalty_points: Number(row.loyalty_points || 0),
            }));

            return {
                customers,
                total: Number(countResult.total || 0)
            };
        } catch (error) {
            logger.error('Error listing customers', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Get customer details with full statistics
     */
    static async getCustomer(customerId: number): Promise<CustomerWithStats | null> {
        let conn;
        try {
            conn = await getConnection();

            const rows = await conn.query(`
                SELECT 
                    c.id,
                    c.email,
                    c.name,
                    c.phone,
                    c.loyalty_points,
                    c.is_active,
                    c.email_verified,
                    c.last_login,
                    c.created_at,
                    COUNT(DISTINCT b.id) as total_bookings,
                    SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
                    SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
                    COALESCE(SUM(CASE WHEN b.status = 'completed' THEN b.total_amount ELSE 0 END), 0) as total_spent
                FROM customers c
                LEFT JOIN bookings b ON c.id = b.customer_id
                WHERE c.id = ?
                GROUP BY c.id
            `, [customerId]) as CustomerWithStats[];

            if (rows.length === 0) return null;

            return {
                ...rows[0],
                total_bookings: Number(rows[0].total_bookings || 0),
                completed_bookings: Number(rows[0].completed_bookings || 0),
                cancelled_bookings: Number(rows[0].cancelled_bookings || 0),
                total_spent: Number(rows[0].total_spent || 0),
                loyalty_points: Number(rows[0].loyalty_points || 0),
            };
        } catch (error) {
            logger.error('Error getting customer', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Update customer (admin can change name, phone, email_verified, is_active)
     */
    static async updateCustomer(
        customerId: number,
        updates: {
            name?: string;
            phone?: string;
            email_verified?: boolean;
            is_active?: boolean;
        }
    ): Promise<CustomerPublic> {
        let conn;
        try {
            conn = await getConnection();

            const existing = await conn.query('SELECT id FROM customers WHERE id = ?', [customerId]);
            if (existing.length === 0) throw new Error('Kunde nicht gefunden');

            const fields: string[] = [];
            const values: any[] = [];

            if (updates.name !== undefined) {
                fields.push('name = ?');
                values.push(updates.name.trim());
            }

            if (updates.phone !== undefined) {
                fields.push('phone = ?');
                values.push(updates.phone || null);
            }

            if (updates.email_verified !== undefined) {
                fields.push('email_verified = ?');
                values.push(updates.email_verified);
            }

            if (updates.is_active !== undefined) {
                fields.push('is_active = ?');
                values.push(updates.is_active);
            }

            if (fields.length === 0) {
                const rows = await conn.query(
                    'SELECT id, email, name, phone, loyalty_points, is_active, email_verified, last_login, created_at FROM customers WHERE id = ?',
                    [customerId]
                );
                return rows[0] as CustomerPublic;
            }

            values.push(customerId);

            await conn.query(
                `UPDATE customers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
                values
            );

            const rows = await conn.query(
                'SELECT id, email, name, phone, loyalty_points, is_active, email_verified, last_login, created_at FROM customers WHERE id = ?',
                [customerId]
            ) as CustomerPublic[];

            logger.info(`Customer updated by admin: ${customerId}`);

            return rows[0];
        } catch (error) {
            logger.error('Error updating customer', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Set customer password (admin function)
     */
    static async setCustomerPassword(customerId: number, newPassword: string): Promise<void> {
        if (!newPassword || newPassword.length < 8) {
            throw new Error('Passwort muss mindestens 8 Zeichen haben');
        }

        const password_hash = await hashPassword(newPassword);
        let conn;
        try {
            conn = await getConnection();
            const [result] = await conn.query(
                'UPDATE customers SET password_hash = ?, updated_at = NOW() WHERE id = ?',
                [password_hash, customerId]
            ) as { affectedRows: number }[];

            if ((result as { affectedRows?: number })?.affectedRows === 0) {
                throw new Error('Kunde nicht gefunden');
            }

            logger.info(`Customer password reset by admin: ${customerId}`);
        } catch (error) {
            logger.error('Error setting customer password', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Adjust customer loyalty points (admin function)
     */
    static async adjustCustomerLoyaltyPoints(
        customerId: number,
        pointsChange: number,
        reason: string
    ): Promise<{ newBalance: number }> {
        let conn;
        try {
            conn = await getConnection();

            // Check if customer exists
            const existing = await conn.query(
                'SELECT loyalty_points FROM customers WHERE id = ?',
                [customerId]
            );

            if (existing.length === 0) {
                throw new Error('Kunde nicht gefunden');
            }

            const currentPoints = Number(existing[0].loyalty_points || 0);
            const newBalance = currentPoints + pointsChange;

            if (newBalance < 0) {
                throw new Error('Punktestand kann nicht negativ werden');
            }

            // Update customer points
            await conn.query(
                'UPDATE customers SET loyalty_points = ? WHERE id = ?',
                [newBalance, customerId]
            );

            // Record transaction
            const type = pointsChange > 0 ? 'bonus' : 'adjustment';
            await conn.query(`
                INSERT INTO loyalty_transactions (customer_id, points, type, description)
                VALUES (?, ?, ?, ?)
            `, [customerId, pointsChange, type, `Admin-Anpassung: ${reason}`]);

            logger.info(`Loyalty points adjusted by admin for customer ${customerId}: ${pointsChange} points, reason: ${reason}`);

            return { newBalance };
        } catch (error) {
            logger.error('Error adjusting loyalty points', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }
}
