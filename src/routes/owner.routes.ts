import { Router, Request, Response } from 'express';
import { authenticateAndLoadUser, requireRole } from '../middleware/auth.middleware';
import { OwnerService } from '../services/owner.service';
import { getAuditLogForBooking } from '../services/audit.service';
import { BookingService } from '../services/booking.service';
import { VenueService } from '../services/venue.service';
import { createLogger } from '../config/utils/logger';
import { CreateBookingData } from '../config/utils/types';

const router = Router();
const logger = createLogger('owner.routes');

const MAX_CUSTOMER_NAME = 200;
const MAX_CUSTOMER_PHONE = 50;
const MAX_SPECIAL_REQUESTS = 500;

router.use(authenticateAndLoadUser);
router.use(requireRole('owner'));

function getVenueId(req: Request): number | null {
    return req.jwtPayload?.venueId ?? null;
}

router.get('/bookings', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    try {
        const filters = {
            startDate: req.query.startDate as string | undefined,
            endDate: req.query.endDate as string | undefined,
            status: req.query.status as string | undefined,
            serviceId: req.query.serviceId ? parseInt(req.query.serviceId as string) : undefined,
            search: req.query.search as string | undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
            offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        };
        const result = await OwnerService.getBookings(venueId, filters);
        res.json({ success: true, data: result.bookings, pagination: { total: result.total, limit: filters.limit, offset: filters.offset } });
    } catch (error) {
        logger.error('Error fetching owner bookings', error);
        res.status(500).json({ success: false, message: 'Fehler beim Laden der Buchungen' });
    }
});

router.get('/bookings/:id', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    const bookingId = parseInt(req.params.id);
    if (Number.isNaN(bookingId)) {
        res.status(400).json({ success: false, message: 'Ungültige Buchungs-ID' });
        return;
    }
    try {
        const booking = await OwnerService.getBookingById(venueId, bookingId);
        if (!booking) {
            res.status(404).json({ success: false, message: 'Buchung nicht gefunden' });
            return;
        }
        res.json({ success: true, data: booking });
    } catch (error) {
        logger.error('Error fetching booking', error);
        res.status(500).json({ success: false, message: 'Fehler beim Laden der Buchung' });
    }
});

router.get('/bookings/:id/audit', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    const bookingId = parseInt(req.params.id);
    if (Number.isNaN(bookingId)) {
        res.status(400).json({ success: false, message: 'Ungültige Buchungs-ID' });
        return;
    }
    try {
        const booking = await OwnerService.getBookingById(venueId, bookingId);
        if (!booking) {
            res.status(404).json({ success: false, message: 'Buchung nicht gefunden' });
            return;
        }
        const entries = await getAuditLogForBooking(bookingId, venueId);
        res.json({ success: true, data: entries });
    } catch (error) {
        logger.error('Error fetching booking audit log', error);
        res.status(500).json({ success: false, message: 'Fehler beim Laden des Verlaufs' });
    }
});

router.patch('/bookings/:id/status', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    const bookingId = parseInt(req.params.id);
    const { status, reason } = req.body;
    if (!status) {
        res.status(400).json({ success: false, message: 'Status ist erforderlich' });
        return;
    }
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
    if (!validStatuses.includes(status)) {
        res.status(400).json({ success: false, message: 'Ungültiger Status' });
        return;
    }
    try {
        const auditContext = req.user ? { userId: req.user.id, actorType: req.user.role } : undefined;
        const booking = await OwnerService.updateBookingStatus(bookingId, status, reason, auditContext, venueId ?? undefined);
        res.json({ success: true, data: booking, message: 'Status erfolgreich aktualisiert' });
    } catch (error) {
        const msg = (error as Error).message;
        if (msg === 'Booking not found') res.status(404).json({ success: false, message: 'Buchung nicht gefunden' });
        else if (msg === 'Kein Zugriff auf diese Buchung') res.status(403).json({ success: false, message: msg });
        else if (msg === 'Grund ist erforderlich') res.status(400).json({ success: false, message: 'Grund ist erforderlich' });
        else if (msg.startsWith('Für vergangene Buchungen') || msg.startsWith('Ein zukünftiger Termin')) res.status(400).json({ success: false, message: msg });
        else res.status(500).json({ success: false, message: 'Fehler beim Aktualisieren des Status' });
    }
});

router.get('/stats', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    try {
        const stats = await OwnerService.getStats(venueId);
        res.json({ success: true, data: stats });
    } catch (error) {
        logger.error('Error fetching owner stats', error);
        res.status(500).json({ success: false, message: 'Fehler beim Laden der Statistiken' });
    }
});

router.get('/services', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    try {
        const services = await OwnerService.getServices(venueId);
        res.json({ success: true, data: services });
    } catch (error) {
        logger.error('Error fetching services', error);
        res.status(500).json({ success: false, message: 'Fehler beim Laden der Services' });
    }
});

router.patch('/services/:id', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    const serviceId = parseInt(req.params.id);
    const { name, description, duration_minutes: rawDuration, price: rawPrice, is_active } = req.body;
    const duration_minutes = rawDuration !== undefined && rawDuration !== null ? (typeof rawDuration === 'number' ? rawDuration : Number(rawDuration)) : undefined;
    const price = rawPrice !== undefined && rawPrice !== null ? (typeof rawPrice === 'number' ? rawPrice : Number(rawPrice)) : undefined;
    if (duration_minutes !== undefined && (Number.isNaN(duration_minutes) || duration_minutes < 1)) {
        res.status(400).json({ success: false, message: 'duration_minutes muss eine positive Zahl sein' });
        return;
    }
    if (price !== undefined && Number.isNaN(price)) {
        res.status(400).json({ success: false, message: 'price muss eine gültige Zahl sein' });
        return;
    }
    try {
        const service = await OwnerService.updateService(serviceId, { name, description, duration_minutes, price, is_active }, venueId);
        res.json({ success: true, data: service, message: 'Service erfolgreich aktualisiert' });
    } catch (error) {
        const msg = (error as Error).message;
        if (msg === 'Service not found') res.status(404).json({ success: false, message: 'Service nicht gefunden' });
        else if (msg === 'Kein Zugriff auf diesen Service') res.status(403).json({ success: false, message: msg });
        else res.status(500).json({ success: false, message: 'Fehler beim Aktualisieren des Services' });
    }
});

router.get('/availability', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    try {
        const rules = await OwnerService.getAvailabilityRules(venueId);
        res.json({ success: true, data: rules });
    } catch (error) {
        logger.error('Error fetching availability rules', error);
        res.status(500).json({ success: false, message: 'Fehler beim Laden der Verfügbarkeiten' });
    }
});

router.patch('/availability/:id', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    const ruleId = parseInt(req.params.id);
    const { start_time, end_time, is_active } = req.body;
    try {
        await OwnerService.updateAvailabilityRule(ruleId, { start_time, end_time, is_active }, venueId);
        res.json({ success: true, message: 'Verfügbarkeit erfolgreich aktualisiert' });
    } catch (error) {
        const msg = (error as Error).message;
        if (msg === 'Verfügbarkeitsregel nicht gefunden') res.status(404).json({ success: false, message: msg });
        else if (msg === 'Kein Zugriff auf diese Verfügbarkeitsregel') res.status(403).json({ success: false, message: msg });
        else res.status(500).json({ success: false, message: 'Fehler beim Aktualisieren der Verfügbarkeit' });
    }
});

router.post('/bookings', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    const bookingData: CreateBookingData = { ...req.body, venue_id: venueId };
    const requiredFields = ['service_id', 'customer_name', 'customer_email', 'booking_date', 'start_time', 'end_time', 'party_size'];
    const missingFields = requiredFields.filter(field => !bookingData[field as keyof CreateBookingData]);
    if (missingFields.length > 0) {
        res.status(400).json({ success: false, message: `Fehlende Felder: ${missingFields.join(', ')}` });
        return;
    }
    if (String(bookingData.customer_name ?? '').length > MAX_CUSTOMER_NAME) {
        res.status(400).json({ success: false, message: `customer_name darf maximal ${MAX_CUSTOMER_NAME} Zeichen haben` });
        return;
    }
    if (bookingData.customer_phone != null && String(bookingData.customer_phone).length > MAX_CUSTOMER_PHONE) {
        res.status(400).json({ success: false, message: `customer_phone darf maximal ${MAX_CUSTOMER_PHONE} Zeichen haben` });
        return;
    }
    if (bookingData.special_requests != null && String(bookingData.special_requests).length > MAX_SPECIAL_REQUESTS) {
        res.status(400).json({ success: false, message: `special_requests darf maximal ${MAX_SPECIAL_REQUESTS} Zeichen haben` });
        return;
    }
    if (bookingData.party_size < 1 || bookingData.party_size > 8) {
        res.status(400).json({ success: false, message: 'Anzahl Personen muss zwischen 1 und 8 liegen. Für mehr Gäste bitte anrufen.' });
        return;
    }
    try {
        const booking = await BookingService.createBooking(bookingData, true);
        res.status(201).json({ success: true, data: booking, message: 'Buchung erfolgreich erstellt' });
    } catch (error) {
        const msg = (error as Error).message || '';
        if (msg.includes('not available')) res.status(400).json({ success: false, message: 'Zeitslot nicht verfügbar' });
        else res.status(500).json({ success: false, message: 'Fehler beim Erstellen der Buchung' });
    }
});

router.get('/venue/settings', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    try {
        const venue = await VenueService.getVenueById(venueId);
        if (!venue) {
            res.status(404).json({ success: false, message: 'Venue nicht gefunden' });
            return;
        }
        res.json({ success: true, data: venue });
    } catch (error) {
        logger.error('Error fetching venue settings', error);
        res.status(500).json({ success: false, message: 'Fehler beim Laden der Einstellungen' });
    }
});

router.patch('/venue/settings', async (req: Request, res: Response) => {
    const venueId = getVenueId(req);
    if (!venueId) {
        res.status(403).json({ success: false, message: 'Kein Venue zugewiesen' });
        return;
    }
    const { booking_advance_hours: rawAdvance, cancellation_hours: rawCancel, image_url } = req.body;
    const parseNonNegative = (v: unknown): number | undefined => {
        if (v === undefined || v === null) return undefined;
        const n = typeof v === 'number' ? v : Number(v);
        return (Number.isNaN(n) || n < 0) ? undefined : n;
    };
    const booking_advance_hours = parseNonNegative(rawAdvance);
    const cancellation_hours = parseNonNegative(rawCancel);
    const imageUrl = image_url === undefined ? undefined : (typeof image_url === 'string' ? image_url : image_url === null ? null : undefined);
    if (rawAdvance !== undefined && rawAdvance !== null && booking_advance_hours === undefined) {
        res.status(400).json({ success: false, message: 'booking_advance_hours muss eine positive Zahl sein' });
        return;
    }
    if (rawCancel !== undefined && rawCancel !== null && cancellation_hours === undefined) {
        res.status(400).json({ success: false, message: 'cancellation_hours muss eine positive Zahl sein' });
        return;
    }
    try {
        await OwnerService.updateVenueSettings(venueId, { booking_advance_hours, cancellation_hours, image_url: imageUrl });
        res.json({ success: true, message: 'Einstellungen erfolgreich aktualisiert' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Fehler beim Aktualisieren der Einstellungen' });
    }
});

export default router;
