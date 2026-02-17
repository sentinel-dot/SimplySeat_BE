import { Router, Request, Response } from 'express';
import { requireCustomerAuth } from '../middleware/customer-auth.middleware';
import {
    getCustomerFavorites,
    isFavorite,
    addFavorite,
    removeFavorite,
    getFavoriteCount
} from '../services/favorites.service';
import { createLogger } from '../config/utils/logger';

const router = Router();
const logger = createLogger('favorites.routes');

// All favorites routes require authentication
router.use(requireCustomerAuth);

/**
 * GET /customer/favorites
 * Get all customer favorites
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const result = await getCustomerFavorites(req.customerJwtPayload.customerId);
        res.json(result);
    } catch (error) {
        logger.error('Error in get favorites route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * GET /customer/favorites/:venueId/check
 * Check if venue is favorited
 */
router.get('/:venueId/check', async (req: Request, res: Response) => {
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

        const isFav = await isFavorite(req.customerJwtPayload.customerId, venueId);
        
        res.json({
            success: true,
            data: { isFavorite: isFav }
        });
    } catch (error) {
        logger.error('Error in check favorite route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * POST /customer/favorites/:venueId
 * Add venue to favorites
 */
router.post('/:venueId', async (req: Request, res: Response) => {
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

        const result = await addFavorite(req.customerJwtPayload.customerId, venueId);
        
        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        logger.error('Error in add favorite route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * DELETE /customer/favorites/:venueId
 * Remove venue from favorites
 */
router.delete('/:venueId', async (req: Request, res: Response) => {
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

        const result = await removeFavorite(req.customerJwtPayload.customerId, venueId);
        
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        logger.error('Error in remove favorite route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

export default router;
