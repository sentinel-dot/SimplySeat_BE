/**
 * Booking Audit Service
 * Schreibt Änderungen an Buchungen in booking_audit_log (wer, wann, was).
 * Wird bei Admin-Statusänderung, Kunden-Stornierung und Kunden-Update (Manage-Link) aufgerufen.
 */

import { getConnection } from '../config/database';
import { createLogger } from '../config/utils/logger';

const logger = createLogger('audit.service');

export type AuditAction = 'status_change' | 'cancel' | 'update';
export type AuditActorType = 'admin' | 'owner' | 'staff' | 'customer' | 'system';

export interface LogBookingActionParams {
    bookingId: number;
    venueId: number;
    action: AuditAction;
    oldStatus?: string | null;
    newStatus?: string | null;
    reason?: string | null;
    actorType: AuditActorType;
    userId?: number | null;
    customerIdentifier?: string | null;
}

/**
 * Schreibt einen Eintrag in booking_audit_log.
 * Fehler werden geloggt, aber nicht geworfen, damit der eigentliche Request nicht scheitert.
 */
export async function logBookingAction(params: LogBookingActionParams): Promise<void> {
    const {
        bookingId,
        venueId,
        action,
        oldStatus = null,
        newStatus = null,
        reason = null,
        actorType,
        userId = null,
        customerIdentifier = null,
    } = params;

    let conn;
    try {
        conn = await getConnection();
        await conn.query(
            `INSERT INTO booking_audit_log
             (booking_id, venue_id, action, old_status, new_status, reason, actor_type, user_id, customer_identifier)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                bookingId,
                venueId,
                action,
                oldStatus,
                newStatus,
                reason,
                actorType,
                userId,
                customerIdentifier,
            ]
        );
        logger.debug('Audit log written', { bookingId, action, actorType });
    } catch (error) {
        logger.error('Failed to write audit log (non-fatal)', { bookingId, action, error });
        // Nicht werfen – Hauptaktion (Status-Update, Stornierung) soll trotzdem erfolgreich sein
    } finally {
        if (conn) conn.release();
    }
}

export interface AuditLogEntry {
    id: number;
    action: AuditAction;
    old_status: string | null;
    new_status: string | null;
    reason: string | null;
    actor_type: AuditActorType;
    actor_label: string | null;
    created_at: string;
}

/**
 * Liest den Audit-Verlauf für eine Buchung (nur Einträge der angegebenen Venue).
 * Für Dashboard: Betreiber sieht nur Verlauf der eigenen Buchungen.
 */
export async function getAuditLogForBooking(bookingId: number, venueId: number): Promise<AuditLogEntry[]> {
    let conn;
    try {
        conn = await getConnection();
        const rows = await conn.query(
            `SELECT a.id, a.action, a.old_status, a.new_status, a.reason, a.actor_type, a.customer_identifier, a.created_at, u.name AS admin_name
             FROM booking_audit_log a
             LEFT JOIN users u ON a.user_id = u.id
             WHERE a.booking_id = ? AND a.venue_id = ?
             ORDER BY a.created_at DESC`,
            [bookingId, venueId]
        ) as (AuditLogEntry & { customer_identifier?: string | null; admin_name?: string | null })[];
        return rows.map((r) => ({
            id: r.id,
            action: r.action,
            old_status: r.old_status,
            new_status: r.new_status,
            reason: r.reason,
            actor_type: r.actor_type,
            actor_label: r.actor_type === 'customer' ? (r.customer_identifier || 'Kunde') : (r.admin_name || (r.actor_type === 'admin' ? 'System-Admin' : r.actor_type === 'owner' ? 'Betreiber' : r.actor_type === 'staff' ? 'Mitarbeiter' : 'System')),
            created_at: (r.created_at as unknown) instanceof Date ? (r.created_at as unknown as Date).toISOString() : String(r.created_at),
        }));
    } catch (error) {
        logger.error('Failed to read audit log', { bookingId, venueId, error });
        throw error;
    } finally {
        if (conn) conn.release();
    }
}
