
export interface ApiResponse<T> {
    success: boolean;
    message?: string;
    data?: T;
    error?: string;
}


// Service Types (DB/API verwenden venue_id)
export interface Service {
  id: number;
  venue_id: number;
  name: string;
  description?: string;
  duration_minutes: number;
  price?: number;
  capacity: number;
  requires_staff: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}


// Staff-Member Types (DB/API verwenden venue_id)
export interface StaffMember {
  id: number;
  venue_id: number;
  name: string;
  email?: string;
  phone?: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

 
// Venue Types
export interface Venue {
    id: number;
    name: string;
    type: 'restaurant' | 'hair_salon' | 'beauty_salon' | 'cafe' | 'bar' | 'spa' | 'other';
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country: string;
    description?: string;
    image_url?: string;
    website_url?: string;
    booking_advance_days: number;
    booking_advance_hours: number;         // Mindestvorlaufzeit für Kundenbuchungen (z.B. 48 Stunden)
    cancellation_hours: number;
    require_phone: boolean;
    require_deposit: boolean;
    deposit_amount?: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface OpeningHoursSlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface VenueWithStaff extends Venue {
  staff_members: StaffMember[];
  services: Service[];
  opening_hours?: OpeningHoursSlot[];
}


// Availability Types
export interface TimeSlot {
  start_time: string;
  end_time: string;
  available: boolean;
  staff_member_id?: number;
  /** Nur bei kapazitätsbasierten Services (z. B. Restaurant) gesetzt */
  remaining_capacity?: number;
}

export interface DayAvailability {
  date: string;
  day_of_week: number;
  time_slots: TimeSlot[];
}


// Booking Types

/**
 * Interface für eine Buchung
 * Definiert die Struktur einer Buchung in der Datenbank
 */
export interface Booking 
{
  id: number;
  customer_id?: number | null;                  // Optional: Link to customer account
  booking_token: string;
  venue_id: number;
  service_id: number;
  staff_member_id?: number | null;              // Optional: Nur bei Services die Mitarbeiter benötigen
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  booking_date: string;                         // Format: YYYY-MM-DD
  start_time: string;                           // Format: HH:MM
  end_time: string;                             // Format: HH:MM
  party_size: number;                           // Anzahl Personen
  special_requests?: string | null;             // Besondere Wünsche des Kunden
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  total_amount?: number | null;                 // Gesamtpreis
  deposit_paid?: number | null;                 // Anzahlung
  payment_status?: string | null;
  confirmation_sent_at?: Date | null;
  reminder_sent_at?: Date | null;
  cancelled_at?: Date | null;
  cancellation_reason?: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Interface für das Erstellen einer neuen Buchung
 * Enthält nur die Felder, die vom Client gesendet werden müssen
 */
export interface CreateBookingData
{
    customer_id?: number;                       // Optional: If user is authenticated
    venue_id: number;
    service_id: number;
    staff_member_id?: number;
    customer_name: string;
    customer_email: string;
    customer_phone?: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    party_size: number;
    special_requests?: string;
    total_amount?: number;
}

/**
 * Interface für das aktualisieren einer Buchung
 * Alle Felder sind optional, nur die geänderten Werte müssen gesendet werden
 */
export interface UpdateBookingData
{
    booking_date?: string;
    start_time?: string;
    end_time?: string;
    party_size?: number;
    staff_member_id?: number; 
    special_requests?: string;
    status?: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
    cancellation_reason?: string;
}


// Admin User Types
export type AdminRole = 'admin' | 'owner' | 'staff';

export interface AdminUser {
    id: number;
    email: string;
    password_hash: string;
    name: string;
    venue_id: number | null;
    role: AdminRole;
    is_active: boolean;
    last_login: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface AdminUserPublic {
    id: number;
    email: string;
    name: string;
    venue_id: number | null;
    role: AdminRole;
}

export interface JwtPayload {
    userId: number;
    email: string;
    role: AdminRole;
    venueId: number | null;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: AdminUserPublic;
}

// Customer User Types
export interface Customer {
    id: number;
    email: string;
    password_hash: string;
    name: string;
    phone: string | null;
    loyalty_points: number;
    is_active: boolean;
    email_verified: boolean;
    verification_token: string | null;
    last_login: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface CustomerPublic {
    id: number;
    email: string;
    name: string;
    phone: string | null;
    loyalty_points: number;
    email_verified: boolean;
}

export interface CustomerJwtPayload {
    customerId: number;
    email: string;
}

export interface CustomerRegisterRequest {
    email: string;
    password: string;
    name: string;
    phone?: string;
}

export interface CustomerLoginResponse {
    token: string;
    customer: CustomerPublic;
}

// Customer Preferences
export interface CustomerPreferences {
    customer_id: number;
    default_party_size: number;
    preferred_time_slot: string | null;
    notification_email: boolean;
    notification_sms: boolean;
    language: string;
    created_at: Date;
    updated_at: Date;
}

// Customer Favorites
export interface CustomerFavorite {
    id: number;
    customer_id: number;
    venue_id: number;
    created_at: Date;
}

// Reviews
export interface Review {
    id: number;
    customer_id: number;
    venue_id: number;
    booking_id: number;
    rating: number;
    comment: string | null;
    is_verified: boolean;
    response: string | null;
    response_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface CreateReviewRequest {
    venue_id: number;
    booking_id: number;
    rating: number;
    comment?: string;
}

// Loyalty Transactions
export type LoyaltyTransactionType = 'earned' | 'redeemed' | 'expired' | 'bonus';

export interface LoyaltyTransaction {
    id: number;
    customer_id: number;
    booking_id: number | null;
    points: number;
    type: LoyaltyTransactionType;
    description: string | null;
    created_at: Date;
}