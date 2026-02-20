/**
 * Owner Service (Venue-Management)
 * Nur Rolle owner: Buchungen, Stats, Leistungen, Verfügbarkeit, Venue-Einstellungen
 */

import { getConnection } from '../config/database';
import { createLogger } from '../config/utils/logger';
import { Booking, Service } from '../config/utils/types';
import { BookingService } from './booking.service';
import { logBookingAction } from './audit.service';
import { sendConfirmation, sendCancellation } from './email.service';
import type { BookingForEmail } from './email.service';

const logger = createLogger('owner.service');

export interface BookingWithDetails extends Booking {
    venue_name?: string;
    service_name?: string;
    staff_member_name?: string;
    service_price?: number;
    service_duration?: number;
}

export interface OwnerStats {
    bookings: {
        today: number;
        thisWeek: number;
        thisMonth: number;
        pending: number;
        confirmed: number;
        cancelled: number;
        completed: number;
    };
    revenue: {
        today: number;
        thisWeek: number;
        thisMonth: number;
        total: number;
    };
    popularServices: Array<{
        service_id: number;
        service_name: string;
        booking_count: number;
        total_revenue: number;
    }>;
    popularTimeSlots: Array<{
        hour: number;
        booking_count: number;
    }>;
}

export class OwnerService {
    static async getBookings(
        venueId: number,
        filters?: {
            startDate?: string;
            endDate?: string;
            status?: string;
            serviceId?: number;
            search?: string;
            limit?: number;
            offset?: number;
        }
    ): Promise<{ bookings: BookingWithDetails[]; total: number }> {
        logger.info('Owner: Fetching bookings...', { venueId, filters });
        let conn;
        try {
            conn = await getConnection();
            let query = `
                SELECT b.*, v.name as venue_name, s.name as service_name, s.price as service_price, s.duration_minutes as service_duration, sm.name as staff_member_name
                FROM bookings b
                LEFT JOIN venues v ON b.venue_id = v.id
                LEFT JOIN services s ON b.service_id = s.id
                LEFT JOIN staff_members sm ON b.staff_member_id = sm.id
                WHERE b.venue_id = ?
            `;
            let countQuery = `SELECT COUNT(*) as total FROM bookings b WHERE b.venue_id = ?`;
            const params: (string | number)[] = [venueId];
            const countParams: (string | number)[] = [venueId];
            if (filters?.startDate) { query += ' AND b.booking_date >= ?'; countQuery += ' AND b.booking_date >= ?'; params.push(filters.startDate); countParams.push(filters.startDate); }
            if (filters?.endDate) { query += ' AND b.booking_date <= ?'; countQuery += ' AND b.booking_date <= ?'; params.push(filters.endDate); countParams.push(filters.endDate); }
            if (filters?.status) { query += ' AND b.status = ?'; countQuery += ' AND b.status = ?'; params.push(filters.status); countParams.push(filters.status); }
            if (filters?.serviceId) { query += ' AND b.service_id = ?'; countQuery += ' AND b.service_id = ?'; params.push(filters.serviceId); countParams.push(filters.serviceId); }
            if (filters?.search) {
                const searchTerm = `%${filters.search}%`;
                query += ' AND (b.customer_name LIKE ? OR b.customer_email LIKE ? OR b.customer_phone LIKE ?)';
                countQuery += ' AND (b.customer_name LIKE ? OR b.customer_email LIKE ? OR b.customer_phone LIKE ?)';
                params.push(searchTerm, searchTerm, searchTerm);
                countParams.push(searchTerm, searchTerm, searchTerm);
            }
            query += ' ORDER BY b.booking_date DESC, b.start_time DESC';
            if (filters?.limit) { query += ' LIMIT ?'; params.push(filters.limit); }
            if (filters?.offset) { query += ' OFFSET ?'; params.push(filters.offset); }
            const [bookings, countResult] = await Promise.all([
                conn.query(query, params) as Promise<BookingWithDetails[]>,
                conn.query(countQuery, countParams) as Promise<[{ total: bigint }]>
            ]);
            const total = Number(countResult[0]?.total || 0);
            await BookingService.markPastBookingsCompleted(conn, bookings);
            return { bookings, total };
        } catch (error) {
            logger.error('Owner: Error fetching bookings', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async getBookingById(venueId: number, bookingId: number): Promise<BookingWithDetails | null> {
        let conn;
        try {
            conn = await getConnection();
            const query = `
                SELECT b.*, v.name as venue_name, s.name as service_name, s.price as service_price, s.duration_minutes as service_duration, sm.name as staff_member_name
                FROM bookings b
                LEFT JOIN venues v ON b.venue_id = v.id
                LEFT JOIN services s ON b.service_id = s.id
                LEFT JOIN staff_members sm ON b.staff_member_id = sm.id
                WHERE b.venue_id = ? AND b.id = ?
            `;
            const rows = await conn.query(query, [venueId, bookingId]) as BookingWithDetails[];
            if (rows.length === 0) return null;
            await BookingService.markPastBookingsCompleted(conn, rows);
            return rows[0];
        } catch (error) {
            logger.error('Owner: Error fetching booking by id', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async updateBookingStatus(
        bookingId: number,
        status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show',
        reason?: string,
        auditContext?: { userId: number; actorType: 'admin' | 'owner' | 'staff' },
        allowedVenueId?: number | null
    ): Promise<Booking> {
        logger.info(`Owner: Updating booking ${bookingId} status to ${status}`);
        let conn;
        try {
            conn = await getConnection();
            const existing = await conn.query('SELECT * FROM bookings WHERE id = ?', [bookingId]) as Booking[];
            if (existing.length === 0) throw new Error('Booking not found');
            const booking = existing[0];
            if (allowedVenueId != null && allowedVenueId !== undefined && booking.venue_id !== allowedVenueId)
                throw new Error('Kein Zugriff auf diese Buchung');
            const currentStatus = booking.status;
            const venueId = booking.venue_id;

            const endDateTime = new Date(`${booking.booking_date}T${booking.end_time}`);
            const now = new Date();
            if (endDateTime < now && (status === 'pending' || status === 'confirmed')) {
                throw new Error('Für vergangene Buchungen kann der Status nur auf „Abgeschlossen“, „No-Show“ oder „Storniert“ gesetzt werden.');
            }
            if (endDateTime > now && (status === 'completed' || status === 'no_show')) {
                throw new Error('Ein zukünftiger Termin kann nicht als „Abgeschlossen“ oder „Nicht erschienen“ markiert werden.');
            }

            const isPendingToConfirmed = currentStatus === 'pending' && status === 'confirmed';
            if (!isPendingToConfirmed && (!reason || !String(reason).trim())) throw new Error('Grund ist erforderlich');
            let updateQuery = `UPDATE bookings SET status = ?, updated_at = NOW()`;
            const params: (string | number | null)[] = [status];
            if (status === 'cancelled') { updateQuery += ', cancelled_at = NOW(), cancellation_reason = ?'; params.push(reason || null); }
            if (currentStatus === 'cancelled' && status !== 'cancelled') { updateQuery += ', cancelled_at = NULL, cancellation_reason = NULL'; }
            updateQuery += ' WHERE id = ?';
            params.push(bookingId);
            await conn.query(updateQuery, params);
            const updated = await conn.query('SELECT * FROM bookings WHERE id = ?', [bookingId]) as Booking[];
            if (auditContext) {
                await logBookingAction({
                    bookingId,
                    venueId,
                    action: 'status_change',
                    oldStatus: currentStatus,
                    newStatus: status,
                    reason: reason ?? null,
                    actorType: auditContext.actorType,
                    userId: auditContext.userId,
                });
            }
            try {
                const forEmail = await BookingService.getBookingByIdWithDetails(bookingId);
                if (forEmail) {
                    const bookingForEmail: BookingForEmail = {
                        id: forEmail.id,
                        customer_name: forEmail.customer_name,
                        customer_email: forEmail.customer_email,
                        booking_date: forEmail.booking_date,
                        start_time: forEmail.start_time,
                        end_time: forEmail.end_time,
                        special_requests: forEmail.special_requests,
                        venue_name: forEmail.venue_name,
                        service_name: forEmail.service_name,
                        staff_member_name: forEmail.staff_member_name,
                        booking_token: forEmail.booking_token,
                    };
                    if (status === 'confirmed') {
                        await sendConfirmation(bookingForEmail, currentStatus === 'cancelled');
                    } else if (status === 'cancelled') {
                        await sendCancellation(bookingForEmail);
                        const { sendBookingCancelledToOwner } = await import('./email.service');
                        if (forEmail.venue_id) {
                            await sendBookingCancelledToOwner(bookingForEmail, forEmail.venue_id);
                        }
                    } else if (status === 'completed') {
                        const { sendReviewInvitation } = await import('./email.service');
                        await sendReviewInvitation(bookingForEmail, forEmail.venue_id);
                    }
                }
            } catch (emailErr) {
                logger.error('Owner: Email after status update failed (booking updated)', emailErr);
            }
            if (status === 'completed' && booking.customer_id) {
                try {
                    const { awardPointsForBooking } = await import('./loyalty.service');
                    await awardPointsForBooking(
                        booking.customer_id,
                        bookingId,
                        booking.total_amount ?? undefined
                    );
                } catch (loyaltyErr) {
                    logger.error('Owner: Loyalty points award failed (booking updated)', loyaltyErr);
                }
            }
            return updated[0];
        } catch (error) {
            logger.error('Owner: Error updating booking status', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async getStats(venueId: number): Promise<OwnerStats> {
        logger.info(`Owner: Fetching stats for venue ${venueId}`);
        let conn;
        try {
            conn = await getConnection();
            const activeCondition = "status IN ('confirmed', 'completed')";
            const completedCondition = "status = 'completed'";
            const [bookingStats] = await conn.query(`
                SELECT COUNT(CASE WHEN booking_date = CURDATE() AND ${activeCondition} THEN 1 END) as today,
                    COUNT(CASE WHEN booking_date >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())) DAY) AND booking_date < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND ${activeCondition} THEN 1 END) as this_week,
                    COUNT(CASE WHEN MONTH(booking_date) = MONTH(CURDATE()) AND YEAR(booking_date) = YEAR(CURDATE()) AND ${activeCondition} THEN 1 END) as this_month,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                    COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
                FROM bookings WHERE venue_id = ?
            `, [venueId]) as [{ today: bigint; this_week: bigint; this_month: bigint; pending: bigint; confirmed: bigint; cancelled: bigint; completed: bigint }];
            const [revenueStats] = await conn.query(`
                SELECT COALESCE(SUM(CASE WHEN booking_date = CURDATE() AND ${completedCondition} THEN total_amount END), 0) as today,
                    COALESCE(SUM(CASE WHEN booking_date >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())) DAY) AND booking_date < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND ${completedCondition} THEN total_amount END), 0) as this_week,
                    COALESCE(SUM(CASE WHEN MONTH(booking_date) = MONTH(CURDATE()) AND YEAR(booking_date) = YEAR(CURDATE()) AND ${completedCondition} THEN total_amount END), 0) as this_month,
                    COALESCE(SUM(CASE WHEN ${completedCondition} THEN total_amount END), 0) as total
                FROM bookings WHERE venue_id = ?
            `, [venueId]) as [{ today: string; this_week: string; this_month: string; total: string }];
            const popularServices = await conn.query(`
                SELECT b.service_id, s.name as service_name, COUNT(*) as booking_count, COALESCE(SUM(b.total_amount), 0) as total_revenue
                FROM bookings b JOIN services s ON b.service_id = s.id
                WHERE b.venue_id = ? AND b.status = 'completed'
                GROUP BY b.service_id, s.name ORDER BY booking_count DESC LIMIT 5
            `, [venueId]) as Array<{ service_id: number; service_name: string; booking_count: bigint; total_revenue: string }>;
            const popularTimeSlots = await conn.query(`
                SELECT HOUR(start_time) as hour, COUNT(*) as booking_count
                FROM bookings WHERE venue_id = ? AND status = 'completed'
                GROUP BY HOUR(start_time) ORDER BY booking_count DESC LIMIT 10
            `, [venueId]) as Array<{ hour: number; booking_count: bigint }>;
            return {
                bookings: {
                    today: Number(bookingStats?.today || 0),
                    thisWeek: Number(bookingStats?.this_week || 0),
                    thisMonth: Number(bookingStats?.this_month || 0),
                    pending: Number(bookingStats?.pending || 0),
                    confirmed: Number(bookingStats?.confirmed || 0),
                    cancelled: Number(bookingStats?.cancelled || 0),
                    completed: Number(bookingStats?.completed || 0),
                },
                revenue: {
                    today: parseFloat(revenueStats?.today || '0'),
                    thisWeek: parseFloat(revenueStats?.this_week || '0'),
                    thisMonth: parseFloat(revenueStats?.this_month || '0'),
                    total: parseFloat(revenueStats?.total || '0'),
                },
                popularServices: popularServices.map(s => ({ service_id: s.service_id, service_name: s.service_name, booking_count: Number(s.booking_count), total_revenue: parseFloat(s.total_revenue || '0') })),
                popularTimeSlots: popularTimeSlots.map(t => ({ hour: t.hour, booking_count: Number(t.booking_count) })),
            };
        } catch (error) {
            logger.error('Owner: Error fetching stats', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async getServices(venueId: number): Promise<Service[]> {
        let conn;
        try {
            conn = await getConnection();
            const services = await conn.query('SELECT * FROM services WHERE venue_id = ? ORDER BY name ASC', [venueId]) as Service[];
            return services;
        } catch (error) {
            logger.error('Owner: Error fetching services', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async updateService(serviceId: number, updates: { name?: string; description?: string; duration_minutes?: number; price?: number; is_active?: boolean }, venueId: number): Promise<Service> {
        let conn;
        try {
            conn = await getConnection();
            const existing = await conn.query('SELECT * FROM services WHERE id = ?', [serviceId]) as Service[];
            if (existing.length === 0) throw new Error('Service not found');
            if (existing[0].venue_id !== venueId) throw new Error('Kein Zugriff auf diesen Service');
            const updateFields: string[] = [];
            const params: (string | number | boolean)[] = [];
            if (updates.name !== undefined) { updateFields.push('name = ?'); params.push(updates.name); }
            if (updates.description !== undefined) { updateFields.push('description = ?'); params.push(updates.description); }
            if (updates.duration_minutes !== undefined) { updateFields.push('duration_minutes = ?'); params.push(updates.duration_minutes); }
            if (updates.price !== undefined) { updateFields.push('price = ?'); params.push(updates.price); }
            if (updates.is_active !== undefined) { updateFields.push('is_active = ?'); params.push(updates.is_active); }
            if (updateFields.length === 0) return existing[0];
            updateFields.push('updated_at = NOW()');
            params.push(serviceId);
            await conn.query(`UPDATE services SET ${updateFields.join(', ')} WHERE id = ?`, params);
            const updated = await conn.query('SELECT * FROM services WHERE id = ?', [serviceId]) as Service[];
            return updated[0];
        } catch (error) {
            logger.error('Owner: Error updating service', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async getAvailabilityRules(venueId: number): Promise<Array<{ id: number; venue_id: number | null; staff_member_id: number | null; staff_member_name?: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean }>> {
        let conn;
        try {
            conn = await getConnection();
            const rules = await conn.query(`
                SELECT ar.*, sm.name as staff_member_name
                FROM availability_rules ar
                LEFT JOIN staff_members sm ON ar.staff_member_id = sm.id
                WHERE ar.venue_id = ? OR ar.staff_member_id IN (SELECT id FROM staff_members WHERE venue_id = ?)
                ORDER BY ar.day_of_week, ar.start_time
            `, [venueId, venueId]);
            return rules as Array<{ id: number; venue_id: number | null; staff_member_id: number | null; staff_member_name?: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean }>;
        } catch (error) {
            logger.error('Owner: Error fetching availability rules', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async updateAvailabilityRule(ruleId: number, updates: { start_time?: string; end_time?: string; is_active?: boolean }, venueId: number): Promise<void> {
        let conn;
        try {
            conn = await getConnection();
            const rules = await conn.query('SELECT * FROM availability_rules WHERE id = ?', [ruleId]) as Array<{ id: number; venue_id: number | null; staff_member_id: number | null }>;
            if (rules.length === 0) throw new Error('Verfügbarkeitsregel nicht gefunden');
            const rule = rules[0];
            if (rule.venue_id !== null) {
                if (rule.venue_id !== venueId) throw new Error('Kein Zugriff auf diese Verfügbarkeitsregel');
            } else if (rule.staff_member_id != null) {
                const staff = await conn.query('SELECT venue_id FROM staff_members WHERE id = ?', [rule.staff_member_id]) as Array<{ venue_id: number }>;
                if (staff.length === 0 || staff[0].venue_id !== venueId) throw new Error('Kein Zugriff auf diese Verfügbarkeitsregel');
            } else {
                throw new Error('Kein Zugriff auf diese Verfügbarkeitsregel');
            }
            const updateFields: string[] = [];
            const params: (string | boolean | number)[] = [];
            if (updates.start_time !== undefined) { updateFields.push('start_time = ?'); params.push(updates.start_time); }
            if (updates.end_time !== undefined) { updateFields.push('end_time = ?'); params.push(updates.end_time); }
            if (updates.is_active !== undefined) { updateFields.push('is_active = ?'); params.push(updates.is_active); }
            if (updateFields.length === 0) return;
            params.push(ruleId);
            await conn.query(`UPDATE availability_rules SET ${updateFields.join(', ')} WHERE id = ?`, params);
        } catch (error) {
            logger.error('Owner: Error updating availability rule', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }

    static async updateVenueSettings(venueId: number, updates: { booking_advance_days?: number; booking_advance_hours?: number; cancellation_hours?: number; image_url?: string | null }): Promise<void> {
        let conn;
        try {
            conn = await getConnection();
            const updateFields: string[] = [];
            const params: (number | string | null)[] = [];
            if (updates.booking_advance_days !== undefined) { updateFields.push('booking_advance_days = ?'); params.push(updates.booking_advance_days); }
            if (updates.booking_advance_hours !== undefined) { updateFields.push('booking_advance_hours = ?'); params.push(updates.booking_advance_hours); }
            if (updates.cancellation_hours !== undefined) { updateFields.push('cancellation_hours = ?'); params.push(updates.cancellation_hours); }
            if (updates.image_url !== undefined) { updateFields.push('image_url = ?'); params.push(updates.image_url); }
            if (updateFields.length === 0) return;
            params.push(venueId);
            await conn.query(`UPDATE venues SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
        } catch (error) {
            logger.error('Owner: Error updating venue settings', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }
}
