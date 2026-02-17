/**
 * E-Mail-Service für Buchungs-Benachrichtigungen
 * - Wenn BREVO_API_KEY gesetzt: Versand über Brevo HTTP-API (HTTPS, funktioniert zuverlässig auf Railway/Cloud).
 * - Sonst Nodemailer mit SMTP (z. B. Resend, SendGrid, Brevo, Mailgun).
 * - Ohne beides: E-Mails nur im Log (z. B. lokale Entwicklung).
 */

import nodemailer, { Transporter } from 'nodemailer';
import { createLogger } from '../config/utils/logger';
import { getConnection } from '../config/database';

const logger = createLogger('email.service');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/** Buchungsdaten, die für E-Mail-Texte benötigt werden (inkl. Venue/Service-Namen) */
export interface BookingForEmail {
  id: number;
  customer_name: string;
  customer_email: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  special_requests?: string | null;
  venue_name?: string | null;
  service_name?: string | null;
  staff_member_name?: string | null;
  booking_token?: string | null;
}

const MAIL_FROM_RAW = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@simplyseat.de';
const MAIL_FROM = MAIL_FROM_RAW;
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
const REMINDER_HOURS = parseInt(process.env.REMINDER_HOURS ?? '24', 10) || 24;

/** Parse "Name<email@domain.com>" or use raw as email. */
function parseSender(raw: string): { name: string; email: string } {
  const match = raw.trim().match(/^([^<]*)<([^>]+)>$/);
  if (match) {
    return { name: (match[1] || 'SimplySeat').trim(), email: match[2].trim() };
  }
  return { name: 'SimplySeat', email: raw.trim() || 'noreply@simplyseat.de' };
}

/** Design-Tokens wie im Frontend (globals.css) – für E-Mail inline verwendet */
const EMAIL_STYLE = {
  pageBg: '#f9fafb', // Helleres Grau (slate-50)
  surface: '#ffffff',
  border: '#e5e7eb', // gray-200
  text: '#111827', // gray-900
  textSoft: '#374151', // gray-700
  muted: '#6b7280', // gray-500
  accent: '#c41e3a',
  accentHover: '#a01930',
  accentMuted: '#fce8eb',
  radius: '12px',
  radiusSm: '8px',
  radiusBtn: '12px', // rounded-xl
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
} as const;

/**
 * E-Mail-Layout wie Frontend: cleaner Look, System-Fonts, hochwertige Typografie.
 */
function emailLayout(opts: {
  title: string;
  bodyContent: string;
  cta?: { text: string; url: string };
  preheader?: string;
}): string {
  const { title, bodyContent, cta, preheader = 'simplyseat' } = opts;
  // Bulletproof button: Hintergrund auf der <td>, damit Clients den Button nicht als blauen Link darstellen
  const ctaBlock = cta
    ? `
  <table role="presentation" class="email-cta" border="0" cellpadding="0" cellspacing="0" align="center" style="margin-top: 32px; margin-bottom: 32px;">
    <tr>
      <td align="center" style="border-radius: ${EMAIL_STYLE.radiusBtn}; background-color: ${EMAIL_STYLE.accent}; padding: 14px 28px;">
        <a href="${cta.url}" class="email-cta" style="display: inline-block; color: #ffffff !important; text-decoration: none !important; font-weight: 600; font-size: 14px; font-family: ${EMAIL_STYLE.fontFamily}; mso-line-height-rule: exactly;">${cta.text}</a>
      </td>
    </tr>
  </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="de" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title.replace(/</g, '&lt;')}</title>
  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <style>
    table {border-collapse: collapse;}
    td,th,div,p,a,h1,h2,h3,h4,h5,h6 {font-family: "Segoe UI", sans-serif; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style>
    .email-cta, .email-cta a { color: #ffffff !important; text-decoration: none !important; }
    .email-logo, .email-logo a { color: #111827 !important; text-decoration: none !important; font-size: 18px !important; font-weight: 700 !important; }
    @media screen and (max-width: 600px) {
      .content-cell { padding: 24px !important; }
      .header-cell { padding: 24px 0 !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_STYLE.pageBg}; font-family: ${EMAIL_STYLE.fontFamily}; font-size: 16px; line-height: 1.6; color: ${EMAIL_STYLE.textSoft}; -webkit-font-smoothing: antialiased; word-spacing: normal;">
  ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${preheader}</div>` : ''}
  <div role="article" aria-roledescription="email" lang="de" style="text-size-adjust: 100%; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: ${EMAIL_STYLE.pageBg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <!-- Logo: Größe/Farbe auf td + Spans, damit Clients es nicht als blauen Link darstellen -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
            <tr>
              <td align="center" class="header-cell email-logo" style="padding-bottom: 32px; font-size: 18px; font-weight: 700; font-family: ${EMAIL_STYLE.fontFamily};">
                <a href="${PUBLIC_APP_URL.replace(/\/$/, '')}" class="email-logo" style="color: ${EMAIL_STYLE.text} !important; text-decoration: none !important; font-size: 18px !important; font-weight: 700 !important; font-family: ${EMAIL_STYLE.fontFamily};"><span style="color: ${EMAIL_STYLE.accent}; font-weight: 700;">easy</span><span style="color: ${EMAIL_STYLE.text}; font-weight: 700;">seat</span></a>
              </td>
            </tr>
          </table>

          <!-- Card -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: ${EMAIL_STYLE.surface}; border-radius: ${EMAIL_STYLE.radius}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            <tr>
              <td class="content-cell" style="padding: 48px;">
                ${bodyContent}
                ${ctaBlock}
                <p style="margin: 32px 0 0 0; font-size: 14px; color: ${EMAIL_STYLE.muted}; text-align: center;">
                  Haben Sie Fragen? Antworten Sie einfach auf diese E-Mail.
                </p>
              </td>
            </tr>
          </table>

          <!-- Footer -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
            <tr>
              <td align="center" style="padding-top: 32px; font-size: 12px; color: ${EMAIL_STYLE.muted}; text-align: center;">
                <p style="margin: 0;">&copy; ${new Date().getFullYear()} SimplySeat. Alle Rechte vorbehalten.</p>
                <p style="margin: 8px 0 0 0;">Diese E-Mail wurde automatisch generiert.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

/** Logged on first use and on send failure (no secrets) so Railway logs show actual SMTP config. */
let smtpConfigForLog: { host: string; port: number; secure: boolean } | null = null;

function getTransport(): Transporter | null {
  const host = (process.env.SMTP_HOST ?? '').trim();
  const user = (process.env.SMTP_USER ?? '').trim();
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    logger.info('SMTP not configured (SMTP_HOST/USER/PASS). Emails will be logged only.');
    return null;
  }
  const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';
  // Port 587 = STARTTLS (secure: false, requireTLS: true). Port 465 = implicit TLS (secure: true).
  // Cloud (Railway/Vercel) often blocks port 25; use 587 or 465. Increase timeouts if provider is slow.
  const connectionTimeout = parseInt(process.env.SMTP_CONNECTION_TIMEOUT ?? '30000', 10);
  const greetingTimeout = parseInt(process.env.SMTP_GREETING_TIMEOUT ?? '15000', 10);

  smtpConfigForLog = { host, port, secure };
  logger.info('SMTP transport created', {
    host,
    port,
    secure,
    connectionTimeout,
    greetingTimeout,
    userHint: user ? `${user.slice(0, 4)}***` : '(none)',
  });

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    requireTLS: port === 587 && !secure,
    connectionTimeout,
    greetingTimeout,
  });
}

let cachedTransport: Transporter | null | undefined = undefined;

function transport(): Transporter | null {
  if (cachedTransport === undefined) cachedTransport = getTransport();
  return cachedTransport;
}

/** Send via Brevo HTTP API (HTTPS, no SMTP from server – works on Railway/cloud). */
async function sendViaBrevoApi(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const apiKey = (process.env.BREVO_API_KEY ?? '').trim();
  if (!apiKey) return false;
  const sender = parseSender(MAIL_FROM_RAW);
  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { name: sender.name, email: sender.email },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error('Brevo API error', { status: res.status, statusText: res.statusText, body: body.slice(0, 500) });
      return false;
    }
    logger.info('Email sent via Brevo API', { to, subject: subject.slice(0, 50) });
    return true;
  } catch (err) {
    logger.error('Brevo API request failed', err);
    return false;
  }
}

function useBrevoApi(): boolean {
  return !!((process.env.BREVO_API_KEY ?? '').trim());
}

function manageLink(booking: BookingForEmail): string {
  const token = booking.booking_token;
  const base = PUBLIC_APP_URL.replace(/\/$/, '');
  return token ? `${base}/bookings/manage/${token}` : `${base}/bookings`;
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function notesBlock(booking: BookingForEmail): { html: string; text: string } {
  if (!booking.special_requests || !String(booking.special_requests).trim()) return { html: '', text: '' };
  const escaped = String(booking.special_requests).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    html: `
    <div style="margin-top: 24px; padding: 16px; background-color: #fff1f2; border-radius: 8px; border: 1px solid ${EMAIL_STYLE.accentMuted};">
      <p style="margin: 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${EMAIL_STYLE.accent};">Ihre Notizen</p>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: ${EMAIL_STYLE.textSoft}; line-height: 1.5;">${escaped}</p>
    </div>\n`,
    text: `Ihre Notizen: ${booking.special_requests}\n\n`,
  };
}

/** Buchungsdetails als moderne Info-Box. */
function bookingDetailsBlock(booking: BookingForEmail): string {
  const staff = booking.staff_member_name
    ? `
    <tr>
      <td style="padding-top: 12px; border-top: 1px solid ${EMAIL_STYLE.border}; margin-top: 12px;">
        <p style="margin: 0; font-size: 13px; color: ${EMAIL_STYLE.muted};">Ansprechpartner</p>
        <p style="margin: 2px 0 0 0; font-size: 15px; font-weight: 500; color: ${EMAIL_STYLE.text};">${booking.staff_member_name}</p>
      </td>
    </tr>`
    : '';

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0; background-color: #f9fafb; border-radius: 12px; overflow: hidden;">
    <tr>
      <td style="padding: 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom: 8px;">
              <p style="margin: 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${EMAIL_STYLE.muted};">Service</p>
              <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 700; color: ${EMAIL_STYLE.text}; line-height: 1.3;">${(booking.service_name || 'Ihre Buchung').replace(/</g, '&lt;')}</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 16px; padding-bottom: ${staff ? '16px' : '0'};">
              <p style="margin: 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${EMAIL_STYLE.muted};">Zeitpunkt</p>
              <p style="margin: 4px 0 0 0; font-size: 16px; color: ${EMAIL_STYLE.text};">${formatDate(booking.booking_date)}</p>
              <p style="margin: 0; font-size: 16px; color: ${EMAIL_STYLE.text};">${booking.start_time} – ${booking.end_time} Uhr</p>
            </td>
          </tr>
          ${staff}
        </table>
      </td>
    </tr>
  </table>`;
}

/**
 * Setzt confirmation_sent_at nach erfolgreichem Versand der Bestätigungsmail.
 */
export async function setConfirmationSentAt(bookingId: number): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.query(
      'UPDATE bookings SET confirmation_sent_at = NOW() WHERE id = ?',
      [bookingId]
    );
  } finally {
    conn.release();
  }
}

/**
 * Setzt reminder_sent_at nach erfolgreichem Versand der Erinnerungsmail.
 */
export async function setReminderSentAt(bookingId: number): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.query(
      'UPDATE bookings SET reminder_sent_at = NOW() WHERE id = ?',
      [bookingId]
    );
  } finally {
    conn.release();
  }
}

/**
 * Mail direkt nach Buchungserstellung (Status pending): „Vielen Dank – wir prüfen und bestätigen in Kürze.“
 */
export async function sendBookingReceived(booking: BookingForEmail): Promise<boolean> {
  const venueName = booking.venue_name || 'Unser Betrieb';
  const serviceName = booking.service_name || 'Ihre Buchung';
  const subject = `Vielen Dank für Ihre Buchung bei ${venueName}`;

  const bodyContent = `
  <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: ${EMAIL_STYLE.text}; letter-spacing: -0.5px;">Buchung eingegangen</h1>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Hallo ${booking.customer_name.replace(/</g, '&lt;')},</p>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Vielen Dank für Ihre Buchung. Wir haben Ihre Anfrage erhalten und prüfen sie. Sie erhalten in Kürze eine Bestätigung, sobald Ihr Termin freigegeben ist.</p>
  ${bookingDetailsBlock(booking)}
  ${notesBlock(booking).html}
  <p style="margin: 24px 0 0 0; font-size: 14px; color: ${EMAIL_STYLE.muted};">Sie können den Status Ihrer Buchung jederzeit online einsehen.</p>`;
  
  const html = emailLayout({
    title: 'Buchung eingegangen',
    bodyContent,
    cta: { text: 'Buchung verwalten', url: manageLink(booking) },
    preheader: `Ihre Buchung bei ${venueName} ist eingegangen.`,
  });

  const notesT = notesBlock(booking).text;
  const text = `Hallo ${booking.customer_name},\n\nVielen Dank für Ihre Buchung. Wir haben Ihre Anfrage erhalten und prüfen sie. Sie erhalten in Kürze eine Bestätigung, sobald Ihr Termin freigegeben ist.\n\n${serviceName}\n${formatDate(booking.booking_date)} · ${booking.start_time}–${booking.end_time} Uhr${booking.staff_member_name ? `\nAnsprechpartner: ${booking.staff_member_name}` : ''}${notesT}\nBuchung verwalten: ${manageLink(booking)}\n\nMit freundlichen Grüßen\n${venueName}`;

  return sendMail({
    to: booking.customer_email,
    subject,
    html,
    text,
    bookingId: booking.id,
    type: 'booking_received',
  });
}

/**
 * Bestätigungsmail (pending → confirmed oder cancelled → confirmed).
 * Bei isReactivation: Formulierung „Ihre Buchung ist wieder gültig“.
 */
export async function sendConfirmation(
  booking: BookingForEmail,
  isReactivation = false
): Promise<boolean> {
  const venueName = booking.venue_name || 'Unser Betrieb';
  const serviceName = booking.service_name || 'Ihre Buchung';
  const subject = isReactivation
    ? `Ihre Buchung bei ${venueName} ist wieder bestätigt`
    : `Ihre Buchung bei ${venueName} ist bestätigt`;

  const intro = isReactivation
    ? `Ihre Buchung ist wieder gültig. Sie können wie geplant zu Ihrem Termin kommen.`
    : `Ihre Buchung wurde bestätigt. Wir freuen uns auf Ihren Besuch.`;

  const bodyContent = `
  <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: ${EMAIL_STYLE.text}; letter-spacing: -0.5px;">Buchung bestätigt</h1>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Hallo ${booking.customer_name.replace(/</g, '&lt;')},</p>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">${intro}</p>
  ${bookingDetailsBlock(booking)}
  ${notesBlock(booking).html}
  <p style="margin: 24px 0 0 0; font-size: 14px; color: ${EMAIL_STYLE.muted};">Sie können Ihre Buchung jederzeit online einsehen oder ändern.</p>`;
  
  const html = emailLayout({
    title: 'Buchungsbestätigung',
    bodyContent,
    cta: { text: 'Buchung verwalten', url: manageLink(booking) },
    preheader: isReactivation ? 'Ihre Buchung ist wieder bestätigt.' : 'Ihre Buchung ist bestätigt.',
  });

  const notesT = notesBlock(booking).text;
  const text = `Hallo ${booking.customer_name},\n\n${intro}\n\n${serviceName}\n${formatDate(booking.booking_date)} · ${booking.start_time}–${booking.end_time} Uhr${booking.staff_member_name ? `\nAnsprechpartner: ${booking.staff_member_name}` : ''}${notesT}\nBuchung verwalten: ${manageLink(booking)}\n\nMit freundlichen Grüßen\n${venueName}`;

  return sendMail({
    to: booking.customer_email,
    subject,
    html,
    text,
    bookingId: booking.id,
    type: 'confirmation',
    onSuccess: () => setConfirmationSentAt(booking.id),
  });
}

/**
 * Stornierungsmail (→ cancelled).
 */
export async function sendCancellation(booking: BookingForEmail): Promise<boolean> {
  const venueName = booking.venue_name || 'Unser Betrieb';
  const serviceName = booking.service_name || 'Ihre Buchung';
  const subject = `Ihre Buchung bei ${venueName} wurde storniert`;

  const bodyContent = `
  <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: ${EMAIL_STYLE.text}; letter-spacing: -0.5px;">Buchung storniert</h1>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Hallo ${booking.customer_name.replace(/</g, '&lt;')},</p>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Ihre folgende Buchung wurde storniert:</p>
  ${bookingDetailsBlock(booking)}
  ${notesBlock(booking).html}
  <p style="margin: 24px 0 0 0; font-size: 14px; color: ${EMAIL_STYLE.muted};">Falls Sie Fragen haben, wenden Sie sich bitte direkt an ${venueName.replace(/</g, '&lt;')}.</p>`;
  
  const html = emailLayout({
    title: 'Stornierung',
    bodyContent,
    preheader: `Ihre Buchung bei ${venueName} wurde storniert.`,
  });

  const notesT = notesBlock(booking).text;
  const text = `Hallo ${booking.customer_name},\n\nIhre folgende Buchung wurde storniert:\n\n${serviceName}\n${formatDate(booking.booking_date)} · ${booking.start_time}–${booking.end_time} Uhr${notesT}\nBei Fragen wenden Sie sich bitte an ${venueName}.\n\nMit freundlichen Grüßen\n${venueName}`;

  return sendMail({
    to: booking.customer_email,
    subject,
    html,
    text,
    bookingId: booking.id,
    type: 'cancellation',
  });
}

/**
 * Erinnerungsmail (zeitgesteuert, z. B. 24 h vor Termin).
 */
export async function sendReminder(booking: BookingForEmail): Promise<boolean> {
  const venueName = booking.venue_name || 'Unser Betrieb';
  const serviceName = booking.service_name || 'Ihre Buchung';
  const subject = `Erinnerung: Ihr Termin bei ${venueName} morgen`;

  const bodyContent = `
  <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: ${EMAIL_STYLE.text}; letter-spacing: -0.5px;">Terminerinnerung</h1>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Hallo ${booking.customer_name.replace(/</g, '&lt;')},</p>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Wir erinnern Sie an Ihren Termin morgen:</p>
  ${bookingDetailsBlock(booking)}
  ${notesBlock(booking).html}
  <p style="margin: 24px 0 0 0; font-size: 14px; color: ${EMAIL_STYLE.muted};">Falls Sie den Termin nicht wahrnehmen können, ändern oder stornieren Sie ihn bitte rechtzeitig.</p>`;
  
  const html = emailLayout({
    title: 'Terminerinnerung',
    bodyContent,
    cta: { text: 'Buchung ansehen oder ändern', url: manageLink(booking) },
    preheader: `Erinnerung: Ihr Termin bei ${venueName} morgen.`,
  });

  const notesT = notesBlock(booking).text;
  const text = `Hallo ${booking.customer_name},\n\nWir erinnern Sie an Ihren Termin:\n\n${serviceName}\n${formatDate(booking.booking_date)} · ${booking.start_time}–${booking.end_time} Uhr${booking.staff_member_name ? `\nAnsprechpartner: ${booking.staff_member_name}` : ''}${notesT}\nBuchung ansehen oder ändern: ${manageLink(booking)}\n\nMit freundlichen Grüßen\n${venueName}`;

  return sendMail({
    to: booking.customer_email,
    subject,
    html,
    text,
    bookingId: booking.id,
    type: 'reminder',
    onSuccess: () => setReminderSentAt(booking.id),
  });
}

/**
 * Einladung zur Bewertung nach abgeschlossener Buchung (completed).
 */
export async function sendReviewInvitation(booking: BookingForEmail, venueId: number): Promise<boolean> {
  const venueName = booking.venue_name || 'Unser Betrieb';
  const baseUrl = PUBLIC_APP_URL.replace(/\/$/, '');
  const reviewUrl = `${baseUrl}/venues/${venueId}`;
  const subject = `Wie hat es Ihnen gefallen? Bewerten Sie ${venueName}`;

  const bodyContent = `
  <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: ${EMAIL_STYLE.text}; letter-spacing: -0.5px;">Wie war es?</h1>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Hallo ${booking.customer_name.replace(/</g, '&lt;')},</p>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Ihr Termin bei <strong style="color: ${EMAIL_STYLE.text};">${venueName.replace(/</g, '&lt;')}</strong> ist abgeschlossen. Wir würden uns sehr freuen, wenn Sie uns Ihre Erfahrung mitteilen.</p>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Ihre Bewertung hilft anderen Gästen und uns, unseren Service zu verbessern.</p>`;
  
  const html = emailLayout({
    title: 'Bewertung',
    bodyContent,
    cta: { text: 'Jetzt bewerten', url: reviewUrl },
    preheader: `Wie hat es Ihnen bei ${venueName} gefallen?`,
  });

  const text = `Hallo ${booking.customer_name},\n\nIhr Termin bei ${venueName} ist abgeschlossen. Wir würden uns freuen, wenn Sie uns Ihre Erfahrung mitteilen.\n\nJetzt bewerten: ${reviewUrl}\n\nMit freundlichen Grüßen\n${venueName}`;

  return sendMail({
    to: booking.customer_email,
    subject,
    html,
    text,
    bookingId: booking.id,
    type: 'review_invitation',
  });
}

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  bookingId: number;
  type: 'confirmation' | 'cancellation' | 'reminder' | 'booking_received' | 'review_invitation';
  onSuccess?: () => Promise<void>;
}

async function sendMail(opts: SendMailOptions): Promise<boolean> {
  if (useBrevoApi()) {
    const ok = await sendViaBrevoApi(opts.to, opts.subject, opts.html, opts.text);
    if (ok) await opts.onSuccess?.();
    return ok;
  }
  const trans = transport();
  if (!trans) {
    logger.info(`[DEV] Email would be sent (${opts.type}, booking ${opts.bookingId}) to ${opts.to}: ${opts.subject}`);
    await opts.onSuccess?.();
    return true;
  }
  try {
    await trans.sendMail({
      from: MAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    logger.info(`Email sent (${opts.type}, booking ${opts.bookingId}) to ${opts.to}`);
    await opts.onSuccess?.();
    return true;
  } catch (err) {
    logger.error(`Failed to send email (${opts.type}, booking ${opts.bookingId})`, err);
    if (smtpConfigForLog) {
      logger.error('SMTP connection failed – config used', {
        ...smtpConfigForLog,
        to: opts.to,
        hint: 'Check: host/port correct, no quotes in Railway vars, Brevo allows cloud IPs (or disable IP restriction).',
      });
    }
    return false;
  }
}

/**
 * Gibt die Anzahl Stunden vor dem Termin zurück, in der die Erinnerung gesendet werden soll.
 */
export function getReminderHours(): number {
  return REMINDER_HOURS;
}

/** Send a generic email (customer verification, password reset). */
async function sendCustomerMail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (useBrevoApi()) {
    return sendViaBrevoApi(to, subject, html, text);
  }
  const trans = transport();
  if (!trans) {
    logger.info(`[DEV] Customer email would be sent to ${to}: ${subject}`);
    return true;
  }
  try {
    await trans.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      html,
      text,
    });
    logger.info(`Customer email sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    logger.error('Failed to send customer email', err);
    if (smtpConfigForLog) {
      logger.error('SMTP connection failed – config used', {
        ...smtpConfigForLog,
        to,
        hint: 'Check: host/port correct, no quotes in Railway vars, Brevo allows cloud IPs (or disable IP restriction).',
      });
    }
    return false;
  }
}

/**
 * Send customer email verification link.
 */
export async function sendCustomerVerificationEmail(email: string, name: string, verificationToken: string): Promise<boolean> {
  const baseUrl = (PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const verifyUrl = `${baseUrl}/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;
  const subject = 'E-Mail-Adresse bestätigen – SimplySeat';
  const bodyContent = `
  <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: ${EMAIL_STYLE.text}; letter-spacing: -0.5px;">E-Mail bestätigen</h1>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Hallo ${name.replace(/</g, '&lt;')},</p>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihre Registrierung bei SimplySeat abzuschließen.</p>
  <p style="margin: 24px 0 0 0; font-size: 13px; color: ${EMAIL_STYLE.muted}; word-break: break-all;">Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br><a href="${verifyUrl}" style="color: ${EMAIL_STYLE.accent}; text-decoration: none;">${verifyUrl}</a></p>
  <p style="margin: 24px 0 0 0; font-size: 14px; color: ${EMAIL_STYLE.textSoft};">Falls Sie sich nicht registriert haben, können Sie diese E-Mail ignorieren.</p>`;
  
  const html = emailLayout({
    title: 'E-Mail bestätigen',
    bodyContent,
    cta: { text: 'E-Mail-Adresse bestätigen', url: verifyUrl },
    preheader: 'Bestätigen Sie Ihre E-Mail-Adresse für SimplySeat.',
  });
  const text = `Hallo ${name},\n\nBitte bestätigen Sie Ihre E-Mail-Adresse: ${verifyUrl}\n\nFalls Sie sich nicht registriert haben, ignorieren Sie diese E-Mail.\n\nMit freundlichen Grüßen,\nIhr SimplySeat-Team`;
  return sendCustomerMail(email, subject, html, text);
}

/**
 * Send customer password reset link.
 */
export async function sendCustomerPasswordResetEmail(email: string, name: string, resetToken: string): Promise<boolean> {
  const baseUrl = (PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const resetUrl = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
  const subject = 'Passwort zurücksetzen – SimplySeat';
  const bodyContent = `
  <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: ${EMAIL_STYLE.text}; letter-spacing: -0.5px;">Passwort zurücksetzen</h1>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Hallo ${name.replace(/</g, '&lt;')},</p>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt. Klicken Sie auf den Button, um ein neues Passwort zu vergeben.</p>
  <p style="margin: 24px 0 0 0; font-size: 13px; color: ${EMAIL_STYLE.muted}; word-break: break-all;">Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br><a href="${resetUrl}" style="color: ${EMAIL_STYLE.accent}; text-decoration: none;">${resetUrl}</a></p>
  <p style="margin: 24px 0 0 0; font-size: 14px; color: ${EMAIL_STYLE.textSoft};">Der Link ist nur begrenzt gültig. Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.</p>`;
  
  const html = emailLayout({
    title: 'Passwort zurücksetzen',
    bodyContent,
    cta: { text: 'Passwort zurücksetzen', url: resetUrl },
    preheader: 'Setzen Sie Ihr SimplySeat-Passwort zurück.',
  });
  const text = `Hallo ${name},\n\nPasswort zurücksetzen: ${resetUrl}\n\nFalls Sie die Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail.\n\nMit freundlichen Grüßen,\nIhr SimplySeat-Team`;
  return sendCustomerMail(email, subject, html, text);
}

/**
 * Send welcome email after email verification
 */
export async function sendWelcomeEmail(email: string, name: string, loyaltyPoints?: number): Promise<boolean> {
  const baseUrl = (PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const dashboardUrl = `${baseUrl}/customer/dashboard`;
  const subject = 'Willkommen bei SimplySeat! 🎉';
  
  const pointsMessage = loyaltyPoints 
    ? `<p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Als kleines Dankeschön haben wir Ihrem Konto <strong>${loyaltyPoints} Bonuspunkte</strong> gutgeschrieben! Diese können Sie bei Ihrer nächsten Buchung einlösen.</p>`
    : '';
  
  const bodyContent = `
  <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: ${EMAIL_STYLE.text}; letter-spacing: -0.5px;">Willkommen bei SimplySeat!</h1>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Hallo ${name.replace(/</g, '&lt;')},</p>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Vielen Dank für die Bestätigung Ihrer E-Mail-Adresse! Ihr Konto ist jetzt vollständig aktiviert.</p>
  ${pointsMessage}
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Mit Ihrem verifizierten Konto können Sie jetzt:</p>
  <ul style="margin: 0 0 24px 0; padding-left: 20px; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">
    <li style="margin-bottom: 8px;">Bewertungen schreiben und Ihre Erfahrungen teilen</li>
    <li style="margin-bottom: 8px;">Treuepunkte sammeln und einlösen</li>
    <li style="margin-bottom: 8px;">Einfach frühere Buchungen wiederholen</li>
    <li style="margin-bottom: 8px;">Ihre Lieblingsorte als Favoriten speichern</li>
  </ul>
  <p style="margin: 0 0 24px 0; font-size: 16px; color: ${EMAIL_STYLE.textSoft};">Wir freuen uns, Sie bei SimplySeat begrüßen zu dürfen!</p>`;
  
  const html = emailLayout({
    title: 'Willkommen bei SimplySeat',
    bodyContent,
    cta: { text: 'Zu meinem Dashboard', url: dashboardUrl },
    preheader: 'Vielen Dank für die Bestätigung Ihrer E-Mail-Adresse!',
  });
  
  const pointsText = loyaltyPoints ? `\n\nAls Dankeschön haben wir Ihrem Konto ${loyaltyPoints} Bonuspunkte gutgeschrieben!\n` : '';
  const text = `Hallo ${name},\n\nVielen Dank für die Bestätigung Ihrer E-Mail-Adresse! Ihr Konto ist jetzt vollständig aktiviert.${pointsText}\n\nMit Ihrem verifizierten Konto können Sie:\n- Bewertungen schreiben\n- Treuepunkte sammeln und einlösen\n- Frühere Buchungen wiederholen\n- Lieblingsorte als Favoriten speichern\n\nWir freuen uns, Sie bei SimplySeat begrüßen zu dürfen!\n\nMit freundlichen Grüßen,\nIhr SimplySeat-Team`;
  
  return sendCustomerMail(email, subject, html, text);
}
