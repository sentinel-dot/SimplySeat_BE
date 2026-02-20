import { Router, Request, Response } from 'express';
import { authenticateAndLoadUser, requireSystemAdmin } from '../middleware/auth.middleware';
import { AdminService } from '../services/admin.service';
import { createLogger } from '../config/utils/logger';
import { parsePositiveId } from '../config/utils/helper';
import { sendError } from '../config/utils/response';
import { sanitizeForJson } from '../config/utils/helper';
import { getPointsConfig, updatePointsConfig } from '../services/loyalty.service';

const router = Router();
const logger = createLogger('admin.routes');

router.use(authenticateAndLoadUser);
router.use(requireSystemAdmin);

router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await AdminService.getGlobalStats();
        res.json({ success: true, data: sanitizeForJson(stats) });
    } catch (error) {
        logger.error('Error fetching admin stats', error);
        sendError(res, 500, 'Fehler beim Laden der Statistiken', error);
    }
});

router.get('/venues', async (req: Request, res: Response) => {
    try {
        const venues = await AdminService.listVenues();
        res.json({ success: true, data: sanitizeForJson(venues) });
    } catch (error) {
        logger.error('Error listing venues', error);
        sendError(res, 500, 'Fehler beim Laden der Venues', error);
    }
});

router.get('/venues/:id', async (req: Request, res: Response) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
        res.status(400).json({ success: false, message: 'Ungültige Venue-ID' });
        return;
    }
    try {
        const venue = await AdminService.getVenue(id);
        if (!venue) {
            res.status(404).json({ success: false, message: 'Venue nicht gefunden' });
            return;
        }
        res.json({ success: true, data: sanitizeForJson(venue) });
    } catch (error) {
        logger.error('Error fetching venue', error);
        sendError(res, 500, 'Fehler beim Laden der Venue', error);
    }
});

router.post('/venues/full', async (req: Request, res: Response) => {
    const body = req.body as Parameters<typeof AdminService.createVenueFull>[0];
    if (!body?.venue || !body?.owner) {
        res.status(400).json({ success: false, message: 'venue und owner sind erforderlich' });
        return;
    }
    try {
        const result = await AdminService.createVenueFull(body);
        res.status(201).json({ success: true, data: sanitizeForJson(result), message: 'Venue inkl. Owner, Staff, Services und Öffnungszeiten erstellt' });
    } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes('erforderlich') || msg.includes('E-Mail wird bereits') || msg.includes('Passwort') || msg.includes('Mitarbeiter') || msg.includes('Service')) {
            res.status(400).json({ success: false, message: msg });
        } else {
            logger.error('Error creating venue full', error);
            sendError(res, 500, msg || 'Fehler beim Erstellen der Venue', error);
        }
    }
});

router.post('/venues', async (req: Request, res: Response) => {
    const { name, type, email, phone, address, city, postal_code, country, description, website_url, booking_advance_days, booking_advance_hours, cancellation_hours, require_phone, require_deposit, deposit_amount, is_active } = req.body;
    if (!name || !type || !email) {
        res.status(400).json({ success: false, message: 'Name, Typ und E-Mail sind erforderlich' });
        return;
    }
    const validTypes = ['restaurant', 'hair_salon', 'beauty_salon', 'cafe', 'bar', 'spa', 'other'];
    if (!validTypes.includes(type)) {
        res.status(400).json({ success: false, message: 'Ungültiger Venue-Typ' });
        return;
    }
    try {
        const venue = await AdminService.createVenue({
            name, type, email, phone, address, city, postal_code, country, description, website_url,
            booking_advance_days, booking_advance_hours, cancellation_hours, require_phone, require_deposit, deposit_amount, is_active,
        });
        res.status(201).json({ success: true, data: sanitizeForJson(venue), message: 'Venue erstellt' });
    } catch (error) {
        logger.error('Error creating venue', error);
        sendError(res, 500, (error as Error).message || 'Fehler beim Erstellen der Venue', error);
    }
});

router.patch('/venues/:id', async (req: Request, res: Response) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
        res.status(400).json({ success: false, message: 'Ungültige Venue-ID' });
        return;
    }
    const body = req.body;
    if (body.type !== undefined) {
        const validTypes = ['restaurant', 'hair_salon', 'beauty_salon', 'cafe', 'bar', 'spa', 'other'];
        if (!validTypes.includes(body.type)) {
            res.status(400).json({ success: false, message: 'Ungültiger Venue-Typ' });
            return;
        }
    }
    try {
        const venue = await AdminService.updateVenue(id, body);
        res.json({ success: true, data: sanitizeForJson(venue), message: 'Venue aktualisiert' });
    } catch (error) {
        if ((error as Error).message === 'Venue not found') res.status(404).json({ success: false, message: 'Venue nicht gefunden' });
        else sendError(res, 500, (error as Error).message || 'Fehler beim Aktualisieren', error);
    }
});

router.get('/users', async (req: Request, res: Response) => {
    try {
        const admins = await AdminService.listAdmins();
        res.json({ success: true, data: admins });
    } catch (error) {
        logger.error('Error listing admins', error);
        sendError(res, 500, 'Fehler beim Laden der Admins', error);
    }
});

router.post('/users', async (req: Request, res: Response) => {
    const { email, password, name, venue_id, role } = req.body;
    if (!email || !password || !name) {
        res.status(400).json({ success: false, message: 'E-Mail, Passwort und Name sind erforderlich' });
        return;
    }
    const allowedRoles = ['owner', 'staff'] as const;
    const roleToUse = role && allowedRoles.includes(role) ? role : 'owner';
    try {
        const admin = await AdminService.createAdmin({
            email, password, name, venue_id: venue_id ?? null, role: roleToUse,
        });
        res.status(201).json({ success: true, data: admin, message: 'Benutzer erstellt' });
    } catch (error) {
        const msg = (error as Error).message;
        if (msg === 'E-Mail wird bereits verwendet' || msg.includes('Passwort')) res.status(400).json({ success: false, message: msg });
        else sendError(res, 500, msg || 'Fehler beim Erstellen', error);
    }
});

router.patch('/users/:id', async (req: Request, res: Response) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
        res.status(400).json({ success: false, message: 'Ungültige Admin-ID' });
        return;
    }
    const { venue_id, role, is_active, name, email } = req.body;
    const allowedRoles = ['owner', 'staff'] as const;
    const updates: { venue_id?: number | null; role?: 'owner' | 'staff'; is_active?: boolean; name?: string; email?: string } = {};
    if (venue_id !== undefined) updates.venue_id = venue_id === null || venue_id === '' ? null : parseInt(String(venue_id), 10);
    if (role !== undefined && allowedRoles.includes(role)) updates.role = role;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);
    if (name !== undefined) updates.name = String(name).trim() || undefined;
    if (email !== undefined) updates.email = String(email).trim() || undefined;
    if (Object.keys(updates).length === 0) {
        res.status(400).json({ success: false, message: 'Keine gültigen Felder zum Aktualisieren' });
        return;
    }
    try {
        const admin = await AdminService.updateAdmin(id, updates);
        res.json({ success: true, data: admin, message: 'Benutzer aktualisiert' });
    } catch (error) {
        if ((error as Error).message === 'Admin nicht gefunden') res.status(404).json({ success: false, message: 'Admin nicht gefunden' });
        else sendError(res, 500, (error as Error).message || 'Fehler beim Aktualisieren', error);
    }
});

router.patch('/users/:id/password', async (req: Request, res: Response) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
        res.status(400).json({ success: false, message: 'Ungültige Admin-ID' });
        return;
    }
    const { newPassword } = req.body;
    if (!newPassword) {
        res.status(400).json({ success: false, message: 'newPassword ist erforderlich' });
        return;
    }
    if (String(newPassword).length < 8) {
        res.status(400).json({ success: false, message: 'Passwort muss mindestens 8 Zeichen haben' });
        return;
    }
    try {
        await AdminService.setAdminPassword(id, newPassword);
        res.json({ success: true, message: 'Passwort geändert' });
    } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes('Passwort') || msg === 'Admin nicht gefunden') res.status(400).json({ success: false, message: msg });
        else sendError(res, 500, 'Fehler beim Setzen des Passworts', error);
    }
});

// ==================== Customer Management ====================

router.get('/customers', async (req: Request, res: Response) => {
    try {
        const search = req.query.search as string | undefined;
        const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const result = await AdminService.listCustomers({ search, active, limit, offset });
        res.json({ success: true, data: result.customers, total: result.total });
    } catch (error) {
        logger.error('Error listing customers', error);
        sendError(res, 500, 'Fehler beim Laden der Kunden', error);
    }
});

router.get('/customers/:id', async (req: Request, res: Response) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
        res.status(400).json({ success: false, message: 'Ungültige Kunden-ID' });
        return;
    }
    try {
        const customer = await AdminService.getCustomer(id);
        if (!customer) {
            res.status(404).json({ success: false, message: 'Kunde nicht gefunden' });
            return;
        }
        res.json({ success: true, data: customer });
    } catch (error) {
        logger.error('Error fetching customer', error);
        sendError(res, 500, 'Fehler beim Laden des Kunden', error);
    }
});

router.patch('/customers/:id', async (req: Request, res: Response) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
        res.status(400).json({ success: false, message: 'Ungültige Kunden-ID' });
        return;
    }

    const { name, phone, email_verified, is_active } = req.body;
    const updates: any = {};

    if (name !== undefined) updates.name = String(name).trim();
    if (phone !== undefined) updates.phone = phone ? String(phone).trim() : null;
    if (email_verified !== undefined) updates.email_verified = Boolean(email_verified);
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    if (Object.keys(updates).length === 0) {
        res.status(400).json({ success: false, message: 'Keine gültigen Felder zum Aktualisieren' });
        return;
    }

    try {
        const customer = await AdminService.updateCustomer(id, updates);
        res.json({ success: true, data: customer, message: 'Kunde aktualisiert' });
    } catch (error) {
        if ((error as Error).message === 'Kunde nicht gefunden') {
            res.status(404).json({ success: false, message: 'Kunde nicht gefunden' });
        } else {
            sendError(res, 500, (error as Error).message || 'Fehler beim Aktualisieren', error);
        }
    }
});

router.patch('/customers/:id/password', async (req: Request, res: Response) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
        res.status(400).json({ success: false, message: 'Ungültige Kunden-ID' });
        return;
    }

    const { newPassword } = req.body;
    if (!newPassword) {
        res.status(400).json({ success: false, message: 'newPassword ist erforderlich' });
        return;
    }
    if (String(newPassword).length < 8) {
        res.status(400).json({ success: false, message: 'Passwort muss mindestens 8 Zeichen haben' });
        return;
    }

    try {
        await AdminService.setCustomerPassword(id, newPassword);
        res.json({ success: true, message: 'Kundenpasswort geändert' });
    } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes('Passwort') || msg === 'Kunde nicht gefunden') {
            res.status(400).json({ success: false, message: msg });
        } else {
            sendError(res, 500, 'Fehler beim Setzen des Passworts', error);
        }
    }
});

router.post('/customers/:id/loyalty-points', async (req: Request, res: Response) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
        res.status(400).json({ success: false, message: 'Ungültige Kunden-ID' });
        return;
    }

    const { pointsChange, reason } = req.body;

    if (pointsChange === undefined || !Number.isInteger(pointsChange)) {
        res.status(400).json({ success: false, message: 'pointsChange muss eine Ganzzahl sein' });
        return;
    }

    if (!reason || String(reason).trim().length === 0) {
        res.status(400).json({ success: false, message: 'reason ist erforderlich' });
        return;
    }

    try {
        const result = await AdminService.adjustCustomerLoyaltyPoints(id, pointsChange, reason);
        res.json({ 
            success: true, 
            data: result, 
            message: `Bonuspunkte ${pointsChange > 0 ? 'hinzugefügt' : 'abgezogen'}` 
        });
    } catch (error) {
        const msg = (error as Error).message;
        if (msg === 'Kunde nicht gefunden' || msg.includes('negativ')) {
            res.status(400).json({ success: false, message: msg });
        } else {
            sendError(res, 500, 'Fehler beim Anpassen der Bonuspunkte', error);
        }
    }
});

// ==================== Loyalty Configuration ====================

router.get('/loyalty/config', async (req: Request, res: Response) => {
    try {
        const config = await getPointsConfig();
        res.json({ success: true, data: config });
    } catch (error) {
        logger.error('Error getting loyalty config', error);
        sendError(res, 500, 'Fehler beim Laden der Konfiguration', error);
    }
});

router.patch('/loyalty/config', async (req: Request, res: Response) => {
    try {
        const { BOOKING_COMPLETED, BOOKING_WITH_REVIEW, WELCOME_BONUS, EMAIL_VERIFIED_BONUS, POINTS_PER_EURO } = req.body;
        const updates: Record<string, number> = {};

        if (BOOKING_COMPLETED !== undefined) updates.BOOKING_COMPLETED = parseInt(BOOKING_COMPLETED);
        if (BOOKING_WITH_REVIEW !== undefined) updates.BOOKING_WITH_REVIEW = parseInt(BOOKING_WITH_REVIEW);
        if (WELCOME_BONUS !== undefined) updates.WELCOME_BONUS = parseInt(WELCOME_BONUS);
        if (EMAIL_VERIFIED_BONUS !== undefined) updates.EMAIL_VERIFIED_BONUS = parseInt(EMAIL_VERIFIED_BONUS);
        if (POINTS_PER_EURO !== undefined) updates.POINTS_PER_EURO = parseFloat(POINTS_PER_EURO);

        if (Object.keys(updates).length === 0) {
            res.status(400).json({ success: false, message: 'Keine gültigen Felder zum Aktualisieren' });
            return;
        }

        const result = await updatePointsConfig(updates);
        
        if (result.success) {
            res.json({ success: true, data: result.data, message: 'Bonuspunkte-Konfiguration aktualisiert' });
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        logger.error('Error updating loyalty config', error);
        sendError(res, 500, 'Fehler beim Aktualisieren der Konfiguration', error);
    }
});

export default router;
