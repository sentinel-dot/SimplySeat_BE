import express, { Request, Response } from 'express';
import { createLogger } from '../config/utils/logger';
import { VenueService } from '../services/venue.service';
import { Venue, VenueWithStaff, ApiResponse, Booking } from '../config/utils/types';
import { BookingService } from '../services/booking.service';
import { authenticateToken, requireVenueAccess } from '../middleware/auth.middleware';
import { parsePositiveId } from '../config/utils/helper';
import { sendError } from '../config/utils/response';

const router = express.Router();
const logger = createLogger('venue.routes');

const VALID_VENUE_TYPES = ['restaurant', 'hair_salon', 'beauty_salon', 'cafe', 'bar', 'spa', 'other'] as const;

/** Zeitfenster ±1h um gewünschte Uhrzeit (HH:MM) für Suche "ca. 19:00" */
function timeWindowAround(timeStr: string): { timeWindowStart: string; timeWindowEnd: string } | undefined {
    if (!timeStr || typeof timeStr !== 'string') return undefined;
    const match = timeStr.match(/^(\d{1,2}):?(\d{2})?$/);
    if (!match) return undefined;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2] ?? '0', 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
    const centerMins = h * 60 + m;
    const startMins = Math.max(0, centerMins - 60);
    const endMins = Math.min(24 * 60 - 1, centerMins + 60);
    return {
        timeWindowStart: `${String(Math.floor(startMins / 60)).padStart(2, '0')}:${String(startMins % 60).padStart(2, '0')}`,
        timeWindowEnd: `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`
    };
}

/**
 * GET /venues
 * Liste aller aktiven Venues.
 * Query: type (optional), date (YYYY-MM-DD, optional), party_size (optional), time (HH:MM, optional).
 * Wenn date gesetzt: nur Venues mit mindestens einem freien Slot an dem Tag (und optional im Zeitfenster um time).
 */
router.get('/', async (req, res) => 
{
    const typeParam = req.query.type as string | undefined;
    const type = typeParam && VALID_VENUE_TYPES.includes(typeParam as typeof VALID_VENUE_TYPES[number])
        ? (typeParam as typeof VALID_VENUE_TYPES[number])
        : undefined;
    const date = (req.query.date as string | undefined)?.trim() || undefined;
    const partySizeParam = req.query.party_size as string | undefined;
    const party_size = partySizeParam != null && partySizeParam !== ''
        ? parseInt(partySizeParam, 10)
        : undefined;
    const time = (req.query.time as string | undefined)?.trim() || undefined;
    const timeWindow = time ? timeWindowAround(time) : undefined;

    const location = (req.query.location as string | undefined)?.trim() || undefined;
    const sortParam = req.query.sort as string | undefined;
    const sort = sortParam === 'distance' ? 'distance' : 'name';
    const q = (req.query.q as string | undefined)?.trim() || undefined;

    const opts: Parameters<typeof VenueService.getAllVenues>[0] = {};
    if (type) opts.type = type;
    if (date) opts.date = date;
    if (party_size != null && !isNaN(party_size) && party_size >= 1) opts.party_size = party_size;
    if (timeWindow) {
        opts.timeWindowStart = timeWindow.timeWindowStart;
        opts.timeWindowEnd = timeWindow.timeWindowEnd;
    }
    if (location) opts.location = location;
    if (sort) opts.sort = sort;
    if (q) opts.q = q;
    const hasFilters = Object.keys(opts).length > 0;

    try 
    {
        const venues = await VenueService.getAllVenues(hasFilters ? opts : undefined);

        res.json({
            success: true,
            message: `${venues.length} venue${venues.length !== 1 ? 's' : ''} found`,
            data: venues
        } as ApiResponse<(Venue & { averageRating: number | null; reviewCount: number })[]>);
    } 
    catch (error) 
    {     
        return sendError(res, 500, 'Failed to retrieve venues', error);
    }
});

/**
 * GET /venues/featured
 * Top-Venues nach Beliebtheit. Mit Standort nur Venues in 30 km: ?location=Ort/PLZ oder ?lat=…&lng=… (Browser-Standort).
 */
router.get('/featured', async (req, res) => {
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit || 8), 10) || 8));
    const location = (req.query.location as string | undefined)?.trim() || undefined;
    const latParam = req.query.lat as string | undefined;
    const lngParam = req.query.lng as string | undefined;
    const lat = latParam != null && latParam !== '' ? parseFloat(latParam) : undefined;
    const lng = lngParam != null && lngParam !== '' ? parseFloat(lngParam) : undefined;
    try {
        const venues = await VenueService.getFeaturedVenues(limit, 2, location, lat, lng);
        res.json({ success: true, data: venues });
    } catch (error) {
        return sendError(res, 500, 'Failed to retrieve featured venues', error);
    }
});

/**
 * GET /venues/stats
 * Öffentliche Statistiken für Homepage: venueCount, bookingCountThisMonth
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await VenueService.getPublicStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        return sendError(res, 500, 'Failed to retrieve stats', error);
    }
});

/**
 * GET /venues/locations/autocomplete
 * Autocomplete für Ortssuche: liefert unique cities und postal_codes aus venues
 * Query: q (min. 2 Zeichen)
 */
router.get('/locations/autocomplete', async (req, res) => {
    const query = (req.query.q as string | undefined)?.trim() || '';
    
    if (query.length < 2) {
        return res.json({ success: true, data: [] });
    }
    
    try {
        const suggestions = await VenueService.getLocationSuggestions(query);
        res.json({ success: true, data: suggestions });
    } catch (error) {
        return sendError(res, 500, 'Failed to retrieve location suggestions', error);
    }
});

/**
 * GET /venues/:id
 * Ein spezifisches Venue mit Services und Staff
 */
router.get('/:id', async (req, res) => 
{
    const id = parsePositiveId(req.params.id);
    if (id === null) {
        logger.warn('Invalid venue ID provided', { provided_id: req.params.id });
        return res.status(400).json({
            success: false,
            message: 'Invalid venue ID'
        } as ApiResponse<void>);
    }

    try 
    {
        const venue = await VenueService.getVenueById(id);

        if (!venue)
        {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            } as ApiResponse<void>);
        }

        res.json({
            success: true,
            message: 'Venue details retrieved successfully',
            data: venue
        } as ApiResponse<VenueWithStaff>);
    } 
    catch (error) 
    {
        logger.error('Failed to retrieve venue details', error);
        return sendError(res, 500, 'Failed to retrieve venue', error);
    }
});

/**
 * =====================================================================================================
 * GET /venues/:venueId/bookings
 * =====================================================================================================
 * Ruft alle Buchungen für ein bestimmtes Venue ab (mit optionalen Filtern)
 * 
 * URL PARAMETER:
 * - :venueId = Venue ID (z.B. /venues/1/bookings)
 * 
 * QUERY PARAMETERS (alle optional):
 * - ?date=YYYY-MM-DD                                               → Nur Buchungen an diesem Tag
 * - ?status=confirmed                                              → Nur Buchungen mit diesem Status
 * - ?startDate=YYYY-MM-DD                                          → Buchungen ab diesem Datum
 * - ?endDate=YYYY-MM-DD                                            → Buchungen bis zu diesem Datum
 * 
 * BEISPIELE:
 * - /venues/1/bookings                                             → Alle Buchungen
 * - /venues/1/bookings?date=2025-10-25                             → Nur am 25.10.2025
 * - /venues/1/bookings?status=confirmed                            → Nur bestätigte
 * - /venues/1/bookings?startDate=2025-10-01&endDate=2025-10-31     → Oktober 2025
 * 
 * USE CASES:
 * - Admin Dashboard: Tagesübersicht
 * - Kalender-Ansicht: Alle Buchungen in einem Monat
 * - Statistiken: Gefiltert nach Status
 * 
 * RESPONSE (Success - 200 OK):
 * {
 *      success: true,
 *      message: 'X booking(s) found',
 *      data: [...array von bookings]
 * }
 */
router.get('/:venueId/bookings', authenticateToken, requireVenueAccess, async (req: Request<{ venueId: string }>, res: Response) => 
{
    const venueId = parsePositiveId(req.params.venueId);
    if (venueId === null) {
        logger.warn('Invalid venue ID', { provided: req.params.venueId });
        return res.status(400).json({
            success: false,
            message: 'Invalid venue Id'
        } as ApiResponse<void>);
    }

    const { date, status, startDate, endDate } = req.query;

    try 
    {
        const venue = await VenueService.getVenueById(venueId);

        if (!venue)
        {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            } as ApiResponse<void>);
        }

        // FILTER-OBJEKT ERSTELLEN
        // Nur definierte Query-Parameter werden an den Service übergeben
        // Warum ? -> Verhindert undefined-Werte in SQL-Query
        const filters: {
            date?: string;
            status?: string;
            startDate?: string;
            endDate?: string;
        } = {};

        // Nur hinzufügen wenn Parameter vorhanden ist
        if (date) filters.date = date as string;
        if (status) filters.status = status as string;
        if (startDate) filters.startDate = startDate as string;
        if (endDate) filters.endDate = endDate as string;

        // Falls filters = {} (leer), werden alle Buchungen geholt
        const bookings = await BookingService.getBookingsByVenue(venueId, filters);

        res.json({
            success: true,
            message: `${bookings.length} booking${bookings.length !== 1 ? 's' : ''} found`,
            data: bookings
        } as ApiResponse<Booking[]>);
    } 
    catch (error) 
    {
        logger.error('Error fetching venue bookings', error);
        return sendError(res, 500, 'Failed to fetch bookings', error);
    }
});

export default router;