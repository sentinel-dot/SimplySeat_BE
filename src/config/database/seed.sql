-- MySQL Seed Data for SimplySeat
USE simplyseatdb;

SET FOREIGN_KEY_CHECKS = 0;

-- Clear existing data
DELETE FROM booking_audit_log;
DELETE FROM reviews;
DELETE FROM loyalty_transactions;
DELETE FROM customer_favorites;
DELETE FROM customer_preferences;
DELETE FROM bookings;
DELETE FROM availability_rules;
DELETE FROM staff_services;
DELETE FROM services;
DELETE FROM staff_members;
DELETE FROM users;
DELETE FROM venues;
DELETE FROM customers;
DELETE FROM loyalty_config;

-- Reset auto increment
ALTER TABLE venues AUTO_INCREMENT = 1;
ALTER TABLE staff_members AUTO_INCREMENT = 1;
ALTER TABLE services AUTO_INCREMENT = 1;
ALTER TABLE staff_services AUTO_INCREMENT = 1;
ALTER TABLE availability_rules AUTO_INCREMENT = 1;
ALTER TABLE users AUTO_INCREMENT = 1;
ALTER TABLE bookings AUTO_INCREMENT = 1;
ALTER TABLE customers AUTO_INCREMENT = 1;
ALTER TABLE reviews AUTO_INCREMENT = 1;

-- ========== VENUES (passende Unsplash-Bilder pro Typ) ==========
INSERT INTO venues (name, type, email, phone, address, city, postal_code, description, image_url, created_at, updated_at) VALUES
('Bella Vista Restaurant', 'restaurant', 'bella@vista.com', '+49 30 12345678', 'Hauptstraße 123', 'Berlin', '10115', 'Authentische italienische Küche im Herzen Berlins', 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800', NOW(), NOW()),
('Salon Schmidt', 'hair_salon', 'info@salon-schmidt.com', '+49 30 87654321', 'Friedrichstraße 456', 'Berlin', '10117', 'Moderner Friseursalon mit erfahrenen Stylisten', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800', NOW(), NOW()),
('Leloluxee Lashes', 'beauty_salon', 'lea@leloluxee-lashes.de', NULL, 'Theodor-Heuss-Straße 6', 'Egelsbach', '63229', 'Wimpern & Brauen – Lashlifting, Browlifting, Zahnschmuck.', 'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=800', NOW(), NOW()),
('Café Mokka', 'cafe', 'hello@cafe-mokka.de', '+49 40 98765432', 'Reeperbahn 12', 'Hamburg', '20359', 'Kleines Café mit frischem Kuchen und Specialty Coffee', 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800', NOW(), NOW()),
('Bar Central', 'bar', 'info@bar-central.de', '+49 30 55566777', 'Oranienburger Str. 45', 'Berlin', '10117', 'Cocktail-Bar mit Livemusik am Wochenende', 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800', NOW(), NOW()),
('Spa Oase', 'spa', 'info@spa-oase.de', '+49 89 12345000', 'Maximilianstraße 28', 'München', '80539', 'Wellness & Sauna, Massagen und Beauty-Behandlungen', 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800', NOW(), NOW()),
('Trattoria Roma', 'restaurant', 'kontakt@trattoria-roma.de', '+49 89 87654321', 'Leopoldstraße 88', 'München', '80802', 'Italienische Küche und Wein', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800', NOW(), NOW()),
('Massage Relax', 'spa', 'info@massage-relax.de', '+49 69 44455566', 'Zeil 100', 'Frankfurt', '60313', 'Thai-Massage, Hot Stone und Aromatherapie', 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=800', NOW(), NOW()),
('Kaffeerösterei Hamburg', 'cafe', 'info@kaffeeroesterei-hh.de', '+49 40 11122334', 'Jungfernstieg 20', 'Hamburg', '20354', 'Rösterei mit Frühstück und Mittagstisch', 'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&w=800', NOW(), NOW()),
('Lounge 21', 'bar', 'reservierung@lounge21.de', '+49 221 7778899', 'Hohe Straße 21', 'Köln', '50667', 'Rooftop-Bar mit Skyline-Blick', 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800', NOW(), NOW()),
('Wellness am See', 'spa', 'buchung@wellness-am-see.de', '+49 30 99988777', 'Am Wannsee 1', 'Berlin', '14109', 'Sauna, Dampfbad, Massagen und Gesichtsbehandlungen', 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800', NOW(), NOW()),
('Sushi Bar Tokyo', 'restaurant', 'info@sushi-tokyo.de', '+49 211 33344555', 'Schadowstraße 50', 'Düsseldorf', '40212', 'Frisches Sushi und japanische Küche', 'https://images.pexels.com/photos/8951563/pexels-photo-8951563.jpeg?auto=compress&w=800', NOW(), NOW()),
('Friseur am Dom', 'hair_salon', 'info@friseur-am-dom.de', '+49 221 12345000', 'Domplatz 5', 'Köln', '50668', 'Herren- und Damenfriseur in zentraler Lage', 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800', NOW(), NOW()),
('Beauty Lounge Stuttgart', 'beauty_salon', 'info@beauty-lounge-stuttgart.de', '+49 711 55566677', 'Königstraße 60', 'Stuttgart', '70173', 'Nageldesign, Wimpern, Hautpflege', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800', NOW(), NOW()),
('Thai Massage Zen', 'spa', 'zen@thai-massage-zen.de', '+49 30 11122334', 'Kantstraße 90', 'Berlin', '10627', 'Klassische Thai-Massage und Ölmassage', 'https://images.pexels.com/photos/4056723/pexels-photo-4056723.jpeg?auto=compress&w=800', NOW(), NOW()),
('Steakhouse Grill', 'restaurant', 'reservierung@steakhouse-grill.de', '+49 89 44455566', 'Sendlinger Str. 50', 'München', '80331', 'Steaks, Burger und Craft Beer', 'https://images.unsplash.com/photo-1529694157872-4e0c0f3b238b?w=800', NOW(), NOW());

-- ========== USERS (Dashboard-Login) ==========
-- Password für Owner: admin123 (bcrypt)
INSERT INTO users (email, password_hash, name, venue_id, role, created_at) VALUES
('lea@leloluxee-lashes.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Lea', 3, 'owner', NOW()),
('hello@cafe-mokka.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Maria Mokka', 4, 'owner', NOW()),
('info@bar-central.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Tom Bar', 5, 'owner', NOW()),
('info@spa-oase.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Sandra Oase', 6, 'owner', NOW()),
('kontakt@trattoria-roma.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Marco Rossi', 7, 'owner', NOW()),
('info@massage-relax.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Kim Relax', 8, 'owner', NOW()),
('info@wellness-am-see.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Anna See', 11, 'owner', NOW()),
('info@friseur-am-dom.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Lisa Dom', 12, 'owner', NOW()),
('info@beauty-lounge-stuttgart.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Julia Beauty', 13, 'owner', NOW()),
('zen@thai-massage-zen.de', '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG', 'Nong Zen', 14, 'owner', NOW());
-- System-Admin. Passwort: superadmin123
INSERT INTO users (email, password_hash, name, venue_id, role, created_at) VALUES
('admin@simplyseat.de', '$2b$10$vsko22RhtwHvzrEEDivapevJP.XWo.kLNv/nAP81XhmZ0CmwXTAXq', 'Admin', NULL, 'admin', NOW());


-- ========== SERVICES ==========
-- Venue 1: Restaurant
INSERT INTO services (venue_id, name, description, duration_minutes, price, capacity, requires_staff, created_at, updated_at) VALUES
(1, 'Tisch für 2 Personen', 'Gemütlicher Tisch für zwei Personen', 120, 0.00, 2, FALSE, NOW(), NOW()),
(1, 'Tisch für 4 Personen', 'Perfekt für kleine Gruppen', 120, 0.00, 4, FALSE, NOW(), NOW()),
(1, 'Großer Tisch (6-8 Personen)', 'Ideal für Familienfeiern', 150, 0.00, 8, FALSE, NOW(), NOW());

-- Venue 2: Hair Salon – Staff zuerst (für staff_services)
INSERT INTO staff_members (venue_id, name, email, description, created_at, updated_at) VALUES
(2, 'Anna Schmidt', 'anna@salon-schmidt.com', 'Spezialistin für Damenhaarschnitte und Colorationen', NOW(), NOW()),
(2, 'Klaus Meyer', 'klaus@salon-schmidt.com', 'Experte für Herrenschnitte und Bärte', NOW(), NOW()),
(3, 'Lea', 'lea@leloluxee-lashes.de', 'Lashlifting, Browlifting, Zahnschmuck', NOW(), NOW());

INSERT INTO services (venue_id, name, description, duration_minutes, price, capacity, requires_staff, created_at, updated_at) VALUES
(2, 'Herrenhaarschnitt', 'Klassischer Herrenhaarschnitt mit Styling', 45, 35.00, 1, TRUE, NOW(), NOW()),
(2, 'Damenhaarschnitt', 'Schnitt und Styling für Damen', 90, 55.00, 1, TRUE, NOW(), NOW()),
(2, 'Coloration', 'Professionelle Haarfärbung', 180, 95.00, 1, TRUE, NOW(), NOW()),
(3, 'Lashlifting inkl. Färben', 'Wimpernlifting inklusive Färben', 90, 40.00, 1, TRUE, NOW(), NOW()),
(3, 'Lashlifting ohne Färben', 'Wimpernlifting ohne Färben', 75, 35.00, 1, TRUE, NOW(), NOW()),
(3, 'Browlifting', 'Brauenlifting. Extras buchbar: Zupfen/Wachsen +5€, Färben +5€', 45, 35.00, 1, TRUE, NOW(), NOW()),
(3, 'Browlifting Extra: Zupfen/Wachsen', 'Zupfen oder Wachsen der Brauen (als Zusatz zu Browlifting)', 15, 5.00, 1, TRUE, NOW(), NOW()),
(3, 'Browlifting Extra: Färben', 'Färben der Brauen (als Zusatz zu Browlifting)', 15, 5.00, 1, TRUE, NOW(), NOW()),
(3, 'Zahnschmuck', 'Dekorativer Zahnschmuck', 30, 20.00, 1, TRUE, NOW(), NOW());

-- Venue 4: Café Mokka
INSERT INTO services (venue_id, name, description, duration_minutes, price, capacity, requires_staff, created_at, updated_at) VALUES
(4, 'Tisch für 2', 'Kleiner Tisch für zwei', 90, 0.00, 2, FALSE, NOW(), NOW()),
(4, 'Tisch für 4', 'Tisch für kleine Runde', 90, 0.00, 4, FALSE, NOW(), NOW()),
(4, 'Frühstück reservieren', 'Reservierung inkl. Frühstücksmenü', 120, 0.00, 4, FALSE, NOW(), NOW()),
-- Venue 5: Bar Central
(5, 'Tisch für 2', 'Bar-Tisch für zwei', 180, 0.00, 2, FALSE, NOW(), NOW()),
(5, 'Lounge (4–6 Pers.)', 'Lounge-Bereich mit Sofa', 180, 0.00, 6, FALSE, NOW(), NOW()),
-- Venue 6: Spa Oase
(6, 'Sauna & Dampfbad', 'Tageseintritt Sauna und Dampfbad', 240, 35.00, 1, FALSE, NOW(), NOW()),
(6, 'Rückenmassage 60 Min.', 'Klassische Rücken- und Nackenmassage', 60, 75.00, 1, TRUE, NOW(), NOW()),
(6, 'Gesichtsbehandlung', 'Reinigung und Maske', 60, 65.00, 1, TRUE, NOW(), NOW()),
(6, 'Hot Stone Massage', 'Massage mit warmen Steinen', 90, 95.00, 1, TRUE, NOW(), NOW()),
-- Venue 7: Trattoria Roma
(7, 'Tisch für 2', 'Romantischer Tisch für zwei', 120, 0.00, 2, FALSE, NOW(), NOW()),
(7, 'Tisch für 4', 'Tisch für vier', 120, 0.00, 4, FALSE, NOW(), NOW()),
(7, 'Tisch für 6', 'Großer Tisch', 150, 0.00, 6, FALSE, NOW(), NOW()),
-- Venue 8: Massage Relax
(8, 'Thai-Massage 60 Min.', 'Klassische Thai-Massage', 60, 65.00, 1, TRUE, NOW(), NOW()),
(8, 'Thai-Massage 90 Min.', 'Thai-Massage extended', 90, 85.00, 1, TRUE, NOW(), NOW()),
(8, 'Hot Stone 60 Min.', 'Massage mit warmen Steinen', 60, 70.00, 1, TRUE, NOW(), NOW()),
(8, 'Aromatherapie 60 Min.', 'Entspannende Aromamassage', 60, 72.00, 1, TRUE, NOW(), NOW()),
-- Venue 9: Kaffeerösterei Hamburg
(9, 'Tisch für 2', 'Tisch für zwei', 90, 0.00, 2, FALSE, NOW(), NOW()),
(9, 'Tisch für 4', 'Tisch für vier', 90, 0.00, 4, FALSE, NOW(), NOW()),
-- Venue 10: Lounge 21
(10, 'Tisch für 2', 'Rooftop-Tisch für zwei', 180, 0.00, 2, FALSE, NOW(), NOW()),
(10, 'Lounge bis 6 Pers.', 'Lounge-Bereich', 180, 0.00, 6, FALSE, NOW(), NOW()),
-- Venue 11: Wellness am See
(11, 'Sauna-Tag', 'Tageseintritt Sauna & Dampfbad', 300, 32.00, 1, FALSE, NOW(), NOW()),
(11, 'Massage 60 Min.', 'Ganzkörpermassage', 60, 78.00, 1, TRUE, NOW(), NOW()),
(11, 'Gesichtsbehandlung', 'Reinigung, Peeling, Maske', 75, 68.00, 1, TRUE, NOW(), NOW()),
-- Venue 12: Sushi Bar Tokyo
(12, 'Tisch für 2', 'Sushi-Bar für zwei', 90, 0.00, 2, FALSE, NOW(), NOW()),
(12, 'Tisch für 4', 'Tisch für vier', 90, 0.00, 4, FALSE, NOW(), NOW()),
(12, 'Chef\'s Table (6 Pers.)', 'Exklusiver Sushi-Tisch', 120, 0.00, 6, FALSE, NOW(), NOW()),
-- Venue 13: Friseur am Dom
(13, 'Herrenhaarschnitt', 'Schnitt und Styling', 45, 32.00, 1, TRUE, NOW(), NOW()),
(13, 'Damenhaarschnitt', 'Schnitt und Styling', 75, 52.00, 1, TRUE, NOW(), NOW()),
(13, 'Coloration', 'Haarfärbung', 180, 89.00, 1, TRUE, NOW(), NOW()),
-- Venue 14: Beauty Lounge Stuttgart
(14, 'Maniküre Classic', 'Nagelpflege und Lack', 45, 28.00, 1, TRUE, NOW(), NOW()),
(14, 'Pediküre', 'Fußpflege und Lack', 60, 42.00, 1, TRUE, NOW(), NOW()),
(14, 'Wimpernlifting', 'Wimpernlifting inkl. Färben', 75, 45.00, 1, TRUE, NOW(), NOW()),
-- Venue 15: Thai Massage Zen
(15, 'Thai-Massage 60 Min.', 'Klassische Thai-Massage', 60, 58.00, 1, TRUE, NOW(), NOW()),
(15, 'Thai-Massage 90 Min.', 'Thai-Massage 90 Minuten', 90, 78.00, 1, TRUE, NOW(), NOW()),
-- Venue 16: Steakhouse Grill
(16, 'Tisch für 2', 'Steakhouse-Tisch für zwei', 120, 0.00, 2, FALSE, NOW(), NOW()),
(16, 'Tisch für 4', 'Tisch für vier', 120, 0.00, 4, FALSE, NOW(), NOW()),
(16, 'Tisch für 6–8', 'Großer Tisch', 150, 0.00, 8, FALSE, NOW(), NOW());

-- Staff für Venues 6, 8, 11, 13, 14, 15 (Spa, Massage, Wellness, Friseur, Beauty)
INSERT INTO staff_members (venue_id, name, email, description, created_at, updated_at) VALUES
(6, 'Sophie Spa', 'sophie@spa-oase.de', 'Massage und Gesichtsbehandlung', NOW(), NOW()),
(6, 'Markus Wellness', 'markus@spa-oase.de', 'Sauna und Massage', NOW(), NOW()),
(8, 'Ying Thai', 'ying@massage-relax.de', 'Thai-Massage', NOW(), NOW()),
(8, 'Laura Aroma', 'laura@massage-relax.de', 'Aromatherapie und Hot Stone', NOW(), NOW()),
(11, 'Claudia See', 'claudia@wellness-am-see.de', 'Massage', NOW(), NOW()),
(11, 'Stefan See', 'stefan@wellness-am-see.de', 'Gesichtsbehandlung', NOW(), NOW()),
(13, 'Tim Friseur', 'tim@friseur-am-dom.de', 'Herren- und Damenschnitt', NOW(), NOW()),
(13, 'Nina Friseur', 'nina@friseur-am-dom.de', 'Coloration und Styling', NOW(), NOW()),
(14, 'Sandra Beauty', 'sandra@beauty-lounge-stuttgart.de', 'Nagel und Wimpern', NOW(), NOW()),
(14, 'Mia Beauty', 'mia@beauty-lounge-stuttgart.de', 'Haut und Wimpern', NOW(), NOW()),
(15, 'Somsak Thai', 'somsak@thai-massage-zen.de', 'Thai-Massage', NOW(), NOW());

-- ========== STAFF_SERVICES ==========
INSERT INTO staff_services (staff_member_id, service_id, created_at) VALUES
(1, 4, NOW()), (1, 5, NOW()), (1, 6, NOW()),
(2, 4, NOW()),
(3, 7, NOW()), (3, 8, NOW()), (3, 9, NOW()), (3, 10, NOW()), (3, 11, NOW()), (3, 12, NOW()),
-- Spa Oase: Staff 4,5 → Services 18–21
(4, 18, NOW()), (4, 19, NOW()), (4, 20, NOW()), (4, 21, NOW()),
(5, 18, NOW()), (5, 19, NOW()), (5, 21, NOW()),
-- Massage Relax: Staff 6,7 → Services 25–28
(6, 25, NOW()), (6, 26, NOW()), (7, 27, NOW()), (7, 28, NOW()),
-- Wellness am See: Staff 8,9 → Services 33–35
(8, 34, NOW()), (8, 35, NOW()), (9, 33, NOW()), (9, 34, NOW()), (9, 35, NOW()),
-- Friseur am Dom: Staff 10,11 → Services 39–41
(10, 39, NOW()), (10, 40, NOW()), (11, 40, NOW()), (11, 41, NOW()),
-- Beauty Lounge: Staff 12,13 → Services 42–44
(12, 42, NOW()), (12, 43, NOW()), (12, 44, NOW()), (13, 42, NOW()), (13, 44, NOW()),
-- Thai Massage Zen: Staff 14 → Services 45–46
(14, 45, NOW()), (14, 46, NOW());

-- ========== AVAILABILITY RULES ==========
-- Venues: Mo–So oder Di–Sa je nach Typ
INSERT INTO availability_rules (venue_id, day_of_week, start_time, end_time, created_at) VALUES
(1, 1, '17:00', '22:00', NOW()),
(1, 2, '11:30', '22:00', NOW()), (1, 3, '11:30', '22:00', NOW()), (1, 4, '11:30', '22:00', NOW()),
(1, 5, '11:30', '22:00', NOW()), (1, 6, '11:30', '22:00', NOW()), (1, 0, '11:30', '22:00', NOW()),
(4, 1, '08:00', '18:00', NOW()), (4, 2, '08:00', '18:00', NOW()), (4, 3, '08:00', '18:00', NOW()),
(4, 4, '08:00', '18:00', NOW()), (4, 5, '08:00', '18:00', NOW()), (4, 6, '09:00', '16:00', NOW()),
(5, 3, '18:00', '02:00', NOW()), (5, 4, '18:00', '02:00', NOW()), (5, 5, '18:00', '02:00', NOW()),
(5, 6, '18:00', '02:00', NOW()), (5, 0, '18:00', '00:00', NOW()),
(6, 2, '09:00', '21:00', NOW()), (6, 3, '09:00', '21:00', NOW()), (6, 4, '09:00', '21:00', NOW()),
(6, 5, '09:00', '21:00', NOW()), (6, 6, '09:00', '18:00', NOW()),
(7, 2, '12:00', '22:00', NOW()), (7, 3, '12:00', '22:00', NOW()), (7, 4, '12:00', '22:00', NOW()),
(7, 5, '12:00', '22:00', NOW()), (7, 6, '12:00', '22:00', NOW()), (7, 0, '12:00', '21:00', NOW()),
(8, 2, '10:00', '20:00', NOW()), (8, 3, '10:00', '20:00', NOW()), (8, 4, '10:00', '20:00', NOW()),
(8, 5, '10:00', '20:00', NOW()), (8, 6, '10:00', '16:00', NOW()),
(9, 1, '08:00', '18:00', NOW()), (9, 2, '08:00', '18:00', NOW()), (9, 3, '08:00', '18:00', NOW()),
(9, 4, '08:00', '18:00', NOW()), (9, 5, '08:00', '18:00', NOW()), (9, 6, '09:00', '17:00', NOW()),
(10, 4, '19:00', '02:00', NOW()), (10, 5, '19:00', '02:00', NOW()), (10, 6, '19:00', '02:00', NOW()), (10, 0, '19:00', '00:00', NOW()),
(11, 2, '09:00', '21:00', NOW()), (11, 3, '09:00', '21:00', NOW()), (11, 4, '09:00', '21:00', NOW()),
(11, 5, '09:00', '21:00', NOW()), (11, 6, '09:00', '18:00', NOW()),
(12, 2, '12:00', '22:00', NOW()), (12, 3, '12:00', '22:00', NOW()), (12, 4, '12:00', '22:00', NOW()),
(12, 5, '12:00', '22:00', NOW()), (12, 6, '12:00', '22:00', NOW()), (12, 0, '12:00', '21:00', NOW()),
(13, 2, '09:00', '19:00', NOW()), (13, 3, '09:00', '19:00', NOW()), (13, 4, '09:00', '19:00', NOW()),
(13, 5, '09:00', '19:00', NOW()), (13, 6, '09:00', '16:00', NOW()),
(14, 2, '09:00', '18:00', NOW()), (14, 3, '09:00', '18:00', NOW()), (14, 4, '09:00', '18:00', NOW()),
(14, 5, '09:00', '18:00', NOW()), (14, 6, '09:00', '14:00', NOW()),
(15, 2, '10:00', '20:00', NOW()), (15, 3, '10:00', '20:00', NOW()), (15, 4, '10:00', '20:00', NOW()),
(15, 5, '10:00', '20:00', NOW()), (15, 6, '10:00', '16:00', NOW()),
(16, 2, '18:00', '23:00', NOW()), (16, 3, '18:00', '23:00', NOW()), (16, 4, '18:00', '23:00', NOW()),
(16, 5, '18:00', '23:00', NOW()), (16, 6, '18:00', '23:00', NOW()), (16, 0, '12:00', '22:00', NOW());

-- Staff availability (Di–Sa für alle Staff 1–14)
INSERT INTO availability_rules (staff_member_id, day_of_week, start_time, end_time, created_at) VALUES
(1, 2, '09:00', '18:00', NOW()), (1, 3, '09:00', '18:00', NOW()), (1, 4, '09:00', '18:00', NOW()), (1, 5, '09:00', '18:00', NOW()), (1, 6, '09:00', '18:00', NOW()),
(2, 2, '09:00', '18:00', NOW()), (2, 3, '09:00', '18:00', NOW()), (2, 4, '09:00', '18:00', NOW()), (2, 5, '09:00', '18:00', NOW()), (2, 6, '09:00', '18:00', NOW()),
(3, 2, '09:00', '18:00', NOW()), (3, 3, '09:00', '18:00', NOW()), (3, 4, '09:00', '18:00', NOW()), (3, 5, '09:00', '18:00', NOW()), (3, 6, '09:00', '18:00', NOW()),
(4, 2, '09:00', '20:00', NOW()), (4, 3, '09:00', '20:00', NOW()), (4, 4, '09:00', '20:00', NOW()), (4, 5, '09:00', '20:00', NOW()), (4, 6, '09:00', '17:00', NOW()),
(5, 2, '09:00', '20:00', NOW()), (5, 3, '09:00', '20:00', NOW()), (5, 4, '09:00', '20:00', NOW()), (5, 5, '09:00', '20:00', NOW()), (5, 6, '09:00', '17:00', NOW()),
(6, 2, '10:00', '19:00', NOW()), (6, 3, '10:00', '19:00', NOW()), (6, 4, '10:00', '19:00', NOW()), (6, 5, '10:00', '19:00', NOW()), (6, 6, '10:00', '15:00', NOW()),
(7, 2, '10:00', '19:00', NOW()), (7, 3, '10:00', '19:00', NOW()), (7, 4, '10:00', '19:00', NOW()), (7, 5, '10:00', '19:00', NOW()), (7, 6, '10:00', '15:00', NOW()),
(8, 2, '09:00', '20:00', NOW()), (8, 3, '09:00', '20:00', NOW()), (8, 4, '09:00', '20:00', NOW()), (8, 5, '09:00', '20:00', NOW()), (8, 6, '09:00', '17:00', NOW()),
(9, 2, '09:00', '20:00', NOW()), (9, 3, '09:00', '20:00', NOW()), (9, 4, '09:00', '20:00', NOW()), (9, 5, '09:00', '20:00', NOW()), (9, 6, '09:00', '17:00', NOW()),
(10, 2, '09:00', '18:00', NOW()), (10, 3, '09:00', '18:00', NOW()), (10, 4, '09:00', '18:00', NOW()), (10, 5, '09:00', '18:00', NOW()), (10, 6, '09:00', '16:00', NOW()),
(11, 2, '09:00', '18:00', NOW()), (11, 3, '09:00', '18:00', NOW()), (11, 4, '09:00', '18:00', NOW()), (11, 5, '09:00', '18:00', NOW()), (11, 6, '09:00', '16:00', NOW()),
(12, 2, '09:00', '17:00', NOW()), (12, 3, '09:00', '17:00', NOW()), (12, 4, '09:00', '17:00', NOW()), (12, 5, '09:00', '17:00', NOW()), (12, 6, '09:00', '14:00', NOW()),
(13, 2, '09:00', '17:00', NOW()), (13, 3, '09:00', '17:00', NOW()), (13, 4, '09:00', '17:00', NOW()), (13, 5, '09:00', '17:00', NOW()), (13, 6, '09:00', '14:00', NOW()),
(14, 2, '10:00', '19:00', NOW()), (14, 3, '10:00', '19:00', NOW()), (14, 4, '10:00', '19:00', NOW()), (14, 5, '10:00', '19:00', NOW()), (14, 6, '10:00', '15:00', NOW());

-- ========== LOYALTY CONFIG ==========
INSERT INTO loyalty_config (id, booking_completed, booking_with_review, welcome_bonus, email_verified_bonus, points_per_euro)
VALUES (1, 10, 5, 50, 25, 1);

-- ========== CUSTOMERS (Passwort: password123, bcrypt) ==========
INSERT INTO customers (email, password_hash, name, phone, loyalty_points, email_verified, created_at, updated_at) VALUES
('mueller@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Familie Müller', '+49 170 1234567', 120, TRUE, NOW(), NOW()),
('peter@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Peter Schmidt', '+49 171 2223344', 50, TRUE, NOW(), NOW()),
('anna.k@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Anna Keller', '+49 172 3334455', 80, TRUE, NOW(), NOW()),
('max.weber@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Max Weber', NULL, 30, TRUE, NOW(), NOW()),
('lisa.fischer@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Lisa Fischer', '+49 173 4445566', 200, TRUE, NOW(), NOW()),
('tom.braun@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Tom Braun', '+49 174 5556677', 0, FALSE, NOW(), NOW()),
('sarah.wagner@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Sarah Wagner', '+49 175 6667788', 65, TRUE, NOW(), NOW()),
('felix.hoffmann@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Felix Hoffmann', '+49 176 7778899', 140, TRUE, NOW(), NOW()),
('julia.koch@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Julia Koch', '+49 177 8889900', 90, TRUE, NOW(), NOW()),
('david.richter@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'David Richter', NULL, 45, TRUE, NOW(), NOW()),
('maria.schulz@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Maria Schulz', '+49 178 9990011', 110, TRUE, NOW(), NOW()),
('paul.becker@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Paul Becker', '+49 179 0001122', 25, TRUE, NOW(), NOW()),
('laura.schmidt@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Laura Schmidt', '+49 160 1112233', 70, TRUE, NOW(), NOW()),
('michael.maier@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Michael Maier', '+49 161 2223344', 0, TRUE, NOW(), NOW()),
('sophie.berger@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Sophie Berger', '+49 162 3334455', 180, TRUE, NOW(), NOW()),
('christoph.zimmermann@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Christoph Zimmermann', '+49 163 4445566', 55, TRUE, NOW(), NOW()),
('emma.krueger@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Emma Krüger', NULL, 95, TRUE, NOW(), NOW()),
('leon.wolf@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Leon Wolf', '+49 164 5556677', 40, TRUE, NOW(), NOW()),
('hannah.schneider@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Hannah Schneider', '+49 165 6667788', 160, TRUE, NOW(), NOW()),
('noah.meyer@example.com', '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy', 'Noah Meyer', '+49 166 7778899', 75, TRUE, NOW(), NOW());

-- ========== CUSTOMER PREFERENCES ==========
INSERT INTO customer_preferences (customer_id, default_party_size, notification_email, language) VALUES
(1, 4, TRUE, 'de'), (2, 2, TRUE, 'de'), (3, 2, TRUE, 'de'), (5, 2, TRUE, 'de'), (7, 2, TRUE, 'de'),
(8, 2, TRUE, 'en'), (9, 2, TRUE, 'de'), (11, 2, TRUE, 'de'), (15, 2, TRUE, 'de');

-- ========== CUSTOMER FAVORITES ==========
INSERT INTO customer_favorites (customer_id, venue_id) VALUES
(1, 1), (1, 7), (2, 2), (3, 4), (3, 9), (5, 1), (5, 6), (5, 11), (7, 2), (7, 13),
(8, 5), (8, 10), (9, 3), (9, 14), (10, 12), (11, 1), (11, 16), (15, 6), (15, 8), (19, 4), (19, 9);

-- ========== BOOKINGS (Vergangenheit + Zukunft, verschiedene Status) ==========
-- Ohne customer_id (Gastbuchungen) und mit customer_id; einige completed für Reviews
INSERT INTO bookings (booking_token, customer_id, venue_id, service_id, staff_member_id, customer_name, customer_email, customer_phone, booking_date, start_time, end_time, party_size, status, special_requests, total_amount, created_at, updated_at) VALUES
(UUID(), 1, 1, 2, NULL, 'Familie Müller', 'mueller@example.com', '+49 170 1234567', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '19:00', '21:00', 4, 'confirmed', 'Vegetarische Optionen', NULL, NOW(), NOW()),
(UUID(), 2, 2, 4, 2, 'Peter Schmidt', 'peter@example.com', NULL, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00', '10:45', 1, 'pending', NULL, 35.00, NOW(), NOW()),
(UUID(), NULL, 4, 13, NULL, 'Gast Kunde', 'gast@example.com', '+49 170 0000001', DATE_ADD(CURDATE(), INTERVAL 2 DAY), '09:00', '10:30', 2, 'confirmed', NULL, NULL, NOW(), NOW()),
(UUID(), 3, 6, 19, 4, 'Anna Keller', 'anna.k@example.com', '+49 172 3334455', DATE_ADD(CURDATE(), INTERVAL 3 DAY), '14:00', '15:00', 1, 'confirmed', NULL, 75.00, NOW(), NOW()),
(UUID(), 5, 1, 1, NULL, 'Lisa Fischer', 'lisa.fischer@example.com', '+49 173 4445566', DATE_SUB(CURDATE(), INTERVAL 5 DAY), '19:30', '21:30', 2, 'completed', NULL, NULL, NOW(), NOW()),
(UUID(), 5, 2, 5, 1, 'Lisa Fischer', 'lisa.fischer@example.com', '+49 173 4445566', DATE_SUB(CURDATE(), INTERVAL 12 DAY), '11:00', '12:30', 1, 'completed', NULL, 55.00, NOW(), NOW()),
(UUID(), 7, 3, 7, 3, 'Sarah Wagner', 'sarah.wagner@example.com', '+49 175 6667788', DATE_SUB(CURDATE(), INTERVAL 8 DAY), '10:00', '11:30', 1, 'completed', NULL, 40.00, NOW(), NOW()),
(UUID(), 8, 5, 16, NULL, 'Felix Hoffmann', 'felix.hoffmann@example.com', '+49 176 7778899', DATE_SUB(CURDATE(), INTERVAL 3 DAY), '20:00', '23:00', 2, 'completed', NULL, NULL, NOW(), NOW()),
(UUID(), 9, 6, 18, NULL, 'Julia Koch', 'julia.koch@example.com', NULL, DATE_SUB(CURDATE(), INTERVAL 10 DAY), '10:00', '14:00', 1, 'completed', NULL, 35.00, NOW(), NOW()),
(UUID(), 11, 1, 2, NULL, 'Maria Schulz', 'maria.schulz@example.com', '+49 178 9990011', DATE_SUB(CURDATE(), INTERVAL 7 DAY), '12:30', '14:30', 4, 'completed', 'Kinderstuhl', NULL, NOW(), NOW()),
(UUID(), 15, 6, 20, 4, 'Sophie Berger', 'sophie.berger@example.com', '+49 162 3334455', DATE_SUB(CURDATE(), INTERVAL 4 DAY), '16:00', '17:00', 1, 'completed', NULL, 65.00, NOW(), NOW()),
(UUID(), 19, 4, 13, NULL, 'Hannah Schneider', 'hannah.schneider@example.com', '+49 165 6667788', DATE_SUB(CURDATE(), INTERVAL 6 DAY), '09:30', '11:00', 2, 'completed', NULL, NULL, NOW(), NOW()),
(UUID(), 4, 8, 25, 6, 'Max Weber', 'max.weber@example.com', NULL, DATE_ADD(CURDATE(), INTERVAL 4 DAY), '11:00', '12:00', 1, 'confirmed', NULL, 65.00, NOW(), NOW()),
(UUID(), 10, 12, 36, NULL, 'David Richter', 'david.richter@example.com', NULL, DATE_ADD(CURDATE(), INTERVAL 5 DAY), '19:00', '20:30', 2, 'pending', NULL, NULL, NOW(), NOW()),
(UUID(), NULL, 7, 22, NULL, 'Reservierung Gast', 'gast2@example.com', '+49 171 9999999', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '20:00', '22:00', 2, 'confirmed', NULL, NULL, NOW(), NOW()),
(UUID(), 12, 13, 39, 10, 'Paul Becker', 'paul.becker@example.com', '+49 179 0001122', DATE_ADD(CURDATE(), INTERVAL 6 DAY), '15:00', '15:45', 1, 'pending', NULL, 32.00, NOW(), NOW()),
(UUID(), 13, 14, 42, 12, 'Laura Schmidt', 'laura.schmidt@example.com', '+49 160 1112233', DATE_ADD(CURDATE(), INTERVAL 2 DAY), '10:00', '10:45', 1, 'confirmed', NULL, 28.00, NOW(), NOW()),
(UUID(), 16, 15, 45, 14, 'Christoph Zimmermann', 'christoph.zimmermann@example.com', '+49 163 4445566', DATE_SUB(CURDATE(), INTERVAL 2 DAY), '14:00', '15:00', 1, 'completed', NULL, 58.00, NOW(), NOW()),
(UUID(), 18, 11, 34, 8, 'Leon Wolf', 'leon.wolf@example.com', '+49 164 5556677', DATE_SUB(CURDATE(), INTERVAL 9 DAY), '11:00', '12:00', 1, 'completed', NULL, 78.00, NOW(), NOW()),
(UUID(), 20, 16, 47, NULL, 'Noah Meyer', 'noah.meyer@example.com', '+49 166 7778899', DATE_ADD(CURDATE(), INTERVAL 7 DAY), '19:30', '21:30', 2, 'pending', NULL, NULL, NOW(), NOW()),
(UUID(), 1, 7, 22, NULL, 'Familie Müller', 'mueller@example.com', '+49 170 1234567', DATE_ADD(CURDATE(), INTERVAL 10 DAY), '19:00', '21:00', 4, 'confirmed', NULL, NULL, NOW(), NOW()),
(UUID(), 5, 11, 33, NULL, 'Lisa Fischer', 'lisa.fischer@example.com', NULL, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:00', '14:00', 1, 'confirmed', NULL, 32.00, NOW(), NOW()),
(UUID(), NULL, 10, 31, NULL, 'Party Gruppe', 'party@example.com', '+49 30 12345678', DATE_ADD(CURDATE(), INTERVAL 3 DAY), '21:00', '00:00', 6, 'pending', NULL, NULL, NOW(), NOW()),
(UUID(), 14, 2, 4, 2, 'Michael Maier', 'michael.maier@example.com', '+49 161 2223344', DATE_SUB(CURDATE(), INTERVAL 15 DAY), '09:00', '09:45', 1, 'cancelled', NULL, 35.00, NOW(), NOW()),
(UUID(), 17, 9, 29, NULL, 'Emma Krüger', 'emma.krueger@example.com', NULL, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '10:00', '11:30', 2, 'completed', NULL, NULL, NOW(), NOW());

-- ========== REVIEWS (nur für completed Bookings mit customer_id) ==========
-- booking_id 5–12, 18, 19, 23 = completed mit customer_id; wir referenzieren über Subquery
INSERT INTO reviews (customer_id, venue_id, booking_id, rating, comment, is_verified, created_at, updated_at) VALUES
(5, 1, 5, 5, 'Super Abend, sehr lecker!', TRUE, NOW(), NOW()),
(5, 2, 6, 5, 'Anna ist eine tolle Friseurin.', TRUE, NOW(), NOW()),
(7, 3, 7, 4, 'Lashlifting hat gut gehalten.', TRUE, NOW(), NOW()),
(8, 5, 8, 5, 'Coole Bar, tolle Cocktails.', TRUE, NOW(), NOW()),
(9, 6, 9, 4, 'Entspannender Tag im Spa.', TRUE, NOW(), NOW()),
(11, 1, 10, 5, 'Immer wieder gern.', TRUE, NOW(), NOW()),
(15, 6, 11, 5, 'Gesichtsbehandlung war perfekt.', TRUE, NOW(), NOW()),
(19, 4, 12, 4, 'Guter Kaffee und nettes Personal.', TRUE, NOW(), NOW()),
(16, 15, 18, 5, 'Sehr professionelle Thai-Massage.', TRUE, NOW(), NOW()),
(18, 11, 19, 4, 'Wellness am See – empfehlenswert.', TRUE, NOW(), NOW()),
(17, 9, 23, 5, 'Bestes Frühstück in Hamburg!', TRUE, NOW(), NOW());

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Seed data created successfully!' AS message;
SELECT 'Customers: Passwort aller Test-Kunden = password123' AS login_info;
SELECT 'Admin Dashboard: admin@simplyseat.de / superadmin123' AS admin_info;
SELECT 'Venue-Typen: restaurant, hair_salon, beauty_salon, cafe, bar, spa, other' AS venue_types;