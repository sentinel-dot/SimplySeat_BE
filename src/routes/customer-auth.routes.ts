import { Router, Request, Response } from 'express';
import { 
    register, 
    login, 
    verifyEmail, 
    requestPasswordReset, 
    resetPassword,
    changePassword,
    linkAllBookingsByEmail,
    findCustomerById
} from '../services/customer-auth.service';
import { requireCustomerAuth } from '../middleware/customer-auth.middleware';
import { createLogger } from '../config/utils/logger';
import { sendError } from '../config/utils/response';

const router = Router();
const logger = createLogger('customer-auth.routes');

/**
 * POST /auth/customer/register
 * Register a new customer account.
 * All past bookings with the same email are automatically linked to the new account.
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name, phone } = req.body;

        if (!email || !password || !name) {
            res.status(400).json({
                success: false,
                message: 'E-Mail, Passwort und Name sind erforderlich'
            });
            return;
        }

        const result = await register({ email, password, name, phone });

        if (!result.success) {
            res.status(400).json(result);
            return;
        }

        // Set HttpOnly cookie with token
        if (result.data?.token) {
            res.cookie('customer_token', result.data.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });
        }

        // Auto-link all past bookings with matching email to the new account
        if (result.data?.customer?.id && result.data.customer?.email) {
            try {
                await linkAllBookingsByEmail(result.data.customer.id, result.data.customer.email);
            } catch (linkErr) {
                logger.error('Auto-link bookings by email after register failed', linkErr);
            }
        }

        res.status(201).json(result);
    } catch (error) {
        logger.error('Error in register route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * POST /auth/customer/login
 * Login customer
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: 'E-Mail und Passwort sind erforderlich'
            });
            return;
        }

        const result = await login(email, password);

        if (!result.success) {
            res.status(401).json(result);
            return;
        }

        // Set HttpOnly cookie with token
        if (result.data?.token) {
            res.cookie('customer_token', result.data.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });
        }

        res.json(result);
    } catch (error) {
        logger.error('Error in login route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * POST /auth/customer/logout
 * Logout customer
 */
router.post('/logout', (req: Request, res: Response) => {
    res.clearCookie('customer_token');
    res.json({
        success: true,
        message: 'Erfolgreich abgemeldet'
    });
});

/**
 * GET /auth/customer/me
 * Get current customer profile
 */
router.get('/me', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        if (!req.customer) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        res.json({
            success: true,
            data: req.customer
        });
    } catch (error) {
        logger.error('Error in me route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * POST /auth/customer/verify-email
 * Verify customer email with token
 */
router.post('/verify-email', async (req: Request, res: Response) => {
    try {
        const { token } = req.body;

        if (!token) {
            res.status(400).json({
                success: false,
                message: 'Verifizierungstoken ist erforderlich'
            });
            return;
        }

        const result = await verifyEmail(token);

        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        logger.error('Error in verify-email route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * POST /auth/customer/resend-verification
 * Resend verification email to customer
 */
router.post('/resend-verification', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        if (!req.customer) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        // Check if already verified
        if (req.customer.email_verified) {
            res.status(400).json({
                success: false,
                message: 'E-Mail ist bereits verifiziert'
            });
            return;
        }

        // Find customer and ensure we have a verification token
        const customer = await findCustomerById(req.customer.id);
        if (!customer) {
            res.status(404).json({
                success: false,
                message: 'Kunde nicht gefunden'
            });
            return;
        }

        let verificationToken = customer.verification_token;
        if (!verificationToken) {
            const { generateVerificationToken } = await import('../services/customer-auth.service');
            const { getConnection } = await import('../config/database');
            verificationToken = generateVerificationToken();
            const conn = await getConnection();
            try {
                await conn.query(
                    'UPDATE customers SET verification_token = ? WHERE id = ?',
                    [verificationToken, customer.id]
                );
            } finally {
                conn.release();
            }
        }

        const { sendCustomerVerificationEmail } = await import('../services/email.service');
        const emailSent = await sendCustomerVerificationEmail(
            customer.email,
            customer.name,
            verificationToken
        );

        if (!emailSent) {
            sendError(res, 500, 'Fehler beim Versenden der E-Mail');
            return;
        }

        res.json({
            success: true,
            message: 'Verifizierungs-E-Mail wurde erneut gesendet'
        });
    } catch (error) {
        logger.error('Error in resend-verification route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * POST /auth/customer/forgot-password
 * Request password reset
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            res.status(400).json({
                success: false,
                message: 'E-Mail ist erforderlich'
            });
            return;
        }

        const result = await requestPasswordReset(email);

        res.json(result);
    } catch (error) {
        logger.error('Error in forgot-password route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * POST /auth/customer/reset-password
 * Reset password with token
 */
router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            res.status(400).json({
                success: false,
                message: 'Token und neues Passwort sind erforderlich'
            });
            return;
        }

        const result = await resetPassword(token, newPassword);

        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        logger.error('Error in reset-password route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

/**
 * POST /auth/customer/change-password
 * Change password for authenticated customer
 */
router.post('/change-password', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            res.status(400).json({
                success: false,
                message: 'Aktuelles und neues Passwort sind erforderlich'
            });
            return;
        }

        if (!req.customerJwtPayload) {
            res.status(401).json({
                success: false,
                message: 'Nicht authentifiziert'
            });
            return;
        }

        const result = await changePassword(
            req.customerJwtPayload.customerId,
            currentPassword,
            newPassword
        );

        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        logger.error('Error in change-password route', error);
        sendError(res, 500, 'Ein Fehler ist aufgetreten', error);
    }
});

export default router;
