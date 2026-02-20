/**
 * Generates seed.sql with 100+ venues in top German cities and scaled bookings/reviews.
 * Run: node scripts/generate-seed.js
 * Output: src/config/database/seed.sql
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../src/config/database/seed.sql');

// Top German cities (name, postal_prefix, lat, lng)
const CITIES = [
  ['Berlin', '10', 52.520008, 13.404954],
  ['Hamburg', '20', 53.551086, 9.993682],
  ['München', '80', 48.135124, 11.581981],
  ['Köln', '50', 50.937531, 6.960279],
  ['Frankfurt am Main', '60', 50.110924, 8.682127],
  ['Stuttgart', '70', 48.775846, 9.182932],
  ['Düsseldorf', '40', 51.227741, 6.773456],
  ['Dortmund', '44', 51.513587, 7.465298],
  ['Essen', '45', 51.455643, 7.011555],
  ['Leipzig', '04', 51.339695, 12.373075],
  ['Bremen', '28', 53.079296, 8.801694],
  ['Dresden', '01', 51.050409, 13.737262],
  ['Hannover', '30', 52.375892, 9.732010],
  ['Nürnberg', '90', 49.452102, 11.076665],
  ['Bonn', '53', 50.737430, 7.098207],
  ['Mannheim', '68', 49.487459, 8.466039],
  ['Wiesbaden', '65', 50.082513, 8.240111],
  ['Kiel', '24', 54.323293, 10.122765],
  ['Münster', '48', 51.960665, 7.626135],
  ['Karlsruhe', '76', 49.006890, 8.403653],
  ['Augsburg', '86', 48.370545, 10.897790],
  ['Mönchengladbach', '41', 51.195265, 6.441624],
  ['Braunschweig', '38', 52.268874, 10.526770],
  ['Kiel', '24', 54.323293, 10.122765],
  ['Aachen', '52', 50.775346, 6.083887],
  ['Freiburg im Breisgau', '79', 47.999008, 7.842104],
  ['Halle (Saale)', '06', 51.496346, 11.968755],
  ['Magdeburg', '39', 52.120533, 11.627624],
  ['Neu-Isenburg', '63', 50.050000, 8.690000],
];

const VENUE_TYPES = ['restaurant', 'hair_salon', 'beauty_salon', 'cafe', 'bar', 'spa'];
const TYPE_NAMES = {
  restaurant: ['Bella Vista', 'Trattoria', 'Steakhouse', 'Sushi Bar', 'Gasthaus', 'Bistro', 'Brasserie', 'Weinstube', 'Ristorante', 'Grill'],
  hair_salon: ['Salon', 'Friseur', 'Haarstudio', 'Cut & Style', 'Haar Atelier', 'Style House', 'Hair Lounge', 'Coiffeur'],
  beauty_salon: ['Beauty Lounge', 'Nail Art', 'Lashes & Brows', 'Kosmetik', 'Beauty Studio', 'Lash Bar', 'Nagelstudio'],
  cafe: ['Café', 'Kaffeebar', 'Rösterei', 'Konditorei', 'Coffee Bar', 'Bäckerei Café', 'Espresso'],
  bar: ['Bar', 'Lounge', 'Cocktail Bar', 'Pub', 'Sky Bar', 'Wine Bar', 'Tapas Bar'],
  spa: ['Spa', 'Wellness', 'Massage', 'Thai Massage', 'Sauna', 'Wellness Oase', 'Relax'],
};

const IMAGES = {
  restaurant: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
  hair_salon: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
  beauty_salon: 'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=800',
  cafe: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
  bar: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800',
  spa: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
};

function sqlEscape(s) {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function* venueRows(targetCount) {
  let id = 0;
  let emailIndex = {};
  for (let i = 0; i < targetCount; i++) {
    const city = CITIES[i % CITIES.length];
    const [cityName, postalPrefix, lat, lng] = city;
    const type = VENUE_TYPES[i % VENUE_TYPES.length];
    const names = TYPE_NAMES[type];
    const baseName = names[i % names.length];
    const name = `${baseName} ${cityName}`.substring(0, 200);
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    let email = `venue-${id + 1}-${slug.substring(0, 20)}@seed.simplyseat.de`;
    while (emailIndex[email]) {
      email = `venue-${id + 1}-${slug}-${Object.keys(emailIndex).length}@seed.simplyseat.de`;
    }
    emailIndex[email] = true;
    id++;
    const postal = postalPrefix + String(100 + (i % 900)).padStart(3, '0');
    const desc = `Anbieter in ${cityName} – gebucht über SimplySeat.`;
    const img = IMAGES[type];
    yield { name, type, email, city: cityName, postal, lat, lng, desc, img };
  }
}

function* serviceRows(venues, servicesByType) {
  let serviceId = 0;
  for (const v of venues) {
    const list = servicesByType[v.type] || servicesByType.other;
    for (const s of list) {
      serviceId++;
      yield { venue_id: v.id, service_id: serviceId, ...s };
    }
  }
}

// Service templates per type: { name, description, duration_minutes, price, capacity, requires_staff }
const SERVICES_BY_TYPE = {
  restaurant: [
    { name: 'Tisch für 2', description: 'Tisch für zwei Personen', duration_minutes: 120, price: 0, capacity: 2, requires_staff: false },
    { name: 'Tisch für 4', description: 'Tisch für vier', duration_minutes: 120, price: 0, capacity: 4, requires_staff: false },
    { name: 'Tisch für 6', description: 'Großer Tisch', duration_minutes: 150, price: 0, capacity: 6, requires_staff: false },
  ],
  hair_salon: [
    { name: 'Herrenhaarschnitt', description: 'Schnitt und Styling', duration_minutes: 45, price: 32, capacity: 1, requires_staff: true },
    { name: 'Damenhaarschnitt', description: 'Schnitt und Styling', duration_minutes: 75, price: 52, capacity: 1, requires_staff: true },
    { name: 'Coloration', description: 'Haarfärbung', duration_minutes: 180, price: 89, capacity: 1, requires_staff: true },
  ],
  beauty_salon: [
    { name: 'Maniküre', description: 'Nagelpflege und Lack', duration_minutes: 45, price: 28, capacity: 1, requires_staff: true },
    { name: 'Wimpernlifting', description: 'Lashlifting inkl. Färben', duration_minutes: 75, price: 42, capacity: 1, requires_staff: true },
    { name: 'Brauen', description: 'Browlifting', duration_minutes: 45, price: 35, capacity: 1, requires_staff: true },
  ],
  cafe: [
    { name: 'Tisch für 2', description: 'Kleiner Tisch', duration_minutes: 90, price: 0, capacity: 2, requires_staff: false },
    { name: 'Tisch für 4', description: 'Tisch für vier', duration_minutes: 90, price: 0, capacity: 4, requires_staff: false },
  ],
  bar: [
    { name: 'Tisch für 2', description: 'Bar-Tisch', duration_minutes: 180, price: 0, capacity: 2, requires_staff: false },
    { name: 'Lounge (4–6)', description: 'Lounge-Bereich', duration_minutes: 180, price: 0, capacity: 6, requires_staff: false },
  ],
  spa: [
    { name: 'Sauna-Tag', description: 'Tageseintritt Sauna', duration_minutes: 240, price: 32, capacity: 1, requires_staff: false },
    { name: 'Massage 60 Min.', description: 'Ganzkörpermassage', duration_minutes: 60, price: 72, capacity: 1, requires_staff: true },
    { name: 'Thai-Massage 60 Min.', description: 'Klassische Thai-Massage', duration_minutes: 60, price: 58, capacity: 1, requires_staff: true },
  ],
  other: [
    { name: 'Standard', description: 'Buchung', duration_minutes: 60, price: 0, capacity: 1, requires_staff: false },
  ],
};

const NUM_VENUES = 120;
const NUM_CUSTOMERS = 150;
const NUM_BOOKINGS = 800;
const PASSWORD_HASH = '$2b$10$rQnM1.HVvO2PAG/VQ5cYCOYz6TtxMQJqhN8/X4.G4jLqH8vQ5KqOy'; // password123
const ADMIN_HASH = '$2b$10$vsko22RhtwHvzrEEDivapevJP.XWo.kLNv/nAP81XhmZ0CmwXTAXq'; // superadmin123
const OWNER_HASH = '$2b$10$EmCeYQvUi/PQvlyGpPAc4ubFhQTop112TrRl2G9ejfc8VVN4rxFiG'; // admin123

function main() {
  const venues = [...venueRows(NUM_VENUES)].map((v, i) => ({ id: i + 1, ...v }));

  // Build service list per venue for IDs
  const allServices = [];
  let sid = 0;
  for (const v of venues) {
    const list = SERVICES_BY_TYPE[v.type] || SERVICES_BY_TYPE.other;
    for (const s of list) {
      sid++;
      allServices.push({ id: sid, venue_id: v.id, ...s });
    }
  }

  const staffVenueTypes = ['hair_salon', 'beauty_salon', 'spa'];
  const staffList = [];
  let staffId = 0;
  for (const v of venues) {
    if (!staffVenueTypes.includes(v.type)) continue;
    const numStaff = 1 + (v.id % 2);
    for (let i = 0; i < numStaff; i++) {
      staffId++;
      staffList.push({ id: staffId, venue_id: v.id, name: `Mitarbeiter ${staffId}` });
    }
  }

  // Staff-services: assign staff to requires_staff services of their venue
  const staffByVenue = {};
  for (const s of staffList) {
    if (!staffByVenue[s.venue_id]) staffByVenue[s.venue_id] = [];
    staffByVenue[s.venue_id].push(s.id);
  }
  const staffServicesList = [];
  for (const svc of allServices) {
    if (!svc.requires_staff) continue;
    const staffIds = staffByVenue[svc.venue_id];
    if (!staffIds || staffIds.length === 0) continue;
    for (const sid of staffIds) {
      staffServicesList.push({ staff_member_id: sid, service_id: svc.id });
    }
  }

  const lines = [];

  lines.push(`-- MySQL Seed Data for SimplySeat (generated – ${NUM_VENUES} venues, ${allServices.length} services, ${staffList.length} staff, ${NUM_CUSTOMERS} customers, ${NUM_BOOKINGS} bookings)`);
  lines.push('USE simplyseatdb;');
  lines.push('');
  lines.push('SET FOREIGN_KEY_CHECKS = 0;');
  lines.push('');
  lines.push('DELETE FROM booking_audit_log;');
  lines.push('DELETE FROM reviews;');
  lines.push('DELETE FROM loyalty_transactions;');
  lines.push('DELETE FROM customer_favorites;');
  lines.push('DELETE FROM customer_preferences;');
  lines.push('DELETE FROM bookings;');
  lines.push('DELETE FROM availability_rules;');
  lines.push('DELETE FROM staff_services;');
  lines.push('DELETE FROM services;');
  lines.push('DELETE FROM staff_members;');
  lines.push('DELETE FROM users;');
  lines.push('DELETE FROM venues;');
  lines.push('DELETE FROM customers;');
  lines.push('DELETE FROM loyalty_config;');
  lines.push('');
  lines.push('ALTER TABLE venues AUTO_INCREMENT = 1;');
  lines.push('ALTER TABLE staff_members AUTO_INCREMENT = 1;');
  lines.push('ALTER TABLE services AUTO_INCREMENT = 1;');
  lines.push('ALTER TABLE staff_services AUTO_INCREMENT = 1;');
  lines.push('ALTER TABLE availability_rules AUTO_INCREMENT = 1;');
  lines.push('ALTER TABLE users AUTO_INCREMENT = 1;');
  lines.push('ALTER TABLE bookings AUTO_INCREMENT = 1;');
  lines.push('ALTER TABLE customers AUTO_INCREMENT = 1;');
  lines.push('ALTER TABLE reviews AUTO_INCREMENT = 1;');
  lines.push('');

  // VENUES
  lines.push('-- ========== VENUES ==========');
  const venueValues = venues.map(v =>
    `(${sqlEscape(v.name)}, ${sqlEscape(v.type)}, ${sqlEscape(v.email)}, '+49 30 1234567', ${sqlEscape(v.name + ' 1')}, ${sqlEscape(v.city)}, ${sqlEscape(v.postal)}, ${sqlEscape(v.desc)}, ${sqlEscape(v.img)}, ${v.lat}, ${v.lng}, NOW(), NOW())`
  ).join(',\n');
  lines.push(`INSERT INTO venues (name, type, email, phone, address, city, postal_code, description, image_url, latitude, longitude, created_at, updated_at) VALUES\n${venueValues};`);
  lines.push('');

  // USERS: one owner per venue + admin
  lines.push('-- ========== USERS (Owner pro Venue, Passwort admin123) ==========');
  const userValues = venues.map(v =>
    `(${sqlEscape(v.email)}, ${sqlEscape(OWNER_HASH)}, ${sqlEscape('Owner ' + v.id)}, ${v.id}, 'owner', NOW())`
  ).join(',\n');
  lines.push(`INSERT INTO users (email, password_hash, name, venue_id, role, created_at) VALUES\n${userValues};`);
  lines.push(`INSERT INTO users (email, password_hash, name, venue_id, role, created_at) VALUES\n('admin@simplyseat.de', ${sqlEscape(ADMIN_HASH)}, 'Admin', NULL, 'admin', NOW());`);
  lines.push('');

  // SERVICES
  lines.push('-- ========== SERVICES ==========');
  const chunk = 50;
  for (let i = 0; i < allServices.length; i += chunk) {
    const part = allServices.slice(i, i + chunk);
    const vals = part.map(s =>
      `(${s.venue_id}, ${sqlEscape(s.name)}, ${sqlEscape(s.description)}, ${s.duration_minutes}, ${s.price}, ${s.capacity}, ${s.requires_staff ? 'TRUE' : 'FALSE'}, NOW(), NOW())`
    ).join(',\n');
    lines.push(`INSERT INTO services (venue_id, name, description, duration_minutes, price, capacity, requires_staff, created_at, updated_at) VALUES\n${vals};`);
  }
  lines.push('');

  // STAFF
  lines.push('-- ========== STAFF MEMBERS ==========');
  const staffChunk = 40;
  for (let i = 0; i < staffList.length; i += staffChunk) {
    const part = staffList.slice(i, i + staffChunk);
    const vals = part.map(s =>
      `(${s.venue_id}, ${sqlEscape(s.name)}, ${sqlEscape('staff' + s.id + '@seed.simplyseat.de')}, NULL, NOW(), NOW())`
    ).join(',\n');
    lines.push(`INSERT INTO staff_members (venue_id, name, email, description, created_at, updated_at) VALUES\n${vals};`);
  }
  lines.push('');

  // STAFF_SERVICES
  lines.push('-- ========== STAFF_SERVICES ==========');
  for (let i = 0; i < staffServicesList.length; i += 100) {
    const part = staffServicesList.slice(i, i + 100);
    const vals = part.map(ss => `(${ss.staff_member_id}, ${ss.service_id}, NOW())`).join(',\n');
    lines.push(`INSERT INTO staff_services (staff_member_id, service_id, created_at) VALUES\n${vals};`);
  }
  lines.push('');

  // AVAILABILITY RULES (venue-level): venue_id set, staff_member_id NULL
  lines.push('-- ========== AVAILABILITY RULES (Venues) ==========');
  const venueRuleRows = [];
  for (const v of venues) {
    const days = ['restaurant', 'cafe', 'bar'].includes(v.type) ? [1, 2, 3, 4, 5, 6, 0] : [2, 3, 4, 5, 6];
    for (const d of days) {
      const [start, end] = v.type === 'bar' ? ['18:00', '02:00'] : ['09:00', '20:00'];
      venueRuleRows.push(`(${v.id}, NULL, ${d}, '${start}', '${end}', NOW())`);
    }
  }
  for (let i = 0; i < venueRuleRows.length; i += 80) {
    const part = venueRuleRows.slice(i, i + 80);
    lines.push(`INSERT INTO availability_rules (venue_id, staff_member_id, day_of_week, start_time, end_time, created_at) VALUES\n${part.join(',\n')};`);
  }
  lines.push('');

  // Staff availability: venue_id NULL, staff_member_id set
  lines.push('-- ========== AVAILABILITY RULES (Staff) ==========');
  const staffRuleRows = staffList.flatMap(s =>
    [2, 3, 4, 5, 6].map(d => `(NULL, ${s.id}, ${d}, '09:00', '18:00', NOW())`)
  );
  for (let i = 0; i < staffRuleRows.length; i += 100) {
    const part = staffRuleRows.slice(i, i + 100);
    lines.push(`INSERT INTO availability_rules (venue_id, staff_member_id, day_of_week, start_time, end_time, created_at) VALUES\n${part.join(',\n')};`);
  }
  lines.push('');

  // LOYALTY
  lines.push('INSERT INTO loyalty_config (id, booking_completed, booking_with_review, welcome_bonus, email_verified_bonus, points_per_euro) VALUES (1, 10, 5, 50, 25, 1);');
  lines.push('');

  // CUSTOMERS
  lines.push('-- ========== CUSTOMERS (Passwort: password123) ==========');
  const customerRows = [];
  for (let i = 1; i <= NUM_CUSTOMERS; i++) {
    const email = `kunde${i}@example.com`;
    const name = `Kunde ${i}`;
    const points = Math.floor(Math.random() * 200);
    customerRows.push(`(${sqlEscape(email)}, ${sqlEscape(PASSWORD_HASH)}, ${sqlEscape(name)}, ${i <= NUM_CUSTOMERS / 2 ? sqlEscape('+49 170 ' + String(1000000 + i).padStart(7, '0')) : 'NULL'}, ${points}, TRUE, NOW(), NOW())`);
  }
  for (let i = 0; i < customerRows.length; i += 30) {
    const part = customerRows.slice(i, i + 30);
    lines.push(`INSERT INTO customers (email, password_hash, name, phone, loyalty_points, email_verified, created_at, updated_at) VALUES\n${part.join(',\n')};`);
  }
  lines.push('');

  // CUSTOMER PREFERENCES (subset)
  const prefs = [];
  for (let cid = 1; cid <= Math.min(80, NUM_CUSTOMERS); cid += 2) {
    prefs.push(`(${cid}, 2, TRUE, 'de')`);
  }
  for (let i = 0; i < prefs.length; i += 50) {
    lines.push(`INSERT INTO customer_preferences (customer_id, default_party_size, notification_email, language) VALUES\n${prefs.slice(i, i + 50).join(',\n')};`);
  }
  lines.push('');

  // CUSTOMER FAVORITES (each customer 1-3 random venues)
  const favs = [];
  for (let cid = 1; cid <= NUM_CUSTOMERS; cid++) {
    const n = 1 + (cid % 3);
    const used = new Set();
    for (let j = 0; j < n; j++) {
      const vid = 1 + (cid * 7 + j * 11) % NUM_VENUES;
      if (!used.has(vid)) { used.add(vid); favs.push(`(${cid}, ${vid})`); }
    }
  }
  for (let i = 0; i < favs.length; i += 80) {
    lines.push(`INSERT INTO customer_favorites (customer_id, venue_id) VALUES\n${favs.slice(i, i + 80).join(',\n')};`);
  }
  lines.push('');

  // BOOKINGS: mix of past (completed) and future (confirmed/pending), some cancelled
  lines.push('-- ========== BOOKINGS ==========');
  const statuses = ['completed', 'completed', 'completed', 'confirmed', 'confirmed', 'pending', 'cancelled'];
  const bookingRows = [];
  for (let b = 0; b < NUM_BOOKINGS; b++) {
    const venue = venues[b % venues.length];
    const venueServices = allServices.filter(s => s.venue_id === venue.id);
    if (venueServices.length === 0) continue;
    const service = venueServices[b % venueServices.length];
    const staffForVenue = staffList.filter(s => s.venue_id === venue.id);
    const serviceNeedsStaff = service.requires_staff;
    let staffId = null;
    if (serviceNeedsStaff && staffForVenue.length > 0) {
      staffId = staffForVenue[b % staffForVenue.length].id;
    }
    const customerId = 1 + (b % NUM_CUSTOMERS);
    const status = statuses[b % statuses.length];
    const daysOffset = status === 'cancelled' ? -30 - (b % 60) : status === 'completed' ? -1 - (b % 90) : 1 + (b % 60);
    const bookingDate = `DATE_ADD(CURDATE(), INTERVAL ${daysOffset} DAY)`;
    const startTime = ['09:00', '10:00', '11:00', '14:00', '15:00', '18:00', '19:00', '20:00'][b % 8];
    const endTime = '22:00';
    const partySize = service.capacity >= 2 ? Math.min(2 + (b % 4), service.capacity) : 1;
    const totalAmount = service.price && service.price > 0 ? service.price : 'NULL';
    bookingRows.push(`(UUID(), ${customerId}, ${venue.id}, ${service.id}, ${staffId || 'NULL'}, ${sqlEscape('Kunde ' + customerId)}, ${sqlEscape('kunde' + customerId + '@example.com')}, NULL, ${bookingDate}, ${sqlEscape(startTime)}, ${sqlEscape(endTime)}, ${partySize}, ${sqlEscape(status)}, NULL, ${totalAmount}, NOW(), NOW())`);
  }
  for (let i = 0; i < bookingRows.length; i += 60) {
    const part = bookingRows.slice(i, i + 60);
    lines.push(`INSERT INTO bookings (booking_token, customer_id, venue_id, service_id, staff_member_id, customer_name, customer_email, customer_phone, booking_date, start_time, end_time, party_size, status, special_requests, total_amount, created_at, updated_at) VALUES\n${part.join(',\n')};`);
  }
  lines.push('');

  // REVIEWS: for completed bookings we need booking_id. We don't have booking IDs in generator (auto_increment). So we need to either use a subquery or generate reviews in a second pass. Easiest: use a stored procedure or insert reviews with a subquery that selects completed bookings. So: INSERT INTO reviews (customer_id, venue_id, booking_id, rating, comment, is_verified, created_at, updated_at) SELECT b.customer_id, b.venue_id, b.id, 4+FLOOR(RAND()*2), 'Toll!', TRUE, NOW(), NOW() FROM bookings b WHERE b.status = 'completed' AND b.customer_id IS NOT NULL LIMIT 500; But that might not give deterministic seed. Better: generate bookings with deterministic ordering so booking id 1,2,3... correspond to our rows. After INSERT bookings, first booking has id 1, second id 2, etc. So we can assume booking_id = row index (1-based). So first 60 bookings get ids 1..60, next 60 get 61..120, etc. So booking at index i has id = i+1. So for each booking row we can compute booking_id = i+1 (global index). Let's add to booking generation a booking_id_after_insert: we don't know exact id if we chunk. So we use a subquery for reviews: insert reviews for each (customer_id, venue_id, booking_id) where we get booking_id from (SELECT id FROM bookings WHERE status='completed' AND customer_id IS NOT NULL ORDER BY id LIMIT N). That gives non-deterministic order. Simplest: generate one big INSERT for bookings so IDs are 1..NUM_BOOKINGS, then for reviews we reference booking_id 1..NUM_BOOKINGS where status=completed. So we need to know which booking indices are completed. In our loop we set status = statuses[b % statuses.length], so roughly 3/7 completed. So completed booking indices are those where b % 7 in [0,1,2]. So we can generate review rows with booking_id = (some index that is completed). Actually the safest is: after all booking INSERTs, run INSERT INTO reviews (customer_id, venue_id, booking_id, rating, comment, is_verified, created_at, updated_at) SELECT customer_id, venue_id, id, 4+FLOOR(RAND()*2), 'Super Erfahrung!', TRUE, NOW(), NOW() FROM bookings WHERE status = 'completed' AND customer_id IS NOT NULL; That way we get one review per completed booking. Let me do that in the generator so we output that SQL.
  lines.push('-- ========== REVIEWS (eine pro abgeschlossener Buchung mit Kunde) ==========');
  lines.push(`INSERT INTO reviews (customer_id, venue_id, booking_id, rating, comment, is_verified, created_at, updated_at)`);
  lines.push(`SELECT customer_id, venue_id, id, 4 + FLOOR(RAND() * 2), 'Super Erfahrung, gerne wieder!', TRUE, NOW(), NOW() FROM bookings WHERE status = 'completed' AND customer_id IS NOT NULL;`);
  lines.push('');

  lines.push('SET FOREIGN_KEY_CHECKS = 1;');
  lines.push('');
  lines.push("SELECT 'Seed data created successfully!' AS message;");
  lines.push("SELECT 'Customers: Passwort = password123' AS login_info;");
  lines.push("SELECT 'Admin: admin@simplyseat.de / superadmin123' AS admin_info;");

  const finalOut = lines.join('\n');
  fs.writeFileSync(OUT, finalOut, 'utf8');
  console.log('Written', OUT);
}

main();
