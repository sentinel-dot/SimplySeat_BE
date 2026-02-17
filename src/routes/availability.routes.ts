import express, { Request, Response } from 'express';
import { AvailabilityService } from '../services/availability.service';
import { createLogger } from '../config/utils/logger';
import { ApiResponse, DayAvailability, Service } from '../config/utils/types';


const router = express.Router();
const logger = createLogger('availability.routes');





/**
 * GET /availability/slots
 * Hole alle verfügbaren Zeitslots für einen bestimmten Tag.
 * Query: venueId, serviceId, date (YYYY-MM-DD), optional partySize, timeWindowStart, timeWindowEnd (HH:MM).
 */
router.get('/slots', async (req, res) =>     
{
    const { venueId, serviceId, date, partySize, timeWindowStart, timeWindowEnd, excludeBookingId } = req.query;  

    if (!venueId || !serviceId || !date)
    {
        logger.warn('Missing one or more required parameters: venueId, serviceId, date');
        return res.status(400).json({
            success: false,
            message: 'Missing one or more required parameters: venueId, serviceId, date'
        } as ApiResponse<void>);
    }

    const partySizeNum = partySize != null && partySize !== '' ? parseInt(String(partySize), 10) : undefined;
    const excludeBookingIdNum = excludeBookingId != null && excludeBookingId !== '' ? parseInt(String(excludeBookingId), 10) : undefined;
    const opts: { partySize?: number; timeWindowStart?: string; timeWindowEnd?: string; excludeBookingId?: number } = {};
    if (partySizeNum != null && !isNaN(partySizeNum) && partySizeNum >= 1) opts.partySize = partySizeNum;
    if (timeWindowStart && timeWindowEnd) {
        opts.timeWindowStart = timeWindowStart as string;
        opts.timeWindowEnd = timeWindowEnd as string;
    }
    if (excludeBookingIdNum != null && !isNaN(excludeBookingIdNum)) opts.excludeBookingId = excludeBookingIdNum;
    const options = Object.keys(opts).length > 0 ? opts : undefined;

    try {

        const dayAvailability = await AvailabilityService.getAvailableSlots(
            Number(venueId),
            Number(serviceId),
            date as string,
            options
        );

        res.json({
            success: true,
            message: 'Available slots retrieved successfully',
            data: dayAvailability
        } as ApiResponse<DayAvailability>);
    } 
    catch (error) 
    {
        logger.error('Error fetching slots', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available slots',
            error: process.env.NODE_ENV === 'development' ? String(error) : undefined
        } as ApiResponse<void>);
    }
});

/**
 * GET /availability/week
 * Hole Verfügbarkeit für eine komplette Woche
 * Query params: venueId, serviceId, startDate(YYYY-MM-DD)
 */
router.get('/week', async (req, res) => 
{
    const { venueId, serviceId, startDate } = req.query;  

    if (!venueId || !serviceId || !startDate)
    {
        logger.warn('Missing one or more required params: venueId, serviceId, startDate');
        return res.status(400).json({
            success: false,
            message: 'Missing one or more required params: venueId, serviceId, startDate'
        } as ApiResponse<void>);
    }

    try 
    {
        const weekAvailability = await AvailabilityService.getWeekAvailability(
            Number(venueId),
            Number(serviceId), 
            startDate as string
        );

        res.json({
            success: true,
            message: 'Week availability retrieved successfully',
            data: weekAvailability
        } as ApiResponse<DayAvailability[]>);
    } 
    catch (error) 
    {
        logger.error('Error fetching week availability', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch week availability',
            error: process.env.NODE_ENV === 'development' ? String(error) : undefined
        } as ApiResponse<void>);      
    }
});

/**
 * POST /availability/check
 * Prüfe ob ein spezifischer Zeitslot verfügbar ist
 * Body: { venueId, serviceId, staffMemberId?, date, startTime, endTime, partySize, excludeBookingId? }
 */
router.post('/check', async (req, res) => 
{
    const {
        venueId,
        serviceId,
        staffMemberId, 
        date,
        startTime,
        endTime,
        partySize,
        excludeBookingId
    } = req.body;


    // Validierung
    if (!venueId || !serviceId || !date || !startTime || !endTime)
    {
        logger.warn('Missing one or more required fields');
        return res.status(400).json({
            success: false,
            message: 'Missing one or more required fields'
        } as ApiResponse<void>);
    }

    try 
    {
        const result = await AvailabilityService.isTimeSlotAvailable(
            Number(venueId),
            Number(serviceId),
            staffMemberId ? Number(staffMemberId) : null,
            date,
            startTime,
            endTime,
            partySize || 1,
            excludeBookingId ? Number(excludeBookingId) : undefined
        );
        
        res.json({
            success: true,
            message: result.available ? 'Time slot is available' : 'Time slot is not available',
            data: result
        } as ApiResponse<{ available: boolean; reason?: string}>);
    } 
    catch (error) 
    {
        logger.error('Error checking slot availability', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check slot availability',
            error: process.env.NODE_ENV === 'development' ? String(error) : undefined
        } as ApiResponse<void>);
    }
});

/**
 * POST /availability/validate
 * Validiere eine komplette Buchugsanfrage
 * Body: { 
 *   venueId, 
 *   serviceId, 
 *   staffMemberId?, 
 *   bookingDate, 
 *   startTime, 
 *   endTime, 
 *   partySize,
 *   excludeBookingId?
 * }
 */
router.post('/validate', async (req, res) => 
{
    const {
        venueId, 
        serviceId,
        staffMemberId,
        bookingDate,
        startTime,
        endTime,
        partySize,
        excludeBookingId
    } = req.body;


    if     (
        venueId == null ||           // Prüft null UND undefined
        serviceId == null || 
        bookingDate == null || 
        startTime == null || 
        endTime == null || 
        partySize == null            // ← Erlaubt jetzt 0!
    )
    {
        logger.warn('Missing one or more required fields', { partySize });
        return res.status(400).json({
            success: false,
            message: 'Missing one or more required fields: venueId, serviceId, bookingDate, startTime, endTime, partySize'
        } as ApiResponse<void>);
    }

    try 
    {
        const validation = await AvailabilityService.validateBookingRequest(
            Number(venueId),
            Number(serviceId),
            staffMemberId ? Number(staffMemberId) : null,
            bookingDate,
            startTime,
            endTime,
            Number(partySize),
            excludeBookingId ? Number(excludeBookingId) : undefined
        );

        if (validation.valid)
        {
            res.json({
                success: true,
                message: 'Booking request is valid',
                data: validation
            } as ApiResponse<{ valid: boolean; errors?: string[] }>);
        }
        else
        {
            res.status(400).json({
                success: false,
                message: 'Booking request validation failed',
                data: validation
            } as ApiResponse<{ valid: boolean; errors?: string[] }>);
        }
    } 
    catch (error) 
    {
        logger.error('Error validating booking request', error);
        res.status(500).json({
            success: false, 
            message: 'Failed to validate booking',
            error: process.env.NODE_ENV === 'development' ? String(error) : undefined
        } as ApiResponse<void>);
    }
});

/**
 * GET /availability/service/:serviceId
 * Hole Service-Details
 * Query params: venueId
 */
router.get('/service/:serviceId', async (req: Request<{ serviceId: string }>, res) => 
{
    const { serviceId } = req.params;
    const { venueId } = req.query;    

    if (!venueId)
    {
        logger.warn('Missing required param: venueId');
        return res.status(400).json({
            success: false,
            message: 'Missing required param: venueId'
        } as ApiResponse<void>);
    }

    try 
    {
        const service = await AvailabilityService.getServiceDetails(
            Number(serviceId),
            Number(venueId)
        );

        if (!service)
        {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            } as ApiResponse<void>);
        }

        res.json({
            success: true,
            message: 'Service details retrieved successfully',
            data: service
        } as ApiResponse<Service>);
    } 
    catch (error) 
    {
        logger.error('Error fetching service details', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch service details',
            error: process.env.NODE_ENV === 'development' ? String(error) : undefined
        } as ApiResponse<void>);
    }
});

/**
 * GET /availability/staff/:staffId/can-perform/:serviceId
 * Prüfe ob Mitarbeiter einen Service durchführen kann
 */
router.get('/staff/:staffId/can-perform/:serviceId', async (req, res) => 
{
    try 
    {
        const { staffId, serviceId } = req.params;

        const canPerform = await AvailabilityService.canStaffPerformService(
            Number(staffId),
            Number(serviceId)
        );

        res.json({
            success: true,
            message: canPerform
                ? 'Staff member can perform this service'
                : 'Staff member cannot perform this service',
            data: { canPerform }
        } as ApiResponse<{ canPerform: boolean }>);
    } 
    catch (error) 
    {
        logger.error('Error checking staff service availability', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check staff capability',
            error: process.env.NODE_ENV === 'development' ? String(error) : undefined
        } as ApiResponse<void>);
    }
});

export default router;