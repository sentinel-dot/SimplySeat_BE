import { getConnection } from '../config/database';
import { createLogger } from '../config/utils/logger';
import { 
    Customer,
    CustomerPublic,
    CustomerPreferences,
    ApiResponse 
} from '../config/utils/types';
import { findCustomerById, toPublicCustomer } from './customer-auth.service';

const logger = createLogger('customer.service');

/**
 * Get customer profile
 */
export async function getCustomerProfile(customerId: number): Promise<ApiResponse<CustomerPublic>> {
    try {
        const customer = await findCustomerById(customerId);
        if (!customer) {
            return { success: false, message: 'Kunde nicht gefunden' };
        }

        return {
            success: true,
            data: toPublicCustomer(customer)
        };
    } catch (error) {
        logger.error('Error getting customer profile', error);
        return { success: false, message: 'Fehler beim Laden des Profils' };
    }
}

/**
 * Update customer profile
 */
export async function updateCustomerProfile(
    customerId: number,
    updates: { name?: string; phone?: string }
): Promise<ApiResponse<CustomerPublic>> {
    let conn = null;
    try {
        // Validate input
        if (updates.name !== undefined && updates.name.trim().length < 2) {
            return { success: false, message: 'Name muss mindestens 2 Zeichen haben' };
        }

        conn = await getConnection();

        const fields: string[] = [];
        const values: any[] = [];

        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name.trim());
        }

        if (updates.phone !== undefined) {
            fields.push('phone = ?');
            values.push(updates.phone || null);
        }

        if (fields.length === 0) {
            return { success: false, message: 'Keine Änderungen angegeben' };
        }

        values.push(customerId);

        await conn.query(
            `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`,
            values
        );

        const updatedCustomer = await findCustomerById(customerId);
        if (!updatedCustomer) {
            throw new Error('Failed to retrieve updated customer');
        }

        logger.info(`Customer profile updated: ${customerId}`);

        return {
            success: true,
            data: toPublicCustomer(updatedCustomer)
        };
    } catch (error) {
        logger.error('Error updating customer profile', error);
        return { success: false, message: 'Fehler beim Aktualisieren des Profils' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Get customer preferences
 */
export async function getCustomerPreferences(customerId: number): Promise<ApiResponse<CustomerPreferences>> {
    let conn = null;
    try {
        conn = await getConnection();

        const rows = await conn.query(
            'SELECT * FROM customer_preferences WHERE customer_id = ?',
            [customerId]
        );

        if (rows.length === 0) {
            // Create default preferences if they don't exist
            await conn.query(
                'INSERT INTO customer_preferences (customer_id) VALUES (?)',
                [customerId]
            );

            const newRows = await conn.query(
                'SELECT * FROM customer_preferences WHERE customer_id = ?',
                [customerId]
            );

            return {
                success: true,
                data: newRows[0] as CustomerPreferences
            };
        }

        return {
            success: true,
            data: rows[0] as CustomerPreferences
        };
    } catch (error) {
        logger.error('Error getting customer preferences', error);
        return { success: false, message: 'Fehler beim Laden der Einstellungen' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Update customer preferences
 */
export async function updateCustomerPreferences(
    customerId: number,
    updates: Partial<Omit<CustomerPreferences, 'customer_id' | 'created_at' | 'updated_at'>>
): Promise<ApiResponse<CustomerPreferences>> {
    let conn = null;
    try {
        if (updates.default_party_size !== undefined) {
            const n = updates.default_party_size;
            if (n < 1 || n > 8) {
                return { success: false, message: 'Standard-Gästeanzahl muss zwischen 1 und 8 liegen.' };
            }
        }

        conn = await getConnection();

        // Ensure preferences exist
        const existing = await conn.query(
            'SELECT * FROM customer_preferences WHERE customer_id = ?',
            [customerId]
        );

        if (existing.length === 0) {
            await conn.query(
                'INSERT INTO customer_preferences (customer_id) VALUES (?)',
                [customerId]
            );
        }

        const fields: string[] = [];
        const values: any[] = [];

        if (updates.default_party_size !== undefined) {
            fields.push('default_party_size = ?');
            values.push(updates.default_party_size);
        }

        if (updates.preferred_time_slot !== undefined) {
            fields.push('preferred_time_slot = ?');
            values.push(updates.preferred_time_slot);
        }

        if (updates.notification_email !== undefined) {
            fields.push('notification_email = ?');
            values.push(updates.notification_email);
        }

        if (updates.notification_sms !== undefined) {
            fields.push('notification_sms = ?');
            values.push(updates.notification_sms);
        }

        if (updates.language !== undefined) {
            fields.push('language = ?');
            values.push(updates.language);
        }

        if (fields.length > 0) {
            values.push(customerId);

            await conn.query(
                `UPDATE customer_preferences SET ${fields.join(', ')} WHERE customer_id = ?`,
                values
            );
        }

        const updatedRows = await conn.query(
            'SELECT * FROM customer_preferences WHERE customer_id = ?',
            [customerId]
        );

        logger.info(`Customer preferences updated: ${customerId}`);

        return {
            success: true,
            data: updatedRows[0] as CustomerPreferences
        };
    } catch (error) {
        logger.error('Error updating customer preferences', error);
        return { success: false, message: 'Fehler beim Aktualisieren der Einstellungen' };
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Delete customer account
 */
export async function deleteCustomerAccount(customerId: number): Promise<ApiResponse<{ message: string }>> {
    let conn = null;
    try {
        conn = await getConnection();

        // Soft delete - mark as inactive
        await conn.query(
            'UPDATE customers SET is_active = FALSE WHERE id = ?',
            [customerId]
        );

        logger.info(`Customer account deleted (soft): ${customerId}`);

        return {
            success: true,
            data: { message: 'Ihr Konto wurde erfolgreich gelöscht' }
        };
    } catch (error) {
        logger.error('Error deleting customer account', error);
        return { success: false, message: 'Fehler beim Löschen des Kontos' };
    } finally {
        if (conn) conn.release();
    }
}
