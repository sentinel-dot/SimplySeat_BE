import type { PoolConnection } from 'mariadb';
import { createLogger } from '../config/utils/logger';
import { getConnection } from '../config/database';

import {
    TimeSlot,
    DayAvailability,
    Service
} from '../config/utils/types';


const logger = createLogger('availability.service');

export class AvailabilityService 
{
    /*
     * Konvertiert Zeitstring (HH:MM) in Minuten seit Mitternacht.
     * Ungültiges Format (z. B. "12", "12:30:00") führt zu NaN – Aufrufer sollten HH:MM validieren.
     */
    static timeStringToMinutes(timeStr: string): number
    {
        if (!timeStr || typeof timeStr !== 'string') return NaN;
        const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return NaN;
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
        return hours * 60 + minutes;
    }

    /*
     * Prüft, ob sich zwei Zeitslots überschneiden.
     * Berücksichtigt Übernacht-Slots (z. B. Bar 23:00–01:00).
     */
    static timeSlotsOverlap(
        slot1Start: string,
        slot1End: string,
        slot2Start: string,
        slot2End: string
    ): boolean
    {
        let s1 = this.timeStringToMinutes(slot1Start);
        let e1 = this.timeStringToMinutes(slot1End);
        let s2 = this.timeStringToMinutes(slot2Start);
        let e2 = this.timeStringToMinutes(slot2End);
        
        // Übernacht-Slots: Ende + 24h wenn Ende <= Start
        if (e1 <= s1) e1 += 24 * 60;
        if (e2 <= s2) e2 += 24 * 60;

        // Standard-Überschneidungsprüfung: Zwei Intervalle überschneiden sich, wenn Start1 < Ende2 UND Start2 < Ende1
        return s1 < e2 && s2 < e1;
    }

    /**
     * Generate time slots between start and end time
     * MVP: bufferAfter (Pufferzeit nach jedem Slot) nicht genutzt; für spätere Erweiterung vorgesehen.
     */
    // Erstellt eine Liste aller theoretisch möglichen Zeitslots im gegebenen Zeitfenster
    static generateTimeSlots(
        startTime: string,          // Format: "HH:MM"
        endTime: string,            // Format: "HH:MM"
        duration: number            // Dauer eines Slots in Minuten
        // bufferAfter: number = 0  // MVP: deaktiviert; später optional Puffer nach Slot
    ): TimeSlot[] 
    {

        // Array zum Sammeln aller generierten Slots
        //           Typ: Array    Wert: leeres Array
        const slots: TimeSlot[] = [];

        // Konvertiert Startzeit/Endzeit in Gesamtminuten seit Mitternacht
        let startTotalMinutes = this.timeStringToMinutes(startTime);      // Bei 14:30 Z.B. ist es dann 840 + 30 = 870
        let endTotalMinutes = this.timeStringToMinutes(endTime);          // Bei 15:30 z.B. ist es dann 900 + 30 = 930

        // Übernacht-Zeiten (z. B. Bar 18:00–02:00): Ende am nächsten Tag → Ende + 24h für die Schleife
        if (endTotalMinutes <= startTotalMinutes) {
            endTotalMinutes += 24 * 60;
        }

        // Berechnet die Gesamtdauer inklusive optionalem Puffer (MVP: nur duration)
        const slotDuration = duration;// + bufferAfter;



        // Loop durch alle möglichen Zeitslots
        for ( let currentMinutes = startTotalMinutes;                       // Startet bei der Anfangszeit (z.B. 14:00 = 840 Minuten)
              currentMinutes + duration <= endTotalMinutes;                 // Prüft, ob ein kompletter Termin noch reinpasst
              currentMinutes += slotDuration )                              // Springt zum nächsten möglichen Slot
        {
            // Beispiel: currentMinutes = 885 (das sind 14:45 Uhr)

            // 1. Slot-STARTZEIT berechnen (immer am selben Tag, Stunde 0–23)
            const slotStartHour = Math.floor(currentMinutes / 60) % 24;
            const slotStartMinute = currentMinutes % 60;

            // 2. Slot-ENDZEIT in Minuten berechnen
            const slotEndMinutes = currentMinutes + duration;

            // 3. Slot-ENDZEIT in Stunden:Minuten (über Mitternacht: 25:00 → 01:00 anzeigen)
            const slotEndHour = Math.floor(slotEndMinutes / 60) % 24;
            const slotEndMinuteRemainder = slotEndMinutes % 60;


            // Formatiert Start/End-Zeit als String mit führenden Nullen (z.B. "09:30")
            const startTimeStr = `${slotStartHour.toString().padStart(2, '0')}:${slotStartMinute.toString().padStart(2, '0')}`;
            const endTimeStr = `${slotEndHour.toString().padStart(2, '0')}:${slotEndMinuteRemainder.toString().padStart(2, '0')}`;


            // Fügt den neuen Slot zum Array hinzu
            slots.push({
                start_time: startTimeStr,
                end_time: endTimeStr,
                available: true                                             // Initial alle Slots als verfügbar markieren
            });
        }

        return slots;
    }

    /**
     * Prüft, ob ein spezifischer Zeitslot für eine Buchung verfügbar ist.
     * @param existingConn - Optional: bestehende Connection (z. B. für Transaktion); wird nicht released.
     */
    static async isTimeSlotAvailable(
        venueId: number,                // ID des Geschäfts
        serviceId: number,              // ID des Services
        staffMemberId: number | null,   // Optional: ID des Mitarbeiters
        date: string,                   // Datum im Format YYYY-MM-DD
        startTime: string,              // Startzeit in HH:MM
        endTime: string,                // Endzeit in HH:MM
        partySize: number = 1,          // Anzahl Personen (Standard: 1)
        excludeBookingId?: number,      // Optional: Buchung die ignoriert werden soll (für Updates)
        existingConn?: PoolConnection   // Optional: für Transaktion (Race-Condition-Vermeidung)
    ): Promise<{ available: boolean; reason?: string }> 
    {
        logger.info('Validating slot availability...',{
            venue_id: venueId,
            service_id: serviceId,
            staff_member_id: staffMemberId,
            date: date,
            start_time: startTime,
            end_time: endTime,
            party_size: partySize,
            exclude_booking_id: excludeBookingId
        });

        const useExistingConn = !!existingConn;
        let conn: PoolConnection | undefined = existingConn;
        try 
        {
            if (!conn) conn = await getConnection();
            logger.debug('Database connection established');

            const services = await conn.query(`
                SELECT duration_minutes, requires_staff, capacity
                FROM services
                WHERE id = ?
                AND venue_id = ?
                AND is_active = true`,
                [serviceId, venueId]
            ) as Pick<Service, 'duration_minutes' | 'requires_staff' | 'capacity'>[];


            // Prüfe, ob Service existiert
            if (services.length === 0)
            {
                logger.warn('Service not found or inactive');

                return {
                    available: false,
                    reason: 'Service not found or inactive'
                };
            }


            // Castet ersten Eintrag zu Service-Typ und nimmt nur die drei Werte
            const service = services[0];

            // Strikt: Bei Staff-Service muss ein Mitarbeiter gewählt sein
            if (service.requires_staff && (staffMemberId == null || staffMemberId === 0))
            {
                logger.warn('Staff member is required for this service');
                return {
                    available: false,
                    reason: 'Staff member is required for this service'
                };
            }

            // Prüfe, ob die Gruppengröße die Kapazität überschreitet
            if (partySize > service.capacity)
            {
                logger.warn(`Party size exceeds capacity (max: ${service.capacity})`);

                return {
                    available: false,
                    reason: `Party size exceeds capacity (max: ${service.capacity})`
                };
            }


            // Konvertiere Datumsstring zu Date-Objekt
            const requestedDate = new Date(date);
            // Ermittle Wochentag (0 = Sonntag, 1 = Montag,...)
            const dayOfWeek = requestedDate.getDay();


            // Prüfe Verfügbarkeitsregeln
            // Wenn Staff benötigt wird, holen wir uns die 
            if (service.requires_staff && staffMemberId)
            {
                const staffRules = await conn.query(`
                    SELECT start_time, end_time
                    FROM availability_rules
                    WHERE staff_member_id = ?
                    AND day_of_week = ?
                    AND is_active = true`,
                    [staffMemberId, dayOfWeek]
                ) as { start_time: string; end_time: string }[];;


                // Prüfe, ob Mitarbeiter an diesem Tag arbeitet
                if (staffRules.length === 0)
                {
                    logger.warn('Staff not available on this day');

                    return {
                        available: false,
                        reason: 'Staff not available on this day'
                    };
                }


                // Prüfe, ob gewünschte Uhrzeit innerhalb der Arbeitszeiten liegt
                const isWithinStaffHours = staffRules.some((rule: any) => {
                    const ruleStart = this.timeStringToMinutes(rule.start_time);
                    let ruleEnd = this.timeStringToMinutes(rule.end_time);
                    if (ruleEnd <= ruleStart) ruleEnd += 24 * 60; // Übernacht-Slot
                    const slotStart = this.timeStringToMinutes(startTime);
                    let slotEnd = this.timeStringToMinutes(endTime);
                    if (slotEnd <= slotStart) slotEnd += 24 * 60; // Übernacht-Slot
                    return slotStart >= ruleStart && slotEnd <= ruleEnd;
                });
                
                // Gebe Fehler zurück, wenn außerhalb Arbeitszeiten
                if (!isWithinStaffHours)
                {
                    logger.warn('Requested time is outside staff working hours');

                    return {
                        available: false,
                        reason: 'Requested time is outside staff working hours'
                    };
                }
            } else {

                // Für Services ohne spezifischen Mitarbeiter: Prüfe Geschäftszeiten
                const venueRules = await conn.query(`
                    SELECT start_time, end_time
                    FROM availability_rules
                    WHERE venue_id = ?
                    AND day_of_week = ?
                    AND is_active = true`,
                    [venueId, dayOfWeek]
                ) as { start_time: string; end_time: string }[];;


                // Prüfe, ob Geschäft an dem Tag offen ist
                if (venueRules.length === 0)
                {
                    logger.warn('Venue closed on this day');

                    return {
                        available: false,
                        reason: 'Venue closed on this day'
                    };
                }


                // Prüfe, ob gewünschte Zeit innerhalb der Öffnungszeiten liegt
                // Übernacht-Regel (z. B. Bar 18:00–02:00): Ende als „nächster Tag“ behandeln
                const isWithinVenueHours = venueRules.some((rule: any) => {
                    const ruleStart = this.timeStringToMinutes(rule.start_time);
                    let ruleEnd = this.timeStringToMinutes(rule.end_time);
                    if (ruleEnd <= ruleStart) ruleEnd += 24 * 60;
                    const slotStart = this.timeStringToMinutes(startTime);
                    let slotEnd = this.timeStringToMinutes(endTime);
                    if (slotEnd <= slotStart) slotEnd += 24 * 60;
                    return slotStart >= ruleStart && slotEnd <= ruleEnd;
                });


                // Gebe Fehler zurück, wenn außerhalb Öffnungszeiten
                if (!isWithinVenueHours)
                {
                    logger.warn('Requested time is outside venue working hours');

                    return {
                        available: false,
                        reason: 'Requested time is outside venue working hours'
                    };
                }
            }


            /*
             * MVP: deaktiviert. Für spätere Erweiterung vorgesehen.
             * Sonderverfügbarkeit (Schließungen, Feiertage, Urlaub) über Tabelle special_availability.
             * Reaktivieren, sobald Tabelle und UI dafür existieren.
             *
             * // Prüfe auf Sonderverfügbarkeit (Schließungen, Feiertage,..)
             * // Findet Ausnahmen für: Geschäft (immer) + Mitarbeiter (falls angegeben)
             * const [specialAvailability] = await conn.query(`
                    SELECT start_time, end_time, is_available, reason
                    FROM special_availability
                    WHERE (
                        venue_id = ? 
                        
                        ${staffMemberId ? 
                            'OR staff_member_id = ?' : ''
                        }
                    )
                    AND date = ?`,
                    staffMemberId ? [venueId, staffMemberId, date] : [venueId, date]
                );


                // Iteriere durch alle Sonderverfügbarkeitsregeln
                for (const special of specialAvailability)
                {
                    // Wenn nicht als verfügbar markiert
                    if (!special.is_available)
                    {
                        //Prüfe, ob partielle Schließung (nur bestimmte Zeiten)
                        if (special.start_time && special.end_time)
                        {
                            // Prüfe, ob Überschneidung mit Schließungszeit
                            if (this.timeSlotsOverlap(startTime, endTime, special.start_time, special.end_time))
                            {
                                return {
                                    available: false,
                                    reason: special.reason || 'Special closure during requested time'
                                };
                            }
                        } 
                        else 
                        {
                            // Ganztägige Schließung
                            return {
                                available: false,
                                reason: special.reason || 'Venue/Staff not available on this date'
                            };
                        }
                    }
                }
            */


            // Erstelle Query zum Prüfen existierender Buchungen
            // Bei Mitarbeiter-Services: Konflikt = alle Buchungen dieses Mitarbeiters an dem Tag (jeder Service),
            // da eine Person nur einen Termin gleichzeitig haben kann.
            let conflictQuery: string;
            let conflictParams: any[];

            if (service.requires_staff && staffMemberId)
            {
                conflictQuery = `
                    SELECT id, start_time, end_time, party_size, status
                    FROM bookings
                    WHERE venue_id = ?
                    AND staff_member_id = ?
                    AND booking_date = ?
                    AND status = 'confirmed'
                `;
                conflictParams = [venueId, staffMemberId, date];
            }
            else
            {
                conflictQuery = `
                    SELECT id, start_time, end_time, party_size, status
                    FROM bookings
                    WHERE venue_id = ?
                    AND service_id = ?
                    AND booking_date = ?
                    AND status = 'confirmed'
                `;
                conflictParams = [venueId, serviceId, date];
            }


            if (excludeBookingId)                                                                           // Bei Updates: Schließt die zu bearbeitende Buchung aus, damit sie nicht als Konflikt erkannt wird         
            {                                                                                               // (z.B. beim Verschieben von 14:00-15:00 auf 14:30-15:30)
                conflictQuery += ' AND id != ?';
                conflictParams.push(excludeBookingId);
            }


            const existingBookings = await conn.query(
                conflictQuery, 
                conflictParams
            ) as { id: number; start_time: string; end_time: string; party_size: number; status: string }[];;

            // Prüfe, ob für den Zeitraum bereits eine Buchung existiert
            // Für kapazitätsbasierte Services: Summiere alle überlappenden Buchungen
            let totalOccupancy = 0;
            
            for (const booking of existingBookings)
            {
                // Prüfe, ob Zeitüberschneidung existiert
                if (this.timeSlotsOverlap(startTime, endTime, booking.start_time, booking.end_time))
                {
                    // Für Mitarbeiter-Services: Slot blockiert wenn Mitarbeiter bereits gebucht
                    if (service.requires_staff)
                    {
                        logger.warn('Time slot already booked');
                        return {
                            available: false,
                            reason: 'Time slot already booked'
                        };
                    }
                    
                    // Für kapazitätsbasierte Services: Summiere Belegung
                    totalOccupancy += booking.party_size;
                }
            }
            
            // Für kapazitätsbasierte Services: Prüfe ob noch genug Kapazität verfügbar
            if (!service.requires_staff && totalOccupancy + partySize > service.capacity)
            {
                logger.warn(`Insufficient capacity (${service.capacity - totalOccupancy}/${service.capacity} remaining, ${partySize} requested)`);
                return {
                    available: false,
                    reason: 'Insufficient capacity for requested party size'
                };
            }

            // Alles ok – Slot verfügbar
            logger.info('Time slot availability check passed');

            return {
                available: true
            };
            
        } 
        catch (error) 
        {
            logger.error('Error checking availability: ', error);
            return {
                available: false,
                reason: 'Error checking availability'
            };
        }
        finally
        {
            if (conn && !useExistingConn) 
            {
                conn.release();
                logger.debug('Database connection released');
            }
        }
    }



    /** 
     * Holt alle verfügbaren Zeitslots für einen Service an einem bestimmten Datum.
     * Optional: partySize (nur Slots mit remaining_capacity >= partySize),
     * timeWindowStart/timeWindowEnd (nur Slots in diesem Zeitfenster),
     * excludeBookingId (für Reschedule – eigene Buchung nicht als "blockiert" zählen),
     * staffMemberId (nur Slots dieses Mitarbeiters, für Schritt „Mitarbeiter wählen“).
     */
    static async getAvailableSlots(
        venueId: number,
        serviceId: number,
        date: string,
        options?: { partySize?: number; timeWindowStart?: string; timeWindowEnd?: string; excludeBookingId?: number; staffMemberId?: number }
    ): Promise<DayAvailability>
    {
        const partySize = options?.partySize ?? 1;
        logger.info('Getting available slots...', {
            venue_id: venueId,
            service_id: serviceId,
            date,
            partySize,
            excludeBookingId: options?.excludeBookingId,
            timeWindow: options?.timeWindowStart && options?.timeWindowEnd
                ? `${options.timeWindowStart}-${options.timeWindowEnd}`
                : undefined
        });

        let conn;
        try
        {
            const requestedDate = new Date(date);
            const dayOfWeek = requestedDate.getDay();

            conn = await getConnection();
            logger.debug('Database connection established');

            // Eigentlich noch mit buffer_after_minutes nach requires_staff, ABER MVP
            const services = await conn.query(`
                SELECT id, duration_minutes, requires_staff, capacity
                FROM services
                WHERE id = ?
                AND venue_id = ?
                AND is_active = true`,
                [serviceId, venueId]
            ) as Service[];

            if (services.length === 0)
            {
                logger.warn('Service not found');
                throw new Error('Service not found');
            }


            const service = services[0]
            //                  Typ: Array   Wert: leeres Array
            let availableSlots: TimeSlot[] = [];

            // Logik für Mitarbeitergebundene Services
            if (service.requires_staff)
            {
                // Hole alle Mitarbeiter, die diesen Service anbieten können (oder nur den gewählten)
                let staffMembers = await conn.query(`
                    SELECT sm.id as staff_id, sm.name as staff_name
                    FROM staff_services ss
                    JOIN staff_members sm 
                    ON ss.staff_member_id = sm.id
                    WHERE ss.service_id = ?
                    AND sm.is_active = true`,
                    [serviceId]
                ) as { staff_id: number; staff_name: string }[];

                if (options?.staffMemberId != null) {
                    staffMembers = staffMembers.filter((s) => s.staff_id === options.staffMemberId);
                }

                // Generiere Slots für jeden verfügbaren Mitarbeiter
                for (const staffMember of staffMembers)
                {
                    const staffId = staffMember.staff_id;

                    // Hole Availability Rules des Mitarbeiters für diesen Tag
                    const staffRules = await conn.query(`
                        SELECT start_time, end_time
                        FROM availability_rules
                        WHERE staff_member_id = ?
                        AND day_of_week = ?
                        AND is_active = true`,
                        [staffId, dayOfWeek]
                    ) as { start_time: string; end_time: string }[];;

                    // Generiere Zeitslots für jede Availability Rule
                    for(const rule of staffRules)
                    {                                                               // So könnte das Array aussehen
                        const staffSlots = this.generateTimeSlots(                  // const staffSlots = [
                            rule.start_time,                                        //   { start_time: '09:00', end_time: '09:30', duration_minutes: 30 },      // <-- slot 1
                            rule.end_time,                                          //   { start_time: '09:30', end_time: '10:00', duration_minutes: 30 },      // <-- slot 2
                            service.duration_minutes                                //   { start_time: '10:00', end_time: '10:30', duration_minutes: 30 }       // <-- slot 3
                            //,service.buffer_after_minutes || 0                    // ];   
                        );

                        // Erstelle einen neuen Array und füge staff_member_id zu jedem Slot hinzu
                        const slotsWithStaff = staffSlots.map(slot => ({            // So würde das Array danach aussehen
                            ...slot, // Kopiert alle Properties von staffSlots      // const slotsWithStaff = [
                            staff_member_id: staffId                                //   { start_time: '09:00', end_time: '09:30', duration_minutes: 30, staff_member_id: 5 }
                        }));                                                        // ];

                        // Füge alle Slots zum Gesamtarray hinzu
                        availableSlots.push(...slotsWithStaff);                     // Ohne das ... würde ich ein Array in ein Array pushen. So wird davor das Array 'entpackt'
                    }
                }
            }
            else 
            {
                // Geschäftslevel-Service (z.B. Restaurant-Tische)
                const venueRules = await conn.query(`
                    SELECT start_time, end_time
                    FROM availability_rules
                    WHERE venue_id = ?
                    AND day_of_week = ?
                    AND is_active = true`,
                    [venueId, dayOfWeek]
                ) as { start_time: string; end_time: string }[];;

                // Generiere Zeitslots für jede Geschäfts-Availability-Rule
                for (const rule of venueRules)
                {
                    const venueSlots = this.generateTimeSlots(
                        rule.start_time,
                        rule.end_time,
                        service.duration_minutes
                        //,service.buffer_after_minutes || 0
                    );

                    // Füge die Slots hinzu
                    availableSlots.push(...venueSlots);
                }
            }

            // Geschlossen = an diesem Tag keine Öffnungszeiten/Regeln (vor Buchungsprüfung)
            const hadOpeningHours = availableSlots.length > 0;

            /*
             * MVP: deaktiviert. Für spätere Erweiterung vorgesehen.
             * Sonderverfügbarkeit (Schließungen, Feiertage) – Slots in Schließzeiten herausfiltern.
             * Reaktivieren, sobald Tabelle special_availability und UI existieren.
             *
             * // Wende Sonderverfügbarkeitsregeln an (Schließungen/Feiertage)
             * // Findet Ausnahmen für: Geschäft (immer) + Mitarbeiter (falls angegeben)
             * const [specialAvailability] = await conn.query(`
                    SELECT start_time, end_time, is_available, reason
                    FROM special_availability
                    WHERE (
                        venue_id = ? 
                        
                        ${service.requires_staff ? 
                            'OR staff_member_id IN (SELECT staff_member_id FROM staff_services WHERE service_id = ?)' : ''
                        }
                    )
                    AND date = ?`,
                    service.requires_staff ? [venueId, serviceId, date] : [venueId, date]
                );

                // Filter Slots während Sonderschließungen heraus
                if (specialAvailability.length > 0)
                {
                    for (const special of specialAvailability)
                    {
                        // Wenn, nicht verfügbar
                        if (!special.is_available)
                        {
                            if (special.start_time && special.end_time)                     // Es gibt Start- und Endzeit -- d.h. Partielle Schließung nur
                            {
                                // Filtere überschneidene Slots bei Partieller Schließung
                                availableSlots = availableSlots.filter(slot =>
                                    !this.timeSlotsOverlap(                                 // falls true kommt (ja, überlappt), soll es inverted werden, sodass der Filter weiß, dass eine Überlappung rausgefiltert wird
                                        slot.start_time,
                                        slot.end_time,
                                        special.start_time,
                                        special.end_time
                                    )
                                );
                            }
                            else
                            {
                                // Ganztägige Schließung -- leert alle Slots
                                availableSlots = [];
                                break;
                            }
                        }
                    }
                }
            */


            // Hole existierende Buchungen
            // Bei Mitarbeiter-Services: alle Buchungen mit Mitarbeiter an dem Tag (jeder Service),
            // damit Slots blockiert werden, wenn der Mitarbeiter schon einen anderen Service hat.
            // excludeBookingId: Für Reschedule – eigene Buchung nicht als "blockiert" zählen
            let existingBookings: { start_time: string; end_time: string; staff_member_id: number | null; party_size: number }[];
            
            if (service.requires_staff) {
                let bookingQuery = `
                    SELECT start_time, end_time, staff_member_id, party_size
                    FROM bookings
                    WHERE venue_id = ?
                    AND booking_date = ?
                    AND staff_member_id IS NOT NULL
                    AND status = 'confirmed'`;
                const bookingParams: (string | number)[] = [venueId, date];
                
                if (options?.staffMemberId != null) {
                    bookingQuery += ' AND staff_member_id = ?';
                    bookingParams.push(options.staffMemberId);
                }
                
                if (options?.excludeBookingId) {
                    bookingQuery += ' AND id != ?';
                    bookingParams.push(options.excludeBookingId);
                }
                
                existingBookings = await conn.query(bookingQuery, bookingParams) as { start_time: string; end_time: string; staff_member_id: number | null; party_size: number }[];
            } else {
                let bookingQuery = `
                    SELECT start_time, end_time, staff_member_id, party_size
                    FROM bookings
                    WHERE venue_id = ?
                    AND service_id = ?
                    AND booking_date = ?
                    AND status = 'confirmed'`;
                const bookingParams: (string | number)[] = [venueId, serviceId, date];
                
                if (options?.excludeBookingId) {
                    bookingQuery += ' AND id != ?';
                    bookingParams.push(options.excludeBookingId);
                }
                
                existingBookings = await conn.query(bookingQuery, bookingParams) as { start_time: string; end_time: string; staff_member_id: number | null; party_size: number }[];
            }

            // Markiere konfliktbehaften Slots als nicht verfügbar
            availableSlots = availableSlots.map(slot => {
                let totalOccupancy = 0;

                // Prüfe jede existierende Buchung
                for (const booking of existingBookings)
                {
                    // Prüfe auf Zeitüberschneidung
                    const conflicts = this.timeSlotsOverlap(
                        slot.start_time,
                        slot.end_time,
                        booking.start_time,
                        booking.end_time
                    );

                    // Kein Konflikt - weiter zum nächsten Buchung
                    if (!conflicts) continue;

                    // Für Mitarbeiter-Services
                    if (service.requires_staff)
                    {
                        // Prüfe, ob die Buchung zum selben Mitarbeiter gehört
                        if (slot.staff_member_id === booking.staff_member_id)
                        {
                            return {
                                ...slot,
                                available: false
                            };
                        }
                    }
                    else
                    {
                        // Kapazitätsbasierte Services (z.B. Restaurant): Summiere auf
                        totalOccupancy += booking.party_size;
                    }
                }        

                // Für kapazitätsbasierte Services: nur verfügbar wenn genug Plätze für partySize
                if (!service.requires_staff)
                {
                    const remainingCapacity = service.capacity - totalOccupancy;
                    const hasEnoughCapacity = remainingCapacity >= partySize;
                    return {
                        ...slot,
                        available: hasEnoughCapacity,
                        remaining_capacity: Math.max(0, remainingCapacity)
                    }
                }

                // Slot bleibt
                return slot;
            });


            // Sortiere Slots nach Zeit
            availableSlots.sort((a, b) => 
                this.timeStringToMinutes(a.start_time) - this.timeStringToMinutes(b.start_time)
            );

            // Entferne doppelte Slots (kann bei mehreren Mitarbeitern vorkommen)
            let uniqueSlots = availableSlots.filter((slot, index, array) =>
                index === array.findIndex(s =>
                    s.start_time === slot.start_time &&         // Entfernt potenzielle Duplikate die durch mehrfache Verfügbarkeitsregeln
                    s.end_time === slot.end_time &&             // desselben Mitarbeiters oder Datenbank-Inkonsistenzen entstehen könnten.
                    s.staff_member_id === slot.staff_member_id  // Defensive Programmierung: In 99% der Fälle ändert dieser Filter nichts.
                )
            );

            // Hole booking_advance_hours für Vorlaufzeit-Filter
            const venueData = await conn.query(`
                SELECT booking_advance_hours
                FROM venues
                WHERE id = ?`,
                [venueId]
            ) as Pick<import('../config/utils/types').Venue, 'booking_advance_hours'>[];

            const bookingAdvanceHours = venueData[0]?.booking_advance_hours || 0;

            // Filter Slots basierend auf Mindestvorlaufzeit (booking_advance_hours)
            const slotsCountBeforeAdvance = uniqueSlots.length;
            const now = new Date();
            uniqueSlots = uniqueSlots.filter(slot => {
                const [hours, minutes] = slot.start_time.split(':').map(Number);
                const slotDateTime = new Date(date);
                slotDateTime.setHours(hours, minutes, 0, 0);
                const hoursUntilSlot = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
                return hoursUntilSlot >= bookingAdvanceHours;
            });
            const withinAdvanceHours = hadOpeningHours && slotsCountBeforeAdvance > 0 && uniqueSlots.length === 0;

            // Optional: nur Slots im Zeitfenster (z.B. 18:00–20:00 für Suche "ca. 19:00")
            if (options?.timeWindowStart && options?.timeWindowEnd) {
                const windowStartMins = this.timeStringToMinutes(options.timeWindowStart);
                const windowEndMins = this.timeStringToMinutes(options.timeWindowEnd);
                uniqueSlots = uniqueSlots.filter(slot => {
                    const slotMins = this.timeStringToMinutes(slot.start_time);
                    return slotMins >= windowStartMins && slotMins <= windowEndMins;
                });
            }

            const available_slots = uniqueSlots.filter(s => s.available).length;
            const total_slots = uniqueSlots.length;


            /*  
                logger.info(`${available_slots}/${total_slots} Available slots fetched successfully`, {
                    total_slots: uniqueSlots.length,
                    available_slots: uniqueSlots.filter(s => s.available).length,
                    unavailable_slots: uniqueSlots.filter(s => !s.available).length
                });
            */
           logger.info(`${available_slots} Available (${total_slots} total) slots fetched successfully`);

            // Return Day-Availability (is_closed: true wenn an dem Tag keine Öffnungszeiten)
            return {
                date: date,
                day_of_week: dayOfWeek,
                time_slots: uniqueSlots,
                is_closed: !hadOpeningHours,
                ...(withinAdvanceHours && { within_advance_hours: true, booking_advance_hours: bookingAdvanceHours })
            };
        }
        catch (error)
        {
            logger.error('Error fetching available slots', error);
            throw error;
        }
        finally
        {
            if (conn)
            {
                conn.release();
                logger.debug('Database connection released');
            }
        }
    }


    /**
     * Prüfe, ob Venue existiert und aktiv ist
     */
    static async isValidVenue(venueId: number): Promise<boolean>
    {
        logger.debug('Validating venue ...');
        let conn;

        try 
        {
            conn = await getConnection();
            
            const venues = await conn.query(`
                SELECT id
                FROM venues
                WHERE id = ?
                AND is_active = true`,
                [venueId]
            ) as { id: number }[];;

            const isValid = venues.length > 0;

            if (!isValid)
            {
                logger.warn('Invalid or inactive venue');
            }
            else
            {
                logger.debug('Venue is valid');
            }

            return isValid;
        } 
        catch (error) 
        {
            logger.error('Error validating venue', error);
            throw error;
        }
        finally
        {
            if (conn)
            {
                conn.release();
                logger.debug('Database connection released');
            }
        }
    }


    /**
     * Hole Service-Details anhand ID
     */
    static async getServiceDetails(serviceId: number, venueId: number): Promise<Service | null>
    {
        logger.debug('Fetching service details...');
        
        let conn;
        try 
        {
            conn = await getConnection();

            // Eigentlich noch buffer_before_minutes & buffer_after_minutes nach requires_staff, ABER MVP
            const services = await conn.query(`
                SELECT id, venue_id, name, description, duration_minutes, 
                    price, capacity, requires_staff, is_active
                FROM services
                WHERE id = ?
                AND venue_id = ?
                AND is_active = true`,
                [serviceId, venueId]
            ) as Service[];

            const service = services.length > 0 ? services[0] : null;

            if (!service) 
            {
                logger.warn('Service not found or inactive');
            } 
            else 
            {
                logger.debug(`Service details fetched`, service);
            }

            // Return Service OR null
            return service;
        }
        catch (error)
        {
            logger.error('Error fetching service details', error);
            throw error;
        }
        finally
        {
            if (conn)
            {
                conn.release();
                logger.debug('Database connection released');
            }
        }
    }


    /**
     * Prüfe, ob Mitarbeiter einen Service durchführen kann
     */
    static async canStaffPerformService(staffMemberId: number, serviceId: number): Promise<boolean>
    {
        logger.debug('Checking if staff can perform service...', {
            staff_member_id: staffMemberId,
            service_id: serviceId
        });

        let conn;
        try
        {
            conn = await getConnection();

            // Suche Verknüpfung zwischen Mitarbeiter und Service
            // Gibt nur ein Ergebnis zurück, wenn der Mitarbeiter aktiv ist und den Service anbietet
            const staffServices = await conn.query(`
                SELECT ss.id
                FROM staff_services ss
                JOIN staff_members sm
                ON ss.staff_member_id = sm.id
                WHERE ss.staff_member_id = ?
                AND ss.service_id = ?
                AND sm.is_active = true`,
                [staffMemberId, serviceId]
            ) as { id: number }[];

            const canPerform = staffServices.length > 0;

            if (!canPerform) 
            {
                logger.warn(`Staff member cannot perform service`);
            } 
            else 
            {
                logger.debug(`Staff member can perform service`);
            }

            // Return true, wenn Mitarbeiter diesen Service anbietet
            return canPerform;
        }
        catch (error)
        {
            logger.error('Error checking staff service', error);
            throw error;
        }
        finally
        {
            if (conn)
            {
                conn.release();
                logger.debug('Database connection released');
            }
        }
    }


    /**
     * Hole Wochen-Verfügbarkeit für einen Service
     * options: staffMemberId, partySize – werden an getAvailableSlots pro Tag weitergegeben
     */
    static async getWeekAvailability(
        venueId: number,
        serviceId: number,
        startDate: string,
        options?: { staffMemberId?: number; partySize?: number }
    ): Promise<DayAvailability[]>
    {
        logger.info('Fetching week availability...', {
            venue_id: venueId,
            service_id: serviceId,
            start_date: startDate
        });

        try
        {
            // Validate Venue
            const isValid = await this.isValidVenue(venueId);
            if(!isValid)
            {
                logger.warn('Venue not found or inactive');
                throw new Error('Venue not found or inactive');
            }

            // Initialisiere Array für Wochen-Verfügbarkeit
            //                      Typ: Array          Wert: leeres Array
            const weekAvailability: DayAvailability[] = [];

            // Konvertiere Start-Datum
            const start = new Date(startDate);


            // Hole Verfügbarkeit für 7 Tage (Datum in Lokalzeit, damit Sonntag nicht als Samstag angefragt wird)
            for (let i = 0; i < 7; i++)
            {
                const currentDate = new Date(start);
                currentDate.setDate(start.getDate() + i);

                const y = currentDate.getFullYear();
                const m = String(currentDate.getMonth() + 1).padStart(2, '0');
                const d = String(currentDate.getDate()).padStart(2, '0');
                const dateString = `${y}-${m}-${d}`;


                try 
                {
                    const dayAvailability = await this.getAvailableSlots(venueId, serviceId, dateString, options);
                    weekAvailability.push(dayAvailability);    
                } 
                catch (error) 
                {
                    logger.error(`Error getting availability for ${dateString}: `, error);

                    // Füge leeren Tag bei Fehler hinzu (als geschlossen anzeigen)
                    weekAvailability.push({
                        date: dateString,
                        day_of_week: currentDate.getDay(),
                        time_slots: [],
                        is_closed: true
                    });
                }
            }

            logger.info('Week availability fetched successfully', {
                days_with_slots: weekAvailability.filter(d => d.time_slots.length > 0).length,
                total_days: weekAvailability.length
            });

            // Return komplette Wochen-Verfügbarkeit
            return weekAvailability;
        }
        catch (error)
        {
            logger.error('Error fetching week availability', error);
            throw error;
        }
    }

    /** Max. Tage für Range-Abfrage (z. B. 84 = 12 Wochen) */
    private static readonly AVAILABILITY_RANGE_MAX_DAYS = 84;

    /**
     * Hole Verfügbarkeit für einen kompletten Datumsbereich in einem Aufruf (weniger HTTP- und DB-Roundtrips).
     * options: staffMemberId, partySize – wie bei getAvailableSlots.
     */
    static async getAvailabilityRange(
        venueId: number,
        serviceId: number,
        startDate: string,
        endDate: string,
        options?: { staffMemberId?: number; partySize?: number }
    ): Promise<DayAvailability[]>
    {
        const partySize = options?.partySize ?? 1;
        logger.info('Fetching availability range...', {
            venue_id: venueId,
            service_id: serviceId,
            start_date: startDate,
            end_date: endDate,
            partySize
        });

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
            throw new Error('Invalid startDate or endDate');
        }
        const totalDays = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        if (totalDays > this.AVAILABILITY_RANGE_MAX_DAYS) {
            throw new Error(`Date range must not exceed ${this.AVAILABILITY_RANGE_MAX_DAYS} days`);
        }

        let conn;
        try
        {
            conn = await getConnection();

            const venueCheck = await conn.query(`
                SELECT id FROM venues WHERE id = ? AND is_active = true`,
                [venueId]
            ) as { id: number }[];
            if (venueCheck.length === 0) throw new Error('Venue not found or inactive');

            const services = await conn.query(`
                SELECT id, duration_minutes, requires_staff, capacity
                FROM services
                WHERE id = ? AND venue_id = ? AND is_active = true`,
                [serviceId, venueId]
            ) as Service[];
            if (services.length === 0) throw new Error('Service not found');
            const service = services[0];

            const venueData = await conn.query(`
                SELECT booking_advance_hours FROM venues WHERE id = ?`,
                [venueId]
            ) as { booking_advance_hours: number | null }[];
            const bookingAdvanceHours = venueData[0]?.booking_advance_hours ?? 0;

            type RuleRow = { day_of_week: number; start_time: string; end_time: string; staff_member_id?: number };
            type BookingRow = { booking_date: string; start_time: string; end_time: string; staff_member_id: number | null; party_size: number };

            let staffIds: number[] = [];
            let rulesByStaffAndDay: Map<number, Map<number, { start_time: string; end_time: string }[]>> = new Map();
            let venueRulesByDay: Map<number, { start_time: string; end_time: string }[]> = new Map();

            if (service.requires_staff)
            {
                let staffRows = await conn.query(`
                    SELECT sm.id as staff_id FROM staff_services ss
                    JOIN staff_members sm ON ss.staff_member_id = sm.id
                    WHERE ss.service_id = ? AND sm.is_active = true`,
                    [serviceId]
                ) as { staff_id: number }[];
                if (options?.staffMemberId != null) {
                    staffRows = staffRows.filter((r) => r.staff_id === options.staffMemberId);
                }
                staffIds = staffRows.map((r) => r.staff_id);
                if (staffIds.length === 0) {
                    const emptyDays = this.buildDateList(startDate, endDate).map(({ dateStr, dayOfWeek }) => ({
                        date: dateStr,
                        day_of_week: dayOfWeek,
                        time_slots: [],
                        is_closed: true
                    }));
                    return emptyDays;
                }
                const rules = await conn.query(`
                    SELECT staff_member_id, day_of_week, start_time, end_time
                    FROM availability_rules
                    WHERE staff_member_id IN (?) AND is_active = true`,
                    [staffIds]
                ) as RuleRow[];
                for (const r of rules) {
                    const sid = r.staff_member_id!;
                    if (!rulesByStaffAndDay.has(sid)) rulesByStaffAndDay.set(sid, new Map());
                    const byDay = rulesByStaffAndDay.get(sid)!;
                    if (!byDay.has(r.day_of_week)) byDay.set(r.day_of_week, []);
                    byDay.get(r.day_of_week)!.push({ start_time: r.start_time, end_time: r.end_time });
                }
            }
            else
            {
                const rules = await conn.query(`
                    SELECT day_of_week, start_time, end_time
                    FROM availability_rules
                    WHERE venue_id = ? AND is_active = true`,
                    [venueId]
                ) as RuleRow[];
                for (const r of rules) {
                    if (!venueRulesByDay.has(r.day_of_week)) venueRulesByDay.set(r.day_of_week, []);
                    venueRulesByDay.get(r.day_of_week)!.push({ start_time: r.start_time, end_time: r.end_time });
                }
            }

            let bookingsQuery: string;
            let bookingsParams: (string | number)[];
            
            if (service.requires_staff) {
                bookingsQuery = `SELECT booking_date, start_time, end_time, staff_member_id, party_size FROM bookings
                   WHERE venue_id = ? AND booking_date >= ? AND booking_date <= ? AND staff_member_id IS NOT NULL AND status = 'confirmed'`;
                bookingsParams = [venueId, startDate, endDate];
                
                if (options?.staffMemberId != null) {
                    bookingsQuery += ' AND staff_member_id = ?';
                    bookingsParams.push(options.staffMemberId);
                }
            } else {
                bookingsQuery = `SELECT booking_date, start_time, end_time, staff_member_id, party_size FROM bookings
                   WHERE venue_id = ? AND service_id = ? AND booking_date >= ? AND booking_date <= ? AND status = 'confirmed'`;
                bookingsParams = [venueId, serviceId, startDate, endDate];
            }
            
            const bookings = await conn.query(bookingsQuery, bookingsParams) as BookingRow[];
            logger.debug(`Loaded ${bookings.length} bookings for date range`, {
                query_includes_staff_filter: options?.staffMemberId != null,
                staff_member_id: options?.staffMemberId,
                booking_count: bookings.length
            });
            const bookingsByDate: Record<string, BookingRow[]> = {};
            for (const b of bookings) {
                if (!bookingsByDate[b.booking_date]) bookingsByDate[b.booking_date] = [];
                bookingsByDate[b.booking_date].push(b);
            }

            const dateList = this.buildDateList(startDate, endDate);
            const result: DayAvailability[] = [];

            for (const { dateStr, dayOfWeek } of dateList)
            {
                let availableSlots: TimeSlot[] = [];
                if (service.requires_staff)
                {
                    for (const staffId of staffIds)
                    {
                        const byDay = rulesByStaffAndDay.get(staffId)?.get(dayOfWeek);
                        if (!byDay) continue;
                        for (const rule of byDay)
                        {
                            const staffSlots = this.generateTimeSlots(rule.start_time, rule.end_time, service.duration_minutes);
                            availableSlots.push(...staffSlots.map(s => ({ ...s, staff_member_id: staffId })));
                        }
                    }
                }
                else
                {
                    const dayRules = venueRulesByDay.get(dayOfWeek) ?? [];
                    for (const rule of dayRules)
                    {
                        availableSlots.push(...this.generateTimeSlots(rule.start_time, rule.end_time, service.duration_minutes));
                    }
                }

                const hadOpeningHours = availableSlots.length > 0;
                const existingBookings = bookingsByDate[dateStr] ?? [];

                if (dateStr === '2026-02-23' && existingBookings.length > 0) {
                    logger.debug(`Processing ${dateStr} with ${existingBookings.length} bookings`, {
                        bookings: existingBookings,
                        slot_count: availableSlots.length,
                        requires_staff: service.requires_staff
                    });
                }

                availableSlots = availableSlots.map(slot => {
                    let totalOccupancy = 0;
                    let slotMarkedUnavailable = false;
                    for (const booking of existingBookings)
                    {
                        const overlaps = this.timeSlotsOverlap(slot.start_time, slot.end_time, booking.start_time, booking.end_time);
                        if (!overlaps) continue;
                        
                        if (service.requires_staff)
                        {
                            if (slot.staff_member_id === booking.staff_member_id) {
                                slotMarkedUnavailable = true;
                                return { ...slot, available: false };
                            }
                        }
                        else
                            totalOccupancy += booking.party_size;
                    }
                    if (!service.requires_staff)
                    {
                        const remainingCapacity = service.capacity - totalOccupancy;
                        return {
                            ...slot,
                            available: remainingCapacity >= partySize,
                            remaining_capacity: Math.max(0, remainingCapacity)
                        };
                    }
                    return slot;
                });

                availableSlots.sort((a, b) => this.timeStringToMinutes(a.start_time) - this.timeStringToMinutes(b.start_time));
                let uniqueSlots = availableSlots.filter((slot, index, array) =>
                    index === array.findIndex(s =>
                        s.start_time === slot.start_time && s.end_time === slot.end_time && s.staff_member_id === slot.staff_member_id
                    )
                );

                const slotsCountBeforeAdvance = uniqueSlots.length;
                const now = new Date();
                uniqueSlots = uniqueSlots.filter(slot => {
                    const [hours, minutes] = slot.start_time.split(':').map(Number);
                    const slotDateTime = new Date(dateStr);
                    slotDateTime.setHours(hours, minutes, 0, 0);
                    const hoursUntilSlot = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
                    return hoursUntilSlot >= bookingAdvanceHours;
                });
                const withinAdvanceHours = hadOpeningHours && slotsCountBeforeAdvance > 0 && uniqueSlots.length === 0;

                result.push({
                    date: dateStr,
                    day_of_week: dayOfWeek,
                    time_slots: uniqueSlots,
                    is_closed: !hadOpeningHours,
                    ...(withinAdvanceHours && { within_advance_hours: true, booking_advance_hours: bookingAdvanceHours })
                });
            }

            logger.info('Availability range fetched successfully', {
                total_days: result.length,
                days_with_slots: result.filter(d => d.time_slots.length > 0).length
            });
            return result;
        }
        catch (error)
        {
            logger.error('Error fetching availability range', error);
            throw error;
        }
        finally
        {
            if (conn) {
                conn.release();
                logger.debug('Database connection released');
            }
        }
    }

    private static buildDateList(startDate: string, endDate: string): { dateStr: string; dayOfWeek: number }[]
    {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const list: { dateStr: string; dayOfWeek: number }[] = [];
        const cur = new Date(start);
        while (cur <= end)
        {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            list.push({ dateStr: `${y}-${m}-${d}`, dayOfWeek: cur.getDay() });
            cur.setDate(cur.getDate() + 1);
        }
        return list;
    }

    /**
     * Validiere Buchungsanfrage gegen Verfügbarkeit
     */
    static async validateBookingRequest(
        venueId: number,                // ID des Geschäfts
        serviceId: number,              // ID des Services
        staffMemberId: number | null,   // Optional: Mitarbeiter-ID
        bookingDate: string,            // Buchungsdatum
        startTime: string,              // Startzeit
        endTime: string,                // Endzeit
        partySize: number,              // Gruppengröße
        excludeBookingId?: number,      // Optional: zu ignorierende Buchungs-ID
        bypassAdvanceCheck?: boolean    // Optional: Für Admin-Buchungen (ignoriert booking_advance_hours)
    ): Promise<{ valid: boolean; errors: string[] }>
    {
        logger.info('Validating booking request...', {
            venue_id: venueId,
            service_id: serviceId,
            staff_member_id: staffMemberId,
            booking_date: bookingDate,
            start_time: startTime,
            end_time: endTime,
            party_size: partySize,
            exclude_booking_id: excludeBookingId,
            bypass_advance_check: bypassAdvanceCheck
        });

        // Initialisiere das Fehler-Array
        const errors: string[] = [];

        try 
        {
            if (partySize <= 0) 
            {
                logger.warn('Party size must be at least 1');
                errors.push('Party size must be at least 1');
            }
            if (partySize > 8)
            {
                logger.warn('Party size must be at most 8 (for larger groups please call)');
                errors.push('Party size must be between 1 and 8. For larger groups please call.');
            }

            // Validiere Zeitformat mit Regex (HH:MM)
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(startTime) || 
                !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(endTime)) 
            {
                logger.warn('Invalid time format. Use HH:MM');
                errors.push('Invalid time format. Use HH:MM');
            }

            // Prüfe, ob Endzeit nach Startzeit liegt
            if (this.timeStringToMinutes(endTime) <= this.timeStringToMinutes(startTime))
            {
                logger.warn('End time must be after start time');
                errors.push('End time must be after start time');
            }

            // Prüfe, ob Buchungsdatum nicht in der Vergangenheit liegt
            const bookingDateObj = new Date(bookingDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Setze auf Mitternacht

            if (bookingDateObj < today)
            {
                logger.warn('Cannot book in the past');
                errors.push('Cannot book in the past');
            }

            // Hole Venue-Details für booking_advance_hours Check
            let conn;
            try 
            {
                conn = await getConnection();
                const venues = await conn.query(`
                    SELECT booking_advance_hours
                    FROM venues
                    WHERE id = ?
                    AND is_active = true`,
                    [venueId]
                ) as Pick<import('../config/utils/types').Venue, 'booking_advance_hours'>[];

                if (venues.length === 0)
                {
                    logger.warn('Venue not found or inactive');
                    errors.push('Venue not found or inactive');
                    return { valid: false, errors };
                }

                const venue = venues[0];

                // Prüfe Mindestvorlaufzeit (außer bei Admin-Bypass)
                if (!bypassAdvanceCheck)
                {
                    // Erstelle vollständiges Datetime-Objekt für den Buchungstermin
                    const [hours, minutes] = startTime.split(':').map(Number);
                    const bookingDateTime = new Date(bookingDate);
                    bookingDateTime.setHours(hours, minutes, 0, 0);

                    // Berechne Zeitdifferenz in Stunden
                    const now = new Date();
                    const hoursUntilBooking = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

                    if (hoursUntilBooking < venue.booking_advance_hours)
                    {
                        logger.warn('Booking too soon', {
                            hours_until_booking: hoursUntilBooking,
                            required_advance: venue.booking_advance_hours
                        });
                        errors.push(
                            `Bookings must be made at least ${venue.booking_advance_hours} hours in advance. ` +
                            `Only ${Math.floor(hoursUntilBooking)} hours remaining.`
                        );
                    }
                }
            }
            finally
            {
                if (conn)
                {
                    conn.release();
                }
            }

            // Hole und prüfe Service-Details
            const service = await this.getServiceDetails(serviceId, venueId);
            if(!service)
            {
                logger.warn('Service not found or inactive', errors);
                errors.push('Service not found or inactive');

                return {
                    valid: false,
                    errors
                };
            }

            // Validiere Mitarbeiter-Anforderung
            if (service.requires_staff)
            {
                if(!staffMemberId)
                {
                    logger.warn('Staff member is required for this service');
                    errors.push('Staff member is required for this service');
                }
                else
                {
                    // Prüfe, ob Mitarbeiter diesen Service durchführen kann
                    const canPerform = await this.canStaffPerformService(staffMemberId, serviceId);
         
                    if (!canPerform)
                    {
                        logger.warn('Selected staff member cannot perform this service');
                        errors.push('Selected staff member cannot perform this service');
                    }
                }
            }

            // Prüfe Verfügbarkeit nur wenn bisher keine Fehler
            if (errors.length === 0)
            {
                const availabilityResult = await this.isTimeSlotAvailable(
                    venueId,
                    serviceId,
                    staffMemberId,
                    bookingDate,
                    startTime,
                    endTime,
                    partySize,
                    excludeBookingId
                );

                // Füge Verfügbarkeits-Fehler hinzu wenn nicht verfügbar
                if (!availabilityResult.available)
                {
                    logger.warn(availabilityResult.reason || 'Time slot not available');
                    errors.push(availabilityResult.reason || 'Time slot not available');
                }
            }
        } 
        catch (error) 
        {
            logger.error('Error validating booking request', error);
            errors.push('Error validating booking request');
        }
        

        // Log Ergebnis bevor Return
        if (errors.length === 0)
        {
            logger.info('Booking request validation passed')
        }
        else
        {
            logger.warn('Booking request validation failed', {
                error_count: errors.length,
                errors: errors
            });
        }

        // Return Validierungs-Ergebnis
        return {
            valid: errors.length === 0,
            errors
        };
    }
}