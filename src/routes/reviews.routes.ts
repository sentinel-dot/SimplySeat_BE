import { Router, Request, Response } from 'express';
import { requireCustomerAuth, optionalCustomerAuth, requireEmailVerified } from '../middleware/customer-auth.middleware';
import {
    getVenueReviews,
    getCustomerReviews,
    getVenueAverageRating,
    createReview,
    updateReview,
    deleteReview,
    canCustomerReviewVenue
} from '../services/reviews.service';
import { createLogger } from '../config/utils/logger';
import { awardPointsForReview } from '../services/loyalty.service';

const router = Router();
const logger = createLogger('reviews.routes');

/**
 * GET /venues/:venueId/reviews
 * Get all reviews for a venue (public)
 */
router.get('/venues/:venueId/reviews', async (req: Request, res: Response) => {
    try {
        const venueId = parseInt(req.params.venueId, 10);
        
        if (isNaN(venueId)) {
            res.status(400).json({
                success: false,
                message: 'Ungültige Venue-ID'
            });
            return;
        }

        const result = await getVenueReviews(venueId);
        res.json(result);
    } catch (error) {
        logger.error('Error in get venue reviews route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * GET /venues/:venueId/reviews/rating
 * Get average rating for a venue (public)
 */
router.get('/venues/:venueId/reviews/rating', async (req: Request, res: Response) => {
    try {
        const venueId = parseInt(req.params.venueId, 10);
        
        if (isNaN(venueId)) {
            res.status(400).json({
                success: false,
                message: 'Ungültige Venue-ID'
            });
            return;
        }

        const rating = await getVenueAverageRating(venueId);
        
        res.json({
            success: true,
            data: rating
        });
    } catch (error) {
        logger.error('Error in get average rating route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * GET /venues/:venueId/reviews/can-review
 * Check if customer can review a venue (requires auth)
 */
router.get('/venues/:venueId/reviews/can-review', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const venueId = parseInt(req.params.venueId, 10);
        
        if (isNaN(venueId)) {
            res.status(400).json({
                success: false,
                message: 'Ungültige Venue-ID'
            });
            return;
        }

        const result = await canCustomerReviewVenue(req.customerJwtPayload.customerId, venueId);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error in can review route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * GET /customer/reviews
 * Get all customer's reviews (requires auth)
 */
router.get('/customer/reviews', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const result = await getCustomerReviews(req.customerJwtPayload.customerId);
        res.json(result);
    } catch (error) {
        logger.error('Error in get customer reviews route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * POST /customer/reviews
 * Create a new review (requires auth and verified email)
 */
router.post('/customer/reviews', requireCustomerAuth, requireEmailVerified, async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const { venue_id, booking_id, rating, comment } = req.body;

        if (!venue_id || !booking_id || !rating) {
            res.status(400).json({
                success: false,
                message: 'Venue-ID, Buchungs-ID und Bewertung sind erforderlich'
            });
            return;
        }

        const result = await createReview(req.customerJwtPayload.customerId, {
            venue_id,
            booking_id,
            rating,
            comment
        });

        // Award loyalty points for leaving a review
        if (result.success && result.data) {
            try {
                await awardPointsForReview(req.customerJwtPayload.customerId, booking_id);
            } catch (loyaltyError) {
                logger.error('Error awarding points for review', loyaltyError);
                // Don't fail the review creation if loyalty points fail
            }
        }

        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        logger.error('Error in create review route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * PATCH /customer/reviews/:reviewId
 * Update a review (requires auth and verified email)
 */
router.patch('/customer/reviews/:reviewId', requireCustomerAuth, requireEmailVerified, async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const reviewId = parseInt(req.params.reviewId, 10);
        
        if (isNaN(reviewId)) {
            res.status(400).json({
                success: false,
                message: 'Ungültige Review-ID'
            });
            return;
        }

        const { rating, comment } = req.body;

        const result = await updateReview(req.customerJwtPayload.customerId, reviewId, {
            rating,
            comment
        });

        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        logger.error('Error in update review route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * DELETE /customer/reviews/:reviewId
 * Delete a review (requires auth)
 */
router.delete('/customer/reviews/:reviewId', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const reviewId = parseInt(req.params.reviewId, 10);
        
        if (isNaN(reviewId)) {
            res.status(400).json({
                success: false,
                message: 'Ungültige Review-ID'
            });
            return;
        }

        const result = await deleteReview(req.customerJwtPayload.customerId, reviewId);

        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        logger.error('Error in delete review route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

export default router;
