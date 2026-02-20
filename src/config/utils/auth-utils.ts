import bcrypt from 'bcrypt';
import { createLogger } from './logger';

const logger = createLogger('auth-utils');

/** Known weak/example secrets – forbidden in production */
export const WEAK_JWT_SECRETS = new Set([
    '',
    'change-me',
    'change-me-in-production',
    'secret',
    'jwt-secret',
    'your-256-bit-secret',
]);

/**
 * Assert that JWT secret is strong (min length, not in weak set). In development, skips check.
 * Calls process.exit(1) if invalid in non-development.
 */
export function assertSecureJwtSecret(
    secret: string,
    weakSecrets: Set<string>,
    logMessage: string,
    minLength: number = 32
): void {
    if (process.env.NODE_ENV === 'development') return;
    const s = secret?.trim() ?? '';
    if (!s || s.length < minLength || weakSecrets.has(s)) {
        logger.error(logMessage);
        process.exit(1);
    }
}

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
        return await bcrypt.compare(password, hash);
    } catch (error) {
        logger.error('Error verifying password', error);
        return false;
    }
}
