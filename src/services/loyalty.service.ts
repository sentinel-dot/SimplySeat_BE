import { getConnection } from '../config/database';
import { createLogger } from '../config/utils/logger';
import { LoyaltyTransaction, LoyaltyTransactionType, ApiResponse } from '../config/utils/types';

const logger = createLogger('loyalty.service');

export type PointsConfig = {
    BOOKING_COMPLETED: number;
    BOOKING_WITH_REVIEW: number;
    WELCOME_BONUS: number;
    EMAIL_VERIFIED_BONUS: number;
    POINTS_PER_EURO: number;
};

const DEFAULT_POINTS_CONFIG: PointsConfig = {
    BOOKING_COMPLETED: 10,
    BOOKING_WITH_REVIEW: 5,
    WELCOME_BONUS: 50,
    EMAIL_VERIFIED_BONUS: 25,
    POINTS_PER_EURO: 1,
};

let POINTS_CONFIG: PointsConfig = { ...DEFAULT_POINTS_CONFIG };
let configLoaded = false;

/** Load points config from DB into in-memory cache (idempotent). */
async function loadPointsConfigFromDb(): Promise<void> {
    if (configLoaded) return;
    let conn = null;
    try {
        conn = await getConnection();
        const rows = await conn.query('SELECT * FROM loyalty_config WHERE id = 1');
        if (rows.length > 0) {
            const r = rows[0];
            const num = (val: unknown, def: number): number => {
                const n = Number(val);
                return Number.isFinite(n) ? n : def;
            };
            POINTS_CONFIG = {
                BOOKING_COMPLETED: num(r.booking_completed, DEFAULT_POINTS_CONFIG.BOOKING_COMPLETED),
                BOOKING_WITH_REVIEW: num(r.booking_with_review, DEFAULT_POINTS_CONFIG.BOOKING_WITH_REVIEW),
                WELCOME_BONUS: num(r.welcome_bonus, DEFAULT_POINTS_CONFIG.WELCOME_BONUS),
                EMAIL_VERIFIED_BONUS: num(r.email_verified_bonus, DEFAULT_POINTS_CONFIG.EMAIL_VERIFIED_BONUS),
                POINTS_PER_EURO: num(r.points_per_euro, DEFAULT_POINTS_CONFIG.POINTS_PER_EURO),
            };
        }
        configLoaded = true;
    } catch (err) {
        logger.warn('Could not load loyalty_config from DB, using defaults', err);
        POINTS_CONFIG = { ...DEFAULT_POINTS_CONFIG };
        configLoaded = true;
    } finally {
        if (conn) conn.release();
    }
}

/** Ensure config is loaded (from DB or defaults); call before reading POINTS_CONFIG. */
async function ensureConfigLoaded(): Promise<void> {
    await loadPointsConfigFromDb();
}

/**
 * Get customer's current loyalty points balance
 */
export async function getLoyaltyBalance(customerId: number): Promise<ApiResponse<{ points: number }>> {
    let conn = null;
    try {
        conn = await getConnection();

        const rows = await conn.query(
            'SELECT loyalty_points FROM customers WHERE id = ?',
            [customerId]
        );

        if (rows.length === 0) {
            return { success: false, message: 'Kunde nicht gefunden' };
        }

        return {
            success: true,
            data: { points: Number(rows[0].loyalty_points) || 0 }
        };
    } catch (error) {
        logger.error('Error getting loyalty balance', error);
        return { success: false, message: 'Fehler beim Laden des Punktestands' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Get customer's loyalty transaction history
 */
export async function getLoyaltyTransactions(
    customerId: number,
    limit: number = 50
): Promise<ApiResponse<LoyaltyTransaction[]>> {
    let conn = null;
    try {
        conn = await getConnection();

        const rows = await conn.query(`
            SELECT *
            FROM loyalty_transactions
            WHERE customer_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `, [customerId, limit]);

        // Coerce BigInt to number so JSON serialization works (MySQL may return BigInt for id columns)
        const data = rows.map((row: Record<string, unknown>) =>
            Object.fromEntries(
                Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])
            )
        ) as LoyaltyTransaction[];

        return {
            success: true,
            data
        };
    } catch (error) {
        logger.error('Error getting loyalty transactions', error);
        return { success: false, message: 'Fehler beim Laden der Transaktionshistorie' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Add loyalty points to customer account
 */
async function addPoints(
    conn: any,
    customerId: number,
    points: number,
    type: LoyaltyTransactionType,
    description: string,
    bookingId?: number
): Promise<void> {
    // Update customer's total points
    await conn.query(
        'UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?',
        [points, customerId]
    );

    // Record the transaction
    await conn.query(`
        INSERT INTO loyalty_transactions (customer_id, booking_id, points, type, description)
        VALUES (?, ?, ?, ?, ?)
    `, [customerId, bookingId || null, points, type, description]);

    logger.info(`Loyalty points added: customerId ${customerId}, points ${points}, type ${type}`);
}

/**
 * Deduct loyalty points from customer account
 */
async function deductPoints(
    conn: any,
    customerId: number,
    points: number,
    type: LoyaltyTransactionType,
    description: string
): Promise<void> {
    // Check if customer has enough points
    const rows = await conn.query(
        'SELECT loyalty_points FROM customers WHERE id = ?',
        [customerId]
    );

    if (rows.length === 0 || rows[0].loyalty_points < points) {
        throw new Error('Nicht genügend Punkte verfügbar');
    }

    // Update customer's total points (deduct)
    await conn.query(
        'UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id = ?',
        [points, customerId]
    );

    // Record the transaction (negative points)
    await conn.query(`
        INSERT INTO loyalty_transactions (customer_id, points, type, description)
        VALUES (?, ?, ?, ?)
    `, [customerId, -points, type, description]);

    logger.info(`Loyalty points deducted: customerId ${customerId}, points ${points}, type ${type}`);
}

/**
 * Award points for a completed booking
 * Called automatically when booking status changes to 'completed'
 */
export async function awardPointsForBooking(
    customerId: number,
    bookingId: number,
    totalAmount?: number
): Promise<ApiResponse<{ points: number }>> {
    let conn = null;
    try {
        await ensureConfigLoaded();
        conn = await getConnection();

        // Check if points already awarded for this booking
        const existing = await conn.query(
            'SELECT id FROM loyalty_transactions WHERE customer_id = ? AND booking_id = ? AND type = ?',
            [customerId, bookingId, 'earned']
        );

        if (existing.length > 0) {
            return { success: false, message: 'Punkte wurden bereits für diese Buchung vergeben' };
        }

        // Calculate points
        let points = POINTS_CONFIG.BOOKING_COMPLETED;
        
        // Add points based on amount spent
        if (totalAmount) {
            points += Math.floor(totalAmount * POINTS_CONFIG.POINTS_PER_EURO);
        }

        await addPoints(
            conn,
            customerId,
            points,
            'earned',
            `Punkte für abgeschlossene Buchung #${bookingId}`,
            bookingId
        );

        return {
            success: true,
            data: { points }
        };
    } catch (error) {
        logger.error('Error awarding points for booking', error);
        return { success: false, message: 'Fehler beim Vergeben der Punkte' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Award bonus points for leaving a review
 */
export async function awardPointsForReview(
    customerId: number,
    bookingId: number
): Promise<ApiResponse<{ points: number }>> {
    let conn = null;
    try {
        await ensureConfigLoaded();
        conn = await getConnection();

        // Check if bonus already awarded for this booking
        const existing = await conn.query(
            'SELECT id FROM loyalty_transactions WHERE customer_id = ? AND booking_id = ? AND type = ? AND description LIKE ?',
            [customerId, bookingId, 'bonus', '%Bewertung%']
        );

        if (existing.length > 0) {
            return { success: false, message: 'Bonus wurde bereits für diese Bewertung vergeben' };
        }

        const points = POINTS_CONFIG.BOOKING_WITH_REVIEW;

        await addPoints(
            conn,
            customerId,
            points,
            'bonus',
            `Bonus für Bewertung zu Buchung #${bookingId}`,
            bookingId
        );

        return {
            success: true,
            data: { points }
        };
    } catch (error) {
        logger.error('Error awarding points for review', error);
        return { success: false, message: 'Fehler beim Vergeben der Bonus-Punkte' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Award welcome bonus to new customer
 */
export async function awardWelcomeBonus(customerId: number): Promise<ApiResponse<{ points: number }>> {
    let conn = null;
    try {
        await ensureConfigLoaded();
        conn = await getConnection();

        // Check if welcome bonus already awarded
        const existing = await conn.query(
            'SELECT id FROM loyalty_transactions WHERE customer_id = ? AND type = ? AND description LIKE ?',
            [customerId, 'bonus', '%Willkommen%']
        );

        if (existing.length > 0) {
            return { success: false, message: 'Willkommensbonus wurde bereits vergeben' };
        }

        const points = POINTS_CONFIG.WELCOME_BONUS;

        await addPoints(
            conn,
            customerId,
            points,
            'bonus',
            'Willkommensbonus für Neukunden'
        );

        return {
            success: true,
            data: { points }
        };
    } catch (error) {
        logger.error('Error awarding welcome bonus', error);
        return { success: false, message: 'Fehler beim Vergeben des Willkommensbonus' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Redeem loyalty points
 * This is a placeholder for future implementation of a rewards catalog
 */
export async function redeemPoints(
    customerId: number,
    points: number,
    rewardDescription: string
): Promise<ApiResponse<{ message: string }>> {
    let conn = null;
    try {
        conn = await getConnection();

        await deductPoints(
            conn,
            customerId,
            points,
            'redeemed',
            rewardDescription
        );

        return {
            success: true,
            data: { message: `${points} Punkte erfolgreich eingelöst` }
        };
    } catch (error: any) {
        logger.error('Error redeeming points', error);
        return { 
            success: false, 
            message: error.message || 'Fehler beim Einlösen der Punkte' 
        };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Get loyalty statistics for a customer
 */
export async function getLoyaltyStats(customerId: number): Promise<ApiResponse<{
    totalPoints: number;
    totalEarned: number;
    totalRedeemed: number;
    completedBookings: number;
    reviewsWritten: number;
}>> {
    let conn = null;
    try {
        conn = await getConnection();

        // Get current balance
        const balanceRows = await conn.query(
            'SELECT loyalty_points FROM customers WHERE id = ?',
            [customerId]
        );

        // Coerce to Number so JSON serialization works (MySQL may return BigInt for SUM/COUNT)
        const totalPoints = Number(balanceRows[0]?.loyalty_points) || 0;

        // Get total earned
        const earnedRows = await conn.query(`
            SELECT COALESCE(SUM(points), 0) as total
            FROM loyalty_transactions
            WHERE customer_id = ? AND type IN ('earned', 'bonus')
        `, [customerId]);

        const totalEarned = Number(earnedRows[0]?.total) || 0;

        // Get total redeemed
        const redeemedRows = await conn.query(`
            SELECT COALESCE(SUM(ABS(points)), 0) as total
            FROM loyalty_transactions
            WHERE customer_id = ? AND type = 'redeemed'
        `, [customerId]);

        const totalRedeemed = Number(redeemedRows[0]?.total) || 0;

        // Get completed bookings count
        const bookingsRows = await conn.query(
            'SELECT COUNT(*) as count FROM bookings WHERE customer_id = ? AND status = ?',
            [customerId, 'completed']
        );

        const completedBookings = Number(bookingsRows[0]?.count) || 0;

        // Get reviews count
        const reviewsRows = await conn.query(
            'SELECT COUNT(*) as count FROM reviews WHERE customer_id = ?',
            [customerId]
        );

        const reviewsWritten = Number(reviewsRows[0]?.count) || 0;

        return {
            success: true,
            data: {
                totalPoints,
                totalEarned,
                totalRedeemed,
                completedBookings,
                reviewsWritten
            }
        };
    } catch (error) {
        logger.error('Error getting loyalty stats', error);
        return { success: false, message: 'Fehler beim Laden der Statistiken' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Export points configuration (for frontend display). Loads from DB on first call.
 */
export async function getPointsConfig(): Promise<PointsConfig> {
    await ensureConfigLoaded();
    return { ...POINTS_CONFIG };
}

/**
 * Update points configuration (Admin only). Persists to DB.
 */
export async function updatePointsConfig(updates: Partial<PointsConfig>): Promise<ApiResponse<PointsConfig>> {
    let conn = null;
    try {
        await ensureConfigLoaded();
        if (updates.BOOKING_COMPLETED !== undefined) {
            POINTS_CONFIG.BOOKING_COMPLETED = Math.max(0, updates.BOOKING_COMPLETED);
        }
        if (updates.BOOKING_WITH_REVIEW !== undefined) {
            POINTS_CONFIG.BOOKING_WITH_REVIEW = Math.max(0, updates.BOOKING_WITH_REVIEW);
        }
        if (updates.WELCOME_BONUS !== undefined) {
            POINTS_CONFIG.WELCOME_BONUS = Math.max(0, updates.WELCOME_BONUS);
        }
        if (updates.EMAIL_VERIFIED_BONUS !== undefined) {
            POINTS_CONFIG.EMAIL_VERIFIED_BONUS = Math.max(0, updates.EMAIL_VERIFIED_BONUS);
        }
        if (updates.POINTS_PER_EURO !== undefined) {
            POINTS_CONFIG.POINTS_PER_EURO = Math.max(0, updates.POINTS_PER_EURO);
        }

        conn = await getConnection();
        await conn.query(
            `INSERT INTO loyalty_config (id, booking_completed, booking_with_review, welcome_bonus, email_verified_bonus, points_per_euro)
             VALUES (1, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               booking_completed = VALUES(booking_completed),
               booking_with_review = VALUES(booking_with_review),
               welcome_bonus = VALUES(welcome_bonus),
               email_verified_bonus = VALUES(email_verified_bonus),
               points_per_euro = VALUES(points_per_euro)`,
            [
                POINTS_CONFIG.BOOKING_COMPLETED,
                POINTS_CONFIG.BOOKING_WITH_REVIEW,
                POINTS_CONFIG.WELCOME_BONUS,
                POINTS_CONFIG.EMAIL_VERIFIED_BONUS,
                POINTS_CONFIG.POINTS_PER_EURO,
            ]
        );

        logger.info('Points configuration updated', POINTS_CONFIG);

        return {
            success: true,
            data: { ...POINTS_CONFIG }
        };
    } catch (error) {
        logger.error('Error updating points configuration', error);
        return { success: false, message: 'Fehler beim Aktualisieren der Konfiguration' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Award bonus points for email verification
 * Called after customer verifies their email
 */
export async function awardPointsForEmailVerification(customerId: number): Promise<ApiResponse<{ points: number }>> {
    let conn = null;
    try {
        await ensureConfigLoaded();
        conn = await getConnection();

        // Check if points already awarded for email verification
        const existing = await conn.query(
            'SELECT id FROM loyalty_transactions WHERE customer_id = ? AND type = ? AND description LIKE ?',
            [customerId, 'earned', '%E-Mail-Verifizierung%']
        );

        if (existing.length > 0) {
            return { success: false, message: 'Punkte für E-Mail-Verifizierung wurden bereits vergeben' };
        }

        const points = POINTS_CONFIG.EMAIL_VERIFIED_BONUS;

        await addPoints(
            conn,
            customerId,
            points,
            'earned',
            'Bonus für E-Mail-Verifizierung'
        );

        logger.info(`Email verification bonus awarded: customerId ${customerId}, points ${points}`);

        return {
            success: true,
            data: { points }
        };
    } catch (error) {
        logger.error('Error awarding points for email verification', error);
        return { success: false, message: 'Fehler beim Vergeben der Punkte' };
    } finally {
        if (conn) conn.release();
    }
}
