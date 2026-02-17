import { Request, Response, NextFunction } from 'express';
import { verifyToken, findCustomerById, toPublicCustomer } from '../services/customer-auth.service';
import { createLogger } from '../config/utils/logger';
import { CustomerJwtPayload, CustomerPublic } from '../config/utils/types';

const logger = createLogger('customer-auth.middleware');

// Erweiterung des Express Request um customer und customerJwtPayload (nach Auth-Middleware)
declare global {
    namespace Express {
        interface Request {
            customer?: CustomerPublic;
            customerJwtPayload?: CustomerJwtPayload;
        }
    }
}

/**
 * Get customer JWT from Authorization header (Bearer) or from HttpOnly cookie (production-safe)
 */
function getTokenFromRequest(req: Request): string | null {
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1];
    if (bearerToken) return bearerToken;
    const cookieToken = req.cookies?.customer_token;
    return typeof cookieToken === 'string' ? cookieToken : null;
}

/**
 * Optional customer authentication middleware
 * Loads customer if token is present, but doesn't fail if missing
 * Useful for endpoints that work both for guests and authenticated customers
 */
export async function optionalCustomerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = getTokenFromRequest(req);
    
    if (!token) {
        // No token present, continue as guest
        next();
        return;
    }
    
    const payload = verifyToken(token);
    if (!payload) {
        // Invalid token, continue as guest (don't fail)
        next();
        return;
    }
    
    try {
        const customer = await findCustomerById(payload.customerId);
        if (customer) {
            req.customer = toPublicCustomer(customer);
            req.customerJwtPayload = payload;
        }
        next();
    } catch (error) {
        logger.error('Error loading customer in optional auth middleware', error);
        // Don't fail, continue as guest
        next();
    }
}

/**
 * Customer authentication middleware that also loads the full customer
 * Use this when you need customer details beyond just the JWT payload
 */
export async function requireCustomerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = getTokenFromRequest(req);
    
    if (!token) {
        res.status(401).json({
            success: false,
            message: 'Authentifizierung erforderlich. Bitte melden Sie sich an.'
        });
        return;
    }
    
    const payload = verifyToken(token);
    if (!payload) {
        res.status(403).json({
            success: false,
            message: 'Ungültiger oder abgelaufener Token. Bitte melden Sie sich erneut an.'
        });
        return;
    }
    
    try {
        const customer = await findCustomerById(payload.customerId);
        if (!customer) {
            res.status(403).json({
                success: false,
                message: 'Kunde nicht gefunden'
            });
            return;
        }
        
        req.customer = toPublicCustomer(customer);
        req.customerJwtPayload = payload;
        next();
    } catch (error) {
        logger.error('Error loading customer in middleware', error);
        res.status(500).json({
            success: false,
            message: 'Interner Serverfehler'
        });
    }
}

/**
 * Middleware to check if customer's email is verified
 * Use after requireCustomerAuth
 */
export function requireEmailVerified(req: Request, res: Response, next: NextFunction): void {
    if (!req.customer) {
        res.status(401).json({
            success: false,
            message: 'Authentifizierung erforderlich'
        });
        return;
    }
    
    if (!req.customer.email_verified) {
        res.status(403).json({
            success: false,
            message: 'Bitte verifizieren Sie Ihre E-Mail-Adresse, um diese Funktion zu nutzen'
        });
        return;
    }
    
    next();
}
