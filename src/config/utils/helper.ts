// config/utils/helper.ts

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