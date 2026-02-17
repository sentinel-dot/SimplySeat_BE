/**
 * Erinnerungs-Job: sendet Erinnerungs-E-Mails an Kunden mit bestätigter Buchung
 * z. B. 24 h vor Termin (REMINDER_HOURS). Läuft per Cron alle 15 Minuten.
 */

import cron from 'node-cron';
import { getConnection } from '../config/database';
import { createLogger } from '../config/utils/logger';
import { sendReminder, getReminderHours } from '../services/email.service';
import type { BookingForEmail } from '../services/email.service';

const logger = createLogger('reminder.job');

/** Buchungen, bei denen Termin in reminderWindow (z. B. 23–25 h) liegt, status=confirmed, reminder_sent_at IS NULL */
async function findBookingsDueForReminder(): Promise<BookingForEmail[]> {
  const hours = getReminderHours();
  const conn = await getConnection();
  try {
    const rows = await conn.query(
      `SELECT b.id, b.customer_name, b.customer_email, b.booking_date, b.start_time, b.end_time,
              b.special_requests, b.booking_token, v.name as venue_name, s.name as service_name, sm.name as staff_member_name
       FROM bookings b
       LEFT JOIN venues v ON b.venue_id = v.id
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN staff_members sm ON b.staff_member_id = sm.id
       WHERE b.status = 'confirmed'
         AND b.reminder_sent_at IS NULL
         AND b.booking_date >= CURDATE()
         AND CONCAT(b.booking_date, ' ', b.start_time) BETWEEN
             DATE_ADD(NOW(), INTERVAL ? HOUR) AND DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [hours - 1, hours + 1]
    ) as (BookingForEmail)[];
    return Array.isArray(rows) ? rows : [];
  } finally {
    conn.release();
  }
}

export async function runReminderJob(): Promise<void> {
  try {
    const list = await findBookingsDueForReminder();
    if (list.length === 0) return;
    logger.info(`Reminder job: sending ${list.length} reminder(s)`);
    for (const b of list) {
      try {
        await sendReminder(b); // setReminderSentAt wird im Service nach Erfolg gesetzt
      } catch (err) {
        logger.error(`Reminder failed for booking ${b.id}`, err);
      }
    }
  } catch (err) {
    logger.error('Reminder job error', err);
  }
}

/** Startet den Cron: alle 15 Minuten. */
export function startReminderCron(): void {
  cron.schedule('*/15 * * * *', () => {
    runReminderJob();
  });
  logger.info('Reminder cron started (every 15 min)');
}
