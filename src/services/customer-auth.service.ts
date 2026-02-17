import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getConnection } from '../config/database';
import { createLogger } from '../config/utils/logger';
import { 
    Customer, 
    CustomerPublic, 
    CustomerJwtPayload, 
    CustomerRegisterRequest,
    CustomerLoginResponse,
    ApiResponse 
} from '../config/utils/types';

const logger = createLogger('customer-auth.service');

const DEFAULT_JWT_SECRET = 'simplyseat-customer-secret-key-change-in-production';
const JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const JWT_EXPIRES_IN = process.env.CUSTOMER_JWT_EXPIRES_IN || '7d';

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
    const secret = process.env.CUSTOMER_JWT_SECRET?.trim() ?? process.env.JWT_SECRET?.trim() ?? '';
    if (!secret || secret.length < 32 || WEAK_JWT_SECRETS.has(secret)) {
        logger.error('NODE_ENV ist nicht "development". Ein starkes CUSTOMER_JWT_SECRET (min. 32 Zeichen) ist erforderlich.');
        process.exit(1);
    }
}

/**
 * Find customer by email
 */
export async function findCustomerByEmail(email: string): Promise<Customer | null> {
    let conn = null;
    try {
        conn = await getConnection();
        const rows = await conn.query(
            'SELECT * FROM customers WHERE email = ? AND is_active = TRUE',
            [email]
        );
        
        if (rows.length === 0) {
            return null;
        }
        
        return rows[0] as Customer;
    } catch (error) {
        logger.error('Error finding customer by email', error);
        throw error;
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Find customer by ID
 */
export async function findCustomerById(id: number): Promise<Customer | null> {
    let conn = null;
    try {
        conn = await getConnection();
        const rows = await conn.query(
            'SELECT * FROM customers WHERE id = ? AND is_active = TRUE',
            [id]
        );
        
        if (rows.length === 0) {
            return null;
        }
        
        return rows[0] as Customer;
    } catch (error) {
        logger.error('Error finding customer by ID', error);
        throw error;
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Find customer by verification token
 */
export async function findCustomerByVerificationToken(token: string): Promise<Customer | null> {
    let conn = null;
    try {
        conn = await getConnection();
        const rows = await conn.query(
            'SELECT * FROM customers WHERE verification_token = ? AND is_active = TRUE',
            [token]
        );
        
        if (rows.length === 0) {
            return null;
        }
        
        return rows[0] as Customer;
    } catch (error) {
        logger.error('Error finding customer by verification token', error);
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
 * Generate JWT token for customer
 */
export function generateToken(customer: Customer): string {
    const payload: CustomerJwtPayload = {
        customerId: customer.id,
        email: customer.email
    };
    
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

/**
 * Verify JWT token for customer
 */
export function verifyToken(token: string): CustomerJwtPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as CustomerJwtPayload;
    } catch (error) {
        logger.debug('Customer token verification failed', error);
        return null;
    }
}

/**
 * Generate verification token
 */
export function generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Update last login timestamp
 */
export async function updateLastLogin(customerId: number): Promise<void> {
    let conn = null;
    try {
        conn = await getConnection();
        await conn.query(
            'UPDATE customers SET last_login = NOW() WHERE id = ?',
            [customerId]
        );
    } catch (error) {
        logger.error('Error updating last login', error);
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Convert Customer to public representation (without password)
 */
export function toPublicCustomer(customer: Customer): CustomerPublic {
    return {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        loyalty_points: customer.loyalty_points,
        email_verified: customer.email_verified
    };
}

/**
 * Register a new customer
 */
export async function register(data: CustomerRegisterRequest): Promise<ApiResponse<CustomerLoginResponse>> {
    try {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            return { success: false, message: 'Ungültige E-Mail-Adresse' };
        }

        // Validate password strength
        if (!data.password || data.password.length < 8) {
            return { success: false, message: 'Passwort muss mindestens 8 Zeichen haben' };
        }

        // Validate name
        if (!data.name || data.name.trim().length < 2) {
            return { success: false, message: 'Name muss mindestens 2 Zeichen haben' };
        }

        // Check if email already exists
        const existingCustomer = await findCustomerByEmail(data.email);
        if (existingCustomer) {
            logger.warn(`Registration failed: Email already exists - ${data.email}`);
            return { success: false, message: 'E-Mail-Adresse ist bereits registriert' };
        }

        // Hash password
        const passwordHash = await hashPassword(data.password);

        // Generate verification token
        const verificationToken = generateVerificationToken();

        // Create customer
        let conn = null;
        try {
            conn = await getConnection();
            const result = await conn.query(
                `INSERT INTO customers (email, password_hash, name, phone, verification_token, email_verified) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [data.email, passwordHash, data.name.trim(), data.phone || null, verificationToken, false]
            );

            const customerId = Number((result as { insertId: number }).insertId);

            // Create default preferences
            await conn.query(
                `INSERT INTO customer_preferences (customer_id) VALUES (?)`,
                [customerId]
            );

            // Get the created customer
            const customer = await findCustomerById(customerId);
            if (!customer) {
                throw new Error('Failed to retrieve created customer');
            }

            // Generate token
            const token = generateToken(customer);

            // Update last login
            await updateLastLogin(customerId);

            logger.info(`Customer registered successfully: ${data.email} (ID: ${customerId})`);

            try {
                const { awardWelcomeBonus } = await import('./loyalty.service');
                await awardWelcomeBonus(customerId);
            } catch (loyaltyErr) {
                logger.error('Welcome bonus award failed (registration succeeded)', loyaltyErr);
            }

            try {
                const { sendCustomerVerificationEmail } = await import('./email.service');
                await sendCustomerVerificationEmail(data.email, data.name.trim(), verificationToken);
            } catch (emailErr) {
                logger.error('Verification email failed (registration succeeded)', emailErr);
            }

            return {
                success: true,
                data: {
                    token,
                    customer: toPublicCustomer(customer)
                }
            };
        } finally {
            if (conn) conn.release();
        }
    } catch (error) {
        logger.error('Registration error', error);
        return {
            success: false,
            message: 'Ein Fehler ist beim Registrieren aufgetreten'
        };
    }
}

/**
 * Login customer
 */
export async function login(email: string, password: string): Promise<ApiResponse<CustomerLoginResponse>> {
    try {
        // Find customer
        const customer = await findCustomerByEmail(email);
        if (!customer) {
            logger.warn(`Login attempt failed: Customer not found - ${email}`);
            return {
                success: false,
                message: 'Ungültige E-Mail oder Passwort'
            };
        }
        
        // Verify password
        const isValid = await verifyPassword(password, customer.password_hash);
        if (!isValid) {
            logger.warn(`Login attempt failed: Invalid password - ${email}`);
            return {
                success: false,
                message: 'Ungültige E-Mail oder Passwort'
            };
        }
        
        // Generate token
        const token = generateToken(customer);
        
        // Update last login
        await updateLastLogin(customer.id);
        
        logger.info(`Customer logged in successfully: ${email}`);
        
        return {
            success: true,
            data: {
                token,
                customer: toPublicCustomer(customer)
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

/**
 * Verify email with token
 */
export async function verifyEmail(token: string): Promise<ApiResponse<{ message: string }>> {
    try {
        const customer = await findCustomerByVerificationToken(token);
        if (!customer) {
            return { success: false, message: 'Ungültiger oder abgelaufener Verifizierungslink' };
        }

        if (customer.email_verified) {
            return { success: false, message: 'E-Mail ist bereits verifiziert' };
        }

        let conn = null;
        try {
            conn = await getConnection();
            await conn.query(
                'UPDATE customers SET email_verified = TRUE, verification_token = NULL WHERE id = ?',
                [customer.id]
            );
        } finally {
            if (conn) conn.release();
        }

        logger.info(`Email verified successfully for customer: ${customer.email}`);

        // Award bonus points for email verification
        const { awardPointsForEmailVerification } = await import('./loyalty.service');
        const pointsResult = await awardPointsForEmailVerification(customer.id);
        const pointsAwarded = pointsResult.success ? pointsResult.data?.points : undefined;

        if (pointsResult.success) {
            logger.info(`Awarded ${pointsAwarded} loyalty points for email verification: customer ${customer.id}`);
        }

        // Send welcome email
        const { sendWelcomeEmail } = await import('./email.service');
        const emailSent = await sendWelcomeEmail(customer.email, customer.name, pointsAwarded);
        
        if (!emailSent) {
            logger.warn(`Failed to send welcome email to ${customer.email}`);
        }

        return { success: true, data: { message: 'E-Mail erfolgreich verifiziert' } };
    } catch (error) {
        logger.error('Email verification error', error);
        return { success: false, message: 'Fehler bei der E-Mail-Verifizierung' };
    }
}

/**
 * Request password reset.
 * Only verified accounts receive a reset link (no info leak: same response either way).
 */
export async function requestPasswordReset(email: string): Promise<ApiResponse<{ message: string }>> {
    try {
        const customer = await findCustomerByEmail(email);
        if (!customer) {
            return { 
                success: true, 
                data: { message: 'Falls die E-Mail-Adresse registriert ist, wurde ein Passwort-Reset-Link gesendet' } 
            };
        }

        if (!customer.email_verified) {
            // Only verified accounts can reset password; same response as "not found" to avoid info leak
            return { 
                success: true, 
                data: { message: 'Falls die E-Mail-Adresse registriert ist, wurde ein Passwort-Reset-Link gesendet' } 
            };
        }

        const resetToken = generateVerificationToken();

        let conn = null;
        try {
            conn = await getConnection();
            await conn.query(
                'UPDATE customers SET verification_token = ? WHERE id = ?',
                [resetToken, customer.id]
            );
        } finally {
            if (conn) conn.release();
        }

        logger.info(`Password reset requested for customer: ${email}`);

        try {
            const { sendCustomerPasswordResetEmail } = await import('./email.service');
            await sendCustomerPasswordResetEmail(email, customer.name, resetToken);
        } catch (emailErr) {
            logger.error('Password reset email failed', emailErr);
        }

        return { 
            success: true, 
            data: { message: 'Falls die E-Mail-Adresse registriert ist, wurde ein Passwort-Reset-Link gesendet' } 
        };
    } catch (error) {
        logger.error('Password reset request error', error);
        return { success: false, message: 'Fehler beim Anfordern des Passwort-Resets' };
    }
}

/**
 * Reset password with token
 */
export async function resetPassword(token: string, newPassword: string): Promise<ApiResponse<{ message: string }>> {
    try {
        if (!newPassword || newPassword.length < 8) {
            return { success: false, message: 'Passwort muss mindestens 8 Zeichen haben' };
        }

        const customer = await findCustomerByVerificationToken(token);
        if (!customer) {
            return { success: false, message: 'Ungültiger oder abgelaufener Reset-Link' };
        }

        const newHash = await hashPassword(newPassword);

        let conn = null;
        try {
            conn = await getConnection();
            await conn.query(
                'UPDATE customers SET password_hash = ?, verification_token = NULL WHERE id = ?',
                [newHash, customer.id]
            );
        } finally {
            if (conn) conn.release();
        }

        logger.info(`Password reset successfully for customer: ${customer.email}`);
        return { success: true, data: { message: 'Passwort erfolgreich zurückgesetzt' } };
    } catch (error) {
        logger.error('Password reset error', error);
        return { success: false, message: 'Fehler beim Zurücksetzen des Passworts' };
    }
}

/**
 * Change password for authenticated customer
 */
export async function changePassword(
    customerId: number,
    currentPassword: string,
    newPassword: string
): Promise<ApiResponse<{ message: string }>> {
    try {
        const customer = await findCustomerById(customerId);
        if (!customer) {
            return { success: false, message: 'Kunde nicht gefunden' };
        }

        const isValid = await verifyPassword(currentPassword, customer.password_hash);
        if (!isValid) {
            logger.warn(`Password change failed: Invalid current password - customerId ${customerId}`);
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
                'UPDATE customers SET password_hash = ? WHERE id = ?',
                [newHash, customerId]
            );
        } finally {
            if (conn) conn.release();
        }

        logger.info(`Password changed successfully for customerId ${customerId}`);
        return { success: true, data: { message: 'Passwort erfolgreich geändert' } };
    } catch (error) {
        logger.error('Error changing password', error);
        return { success: false, message: 'Fehler beim Ändern des Passworts' };
    }
}

/**
 * Link all past bookings with matching customer_email to the customer account.
 * Called automatically on registration so all prior guest bookings (same email) appear in the account.
 */
export async function linkAllBookingsByEmail(customerId: number, email: string): Promise<{ linked: number }> {
    let conn = null;
    try {
        conn = await getConnection();
        const result = await conn.query(
            'UPDATE bookings SET customer_id = ? WHERE customer_email = ? AND (customer_id IS NULL OR customer_id = ?)',
            [customerId, email, customerId]
        );
        const linked = typeof result.affectedRows === 'number' ? result.affectedRows : 0;
        if (linked > 0) {
            logger.info(`Linked ${linked} booking(s) to customer ${customerId} by email ${email}`);
        }
        return { linked };
    } catch (error) {
        logger.error('Error linking bookings by email', error);
        return { linked: 0 };
    } finally {
        if (conn) conn.release();
    }
}
