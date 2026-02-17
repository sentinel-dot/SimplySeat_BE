import { Router, Request, Response } from 'express';
import { login, changePassword } from '../services/auth.service';
import { authenticateToken, authenticateAndLoadUser } from '../middleware/auth.middleware';
import { createLogger } from '../config/utils/logger';

const router = Router();
const logger = createLogger('auth.routes');

/**
 * POST /auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
    logger.info('POST /auth/login');
    
    const { email, password } = req.body;
    
    if (!email || !password) {
        res.status(400).json({
            success: false,
            message: 'E-Mail und Passwort sind erforderlich'
        });
        return;
    }
    
    const result = await login(email, password);
    
    if (result.success && result.data) {
        const { token, user } = result.data;
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? ('none' as const) : ('lax' as const),
            maxAge: 24 * 60 * 60 * 1000,
            path: '/',
        };
        res.cookie('admin_token', token, cookieOptions);
        res.json({ success: true, data: { user } });
    } else {
        res.status(401).json(result);
    }
});

/**
 * GET /auth/me
 * Get current user info (requires authentication).
 * Uses authenticateAndLoadUser so user is already loaded (no extra DB call).
 */
router.get('/me', authenticateAndLoadUser, async (req: Request, res: Response) => {
    logger.info('GET /auth/me');
    if (!req.user) {
        res.status(401).json({ success: false, message: 'Nicht authentifiziert' });
        return;
    }
    res.json({ success: true, data: req.user });
});

/**
 * PATCH /auth/me/password
 * Change password for the currently authenticated user (any role: admin, owner, staff)
 */
router.patch('/me/password', authenticateToken, async (req: Request, res: Response) => {
    const userId = req.jwtPayload?.userId;
    if (!userId) {
        res.status(401).json({ success: false, message: 'Nicht authentifiziert' });
        return;
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        res.status(400).json({ success: false, message: 'Aktuelles Passwort und neues Passwort sind erforderlich' });
        return;
    }
    const result = await changePassword(userId, currentPassword, newPassword);
    if (!result.success) {
        res.status(400).json({ success: false, message: result.message });
        return;
    }
    res.json({ success: true, message: result.data?.message || 'Passwort erfolgreich geändert' });
});

/**
 * POST /auth/logout
 * Clears HttpOnly auth cookie (no auth required – so cookie is always cleared)
 */
router.post('/logout', (req: Request, res: Response) => {
    logger.info('POST /auth/logout');
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie('admin_token', {
        path: '/',
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
    });
    res.json({
        success: true,
        message: 'Erfolgreich abgemeldet'
    });
});

export default router;
