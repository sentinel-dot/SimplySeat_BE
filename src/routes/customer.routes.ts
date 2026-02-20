import { Router, Request, Response } from 'express';
import { requireCustomerAuth, requireEmailVerified } from '../middleware/customer-auth.middleware';
import { 
    getCustomerProfile, 
    updateCustomerProfile,
    getCustomerPreferences,
    updateCustomerPreferences,
    deleteCustomerAccount
} from '../services/customer.service';
import { BookingService } from '../services/booking.service';
import { createLogger } from '../config/utils/logger';
import { parsePositiveId } from '../config/utils/helper';
import { sendError } from '../config/utils/response';

const router = Router();
const logger = createLogger('customer.routes');

// All customer routes require authentication
router.use(requireCustomerAuth);

/**
 * GET /customer/profile
 * Get customer profile
 */
router.get('/profile', async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const result = await getCustomerProfile(req.customerJwtPayload.customerId);
        res.json(result);
    } catch (error) {
        logger.error('Error in get profile route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * PATCH /customer/profile
 * Update customer profile
 */
router.patch('/profile', async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const { name, phone } = req.body;
        const result = await updateCustomerProfile(req.customerJwtPayload.customerId, { name, phone });
        
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        logger.error('Error in update profile route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * DELETE /customer/profile
 * Delete customer account
 */
router.delete('/profile', async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const result = await deleteCustomerAccount(req.customerJwtPayload.customerId);
        
        if (result.success) {
            // Clear the auth cookie
            res.clearCookie('customer_token');
        }

        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        logger.error('Error in delete account route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * GET /customer/preferences
 * Get customer preferences
 */
router.get('/preferences', async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const result = await getCustomerPreferences(req.customerJwtPayload.customerId);
        res.json(result);
    } catch (error) {
        logger.error('Error in get preferences route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * PATCH /customer/preferences
 * Update customer preferences
 */
router.patch('/preferences', async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const updates = req.body;
        const result = await updateCustomerPreferences(req.customerJwtPayload.customerId, updates);
        
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        logger.error('Error in update preferences route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * GET /customer/bookings
 * Get customer's booking history (secure, authenticated)
 */
router.get('/bookings', async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const onlyFuture = req.query.onlyFuture === 'true';
        const bookings = await BookingService.getBookingsByCustomerId(
            req.customerJwtPayload.customerId,
            onlyFuture
        );

        res.json({
            success: true,
            data: bookings
        });
    } catch (error) {
        logger.error('Error in get bookings route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * POST /customer/bookings/:id/quick-rebook
 * Quickly rebook a previous booking (creates a new booking with same details, requires verified email)
 */
router.post('/bookings/:id/quick-rebook', requireEmailVerified, async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const bookingId = parsePositiveId(req.params.id);
        if (bookingId === null) {
            res.status(400).json({
                success: false,
                message: 'Ungültige Buchungs-ID'
            });
            return;
        }

        // Get the original booking
        const originalBooking = await BookingService.getBookingById(bookingId);

        if (!originalBooking) {
            res.status(404).json({
                success: false,
                message: 'Buchung nicht gefunden'
            });
            return;
        }

        // Verify the booking belongs to this customer
        if (originalBooking.customer_id !== req.customerJwtPayload.customerId) {
            res.status(403).json({
                success: false,
                message: 'Diese Buchung gehört nicht zu Ihrem Konto'
            });
            return;
        }

        // Get new booking details from request body
        const { booking_date, start_time, end_time, party_size } = req.body;

        const finalPartySize = party_size ?? originalBooking.party_size;
        if (finalPartySize < 1 || finalPartySize > 8) {
            res.status(400).json({
                success: false,
                message: 'Anzahl Personen muss zwischen 1 und 8 liegen. Für mehr Gäste bitte anrufen.'
            });
            return;
        }

        if (!booking_date || !start_time || !end_time) {
            res.status(400).json({
                success: false,
                message: 'Datum und Zeitangaben sind erforderlich'
            });
            return;
        }

        // Create new booking with same service/venue but new date/time
        const newBooking = await BookingService.createBooking({
            customer_id: req.customerJwtPayload.customerId,
            venue_id: originalBooking.venue_id,
            service_id: originalBooking.service_id,
            staff_member_id: originalBooking.staff_member_id ?? undefined,
            customer_name: originalBooking.customer_name,
            customer_email: originalBooking.customer_email,
            customer_phone: originalBooking.customer_phone ?? undefined,
            booking_date,
            start_time,
            end_time,
            party_size: finalPartySize,
            special_requests: originalBooking.special_requests ?? undefined,
            total_amount: originalBooking.total_amount ?? undefined
        });

        res.status(201).json({
            success: true,
            data: newBooking
        });
    } catch (error) {
        logger.error('Error in quick rebook route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

export default router;
