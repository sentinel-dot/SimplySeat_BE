import { Request, Response, NextFunction } from 'express';
import { verifyToken, findAdminById, toPublicUser } from '../services/auth.service';
import { sendError } from '../config/utils/response';
import { createLogger } from '../config/utils/logger';
import { JwtPayload, AdminUserPublic, AdminRole } from '../config/utils/types';

const logger = createLogger('auth.middleware');

// Erweiterung des Express Request um user und jwtPayload (nach Auth-Middleware)
declare global {
    namespace Express {
        interface Request {
            user?: AdminUserPublic;
            jwtPayload?: JwtPayload;
        }
    }
}

/**
 * Get JWT from Authorization header (Bearer) or from HttpOnly cookie (production-safe)
 */
function getTokenFromRequest(req: Request): string | null {
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1];
    if (bearerToken) return bearerToken;
    const cookieToken = req.cookies?.admin_token;
    return typeof cookieToken === 'string' ? cookieToken : null;
}

/**
 * Authentication middleware
 * Verifies JWT from Authorization header or from HttpOnly cookie
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
    const token = getTokenFromRequest(req);
    
    if (!token) {
        res.status(401).json({
            success: false,
            message: 'Authentifizierung erforderlich'
        });
        return;
    }
    
    const payload = verifyToken(token);
    if (!payload) {
        res.status(403).json({
            success: false,
            message: 'Ungültiger oder abgelaufener Token'
        });
        return;
    }
    
    req.jwtPayload = payload;
    next();
}

/**
 * Authentication middleware that also loads the full user
 */
export async function authenticateAndLoadUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = getTokenFromRequest(req);
    
    if (!token) {
        res.status(401).json({
            success: false,
            message: 'Authentifizierung erforderlich'
        });
        return;
    }
    
    const payload = verifyToken(token);
    if (!payload) {
        res.status(403).json({
            success: false,
            message: 'Ungültiger oder abgelaufener Token'
        });
        return;
    }
    
    try {
        const user = await findAdminById(payload.userId);
        if (!user) {
            res.status(403).json({
                success: false,
                message: 'Benutzer nicht gefunden'
            });
            return;
        }
        
        req.user = toPublicUser(user);
        req.jwtPayload = payload;
        next();
    } catch (error) {
        logger.error('Error loading user in middleware', error);
        sendError(res, 500, 'Interner Serverfehler', error);
    }
}

/**
 * Role-based authorization middleware
 * Must be used after authenticateToken or authenticateAndLoadUser
 */
export function requireRole(...roles: AdminRole[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.jwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Authentifizierung erforderlich'
            });
            return;
        }
        
        if (!roles.includes(req.jwtPayload.role)) {
            res.status(403).json({
                success: false,
                message: 'Keine Berechtigung für diese Aktion'
            });
            return;
        }
        
        next();
    };
}

/**
 * System-Admin-only authorization (role admin, typically venue_id NULL)
 */
export function requireSystemAdmin(req: Request, res: Response, next: NextFunction): void {
    if (!req.jwtPayload) {
        res.status(401).json({
            success: false,
            message: 'Authentifizierung erforderlich'
        });
        return;
    }
    if (req.jwtPayload.role !== 'admin') {
        res.status(403).json({
            success: false,
            message: 'Nur System-Admins haben Zugriff'
        });
        return;
    }
    next();
}

/**
 * Venue-based authorization middleware
 * Ensures user can only access their own venue's data.
 * Admin: any venue. Owner/Staff: only venue_id from JWT.
 */
export function requireVenueAccess(req: Request, res: Response, next: NextFunction): void {
    if (!req.jwtPayload) {
        res.status(401).json({
            success: false,
            message: 'Authentifizierung erforderlich'
        });
        return;
    }
    if (req.jwtPayload.role === 'admin') {
        next();
        return;
    }
    const raw = req.params.venueId ?? req.body?.venue_id;
    const requestedVenueId = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isInteger(requestedVenueId) || requestedVenueId < 1) {
        res.status(400).json({
            success: false,
            message: 'Ungültige oder fehlende Venue-ID'
        });
        return;
    }
    if (req.jwtPayload.venueId === null || requestedVenueId !== req.jwtPayload.venueId) {
        res.status(403).json({
            success: false,
            message: 'Kein Zugriff auf diese Venue'
        });
        return;
    }
    next();
}
