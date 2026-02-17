import { getConnection } from '../config/database';
import { createLogger } from '../config/utils/logger';
import { Review, CreateReviewRequest, ApiResponse } from '../config/utils/types';

const logger = createLogger('reviews.service');

/**
 * Get all reviews for a venue
 */
export async function getVenueReviews(venueId: number): Promise<ApiResponse<(Review & { customer_name: string })[]>> {
    let conn = null;
    try {
        conn = await getConnection();

        const rows = await conn.query(`
            SELECT 
                r.*,
                c.name as customer_name
            FROM reviews r
            INNER JOIN customers c ON r.customer_id = c.id
            WHERE r.venue_id = ?
            ORDER BY r.created_at DESC
        `, [venueId]);

        return {
            success: true,
            data: rows as (Review & { customer_name: string })[]
        };
    } catch (error) {
        logger.error('Error getting venue reviews', error);
        return { success: false, message: 'Fehler beim Laden der Bewertungen' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Get reviews by customer
 */
export async function getCustomerReviews(customerId: number): Promise<ApiResponse<(Review & { venue_name: string })[]>> {
    let conn = null;
    try {
        conn = await getConnection();

        const rows = await conn.query(`
            SELECT 
                r.*,
                v.name as venue_name
            FROM reviews r
            INNER JOIN venues v ON r.venue_id = v.id
            WHERE r.customer_id = ?
            ORDER BY r.created_at DESC
        `, [customerId]);

        return {
            success: true,
            data: rows as (Review & { venue_name: string })[]
        };
    } catch (error) {
        logger.error('Error getting customer reviews', error);
        return { success: false, message: 'Fehler beim Laden Ihrer Bewertungen' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Get average rating for a venue
 */
export async function getVenueAverageRating(venueId: number): Promise<{ average: number; count: number }> {
    let conn = null;
    try {
        conn = await getConnection();

        const [row] = await conn.query(`
            SELECT 
                AVG(rating) as average,
                COUNT(*) as count
            FROM reviews
            WHERE venue_id = ?
        `, [venueId]) as Array<{ average: number | string | null; count: bigint | number }>;

        const avg = row?.average != null ? Number(row.average) : 0;
        const count = row?.count != null ? Number(row.count) : 0;

        return {
            average: Number.isFinite(avg) ? avg : 0,
            count: Number(Math.max(0, Math.floor(count)))
        };
    } catch (error) {
        logger.error('Error getting venue average rating', error);
        return { average: 0, count: 0 };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Create a new review
 * Requires that the customer has a completed booking for this venue
 */
export async function createReview(
    customerId: number,
    reviewData: CreateReviewRequest
): Promise<ApiResponse<Review>> {
    let conn = null;
    try {
        // Validate rating
        if (reviewData.rating < 1 || reviewData.rating > 5) {
            return { success: false, message: 'Bewertung muss zwischen 1 und 5 liegen' };
        }

        conn = await getConnection();

        // Verify the booking exists and belongs to the customer
        const bookings = await conn.query(`
            SELECT id, venue_id, status
            FROM bookings
            WHERE id = ? AND customer_id = ?
        `, [reviewData.booking_id, customerId]);

        if (bookings.length === 0) {
            return { success: false, message: 'Buchung nicht gefunden oder gehört nicht zu Ihrem Konto' };
        }

        const booking = bookings[0];

        // Verify the venue matches
        if (booking.venue_id !== reviewData.venue_id) {
            return { success: false, message: 'Buchung gehört nicht zu dieser Venue' };
        }

        // Verify booking is completed
        if (booking.status !== 'completed') {
            return { success: false, message: 'Sie können nur abgeschlossene Buchungen bewerten' };
        }

        // Check if review already exists for this booking
        const existingReviews = await conn.query(
            'SELECT id FROM reviews WHERE customer_id = ? AND booking_id = ?',
            [customerId, reviewData.booking_id]
        );

        if (existingReviews.length > 0) {
            return { success: false, message: 'Sie haben diese Buchung bereits bewertet' };
        }

        // Create the review
        const result = await conn.query(`
            INSERT INTO reviews (customer_id, venue_id, booking_id, rating, comment, is_verified)
            VALUES (?, ?, ?, ?, ?, TRUE)
        `, [
            customerId,
            reviewData.venue_id,
            reviewData.booking_id,
            reviewData.rating,
            reviewData.comment || null
        ]);

        const newReview = await conn.query(
            'SELECT * FROM reviews WHERE id = ?',
            [result.insertId]
        );

        logger.info(`Review created: customerId ${customerId}, venueId ${reviewData.venue_id}, bookingId ${reviewData.booking_id}`);

        return {
            success: true,
            data: newReview[0] as Review
        };
    } catch (error: any) {
        logger.error('Error creating review', error);

        // Handle duplicate key error
        if (error.code === 'ER_DUP_ENTRY') {
            return { success: false, message: 'Sie haben diese Buchung bereits bewertet' };
        }

        return { success: false, message: 'Fehler beim Erstellen der Bewertung' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Update a review
 * Only the customer who created the review can update it
 */
export async function updateReview(
    customerId: number,
    reviewId: number,
    updates: { rating?: number; comment?: string }
): Promise<ApiResponse<Review>> {
    let conn = null;
    try {
        // Validate rating if provided
        if (updates.rating !== undefined && (updates.rating < 1 || updates.rating > 5)) {
            return { success: false, message: 'Bewertung muss zwischen 1 und 5 liegen' };
        }

        conn = await getConnection();

        // Verify the review exists and belongs to the customer
        const reviews = await conn.query(
            'SELECT id FROM reviews WHERE id = ? AND customer_id = ?',
            [reviewId, customerId]
        );

        if (reviews.length === 0) {
            return { success: false, message: 'Bewertung nicht gefunden oder gehört nicht zu Ihrem Konto' };
        }

        const fields: string[] = [];
        const values: any[] = [];

        if (updates.rating !== undefined) {
            fields.push('rating = ?');
            values.push(updates.rating);
        }

        if (updates.comment !== undefined) {
            fields.push('comment = ?');
            values.push(updates.comment || null);
        }

        if (fields.length === 0) {
            return { success: false, message: 'Keine Änderungen angegeben' };
        }

        values.push(reviewId);

        await conn.query(
            `UPDATE reviews SET ${fields.join(', ')} WHERE id = ?`,
            values
        );

        const updatedReview = await conn.query(
            'SELECT * FROM reviews WHERE id = ?',
            [reviewId]
        );

        logger.info(`Review updated: reviewId ${reviewId}, customerId ${customerId}`);

        return {
            success: true,
            data: updatedReview[0] as Review
        };
    } catch (error) {
        logger.error('Error updating review', error);
        return { success: false, message: 'Fehler beim Aktualisieren der Bewertung' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Delete a review
 * Only the customer who created the review can delete it
 */
export async function deleteReview(customerId: number, reviewId: number): Promise<ApiResponse<{ message: string }>> {
    let conn = null;
    try {
        conn = await getConnection();

        const result = await conn.query(
            'DELETE FROM reviews WHERE id = ? AND customer_id = ?',
            [reviewId, customerId]
        );

        if (result.affectedRows === 0) {
            return { success: false, message: 'Bewertung nicht gefunden oder gehört nicht zu Ihrem Konto' };
        }

        logger.info(`Review deleted: reviewId ${reviewId}, customerId ${customerId}`);

        return {
            success: true,
            data: { message: 'Bewertung erfolgreich gelöscht' }
        };
    } catch (error) {
        logger.error('Error deleting review', error);
        return { success: false, message: 'Fehler beim Löschen der Bewertung' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Check if customer can review a venue
 * Customer must have at least one completed booking
 */
export async function canCustomerReviewVenue(customerId: number, venueId: number): Promise<{
    canReview: boolean;
    completedBookingId?: number;
    reason?: string;
}> {
    let conn = null;
    try {
        conn = await getConnection();

        // Find completed bookings for this customer and venue
        const bookings = await conn.query(`
            SELECT id
            FROM bookings
            WHERE customer_id = ? AND venue_id = ? AND status = 'completed'
            ORDER BY booking_date DESC
            LIMIT 1
        `, [customerId, venueId]);

        if (bookings.length === 0) {
            return {
                canReview: false,
                reason: 'Sie müssen zuerst eine Buchung bei dieser Venue abschließen'
            };
        }

        const bookingId = bookings[0].id;

        // Check if already reviewed
        const existingReviews = await conn.query(
            'SELECT id FROM reviews WHERE customer_id = ? AND booking_id = ?',
            [customerId, bookingId]
        );

        if (existingReviews.length > 0) {
            return {
                canReview: false,
                reason: 'Sie haben diese Buchung bereits bewertet'
            };
        }

        return {
            canReview: true,
            completedBookingId: bookingId
        };
    } catch (error) {
        logger.error('Error checking if customer can review', error);
        return {
            canReview: false,
            reason: 'Fehler beim Überprüfen der Bewertungsberechtigung'
        };
    } finally {
        if (conn) conn.release();
    }
}
