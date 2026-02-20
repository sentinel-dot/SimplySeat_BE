-- Database schema

-- Create database
CREATE DATABASE IF NOT EXISTS simplyseatdb;
USE simplyseatdb;



-- venue table
CREATE TABLE venues (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type ENUM('restaurant', 'hair_salon', 'beauty_salon', 'cafe', 'bar', 'spa', 'other') NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    address VARCHAR(255),
    city VARCHAR(255),
    postal_code VARCHAR(20),
    country VARCHAR(3) DEFAULT 'DE',
    description TEXT,
    image_url VARCHAR(500),
    website_url VARCHAR(500),
    booking_advance_days INT DEFAULT 30,
    booking_advance_hours INT DEFAULT 48,
    cancellation_hours INT DEFAULT 24,
    require_phone BOOLEAN DEFAULT FALSE,
    require_deposit BOOLEAN DEFAULT FALSE,
    deposit_amount DECIMAL(10, 2),
    is_active BOOLEAN DEFAULT TRUE,
    latitude DECIMAL(10, 7) NULL COMMENT 'Für 30km-Nähe-Filter (Featured)',
    longitude DECIMAL(10, 7) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_venues_type (type),
    INDEX idx_venues_lat_lng (latitude, longitude),
    INDEX idx_venues_is_active (is_active),
    INDEX idx_venues_city (city),
    INDEX idx_venues_type_active (type, is_active)
);


-- Staff members table
-- user_id: wenn gesetzt, ist dieser Staff der Dashboard-User (Owner/Staff); FK wird nach Erstellung von users gesetzt
CREATE TABLE staff_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venue_id INT NOT NULL,
    user_id INT NULL COMMENT 'Verknüpfung zum Owner/User (Dashboard-Login); NULL = reiner Mitarbeiter ohne Login',
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
    INDEX idx_staff_venue (venue_id),
    INDEX idx_staff_venue_active (venue_id, is_active),
    INDEX idx_staff_user (user_id)
);

-- Services table
CREATE TABLE services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venue_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL,
    price DECIMAL(10, 2),
    capacity INT DEFAULT 1,
    requires_staff BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
    INDEX idx_services_venue (venue_id),
    INDEX idx_services_venue_active (venue_id, is_active)
);

-- Staff services junction table
CREATE TABLE staff_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_member_id INT NOT NULL,
    service_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_member_id) REFERENCES staff_members(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    UNIQUE KEY unique_staff_service (staff_member_id, service_id),
    INDEX idx_staff_services_staff (staff_member_id),
    INDEX idx_staff_services_service (service_id)
);

-- Availability rules table
CREATE TABLE availability_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venue_id INT,
    staff_member_id INT,
    day_of_week INT NOT NULL,
    start_time VARCHAR(5) NOT NULL,
    end_time VARCHAR(5) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
    FOREIGN KEY (staff_member_id) REFERENCES staff_members(id) ON DELETE CASCADE,
    INDEX idx_availability_venue_day (venue_id, day_of_week),
    INDEX idx_availability_staff_day (staff_member_id, day_of_week),
    INDEX idx_availability_is_active (is_active)
);



-- Customer accounts (separate from admin/owner users)
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    loyalty_points INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    last_login DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_verification_token (verification_token)
);

-- Bookings table (booking_token wird von der Anwendung beim Anlegen gesetzt)
CREATE TABLE bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NULL,
  booking_token VARCHAR(36) UNIQUE NOT NULL,
  venue_id INT NOT NULL,
  service_id INT NOT NULL,
  staff_member_id INT,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(255),
  booking_date DATE NOT NULL,
  start_time VARCHAR(5) NOT NULL,
  end_time VARCHAR(5) NOT NULL,
  party_size INT DEFAULT 1,
  special_requests TEXT,
  status ENUM('pending', 'confirmed', 'cancelled', 'completed', 'no_show') DEFAULT 'pending',
  total_amount DECIMAL(10, 2),
  deposit_paid DECIMAL(10, 2) DEFAULT 0,
  payment_status VARCHAR(255),
  confirmation_sent_at DATETIME,
  reminder_sent_at DATETIME,
  cancelled_at DATETIME,
  cancellation_reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_member_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  INDEX idx_customer_id (customer_id),
  INDEX idx_customer_email (customer_email),
  INDEX idx_booking_date (booking_date),
  INDEX idx_status (status),
  INDEX idx_bookings_venue_date (venue_id, booking_date),
  INDEX idx_bookings_venue_status (venue_id, status),
  INDEX idx_bookings_venue_status_date (venue_id, status, booking_date)
);

-- Users table (Dashboard-Login: Owner/Staff/System-Admin)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    venue_id INT,
    role ENUM('owner', 'admin', 'staff') DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    last_login DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL,
    INDEX idx_users_venue (venue_id),
    INDEX idx_users_venue_active (venue_id, is_active)
);

-- FK staff_members.user_id -> users (nach Erstellung von users)
ALTER TABLE staff_members
    ADD CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Customer preferences
CREATE TABLE customer_preferences (
    customer_id INT PRIMARY KEY,
    default_party_size INT DEFAULT 2,
    preferred_time_slot VARCHAR(50),
    notification_email BOOLEAN DEFAULT TRUE,
    notification_sms BOOLEAN DEFAULT FALSE,
    language VARCHAR(10) DEFAULT 'de',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Customer favorites
CREATE TABLE customer_favorites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    venue_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
    UNIQUE KEY unique_customer_venue (customer_id, venue_id),
    INDEX idx_customer (customer_id),
    INDEX idx_venue (venue_id)
);

-- Reviews
CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    venue_id INT NOT NULL,
    booking_id INT NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    response TEXT,
    response_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    UNIQUE KEY unique_customer_booking (customer_id, booking_id),
    INDEX idx_venue (venue_id),
    INDEX idx_customer (customer_id),
    INDEX idx_rating (rating)
);

-- Loyalty points configuration (single row, admin-editable)
CREATE TABLE loyalty_config (
    id INT PRIMARY KEY DEFAULT 1,
    booking_completed INT NOT NULL DEFAULT 10,
    booking_with_review INT NOT NULL DEFAULT 5,
    welcome_bonus INT NOT NULL DEFAULT 50,
    email_verified_bonus INT NOT NULL DEFAULT 25,
    points_per_euro DECIMAL(5,2) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_loyalty_config_single_row CHECK (id = 1)
);

-- Loyalty transactions
CREATE TABLE loyalty_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    booking_id INT,
    points INT NOT NULL,
    type ENUM('earned', 'redeemed', 'expired', 'bonus') NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
    INDEX idx_customer (customer_id),
    INDEX idx_type (type),
    INDEX idx_loyalty_customer_created (customer_id, created_at)
);

-- Booking audit log: wer wann welche Buchungsänderung (Admin/Owner/Staff/Kunde)
CREATE TABLE booking_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    venue_id INT NOT NULL,
    action VARCHAR(50) NOT NULL COMMENT 'status_change, cancel, update',
    old_status VARCHAR(20) NULL,
    new_status VARCHAR(20) NULL,
    reason VARCHAR(255) NULL COMMENT 'Allgemeiner Grund/Kommentar',
    actor_type ENUM('admin', 'owner', 'staff', 'customer', 'system') NOT NULL,
    user_id INT NULL,
    customer_identifier VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_booking (booking_id),
    INDEX idx_venue_created (venue_id, created_at),
    INDEX idx_created (created_at)
);