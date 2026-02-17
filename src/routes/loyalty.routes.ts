import { Router, Request, Response } from 'express';
import { requireCustomerAuth } from '../middleware/customer-auth.middleware';
import {
    getLoyaltyBalance,
    getLoyaltyTransactions,
    getLoyaltyStats,
    getPointsConfig
} from '../services/loyalty.service';
import { createLogger } from '../config/utils/logger';

const router = Router();
const logger = createLogger('loyalty.routes');

// All loyalty routes require authentication
router.use(requireCustomerAuth);

/**
 * GET /customer/loyalty
 * Get customer's loyalty points balance and stats
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

        const statsResult = await getLoyaltyStats(req.customerJwtPayload.customerId);
        
        res.json(statsResult);
    } catch (error) {
        logger.error('Error in get loyalty route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * GET /customer/loyalty/balance
 * Get customer's current loyalty points balance
 */
router.get('/balance', async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const result = await getLoyaltyBalance(req.customerJwtPayload.customerId);
        
        res.json(result);
    } catch (error) {
        logger.error('Error in get balance route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * GET /customer/loyalty/transactions
 * Get customer's loyalty transaction history
 */
router.get('/transactions', async (req: Request, res: Response) => {
    try {
        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
        const result = await getLoyaltyTransactions(req.customerJwtPayload.customerId, limit);
        
        res.json(result);
    } catch (error) {
        logger.error('Error in get transactions route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

/**
 * GET /customer/loyalty/config
 * Get points configuration (how many points for what actions)
 */
router.get('/config', async (req: Request, res: Response) => {
    try {
        const config = await getPointsConfig();

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('Error in get config route', error);
        res.status(500).json({
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        });
    }
});

export default router;
