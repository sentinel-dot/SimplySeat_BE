// config/utils/helper.ts

/**
 * Recursively convert BigInt values to number so objects can be JSON-serialized.
 * MySQL returns BIGINT/COUNT etc. as BigInt, and JSON.stringify does not support BigInt.
 */
export function sanitizeForJson<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj === 'bigint') {
        return Number(obj) as T;
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => sanitizeForJson(item)) as T;
    }
    if (typeof obj === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = sanitizeForJson(v);
        }
        return out as T;
    }
    return obj;
}

/** Date format YYYY-MM-DD for API (e.g. booking_date, startDate). */
export const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(dateStr: string | undefined): boolean {
    if (!dateStr || typeof dateStr !== 'string') return false;
    return DATE_FORMAT_REGEX.test(dateStr.trim());
}

/** Simple email format check. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(str: string | undefined): boolean {
    if (!str || typeof str !== 'string') return false;
    return EMAIL_REGEX.test(str.trim());
}

/**
 * Parse route param as positive integer ID. Returns null if invalid or <= 0.
 */
export function parsePositiveId(value: string | undefined): number | null {
    if (value == null || value === '') return null;
    const n = parseInt(String(value).trim(), 10);
    if (Number.isNaN(n) || n < 1) return null;
    return n;
}

/**
 * Validiert ob ein String ein gültiges UUID v4 Format hat
 * 
 * @param token - Der zu validierende Token-String
 * @returns true wenn gültig, false wenn ungültig
 * 
 * @example
 * validateBookingToken('a1b2c3d4-5e6f-4a8b-8c0d-e1f2a3b4c5d6') // true (gültiges UUID v4)
 * validateBookingToken('invalid-token') // false
 * validateBookingToken(undefined) // false
 */
export function validateBookingToken(token: string | undefined): boolean 
{
    if (!token) return false;
    
    // UUID v4 Format: 8-4-4-4-12 hexadezimale Zeichen
    // 4. Gruppe muss mit 4 beginnen (Version 4)
    // 5. Gruppe muss mit 8, 9, a oder b beginnen (Variant)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    return uuidRegex.test(token);
}

/**
 * Gibt ein gekürztes Token für sicheres Logging zurück (erste 8 Zeichen + "...").
 *
 * @param token - Der vollständige Token (z. B. booking_token)
 * @returns Gekürztes Token für Log-Ausgaben
 */
export function getTokenPrefix(token: string): string 
{
    return token.substring(0, 8) + '...';
}

/**
 * Round average rating from DB (number or string) to one decimal. Returns null if invalid.
 */
export function roundAverageRating(avg: unknown): number | null {
    if (avg == null) return null;
    if (typeof avg === 'number' && !Number.isNaN(avg)) return Math.round(avg * 10) / 10;
    if (typeof avg === 'string') {
        const n = parseFloat(avg);
        if (!Number.isNaN(n)) return Math.round(n * 10) / 10;
    }
    return null;
}