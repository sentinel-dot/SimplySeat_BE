/**
 * BOOKING ROUTES
 * 
 * Alle HTTP-Endpunkte für Buchungsoperationen:
 * - POST   /bookings                           -> Neue Buchung erstellen
 * - GET    /bookings/:id                       -> Einzelne Buchung abrufen
 * - GET    /bookings/customer/:email           -> Buchungen eines Kunden abrufen
 * - PATCH  /bookings/manage/:token             -> Buchung aktualisieren (Token-basiert)
 * - POST   /bookings/:id/confirm               -> Buchung bestätigen
 * - POST   /bookings/manage/:token/cancel      -> Buchung stornieren
 * - DELETE /bookings/:id                       -> Buchung löschen (HARD DELETE)
 * - GET /bookings/manage/:token -> Hole Buchung via Token (für Management-Seite)
 * 
 * ARCHITEKTUR-PATTERN:
 * --------------------
 * Request → Route (Validierung) → Service (Business Logic) → Database
 *                ↓
 *         Response mit ApiResponse-Format
 */

import express, { Request, Response } from 'express';
import { createLogger } from '../config/utils/logger';
import { BookingService } from '../services/booking.service';
import {
    Booking,
    CreateBookingData,
    UpdateBookingData,
    ApiResponse
} from '../config/utils/types';
import { getTokenPrefix, isValidDate, isValidEmail, parsePositiveId, validateBookingToken } from '../config/utils/helper';
import { sendError } from '../config/utils/response';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { optionalCustomerAuth } from '../middleware/customer-auth.middleware';

const router = express.Router();
const logger = createLogger('booking.routes');

/** Max-Längen für Buchungsfelder (Missbrauch/Speicher begrenzen) */
const MAX_CUSTOMER_NAME = 200;
const MAX_CUSTOMER_PHONE = 50;
const MAX_SPECIAL_REQUESTS = 500;




/**
 * =====================================================================================================
 * POST /bookings
 * =====================================================================================================
 * Erstellt eine neue Buchung in der Datenbank
 * 
 * FLOW:
 * 1. Request-Body validieren (Required Fields, Format-Checks)
 * 2. BookingService aufrufen (führt Availability-Check) durch
 * 3. Response zurücksenden (201 bei Erfolg, 4xx/5xx bei Fehler)
 * 
 * REQUEST BODY (CreateBookingData):
 * {
 *   venue_id: number,              // ID des Venues (Restaurant, Salon, etc.)
 *   service_id: number,            // ID des gewünschten Service
 *   staff_member_id?: number,      // Optional: Nur bei Services die Staff benötigen
 *   customer_name: string,         // Name des Kunden
 *   customer_email: string,        // Email für Bestätigung/Updates
 *   customer_phone?: string,       // Optional: Telefonnummer
 *   booking_date: string,          // Format: "YYYY-MM-DD" (z.B. "2025-10-25")
 *   start_time: string,            // Format: "HH:MM" (z.B. "14:00")
 *   end_time: string,              // Format: "HH:MM" (z.B. "15:30")
 *   party_size: number,            // Anzahl Personen (1-8; für mehr bitte anrufen)
 *   special_requests?: string,     // Optional: Besondere Wünsche
 *   total_amount?: number          // Optional: Gesamtpreis
 * }
 * 
 * RESPONSE (Success - 201 Created):
 * {
 *   success: true,
 *   message: "Booking created successfully",
 *   data: { ...booking mit ID und allen Feldern }
 * }
 * 
 * RESPONSE (Error):
 * - 400: Validierungsfehler (fehlende Felder, falsches Format)
 * - 409: Slot nicht verfügbar (Konflikt mit existierender Buchung)
 * - 500: Serverfehler
 */
router.post('/', optionalCustomerAuth, async (req: Request, res: Response) => 
{
    if (!req.body || Object.keys(req.body).length === 0)
    {
        logger.warn('Empty request body');
        return res.status(400).json({
            success: false,
            message: 'Request body is required'
        } as ApiResponse<void>);
    }

    const bookingData: CreateBookingData = req.body;

    // SCHRITT 1: VALIDIERUNG DER PFLICHTFELDER
    // Alle Felder die zwingend erforderlich sind
    const requiredFields = [
        'venue_id',
        'service_id',
        'customer_name',
        'customer_email',
        'booking_date',
        'start_time',
        'end_time',
        'party_size'
    ];

    // Filter alle fehlenden Felder
    // .filter() durchläuft das Array und behält nur Elemente die die Bedingung erfüllen
    // Hier: Behalte nur Felder die NICHT im Request Body sind
    const missingFields = requiredFields.filter(field => !bookingData[field as keyof CreateBookingData]);

    // Falls irgendwelche Felder fehlen, lehne Request ab
    if (missingFields.length > 0)
    {
        logger.warn('Missing required fields', { missing: missingFields });
        return res.status(400).json({
            success: false,
            message: `Missing required fields: ${missingFields.join(', ')}`
        } as ApiResponse<void>);
    }

    // SCHRITT 2: EMAIL-FORMAT VALIDIERUNG
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    //.test() gibt true/false zurück, ob String dem Pattern entspricht
    if (!emailRegex.test(bookingData.customer_email))
    {
        logger.warn('Invalid email format', { email: bookingData.customer_email });
        return res.status(400).json({
            success: false,
            message: 'Invalid email format'
        } as ApiResponse<void>);
    }

    // SCHRITT 3: DATUMS-FORMAT VALIDIERUNG (YYYY-MM-DD)
    if (!isValidDate(bookingData.booking_date)) {
        logger.warn('Invalid date format', { date: bookingData.booking_date });
        return res.status(400).json({
            success: false,
            message: 'Invalid date format. Expected: YYYY-MM-DD'
        } as ApiResponse<void>);
    }

    // SCHRITT 4: ZEIT-FORMAT VALIDIERUNG
    // Erwartetes Format: HH:MM (z.B. 14:00, 09:30)
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(bookingData.start_time) || !timeRegex.test(bookingData.end_time))
    {
        logger.warn('Invalid time format', {
            start: bookingData.start_time,
            end: bookingData.end_time
        });
        return res.status(400).json({
            success: false,
            message: 'Invalid time format. Expected: HH:MM'
        } as ApiResponse<void>);
    }

    // SCHRITT 5: PARTY SIZE VALIDIERUNG (1-8; für mehr Personen bitte anrufen)
    if (bookingData.party_size < 1 || bookingData.party_size > 8)
    {
        logger.warn('Invalid party size', { party_size: bookingData.party_size });
        return res.status(400).json({
            success: false,
            message: 'Party size must be between 1 and 8. For larger groups please call.'
        } as ApiResponse<void>);
    }

    // SCHRITT 5b: LÄNGEN-LIMITS (customer_name, customer_phone, special_requests)
    const nameLen = String(bookingData.customer_name ?? '').length;
    if (nameLen > MAX_CUSTOMER_NAME) {
        return res.status(400).json({
            success: false,
            message: `customer_name darf maximal ${MAX_CUSTOMER_NAME} Zeichen haben`
        } as ApiResponse<void>);
    }
    if (bookingData.customer_phone != null && String(bookingData.customer_phone).length > MAX_CUSTOMER_PHONE) {
        return res.status(400).json({
            success: false,
            message: `customer_phone darf maximal ${MAX_CUSTOMER_PHONE} Zeichen haben`
        } as ApiResponse<void>);
    }
    if (bookingData.special_requests != null && String(bookingData.special_requests).length > MAX_SPECIAL_REQUESTS) {
        return res.status(400).json({
            success: false,
            message: `special_requests darf maximal ${MAX_SPECIAL_REQUESTS} Zeichen haben`
        } as ApiResponse<void>);
    }

    // SCHRITT 6: ADD CUSTOMER ID IF AUTHENTICATED
    if (req.customerJwtPayload) {
        bookingData.customer_id = req.customerJwtPayload.customerId;
        logger.info('Booking created by authenticated customer', { customer_id: req.customerJwtPayload.customerId });
    }

    // SCHRITT 7: BUCHUNG ERSTELLEN
    try 
    {
        const newBooking = await BookingService.createBooking(bookingData);

        logger.info('Booking created successfully', { booking_id: newBooking.id });

        return res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            data: newBooking
        } as ApiResponse<Booking>);
    } 
    catch (error) 
    {
        logger.error('Error creating booking', error);

        // Error in String umwandeln für Analyse
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // KONFLIKT: Slot ist nicht verfügbar (z.B. schon gebucht)
        // 409 Conflict = Request ist valid, aber Ressourcen-Zustand erlaubt Operation nicht
        if (errorMessage.includes('not available') || errorMessage.includes('Booking not available'))   // Error-Message von CreateBooking - Service => ValidateBookingRequest failed
        {
            return res.status(409).json({
                success: false,
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }


        return sendError(res, 500, 'Failed to create booking', error);
    }
});

/**
 * GET /bookings/customer/:email - muss vor GET /:id stehen (Route-Reihenfolge!)
 * Optional: Wenn Kunde eingeloggt ist, dürfen nur Buchungen der eigenen E-Mail abgefragt werden (Datenschutz).
 */
router.get('/customer/:email', optionalCustomerAuth, async (req: Request<{ email: string }>, res: Response) =>
{
    const customerEmail = req.params.email;

    if (!isValidEmail(customerEmail))
    {
        logger.warn('Invalid email format', { email: customerEmail });
        return res.status(400).json({
            success: false,
            message: 'Invalid email format'
        } as ApiResponse<void>);
    }

    // Eingeloggte Kunden dürfen nur die eigene E-Mail abfragen
    if (req.customer && req.customer.email !== customerEmail) {
        logger.warn('Authenticated customer tried to fetch bookings for another email');
        return res.status(403).json({
            success: false,
            message: 'Kein Zugriff auf Buchungen dieser E-Mail-Adresse'
        } as ApiResponse<void>);
    }

    const maskedEmail = customerEmail.replace(/^(.)(.*)(@.*)$/, '$1***$3');
    logger.info('Fetching bookings for customer', { email: maskedEmail });

    try 
    {
        const bookings = await BookingService.getBookingsByEmail(customerEmail);

        res.json({
            success: true,
            message: `${bookings.length} booking${bookings.length !== 1 ? 's' : ''} found`,
            data: bookings
        } as ApiResponse<Booking[]>);
    } 
    catch (error) 
    {
        logger.error('Error fetching customer bookings', error);
        sendError(res, 500, 'Failed to fetch bookings', error);
    }
});

/**
 * GET /bookings/manage/:token - muss vor GET /:id stehen (sonst wird "manage" als :id gematcht!)
 */
router.get('/manage/:token', async (req: Request<{ token: string }>, res: Response) => 
{
    const { token } = req.params;
    const tokenPrefix = getTokenPrefix(token);

    if (!validateBookingToken(token))
    {
        logger.warn('Invalid booking token format', { token_prefix: tokenPrefix });
        return res.status(400).json({
            success: false,
            message: 'Invalid booking token format'
        } as ApiResponse<void>);
    }

    try 
    {
        const booking = await BookingService.getBookingByToken(token);
        
        if (!booking)
        {
            logger.warn('Booking not found', { token_prefix: tokenPrefix });

            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            } as ApiResponse<void>);
        }

        logger.info('Booking retrieved successfully', { 
            booking_id: booking.id,
            token_prefix: tokenPrefix
        });

        return res.status(200).json({
            success: true,
            message: 'Booking retrieved successfully',
            data: booking
        } as ApiResponse<Booking>);
    } 
    catch (error) 
    {
        logger.error('Error fetching booking by token', error);
        sendError(res, 500, 'Failed to fetch booking', error);
    }
});

/**
 * =====================================================================================================
 * GET /bookings/:id
 * =====================================================================================================
 * Ruft eine einzelne Buchung anhand ihrer ID ab.
 * Nur für authentifizierte Admin/Owner/Staff; Owner/Staff nur für Buchungen der eigenen Venue.
 */
router.get('/:id', authenticateToken, async (req: Request<{ id: string }>, res: Response) => 
{
    const bookingId = parsePositiveId(req.params.id);
    if (bookingId === null) {
        logger.warn('Invalid booking ID', { provided: req.params.id });
        return res.status(400).json({
            success: false,
            message: 'Invalid booking ID'
        } as ApiResponse<void>);
    }

    try 
    {
        const booking = await BookingService.getBookingById(bookingId);
        if (!booking)
        {
            logger.warn('Booking not found');
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            } as ApiResponse<void>);
        }
        const payload = req.jwtPayload!;
        if (payload.role !== 'admin' && (payload.venueId === null || payload.venueId !== booking.venue_id))
        {
            return res.status(403).json({
                success: false,
                message: 'Kein Zugriff auf diese Buchung'
            } as ApiResponse<void>);
        }
        return res.status(200).json({
            success: true,
            message: 'Booking retrieved successfully',
            data: booking
        } as ApiResponse<Booking>);
    } 
    catch (error) 
    {
        logger.error('Error fetching booking', error);
        sendError(res, 500, 'Failed to fetch booking', error);
    }
});





/**
 * ============================================================================
 * PATCH /bookings/manage/:token
 * ============================================================================
 * Aktualisiert eine existierende Buchung (partielles Update)
 * 
 * WICHTIG: Token-basierte Authentifizierung!
 * - Nur wer den korrekten booking_token kennt, kann die Buchung ändern
 * - Kein Email-Abgleich mehr nötig
 * - Token kommt aus Bestätigungs-Email oder QR-Code
 * 
 * URL PARAMETER:
 * - :token = booking_token (UUID) aus der Bestätigungs-Email
 * 
 * REQUEST BODY:
 * {
 *   booking_date?: string,          // Optional: Neues Datum
 *   start_time?: string,            // Optional: Neue Startzeit
 *   end_time?: string,              // Optional: Neue Endzeit
 *   party_size?: number,            // Optional: Neue Personenzahl (1-8)
 *   staff_member_id?: number,       // Optional: Anderer Mitarbeiter
 *   special_requests?: string       // Optional: Neue Wünsche
 * }
 * 
 * BEISPIEL:
 * PATCH /bookings/manage/a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6
 * Body: {
 *   "booking_date": "2025-10-26",
 *   "start_time": "15:00",
 *   "party_size": 4
 * }
 * 
 * WICHTIG:
 * - Wenn Datum/Zeit geändert wird → Verfügbarkeit wird neu geprüft!
 * - Reminder wird automatisch zurückgesetzt bei Datum/Zeit-Änderung
 * - Stornierte/abgeschlossene Buchungen können NICHT geändert werden
 * 
 * RESPONSE (Success - 200 OK):
 * {
 *   success: true,
 *   message: "Booking updated successfully",
 *   data: { ...updated booking }
 * }
 * 
 * RESPONSE (Error):
 * - 400: Validierungsfehler, keine Updates, oder Status verhindert Update
 * - 401: Token ungültig oder abgelaufen (Unauthorized)
 * - 404: Buchung nicht gefunden
 * - 409: Neuer Slot nicht verfügbar (Conflict)
 * - 500: Serverfehler
 */
router.patch('/manage/:token', async (req: Request<{ token: string }>, res: Response) => 
{
    const { token } = req.params;
    const updates = req.body;


    // ========================================================================
    // VALIDIERUNG
    // ========================================================================
    
    // 1. Token-Format-Validierung (UUID v4)
    if (!validateBookingToken(token))
    {
        logger.warn('Invalid booking token format', { provided: token });
        return res.status(400).json({
            success: false,
            message: 'Invalid booking token format'
        } as ApiResponse<void>);
    }


    // 2. Updates-Validierung
    // Object.keys() gibt Array aller Property-Namen zurück
    // Beispiel: { date: "2025-10-25", time: "14:00" } → ["date", "time"]
    if (!updates || Object.keys(updates).length === 0)
    {
        logger.warn('No updates provided');
        return res.status(400).json({
            success: false,
            message: 'No updates provided'
        } as ApiResponse<void>);
    }


    // 3. Validiere einzelne Update-Felder (optional, aber empfohlen)
    const allowedFields = [
        'booking_date', 
        'start_time', 
        'end_time', 
        'party_size', 
        'staff_member_id', 
        'special_requests'
    ];

    const invalidFields = Object.keys(updates).filter(
        field => !allowedFields.includes(field)
    );

    if (invalidFields.length > 0)
    {
        logger.warn('Invalid update fields', { invalid: invalidFields });
        return res.status(400).json({
            success: false,
            message: `Invalid fields: ${invalidFields.join(', ')}`
        } as ApiResponse<void>);
    }

    if (updates.special_requests !== undefined && String(updates.special_requests).length > MAX_SPECIAL_REQUESTS) {
        return res.status(400).json({
            success: false,
            message: `special_requests darf maximal ${MAX_SPECIAL_REQUESTS} Zeichen haben`
        } as ApiResponse<void>);
    }

    // party_size 1–8 (wie bei POST /bookings)
    if (updates.party_size !== undefined && (updates.party_size < 1 || updates.party_size > 8)) {
        return res.status(400).json({
            success: false,
            message: 'Party size must be between 1 and 8. For larger groups please call.'
        } as ApiResponse<void>);
    }

    // ========================================================================
    // UPDATE DURCHFÜHREN
    // ========================================================================
    try 
    {
        // Service-Aufruf mit Token-Verifizierung
        // Der Service prüft:
        // 1. Existiert eine Buchung mit diesem Token?
        // 2. Ist der Status updatebar? (nicht cancelled/completed)
        // 3. Wenn Datum/Zeit geändert → Ist der neue Slot verfügbar?
        const updatedBooking = await BookingService.updateBooking(
            token, 
            updates as UpdateBookingData
        );

        logger.info('Booking updated successfully', { 
            booking_id: updatedBooking.id,
            token_used: getTokenPrefix(token)
        });

        res.json({
            success: true,
            message: 'Booking updated successfully',
            data: updatedBooking
        } as ApiResponse<Booking>);
    } 
    catch (error) 
    {
        // ====================================================================
        // DETAILLIERTES ERROR HANDLING
        // ====================================================================
        // Verschiedene Error-Typen werden unterschiedlich behandelt
        logger.error('Error updating booking', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // ERROR 1: INVALID/EXPIRED TOKEN
        // 401 Unauthorized = Token ungültig oder abgelaufen
        if (errorMessage.includes('Invalid token') || 
            errorMessage.includes('Token not found') ||
            errorMessage.includes('Unauthorized'))
        {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired booking token',
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        // ERROR 2: NOT FOUND (Buchung existiert nicht)
        if (errorMessage.includes('not found'))
        {
            return res.status(404).json({
                success: false,
                message: 'Booking not found',
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        // ERROR 3: CANNOT UPDATE (Status verhindert Update)
        // z.B. "Cannot update booking with status: cancelled"
        if (errorMessage.includes('Cannot update'))
        {
            return res.status(400).json({
                success: false,
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        // ERROR 4: SLOT NOT AVAILABLE (neuer Zeitslot ist belegt)
        // 409 Conflict = Ressourcen-Zustand erlaubt Operation nicht
        if (errorMessage.includes('not available'))
        {
            return res.status(409).json({
                success: false,
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        sendError(res, 500, 'Failed to update booking', error);
    }
});

/**
 * ============================================================================
 * POST /bookings/:id/confirm
 * ============================================================================
 * Bestätigt eine Buchung (ändert Status von 'pending' zu 'confirmed')
 * 
 * USE CASES:
 * - Admin/Venue bestätigt manuelle Buchung
 * - Automatische Bestätigung nach Zahlung
 * - Email-Bestätigungs-Link wurde geklickt
 * 
 * FLOW:
 * 1. Kunde bucht → Status: 'pending'
 * 2. Admin/System bestätigt → Status: 'confirmed'
 * 3. Kunde erhält Bestätigungsmail
 * 
 * WICHTIG:
 * - BookingService setzt confirmation_sent_at nach Versand der Bestätigungsmail
 * - Bestätigungsmail wird vom BookingService nach Statuswechsel versendet
 * 
 * RESPONSE (Success - 200 OK):
 * {
 *   success: true,
 *   message: "Booking confirmed successfully",
 *   data: { ...confirmed booking }
 * }
 * 
 * RESPONSE (Error):
 * - 400: Ungültige Booking ID
 * - 404: Buchung nicht gefunden
 * - 500: Serverfehler
 */
router.post('/:id/confirm', authenticateToken, requireRole('owner', 'admin', 'staff'), async (req: Request<{ id: string }>, res: Response) => 
{
    const bookingId = parsePositiveId(req.params.id);
    if (bookingId === null) {
        logger.warn('Invalid booking ID', { provided: req.params.id });
        return res.status(400).json({
            success: false,
            message: 'Invalid booking ID'
        } as ApiResponse<void>);
    }

    try 
    {
        const booking = await BookingService.getBookingById(bookingId);
        if (!booking)
        {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            } as ApiResponse<void>);
        }
        const payload = req.jwtPayload!;
        if (payload.role !== 'admin' && (payload.venueId === null || payload.venueId !== booking.venue_id))
        {
            return res.status(403).json({
                success: false,
                message: 'Kein Zugriff auf diese Buchung'
            } as ApiResponse<void>);
        }
        const confirmedBooking = await BookingService.confirmBooking(bookingId);
        logger.info('Booking confirmed successfully', { booking_id: bookingId });
        res.json({
            success: true,
            message: 'Booking confirmed successfully',
            data: confirmedBooking
        } as ApiResponse<Booking>);
    } 
    catch (error) 
    {
        logger.error('Error confirming booking', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('not found'))
        {
            return res.status(404).json({
                success: false,
                message: 'Booking not found',
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }
        sendError(res, 500, 'Failed to confirm booking', error);
    }
});

/**
 * ============================================================================
 * POST /bookings/manage/:token/cancel
 * ============================================================================
 * Storniert eine Buchung (ändert Status zu 'cancelled')
 * 
 * URL PARAMETER:
 * - :token = booking_token (UUID) aus der Bestätigungs-Email
 * 
 * REQUEST BODY:
 * {
 *   reason?: string   // Optional: Stornierungsgrund
 * }
 *
 * Admin-Storno (ohne Frist) erfolgt über Owner-API: PATCH /owner/bookings/:id/status.
 *
 * STORNIERUNGSRICHTLINIE:
 * - Stornierung nur bis X Stunden vor Termin erlaubt
 * - X wird in venues.cancellation_hours definiert (z.B. 24 Stunden)
 *
 * BEISPIEL:
 * { "reason": "Krankheit" }
 * 
 * WAS PASSIERT BEI STORNIERUNG:
 * - Status → 'cancelled'
 * - cancelled_at → NOW()
 * - cancellation_reason → gespeichert
 * - Slot wird wieder verfügbar für andere Buchungen
 * - Stornierungsmail wird im BookingService.cancelBooking() versendet
 * 
 * USE CASES:
 * - Kunde kann nicht zum Termin
 * - Venue muss Termin absagen
 * - Admin storniert aus Kulanz (auch nach Frist)
 * 
 * RESPONSE (Success - 200 OK):
 * {
 *   success: true,
 *   message: "Booking cancelled successfully",
 *   data: { ...cancelled booking }
 * }
 * 
 * RESPONSE (Error):
 * - 400: Validierungsfehler, bereits storniert, oder Frist überschritten
 * - 401: Email-Verifizierung fehlgeschlagen
 * - 404: Buchung nicht gefunden
 * - 500: Serverfehler
 */
router.post('/manage/:token/cancel', async (req: Request<{ token: string }>, res: Response) => 
{
    const { token } = req.params;
    const { reason } = req.body;

    if (!validateBookingToken(token)) {
        logger.warn('Invalid booking token format');
        return res.status(400).json({
            success: false,
            message: 'Invalid booking token format'
        } as ApiResponse<void>);
    }

    // ========================================================================
    // STORNIERUNG DURCHFÜHREN
    // ========================================================================
    try 
    {
        // Service-Aufruf: bypassPolicy immer false – Kunden müssen Stornierungsfrist einhalten
        const cancelledBooking = await BookingService.cancelBooking(
            token,
            reason,   // Optional: Stornierungsgrund
            false    // Öffentliche Route: Frist wird nie umgangen
        );

        logger.info('Booking cancelled successfully', { booking_id: cancelledBooking.id });

        // Stornierungsmail wird im BookingService.cancelBooking() versendet

        res.json({
            success: true,
            message: 'Booking cancelled successfully',
            data: cancelledBooking
        } as ApiResponse<Booking>);
    } 
    catch (error) 
    {
        // ====================================================================
        // DETAILLIERTES ERROR HANDLING
        // ====================================================================
        logger.error('Error cancelling booking', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('Invalid token') || errorMessage.includes('Unauthorized')) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired booking token',
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        if (errorMessage.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found',
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        if (errorMessage.includes('already cancelled')) {
            return res.status(400).json({
                success: false,
                message: 'Booking is already cancelled',
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        if (errorMessage.includes('Cannot cancel completed')) {
            return res.status(400).json({
                success: false,
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        // Stornierungsfrist nicht eingehalten (z. B. "at least 24 hours in advance", "Only 12 hours remaining")
        if (errorMessage.includes('hours in advance') || errorMessage.includes('hours remaining')) {
            return res.status(400).json({
                success: false,
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        if (errorMessage.includes('cancellation policy')) {
            return res.status(400).json({
                success: false,
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        // Alle anderen Fehler (z. B. Stornierungsfrist): echte Meldung durchreichen, Status 400 für Business-Fehler
        const isBusinessError =
            errorMessage !== 'Unknown error' &&
            (errorMessage.includes('Cancellation') ||
             errorMessage.includes('hours') ||
             errorMessage.includes('cancel') ||
             errorMessage.includes('retrieve'));
        const status = isBusinessError ? 400 : 500;
        const message = errorMessage !== 'Unknown error' ? errorMessage : 'Failed to cancel booking';

        return res.status(status).json({
            success: false,
            message,
            error: process.env.NODE_ENV === 'development' ? String(error) : undefined
        } as ApiResponse<void>);

    }
});





/**
 * ============================================================================
 * DELETE /bookings/:id
 * ============================================================================
 * Löscht eine Buchung PERMANENT aus der Datenbank (HARD DELETE)
 * 
 * ⚠️⚠️⚠️ ACHTUNG - KRITISCHE OPERATION ⚠️⚠️⚠️
 * 
 * WICHTIG ZU WISSEN:
 * - Dies ist ein HARD DELETE = Buchung wird UNWIDERRUFLICH gelöscht!
 * - Alle Daten sind weg (keine Wiederherstellung möglich)
 * - Es wird KEIN Audit-Trail erstellt
 * - Diese Operation sollte SEHR SELTEN verwendet werden
 * 
 * WANN SOLLTE HARD DELETE VERWENDET WERDEN?
 * ✅ Spam-Buchungen entfernen
 * ✅ Test-Daten in Development bereinigen
 * ✅ GDPR-Anfragen (Recht auf Löschung)
 * ✅ Duplikate entfernen
 * ❌ NICHT für normale Stornierungen! (verwende cancelBooking)
 * ❌ NICHT für "Kunde ist nicht erschienen" (verwende Status: 'no_show')
 * 
 * UNTERSCHIED: DELETE vs CANCEL
 * ┌─────────────┬──────────────────┬────────────────────┐
 * │ Operation   │ DELETE           │ CANCEL             │
 * ├─────────────┼──────────────────┼────────────────────┤
 * │ Daten       │ Komplett weg     │ Bleiben erhalten   │
 * │ Status      │ N/A (gelöscht)   │ 'cancelled'        │
 * │ History     │ Verloren         │ Nachvollziehbar    │
 * │ Analytics   │ Nicht möglich    │ Auswertbar         │
 * │ Use Case    │ Spam, GDPR       │ Normale Storno     │
 * └─────────────┴──────────────────┴────────────────────┘
 * 
 * SICHERHEIT:
 * - Geschützt durch authenticateToken + requireRole('owner', 'admin')
 * 
 * ALTERNATIVE (Post-MVP): Soft Delete (deleted_at) für Audit/Analytics
 * 
 * RESPONSE (Success - 200 OK):
 * {
 *   success: true,
 *   message: "Booking deleted permanently"
 * }
 * 
 * RESPONSE (Error):
 * - 400: Ungültige Booking ID
 * - 403: Forbidden (falls Auth-Middleware aktiv und kein Admin)
 * - 500: Serverfehler
 */
router.delete('/:id', authenticateToken, requireRole('owner', 'admin'), async (req: Request<{ id: string }>, res: Response) => 
{
    logger.warn('⚠️ HARD DELETE operation requested');

    const bookingId = parsePositiveId(req.params.id);
    if (bookingId === null) {
        logger.warn('Invalid booking ID', { provided: req.params.id });
        return res.status(400).json({
            success: false,
            message: 'Invalid booking ID'
        } as ApiResponse<void>);
    }

    try 
    {
        if (req.jwtPayload!.role === 'owner')
        {
            const booking = await BookingService.getBookingById(bookingId);
            if (!booking)
            {
                return res.status(404).json({
                    success: false,
                    message: 'Booking not found'
                } as ApiResponse<void>);
            }
            if (req.jwtPayload!.venueId === null || booking.venue_id !== req.jwtPayload!.venueId)
            {
                return res.status(403).json({
                    success: false,
                    message: 'Kein Zugriff auf diese Buchung'
                } as ApiResponse<void>);
            }
        }
        await BookingService.deleteBooking(bookingId);

        // Erfolgreiche Löschung wird geloggt (für Audit-Trail in Logs)
        logger.info('Booking deleted permanently', { booking_id: bookingId });

        // 200 OK (nicht 204 No Content, weil wir JSON Response senden)
        res.json({
            success: true,
            message: 'Booking deleted permanently'
        } as ApiResponse<void>);
    } 
    catch (error) 
    {
        logger.error('Error deleting booking', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('Booking not found') || errorMessage.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found',
                error: process.env.NODE_ENV === 'development' ? String(error) : undefined
            } as ApiResponse<void>);
        }

        sendError(res, 500, 'Failed to delete booking', error);
    }
});

// ============================================================================
// ROUTER EXPORTIEREN
// ============================================================================
// Der Router wird in server.ts importiert und unter /bookings gemountet
// Beispiel in server.ts:
// 
// import bookingRoutes from './routes/booking.routes';
// app.use('/bookings', bookingRoutes);
// 
// Dann sind alle Routes verfügbar:
// - POST   http://localhost:3000/bookings
// - GET    http://localhost:3000/bookings/:id
// - PATCH  http://localhost:3000/bookings/:id
// - etc.
export default router;
