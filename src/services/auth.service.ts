import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getConnection } from '../config/database';
import { createLogger } from '../config/utils/logger';
import { AdminUser, AdminUserPublic, JwtPayload, ApiResponse, LoginResponse } from '../config/utils/types';

const logger = createLogger('auth.service');

const DEFAULT_JWT_SECRET = 'simplyseat-admin-secret-key-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/** Bekannte schwache/Beispiel-Secrets – in Production verboten */
const WEAK_JWT_SECRETS = new Set([
    '',
    'change-me',
    'change-me-in-production',
    'secret',
    'jwt-secret',
    'your-256-bit-secret',
    DEFAULT_JWT_SECRET,
]);

/** Außer in Development muss ein starkes JWT_SECRET gesetzt sein (Production, Staging, etc.). */
export function assertSecureJwtSecret(): void {
    if (process.env.NODE_ENV === 'development') return;
    const secret = process.env.JWT_SECRET?.trim() ?? '';
    if (!secret || secret.length < 32 || WEAK_JWT_SECRETS.has(secret)) {
        logger.error('NODE_ENV ist nicht "development". Ein starkes JWT_SECRET (min. 32 Zeichen) ist erforderlich. Setzen Sie JWT_SECRET (z. B. openssl rand -base64 32).');
        process.exit(1);
    }
}

/**
 * Find admin user by email
 */
export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
    let conn = null;
    try {
        conn = await getConnection();
        const rows = await conn.query(
            'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
            [email]
        );
        
        if (rows.length === 0) {
            return null;
        }
        
        return rows[0] as AdminUser;
    } catch (error) {
        logger.error('Error finding admin by email', error);
        throw error;
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Find admin user by ID
 */
export async function findAdminById(id: number): Promise<AdminUser | null> {
    let conn = null;
    try {
        conn = await getConnection();
        const rows = await conn.query(
            'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
            [id]
        );
        
        if (rows.length === 0) {
            return null;
        }
        
        return rows[0] as AdminUser;
    } catch (error) {
        logger.error('Error finding admin by ID', error);
        throw error;
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
        return await bcrypt.compare(password, hash);
    } catch (error) {
        logger.error('Error verifying password', error);
        return false;
    }
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Generate JWT token
 */
export function generateToken(user: AdminUser): string {
    const payload: JwtPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        venueId: user.venue_id
    };
    
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch (error) {
        logger.debug('Token verification failed', error);
        return null;
    }
}

/**
 * Update last login timestamp
 */
export async function updateLastLogin(userId: number): Promise<void> {
    let conn = null;
    try {
        conn = await getConnection();
        await conn.query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [userId]
        );
    } catch (error) {
        logger.error('Error updating last login', error);
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Convert AdminUser to public representation (without password)
 */
export function toPublicUser(user: AdminUser): AdminUserPublic {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        venue_id: user.venue_id,
        role: user.role
    };
}

/**
 * Change password for an admin user
 */
export async function changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
): Promise<ApiResponse<{ message: string }>> {
    try {
        const user = await findAdminById(userId);
        if (!user) {
            return { success: false, message: 'Benutzer nicht gefunden' };
        }

        const isValid = await verifyPassword(currentPassword, user.password_hash);
        if (!isValid) {
            logger.warn(`Password change failed: Invalid current password - userId ${userId}`);
            return { success: false, message: 'Aktuelles Passwort ist falsch' };
        }

        if (!newPassword || newPassword.length < 8) {
            return { success: false, message: 'Neues Passwort muss mindestens 8 Zeichen haben' };
        }

        const newHash = await hashPassword(newPassword);
        let conn = null;
        try {
            conn = await getConnection();
            await conn.query(
                'UPDATE users SET password_hash = ? WHERE id = ?',
                [newHash, userId]
            );
        } finally {
            if (conn) conn.release();
        }

        logger.info(`Password changed successfully for userId ${userId}`);
        return { success: true, data: { message: 'Passwort erfolgreich geändert' } };
    } catch (error) {
        logger.error('Error changing password', error);
        return { success: false, message: 'Fehler beim Ändern des Passworts' };
    }
}

/**
 * Login user
 */
export async function login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
    try {
        // Find user
        const user = await findAdminByEmail(email);
        if (!user) {
            logger.warn(`Login attempt failed: User not found - ${email}`);
            return {
                success: false,
                message: 'Ungültige E-Mail oder Passwort'
            };
        }
        
        // Verify password
        const isValid = await verifyPassword(password, user.password_hash);
        if (!isValid) {
            logger.warn(`Login attempt failed: Invalid password - ${email}`);
            return {
                success: false,
                message: 'Ungültige E-Mail oder Passwort'
            };
        }
        
        // Generate token
        const token = generateToken(user);
        
        // Update last login
        await updateLastLogin(user.id);
        
        logger.info(`User logged in successfully: ${email}`);
        
        return {
            success: true,
            data: {
                token,
                user: toPublicUser(user)
            }
        };
    } catch (error) {
        logger.error('Login error', error);
        return {
            success: false,
            message: 'Ein Fehler ist aufgetreten'
        };
    }
}
