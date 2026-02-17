import { getConnection } from '../config/database';
import { createLogger } from '../config/utils/logger';
import { CustomerFavorite, ApiResponse, Venue } from '../config/utils/types';

const logger = createLogger('favorites.service');

/**
 * Get all favorites for a customer
 */
export async function getCustomerFavorites(customerId: number): Promise<ApiResponse<(CustomerFavorite & { venue: Venue })[]>> {
    let conn = null;
    try {
        conn = await getConnection();

        const rows = await conn.query(`
            SELECT 
                cf.id,
                cf.customer_id,
                cf.venue_id,
                cf.created_at,
                v.id as v_id,
                v.name as v_name,
                v.type as v_type,
                v.email as v_email,
                v.phone as v_phone,
                v.address as v_address,
                v.city as v_city,
                v.postal_code as v_postal_code,
                v.country as v_country,
                v.description as v_description,
                v.image_url as v_image_url,
                v.website_url as v_website_url,
                v.booking_advance_days as v_booking_advance_days,
                v.booking_advance_hours as v_booking_advance_hours,
                v.cancellation_hours as v_cancellation_hours,
                v.require_phone as v_require_phone,
                v.require_deposit as v_require_deposit,
                v.deposit_amount as v_deposit_amount,
                v.is_active as v_is_active,
                v.created_at as v_created_at,
                v.updated_at as v_updated_at
            FROM customer_favorites cf
            INNER JOIN venues v ON cf.venue_id = v.id
            WHERE cf.customer_id = ? AND v.is_active = TRUE
            ORDER BY cf.created_at DESC
        `, [customerId]);

        const favorites = rows.map((row: any) => ({
            id: row.id,
            customer_id: row.customer_id,
            venue_id: row.venue_id,
            created_at: row.created_at,
            venue: {
                id: row.v_id,
                name: row.v_name,
                type: row.v_type,
                email: row.v_email,
                phone: row.v_phone,
                address: row.v_address,
                city: row.v_city,
                postal_code: row.v_postal_code,
                country: row.v_country,
                description: row.v_description,
                image_url: row.v_image_url,
                website_url: row.v_website_url,
                is_active: row.v_is_active,
                booking_advance_days: row.v_booking_advance_days,
                booking_advance_hours: row.v_booking_advance_hours,
                cancellation_hours: row.v_cancellation_hours,
                require_phone: row.v_require_phone,
                require_deposit: row.v_require_deposit,
                deposit_amount: row.v_deposit_amount,
                created_at: row.v_created_at,
                updated_at: row.v_updated_at
            }
        }));

        return {
            success: true,
            data: favorites
        };
    } catch (error) {
        logger.error('Error getting customer favorites', error);
        return { success: false, message: 'Fehler beim Laden der Favoriten' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Check if a venue is favorited by customer
 */
export async function isFavorite(customerId: number, venueId: number): Promise<boolean> {
    let conn = null;
    try {
        conn = await getConnection();

        const rows = await conn.query(
            'SELECT id FROM customer_favorites WHERE customer_id = ? AND venue_id = ?',
            [customerId, venueId]
        );

        return rows.length > 0;
    } catch (error) {
        logger.error('Error checking if favorite', error);
        return false;
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Add venue to favorites
 */
export async function addFavorite(customerId: number, venueId: number): Promise<ApiResponse<CustomerFavorite>> {
    let conn = null;
    try {
        conn = await getConnection();

        // Check if venue exists and is active
        const venues = await conn.query(
            'SELECT id FROM venues WHERE id = ? AND is_active = TRUE',
            [venueId]
        );

        if (venues.length === 0) {
            return { success: false, message: 'Venue nicht gefunden oder nicht aktiv' };
        }

        // Check if already favorited
        const existing = await conn.query(
            'SELECT id FROM customer_favorites WHERE customer_id = ? AND venue_id = ?',
            [customerId, venueId]
        );

        if (existing.length > 0) {
            return { success: false, message: 'Venue ist bereits in Ihren Favoriten' };
        }

        // Add favorite
        const result = await conn.query(
            'INSERT INTO customer_favorites (customer_id, venue_id) VALUES (?, ?)',
            [customerId, venueId]
        );

        const newFavorite = await conn.query(
            'SELECT * FROM customer_favorites WHERE id = ?',
            [result.insertId]
        );

        logger.info(`Favorite added: customerId ${customerId}, venueId ${venueId}`);

        return {
            success: true,
            data: newFavorite[0] as CustomerFavorite
        };
    } catch (error: any) {
        logger.error('Error adding favorite', error);
        
        // Handle duplicate key error
        if (error.code === 'ER_DUP_ENTRY') {
            return { success: false, message: 'Venue ist bereits in Ihren Favoriten' };
        }

        return { success: false, message: 'Fehler beim Hinzufügen zu Favoriten' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Remove venue from favorites
 */
export async function removeFavorite(customerId: number, venueId: number): Promise<ApiResponse<{ message: string }>> {
    let conn = null;
    try {
        conn = await getConnection();

        const result = await conn.query(
            'DELETE FROM customer_favorites WHERE customer_id = ? AND venue_id = ?',
            [customerId, venueId]
        );

        if (result.affectedRows === 0) {
            return { success: false, message: 'Favorit nicht gefunden' };
        }

        logger.info(`Favorite removed: customerId ${customerId}, venueId ${venueId}`);

        return {
            success: true,
            data: { message: 'Favorit erfolgreich entfernt' }
        };
    } catch (error) {
        logger.error('Error removing favorite', error);
        return { success: false, message: 'Fehler beim Entfernen des Favorits' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Get favorite count for a venue
 */
export async function getFavoriteCount(venueId: number): Promise<number> {
    let conn = null;
    try {
        conn = await getConnection();

        const rows = await conn.query(
            'SELECT COUNT(*) as count FROM customer_favorites WHERE venue_id = ?',
            [venueId]
        );

        return rows[0]?.count || 0;
    } catch (error) {
        logger.error('Error getting favorite count', error);
        return 0;
    } finally {
        if (conn) conn.release();
    }
}
