/**
 * BOOKING SERVICE
 * 
 * Dieser Service ist verantwortlich für alle Buchungsoperationen:
 * - Erstellen neuer Buchungen
 * - Abrufen von Buchungen (nach ID, Venue, Kunde)
 * - Aktualisieren von Buchungen (Token-basiert)
 * - Stornieren von Buchungen (Token-basiert)
 * - Verwalten von Buchungsstatus (Dashboard/Admin)
 */

import { getConnection } from "../config/database";
import { createLogger } from "../config/utils/logger";
import { AvailabilityService } from "./availability.service";
import { logBookingAction } from "./audit.service";
import { 
    Booking,
    CreateBookingData,
    UpdateBookingData
 } from "../config/utils/types";
import { getTokenPrefix } from "../config/utils/helper";
import { randomUUID } from 'crypto';


 const logger = createLogger('booking.service');



 export class BookingService
 {
   /**
    * ERSTELLE NEUE BUCHUNG
    * 
    * Prüft zuerst die Verfügbarkeit, dann erstellt die Buchung in der DB
    * 
    * @param bookingData - Daten für die neue Buchung
    * @param bypassAdvanceCheck - Optional: Für Admin-Buchungen (ignoriert booking_advance_hours)
    * @returns Die erstellte Buchung mit ID oder Exception, welche dann von der Route abgefangen wird
    */
   static async createBooking(bookingData: CreateBookingData, bypassAdvanceCheck: boolean = false): Promise<Booking>
    {
        logger.info('Creating new booking...', {
            venue_id: bookingData.venue_id,
            service_id: bookingData.service_id,
            date: bookingData.booking_date,
            time: `${bookingData.start_time} - ${bookingData.end_time}`,
            bypass_advance_check: bypassAdvanceCheck
        });

        let conn;
        try 
        {
            conn = await getConnection();
            logger.debug('Database connection established');
            
            // SCHRITT 1: Validiere die Verfügbarkeit
            // Bevor wir buchen, müssen wir sicherstellen, dass der Slot verfügbar ist
            const validation = await AvailabilityService.validateBookingRequest(
                bookingData.venue_id,
                bookingData.service_id,
                bookingData.staff_member_id || null,
                bookingData.booking_date,
                bookingData.start_time,
                bookingData.end_time,
                bookingData.party_size,
                undefined,              // excludeBookingId
                bypassAdvanceCheck      // Admin kann Vorlaufzeit umgehen
            );

            // Falls nicht verfügbar, wirf einen Fehler
            if (!validation.valid)
            {
                logger.warn('Booking validation failed');
                throw new Error(`Booking not available: ${validation.errors?.join(', ')}`);
            }

            // SCHRITT 1.5: Erstelle booking_token
            const bookingToken = randomUUID();


            // SCHRITT 2: Füge die Buchung in die Datenbank ein
            const result = await conn.query(`
                INSERT INTO bookings (
                    customer_id,
                    booking_token,
                    venue_id,
                    service_id,
                    staff_member_id,
                    customer_name,
                    customer_email,
                    customer_phone,
                    booking_date,
                    start_time,
                    end_time,
                    party_size,
                    special_requests,
                    total_amount,
                    status
                ) 
                VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [
                    bookingData.customer_id || null,
                    bookingToken,
                    bookingData.venue_id,
                    bookingData.service_id,
                    bookingData.staff_member_id || null,
                    bookingData.customer_name,
                    bookingData.customer_email,
                    bookingData.customer_phone || null,
                    bookingData.booking_date,
                    bookingData.start_time,
                    bookingData.end_time,
                    bookingData.party_size,
                    bookingData.special_requests || null,
                    bookingData.total_amount || null
                ]
            ) as { insertId: number };

            logger.info(`Booking created successfully with ID: ${result.insertId}`);


            // SCHRITT 3: Hole die vollständige Buchung mit der neuen ID
            const newBooking = await this.getBookingById(result.insertId);

            if (!newBooking)
            {
                throw new Error('Failed to retrieve newly created booking');
            }

            // E-Mail „Buchung eingegangen“ (Status pending): Vielen Dank – wir prüfen und bestätigen in Kürze
            try {
                const withDetails = await this.getBookingByIdWithDetails(result.insertId);
                if (withDetails) {
                    const { sendBookingReceived } = await import('./email.service');
                    await sendBookingReceived({
                        id: withDetails.id,
                        customer_name: withDetails.customer_name,
                        customer_email: withDetails.customer_email,
                        booking_date: withDetails.booking_date,
                        start_time: withDetails.start_time,
                        end_time: withDetails.end_time,
                        special_requests: withDetails.special_requests,
                        venue_name: withDetails.venue_name,
                        service_name: withDetails.service_name,
                        staff_member_name: withDetails.staff_member_name,
                        booking_token: withDetails.booking_token,
                    });
                }
            } catch (emailErr) {
                logger.error('Email after booking creation failed (booking already created)', emailErr);
            }

            return newBooking;
        } 
        catch (error) 
        {
            logger.error('Error creating booking');
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
     * HOLE BUCHUNG NACH ID
     * 
     * @params bookingId
     * @returns Die Buchung oder null wenn nicht gefunden
     */
    static async getBookingById(bookingId: number): Promise<Booking | null>
    {
        logger.info(`Fetching booking with ID: ${bookingId}...`);

        let conn;
        try 
        {
            conn = await getConnection();
            
            const bookings = await conn.query(`
                SELECT *
                FROM bookings
                WHERE id = ?`,
                [bookingId]
            ) as Booking[];     // SQL gibt immer Array zurück

            if (bookings.length === 0)
            {
                logger.warn('Booking not found');
                return null;
            }

            logger.info('Booking found');
            return bookings[0];
        } 
        catch (error) 
        {
            logger.error('Error fetching booking by ID', error);
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
     * Buchung mit Venue-/Service-/Mitarbeiter-Namen (für E-Mails, Dashboard-Details).
     */
    static async getBookingByIdWithDetails(bookingId: number): Promise<(Booking & { venue_name?: string; service_name?: string; staff_member_name?: string }) | null> {
        let conn;
        try {
            conn = await getConnection();
            const rows = await conn.query(`
                SELECT b.*, v.name as venue_name, s.name as service_name, sm.name as staff_member_name
                FROM bookings b
                LEFT JOIN venues v ON b.venue_id = v.id
                LEFT JOIN services s ON b.service_id = s.id
                LEFT JOIN staff_members sm ON b.staff_member_id = sm.id
                WHERE b.id = ?
            `, [bookingId]) as Array<Booking & { venue_name?: string; service_name?: string; staff_member_name?: string }>;
            return rows.length ? rows[0] : null;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * ========================================================================
     * HOLE BUCHUNG NACH TOKEN (NEU!)
     * ========================================================================
     * 
     * Dies ist die neue Hauptmethode für Token-basierten Zugriff
     * 
     * VORTEILE:
     * - Kein Email-Abgleich nötig
     * - Token ist unguessable (UUID v4 = 128 bit Entropie)
     * - Funktioniert auch ohne Email (QR-Codes, Walk-Ins)
     * 
     * @param token - Der booking_token (UUID) aus der Bestätigungs-Email
     * @returns Die Buchung oder null wenn nicht gefunden
     */
    static async getBookingByToken(token: string): Promise<Booking | null>
    {
        const tokenPrefix = getTokenPrefix(token);
        
        logger.info('Fetching booking by token...');
        logger.separator();

        let conn;
        try 
        {
            conn = await getConnection();

            const bookings = await conn.query(`
                SELECT 
                    b.*,
                    v.name as venue_name,
                    v.cancellation_hours,
                    s.name as service_name,
                    sm.name as staff_member_name
                FROM bookings b
                LEFT JOIN venues v ON b.venue_id = v.id
                LEFT JOIN services s ON b.service_id = s.id
                LEFT JOIN staff_members sm ON b.staff_member_id = sm.id
                WHERE b.booking_token = ?
            `, [token]) as Booking[];


            if (bookings.length === 0)
            {
                logger.warn('Booking not found for token', { token_prefix: tokenPrefix });
                return null;
            }

            let booking = bookings[0] as Booking;

            await this.markPastBookingsCompleted(conn, [booking]);

            logger.info('Booking found', { 
                booking_id: booking.id,
                token_prefix: tokenPrefix 
            });

            return booking;
        } 
        catch (error) 
        {
            logger.error('Error fetching booking by token', error);
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
     * Vergangene Termine (pending/confirmed) in der DB und im Array auf 'completed' setzen.
     * Wird von getBookingByToken, getBookingsByVenue, getBookingsByEmail und Admin getBookings genutzt.
     */
    static async markPastBookingsCompleted<T extends { id: number; booking_date: string; end_time: string; status: string }>(
        conn: Awaited<ReturnType<typeof getConnection>>,
        bookings: T[]
    ): Promise<T[]> {
        const now = Date.now();
        for (const b of bookings) {
            if (b.status !== 'pending' && b.status !== 'confirmed') continue;
            const endDateTime = new Date(`${b.booking_date}T${b.end_time}`);
            if (endDateTime.getTime() > now) continue;
            await conn.query(
                `UPDATE bookings SET status = 'completed', updated_at = NOW() WHERE id = ?`,
                [b.id]
            );
            (b as { status: string }).status = 'completed';
            logger.info('Booking auto-marked as completed (appointment time passed)', { booking_id: b.id });
            try {
                const withDetails = await BookingService.getBookingByIdWithDetails(b.id);
                if (withDetails?.customer_email && withDetails.venue_id) {
                    const { sendReviewInvitation } = await import('./email.service');
                    await sendReviewInvitation(
                        {
                            id: withDetails.id,
                            customer_name: withDetails.customer_name,
                            customer_email: withDetails.customer_email,
                            booking_date: withDetails.booking_date,
                            start_time: withDetails.start_time,
                            end_time: withDetails.end_time,
                            special_requests: withDetails.special_requests,
                            venue_name: withDetails.venue_name,
                            service_name: withDetails.service_name,
                            staff_member_name: withDetails.staff_member_name,
                            booking_token: withDetails.booking_token,
                        },
                        withDetails.venue_id
                    );
                }
            } catch (emailErr) {
                logger.error('Review invitation email failed after auto-complete', { booking_id: b.id, err: emailErr });
            }
        }
        return bookings;
    }






    /**
     * HOLE ALLE BUCHUNGEN FÜR EIN VENUE
     * 
     * Optional können Buchungen nach Datum und Status gefiltert werden
     * 
     * @param venueId - ID des Venues
     * @param filters - Optional: Datum und/oder Status zum filtern
     * @returns Array von Buchungen
     */
    static async getBookingsByVenue(
        venueId: number,
        filters?: {
            date?: string;          // Format: YYYY-MM-DD
            status?: string;        // z.B. 'confirmed', 'pending'
            startDate?: string;     // Für Datumsbereich: Von
            endDate?: string;       // Für Datumsbereich: Bis
        }
    ): Promise<Booking[]>
    {
        logger.info('Fetching bookings for venue...', {
            venue_id: venueId,
            filters
        });

        let conn;
        try 
        {
            conn = await getConnection();
            
            // Baue die Query dynamisch auf, je nachdem welche Filter gesetzt sind
            // Da staff_member_id in der bookings Tabelle optional ist (kann NULL sein), brauchen wir LEFT JOIN!
            // INNER JOIN würde nur das zeigen was matched (sm id kann null sein, daher würde er da nicht zeigen)
            let query = `
                SELECT b.*,
                        s.name as service_name,
                        sm.name as staff_member_name
                FROM bookings b
                LEFT JOIN services s ON b.service_id = s.id
                LEFT JOIN staff_members sm ON b.staff_member_id = sm.id
                WHERE b.venue_id = ?
            `;

            // params ist ein array von entweder strings oder number
            // der erste wert ist ein Array mit venueId drin
            const params: (string | number)[] = [venueId]; 

            // Filter nach exaktem Datum
            if (filters?.date)
            {
                query += ' AND b.booking_date = ?';
                params.push(filters.date);
            }

            // Filter nach Datumsbereich
            if (filters?.startDate)
            {
                query += ' AND b.booking_date >= ?';
                params.push(filters.startDate);
            }

            if (filters?.endDate)
            {
                query += ' AND b.booking_date <= ?';
                params.push(filters.endDate);
            }

            // Filter nach Status
            if (filters?.status)
            {
                query += ' AND b.status = ?';
                params.push(filters.status);
            }

            // Sortiere nach Datum und Zeit (neueste zuerst)
            query += ' ORDER BY b.booking_date DESC, b.start_time DESC';


            const bookings = await conn.query(query, params) as Booking[];

            await this.markPastBookingsCompleted(conn, bookings);

            logger.info(`Found ${bookings.length} bookings for venue ${venueId}`);
            return bookings;
        } 
        catch (error) 
        {
            logger.error('Error fetching bookings by venue', error);
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
     * HOLE BUCHUNGEN FÜR EINEN KUNDEN
     * 
     * Findet alle Buchungen anhand der E-Mail-Adresse
     * 
     * @param customerEmail - E-Mail des Kunden
     * @param onlyFuture - Optional: Nur zukünftige Buchungen (default: false)
     * @returns Array von Buchungen
     */
    static async getBookingsByEmail(
        customerEmail: string,
        onlyFuture: boolean = false
    ): Promise<Booking[]>
    {
        logger.info(`Fetching bookings for customer...`, {
            customer_email: customerEmail,
            only_future: onlyFuture
        });

        let conn;
        try 
        {
            conn = await getConnection();
            
            // LEFT JOIN ist hier technisch nicht nötig (venue_id und service_id sind NOT NULL in der DB), 
            // aber defensiver: Falls durch Bugs Daten fehlen, crasht die Query nicht 
            // sondern gibt venue_name = NULL zurück statt gar nichts.
            let query = `
                SELECT b.*,
                    v.name as venue_name,
                    s.name as service_name
                FROM bookings b
                LEFT JOIN venues v ON b.venue_id = v.id
                LEFT JOIN services s ON b.service_id = s.id
                WHERE b.customer_email = ?
            `;

            const params: (string | number)[] = [customerEmail];

            // Wenn nur zukünftige Buchungen gewünscht, füge Datumsfilter hinzu
            if (onlyFuture)
            {
                query += ' AND b.booking_date >= CURDATE()';
            }

            query += ' ORDER BY b.booking_date DESC, b.start_time DESC';

            const bookings = await conn.query(query, params) as Booking[];

            await this.markPastBookingsCompleted(conn, bookings);

            logger.info(`Found ${bookings.length} bookings for customer`);
            
            return bookings;
        } 
        catch (error) 
        {
            logger.error('Error fetching bookings by email', error);
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
     * HOLE ALLE BUCHUNGEN EINES KUNDEN (via customer_id)
     * Sicher und authentifiziert - nur für eingeloggte Kunden
     * 
     * @param customerId - ID des eingeloggten Kunden
     * @param onlyFuture - Optional: Nur zukünftige Buchungen (default: false)
     * @returns Array von Buchungen mit Details
     */
    static async getBookingsByCustomerId(
        customerId: number,
        onlyFuture: boolean = false
    ): Promise<Booking[]>
    {
        logger.info(`Fetching bookings for customer ID: ${customerId}`, {
            only_future: onlyFuture
        });

        let conn;
        try 
        {
            conn = await getConnection();
            
            let query = `
                SELECT b.*,
                    v.name as venue_name,
                    s.name as service_name,
                    sm.name as staff_member_name
                FROM bookings b
                LEFT JOIN venues v ON b.venue_id = v.id
                LEFT JOIN services s ON b.service_id = s.id
                LEFT JOIN staff_members sm ON b.staff_member_id = sm.id
                WHERE b.customer_id = ?
            `;

            const params: (string | number)[] = [customerId];

            // Wenn nur zukünftige Buchungen gewünscht, füge Datumsfilter hinzu
            if (onlyFuture)
            {
                query += ' AND b.booking_date >= CURDATE()';
            }

            query += ' ORDER BY b.booking_date DESC, b.start_time DESC';

            const bookings = await conn.query(query, params) as Booking[];

            await this.markPastBookingsCompleted(conn, bookings);

            logger.info(`Found ${bookings.length} bookings for customer ID ${customerId}`);
            
            return bookings;
        } 
        catch (error) 
        {
            logger.error('Error fetching bookings by customer', error);
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
     * AKTUALISIERE BUCHUNG
     * 
     * Erlaubt das Ändern von Buchungsdetails (Datum, Zeit, Personenzahl, etc.)
     * Prüft bei Änderung von Datum/Zeit die Verfügbarkeit neu
     * Setzt reminder_sent_at zurück, wenn Datum/Zeit geändert wird
     * 
     * @param token - booking_token der zu aktualisierenden Buchung
     * @param updates - Objekt mit den zu ändernden Feldern
     * 
     * @returns Die aktualisierte Buchung
     */
    static async updateBooking(
        token: string,
        updates: UpdateBookingData
    ): Promise<Booking>
    {
        logger.info(`Updating booking ${token}...`, { updates });

        let conn;
        try 
        {
            conn = await getConnection();
            
            // SCHRITT 1: Hole aktuelle Buchung
            const currentBooking = await this.getBookingByToken(token);

            if (!currentBooking)
            {
                throw new Error('Booking not found');
            }

            // SCHRITT 2: Prüfe, ob Buchung geändert werden kann
            if (currentBooking.status === 'cancelled' || currentBooking.status === 'completed')
            {
                logger.warn(`Cannot update booking with status: ${currentBooking.status}`);
                throw new Error(`Cannot update booking with status: ${currentBooking.status}`);
            }

            // SCHRITT 3: Wenn Datum/Zeit/Mitarbeiter geändert wird -> Verfügbarkeit prüfen
            // Wenn etwas von diesen Parametern da ist -> hat sich was geändert (Was wenn genau das gleiche eingegeben wird? - wird vlt abgefangen von excludebookingid)
            const dateTimeChanged = 
                updates.booking_date ||
                updates.start_time ||
                updates.end_time ||
                updates.staff_member_id !== undefined;

            if (dateTimeChanged)
            {
                logger.info('Date/time/staff changed - validating availability...');    // Wenn genau das gleiche geändert wurde - stimmt das dann?...

                const validation = await AvailabilityService.validateBookingRequest(
                    currentBooking.venue_id,
                    currentBooking.service_id,
                    updates.staff_member_id !== undefined
                        ? updates.staff_member_id
                        : (currentBooking.staff_member_id ?? null),                     // In currentBooking MUSS NICHT staff_member_id enthalten sein (dann wäre es undefined, aber validateBookingRequest akzeptiert kein undefined)
                    updates.booking_date ?? currentBooking.booking_date,                // Wenn links was drin ist, nimm das, ansonsten rechts
                    updates.start_time ?? currentBooking.start_time,
                    updates.end_time ?? currentBooking.end_time,
                    updates.party_size ?? currentBooking.party_size,
                    currentBooking.id
                );

                if (!validation.valid)
                {
                    logger.warn('Availability validation failed', { errors: validation.errors });
                    throw new Error(`Update not possible: ${validation.errors.join(', ')}`);
                }
            }

            // SCHRITT 4: Baue UPDATE Query dynamisch
            const updateFields: string[] = [];
            const updateValues: (string | number)[] = [];

            // Für jedes Feld in updates, füge zum Query hinzu
            if (updates.booking_date !== undefined) 
            {
                updateFields.push('booking_date = ?');
                updateValues.push(updates.booking_date);
            }

            if (updates.start_time !== undefined) 
            {
                updateFields.push('start_time = ?');
                updateValues.push(updates.start_time);
            }
            
            if (updates.end_time !== undefined) 
            {
                updateFields.push('end_time = ?');
                updateValues.push(updates.end_time);
            }
            
            if (updates.staff_member_id !== undefined) 
            {
                updateFields.push('staff_member_id = ?');
                updateValues.push(updates.staff_member_id);
            }
            
            if (updates.party_size !== undefined) 
            {
                updateFields.push('party_size = ?');
                updateValues.push(updates.party_size);
            }
            
            if (updates.special_requests !== undefined) 
            {
                updateFields.push('special_requests = ?');
                updateValues.push(updates.special_requests);
            }


            // WICHTIG: Wenn Datum/Zeit geändert -> Reminder zurücksetzen und Status auf "ausstehend"
            // Owner muss den neuen Termin erneut bestätigen
            if (dateTimeChanged)
            {
                updateFields.push('reminder_sent_at = NULL');
                updateFields.push("status = 'pending'");
                updateFields.push('confirmation_sent_at = NULL');
                logger.info('Resetting reminder_sent_at and status to pending due to date/time change');
            }

            // Falls keine Änderungen
            if (updateFields.length === 0)
            {
                logger.info('No changes detected');
                return currentBooking;
            }


            // SCHRITT 5: Führe Update aus
            updateValues.push(token);       // Für WHERE clause

            await conn.query(`
                UPDATE bookings
                SET ${updateFields.join(', ')}
                WHERE booking_token = ?`,
                updateValues                    // Ist schon ein Array, daher kein [updateValues]
            );

            logger.info('Booking updated successfully');

            // Audit: Kunde hat über Manage-Link Datum/Zeit/Details geändert
            const newStatusAfterUpdate = dateTimeChanged ? 'pending' : currentBooking.status;
            await logBookingAction({
                bookingId: currentBooking.id,
                venueId: currentBooking.venue_id,
                action: 'update',
                oldStatus: currentBooking.status,
                newStatus: newStatusAfterUpdate,
                reason: null,
                actorType: 'customer',
                customerIdentifier: 'manage_link',
            });

            // SCHRITT 7: Hole aktualisierte Buchung
            const updatedBooking = await this.getBookingByToken(token);

            if (!updatedBooking)
            {
                throw new Error('Failed to retrieve updated booking');
            }

            return updatedBooking;
        } 
        catch (error) 
        {
            logger.error('Error updating booking', error);
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
     * STORNIERE BUCHUNG
     * 
     * Setzt den Status auf 'cancelled' und speichert Zeitpunkt + Grund
     * Benötigt Token für Sicherheit
     * 
     * @param token - Token zur Verifizierung
     * @param reason - Optional: Grund für die Stornierung
     * @param bypassPolicy - Optional: Für Admin-Stornierungen (ignoriert Stornierungsfrist)
     * @returns Die stornierte Buchung
     */
    static async cancelBooking(
        token: string,
        reason?: string,
        bypassPolicy: boolean = false  // Für Admin-Stornierungen
    ): Promise<Booking>
    {
        logger.info(`Cancelling booking ${token.substring(0, 8)}...` ,{ reason, bypassPolicy });

        let conn;
        try 
        {
            conn = await getConnection();
            
            // SCHRITT 1: Hole Buchung MIT Venue-Daten (für cancellation_hours)
            const bookings = await conn.query(`
                SELECT b.*, v.cancellation_hours
                FROM bookings b
                JOIN venues v ON b.venue_id = v.id
                WHERE b.booking_token = ?`,
                [token]
            ) as Array<Booking & { cancellation_hours: number }>;

            if (bookings.length === 0)
            {
                logger.warn('Booking not found');
                throw new Error('Booking not found');
            }

            const booking = bookings[0];


            // SCHRITT 2: Prüfe ob Stornierung möglich ist
            if (booking.status === 'cancelled')
            {
                logger.warn('Booking already cancelled');
                throw new Error('Booking is already cancelled');
            }

            if (booking.status === 'completed')
            {
                logger.warn('Cannot cancel completed booking');
                throw new Error('Cannot cancel completed booking');
            }


            // SCHRITT 3: Prüfe Stornierungsfrist (außer bei Admin-Bypass)
            if (!bypassPolicy)
            {
                const bookingDateTime = new Date(`${booking.booking_date}T${booking.start_time}`);
                const now = new Date();
                const hoursUntilBooking = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

                if (hoursUntilBooking < booking.cancellation_hours)
                {
                    logger.warn('Cancellation too late', {
                        hoursUntilBooking: Math.round(hoursUntilBooking),
                        require: booking.cancellation_hours
                    });
                    throw new Error(
                        `Cancellation must be made at least ${booking.cancellation_hours} hours in advance. ` +
                        `Only ${Math.round(hoursUntilBooking)} hours remaining.`
                    );
                }
            }

            // SCHRITT 4: Storniere Buchung
            await conn.query(`
                UPDATE bookings
                SET
                    status = 'cancelled',
                    cancelled_at = NOW(),
                    cancellation_reason = ?
                WHERE id = ?`,
                [reason || null, booking.id]
            );

            logger.info('Booking cancelled successfully');

            // Audit: Kunde hat über Manage-Link storniert (kein Token speichern)
            await logBookingAction({
                bookingId: booking.id,
                venueId: booking.venue_id,
                action: 'cancel',
                oldStatus: booking.status,
                newStatus: 'cancelled',
                reason: reason ?? null,
                actorType: 'customer',
                customerIdentifier: 'manage_link',
            });

            // SCHRITT 6: Hole die aktualisierte Buchung
            const cancelledBooking = await this.getBookingById(booking.id);

            if (!cancelledBooking)
            {
                logger.warn('Failed to retrieve cancelled booking');
                throw new Error('Failed to retrieve cancelled booking');
            }

            // Stornierungsmail an Kunden (gemäß Doku 1.5)
            try {
                const withDetails = await this.getBookingByIdWithDetails(booking.id);
                if (withDetails) {
                    const { sendCancellation } = await import('./email.service');
                    await sendCancellation({
                        id: withDetails.id,
                        customer_name: withDetails.customer_name,
                        customer_email: withDetails.customer_email,
                        booking_date: withDetails.booking_date,
                        start_time: withDetails.start_time,
                        end_time: withDetails.end_time,
                        special_requests: withDetails.special_requests,
                        venue_name: withDetails.venue_name,
                        service_name: withDetails.service_name,
                        staff_member_name: withDetails.staff_member_name,
                        booking_token: withDetails.booking_token,
                    });
                }
            } catch (emailErr) {
                logger.error('Email after cancel failed (booking already cancelled)', emailErr);
            }

            return cancelledBooking;
        } 
        catch (error) 
        {
            logger.error('Error cancelling booking', error)
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
     * BESTÄTIGE BUCHUNG
     * 
     * Ändert Status von 'pending' zu 'confirmed'
     * 
     * @param bookingId - ID der zu bestätigenden Buchung
     * @returns Die bestätigte Buchung
     */
    static async confirmBooking(bookingId: number): Promise<Booking>
    {
        logger.info(`Confirming booking ${bookingId}...`);

        let conn;
        try 
        {
            conn = await getConnection();

            // Prüfe Existenz zuerst
            const booking = await this.getBookingById(bookingId);
            
            if (!booking)
            {
                logger.warn('Booking not found');
                throw new Error('Booking not found');  // Wird als 404 erkannt!
            }
            
            // Optional: Prüfe ob schon confirmed
            if (booking.status === 'confirmed')
            {
                logger.info('Booking already confirmed');
                return booking;  // Idempotent!
            }
            
            await conn.query(`
                UPDATE bookings
                SET status = 'confirmed',
                    updated_at = NOW()
                WHERE id = ?`,
                [bookingId]
            );
            // confirmation_sent_at wird vom E-Mail-Service nach Versand der Bestätigungsmail gesetzt

            logger.info(`Booking confirmed`);

            const confirmedBooking = await this.getBookingById(bookingId);

            if (!confirmedBooking)
            {
                throw new Error('Failed to retrieve confirmed booking');
            }

            // Bestätigungsmail (inkl. Reaktivierung falls vorher cancelled)
            try {
                const withDetails = await this.getBookingByIdWithDetails(bookingId);
                if (withDetails) {
                    const { sendConfirmation } = await import('./email.service');
                    await sendConfirmation(
                        {
                            id: withDetails.id,
                            customer_name: withDetails.customer_name,
                            customer_email: withDetails.customer_email,
                            booking_date: withDetails.booking_date,
                            start_time: withDetails.start_time,
                            end_time: withDetails.end_time,
                            special_requests: withDetails.special_requests,
                            venue_name: withDetails.venue_name,
                            service_name: withDetails.service_name,
                            staff_member_name: withDetails.staff_member_name,
                            booking_token: withDetails.booking_token,
                        },
                        booking.status === 'cancelled'
                    );
                }
            } catch (emailErr) {
                logger.error('Email after confirm failed (booking already confirmed)', emailErr);
            }

            return confirmedBooking;
        } 
        catch (error) 
        {
            logger.error('Error confirming booking', error);
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
     * LÖSCHE BUCHUNG (HARD DELETE)
     * 
     * ACHTUNG: Dies löscht die Buchung permanent aus der Datenbank!
     * In den meisten Fällen sollte stattdessen cancelBooking() verwendet werden.
     * 
     * @param bookingId - ID der zu löschenden Buchung
     */
    static async deleteBooking(bookingId: number): Promise<void>
    {
        logger.warn(`HARD DELETE booking ${bookingId}`);

        let conn;
        try 
        {

            // Prüfe Existenz zuerst
            const booking = await this.getBookingById(bookingId);
            
            if (!booking)
            {
                logger.warn('Booking not found');
                throw new Error('Booking not found');  // Wird als 404 erkannt!
            }
            
            conn = await getConnection();
            
            await conn.query(`
                DELETE FROM bookings
                WHERE id = ?`,
                [bookingId]
            );

            logger.info('Booking deleted permanently');
        } 
        catch (error) 
        {
            logger.error('Error deleting booking', error);
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
 }