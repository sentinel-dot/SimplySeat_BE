-- MySQL Seed Data for OpenTable Clone
USE simplyseatdb;

-- Disable foreign key checks temporarily for easier insertion
SET FOREIGN_KEY_CHECKS = 0;

-- Clear existing data (optional - remove if you want to keep existing data)

DELETE FROM bookings;

DELETE FROM availability_rules;
DELETE FROM staff_services;
DELETE FROM services;
DELETE FROM staff_members;

DELETE FROM users;
DELETE FROM venues;

DELETE FROM loyalty_config;

-- Reset auto increment counters

ALTER TABLE venues AUTO_INCREMENT = 1;

ALTER TABLE staff_members AUTO_INCREMENT = 1;
ALTER TABLE services AUTO_INCREMENT = 1;
ALTER TABLE staff_services AUTO_INCREMENT = 1;
ALTER TABLE availability_rules AUTO_INCREMENT = 1;
ALTER TABLE users AUTO_INCREMENT = 1;

ALTER TABLE bookings AUTO_INCREMENT = 1;



-- Insert venues (image_url: passende Stock-Bilder von Unsplash)
INSERT INTO venues (name, type, email, phone, address, city, postal_code, description, image_url, created_at, updated_at) VALUES
('Bella Vista Restaurant', 'restaurant', 'bella@vista.com', '+49 30 12345678', 'Hauptstraße 123', 'Berlin', '10115', 'Authentische italienische Küche im Herzen Berlins', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800', NOW(), NOW()),
('Salon Schmidt', 'hair_salon', 'info@salon-schmidt.com', '+49 30 87654321', 'Friedrichstraße 456', 'Berlin', '10117', 'Moderner Friseursalon mit erfahrenen Stylisten', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800', NOW(), NOW()),
('Leloluxee Lashes', 'beauty_salon', 'lea@leloluxee-lashes.de', NULL, 'Theodor-Heuss-Straße 6', 'Egelsbach', '63229', 'Wimpern & Brauen – Lashlifting, Browlifting, Zahnschmuck. Deine Ansprechpartnerin: Lea.', 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800', NOW(), NOW());

-- Insert users (Dashboard-Login)
-- Default password: admin123 (bcrypt hash with 10 rounds)
INSERT INTO users (email, password_hash, name, venue_id, role, created_at) VALUES
('lea@leloluxee-lashes.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Lea', 3, 'owner', NOW());

-- System-Admin (admin = System, venue_id NULL). Standard-Passwort: superadmin123
INSERT INTO users (email, password_hash, name, venue_id, role, created_at) VALUES
('admin@simplyseat.de', '$2b$10$vsko22RhtwHvzrEEDivapevJP.XWo.kLNv/nAP81XhmZ0CmwXTAXq', 'Admin', NULL, 'admin', NOW());


-- Insert restaurant services (tables)
INSERT INTO services (venue_id, name, description, duration_minutes, price, capacity, requires_staff, created_at, updated_at) VALUES
(1, 'Tisch für 2 Personen', 'Gemütlicher Tisch für zwei Personen', 120, 0.00, 2, FALSE, NOW(), NOW()),
(1, 'Tisch für 4 Personen', 'Perfekt für kleine Gruppen', 120, 0.00, 4, FALSE, NOW(), NOW()),
(1, 'Großer Tisch (6-8 Personen)', 'Ideal für Familienfeiern', 150, 0.00, 8, FALSE, NOW(), NOW());

-- Insert staff members for hair salon
INSERT INTO staff_members (venue_id, name, email, description, created_at, updated_at) VALUES
(2, 'Anna Schmidt', 'anna@salon-schmidt.com', 'Spezialistin für Damenhaarschnitte und Colorationen', NOW(), NOW()),
(2, 'Klaus Meyer', 'klaus@salon-schmidt.com', 'Experte für Herrenschnitte und Bärte', NOW(), NOW()),
(3, 'Lea', 'lea@leloluxee-lashes.de', 'Lashlifting, Browlifting, Zahnschmuck', NOW(), NOW());

-- Insert hair salon services
INSERT INTO services (venue_id, name, description, duration_minutes, price, capacity, requires_staff, created_at, updated_at) VALUES
(2, 'Herrenhaarschnitt', 'Klassischer Herrenhaarschnitt mit Styling', 45, 35.00, 1, TRUE, NOW(), NOW()),
(2, 'Damenhaarschnitt', 'Schnitt und Styling für Damen', 90, 55.00, 1, TRUE, NOW(), NOW()),
(2, 'Coloration', 'Professionelle Haarfärbung', 180, 95.00, 1, TRUE, NOW(), NOW());

-- Insert Leloluxee Lashes services (venue_id 3)
INSERT INTO services (venue_id, name, description, duration_minutes, price, capacity, requires_staff, created_at, updated_at) VALUES
(3, 'Lashlifting inkl. Färben', 'Wimpernlifting inklusive Färben', 90, 40.00, 1, TRUE, NOW(), NOW()),
(3, 'Lashlifting ohne Färben', 'Wimpernlifting ohne Färben', 75, 35.00, 1, TRUE, NOW(), NOW()),
(3, 'Browlifting', 'Brauenlifting. Extras buchbar: Zupfen/Wachsen +5€, Färben +5€', 45, 35.00, 1, TRUE, NOW(), NOW()),
(3, 'Browlifting Extra: Zupfen/Wachsen', 'Zupfen oder Wachsen der Brauen (als Zusatz zu Browlifting)', 15, 5.00, 1, TRUE, NOW(), NOW()),
(3, 'Browlifting Extra: Färben', 'Färben der Brauen (als Zusatz zu Browlifting)', 15, 5.00, 1, TRUE, NOW(), NOW()),
(3, 'Zahnschmuck', 'Dekorativer Zahnschmuck', 30, 20.00, 1, TRUE, NOW(), NOW());

-- Insert staff-service relationships
INSERT INTO staff_services (staff_member_id, service_id, created_at) VALUES
-- Anna kann alle Services (Service IDs 4, 5, 6)
(1, 4, NOW()),
(1, 5, NOW()),
(1, 6, NOW()),
-- Klaus nur Herrenhaarschnitt (Service ID 4)
(2, 4, NOW()),
-- Lea (staff_id 3) – alle Leloluxee-Services (Service IDs 7–12)
(3, 7, NOW()),
(3, 8, NOW()),
(3, 9, NOW()),
(3, 10, NOW()),
(3, 11, NOW()),
(3, 12, NOW());

-- Insert availability rules for restaurant (Mo-So)
INSERT INTO availability_rules (venue_id, day_of_week, start_time, end_time, created_at) VALUES
-- Montag nur Abend
(1, 1, '17:00', '22:00', NOW()),
-- Dienstag bis Sonntag ganztags
(1, 2, '11:30', '22:00', NOW()),
(1, 3, '11:30', '22:00', NOW()),
(1, 4, '11:30', '22:00', NOW()),
(1, 5, '11:30', '22:00', NOW()),
(1, 6, '11:30', '22:00', NOW()),
(1, 0, '11:30', '22:00', NOW());

-- Insert availability rules for hair salon staff (Di-Sa)
INSERT INTO availability_rules (staff_member_id, day_of_week, start_time, end_time, created_at) VALUES
-- Anna Schmidt (Di-Sa)
(1, 2, '09:00', '18:00', NOW()),
(1, 3, '09:00', '18:00', NOW()),
(1, 4, '09:00', '18:00', NOW()),
(1, 5, '09:00', '18:00', NOW()),
(1, 6, '09:00', '18:00', NOW()),
-- Klaus Meyer (Di-Sa)
(2, 2, '09:00', '18:00', NOW()),
(2, 3, '09:00', '18:00', NOW()),
(2, 4, '09:00', '18:00', NOW()),
(2, 5, '09:00', '18:00', NOW()),
(2, 6, '09:00', '18:00', NOW()),
-- Lea / Leloluxee Lashes (Di–Sa, Platzhalterzeiten – anpassen!)
(3, 2, '09:00', '18:00', NOW()),
(3, 3, '09:00', '18:00', NOW()),
(3, 4, '09:00', '18:00', NOW()),
(3, 5, '09:00', '18:00', NOW()),
(3, 6, '09:00', '18:00', NOW());

-- Loyalty-Konfiguration (Default-Werte)
INSERT INTO loyalty_config (id, booking_completed, booking_with_review, welcome_bonus, email_verified_bonus, points_per_euro)
VALUES (1, 10, 5, 50, 25, 1);

-- Insert test bookings for tomorrow (booking_token erforderlich)
INSERT INTO bookings (booking_token, venue_id, service_id, staff_member_id, customer_name, customer_email, customer_phone, booking_date, start_time, end_time, party_size, status, special_requests, total_amount, created_at, updated_at) VALUES
(UUID(), 1, 2, NULL, 'Familie Müller', 'mueller@example.com', '+49 170 1234567', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '19:00', '21:00', 4, 'confirmed', 'Vegetarische Optionen gewünscht', NULL, NOW(), NOW()),
(UUID(), 2, 4, 2, 'Peter Schmidt', 'peter@example.com', NULL, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00', '10:45', 1, 'pending', NULL, 35.00, NOW(), NOW());

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Display success message and useful information
SELECT 'Seed data created successfully!' as message;
SELECT 'Test User: test@example.com / password123' as login_info;
SELECT 'Restaurant booking link: /book/bella-vista' as restaurant_link;
SELECT 'Salon booking link: /book/salon-schmidt' as salon_link;
SELECT 'Leloluxee Lashes booking link: /venues/3' as leloluxee_link;