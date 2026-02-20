/**
 * Transformiert die bestehende seed.sql: echte Namen, jeder Venue einen Owner als Staff (user_id),
 * Staff-Mitarbeiter mit echten Namen, Kunden mit echten Namen, viele unterschiedliche Bewertungen.
 * Keine Migrationen – alles nur Schema + Seed.
 * Run: node scripts/transform-seed-to-real-data.js
 */

const fs = require('fs');
const path = require('path');

const SEED_PATH = path.join(__dirname, '../src/config/database/seed.sql');

// 120 echte deutsche Namen für Venue-Owner (Vorname Nachname)
const OWNER_NAMES = [
  'Markus Weber', 'Sandra Hoffmann', 'Thomas Schmidt', 'Anna Müller', 'Michael Fischer',
  'Julia Becker', 'Stefan Wagner', 'Laura Schulz', 'Daniel Koch', 'Christina Richter',
  'Andreas Klein', 'Jennifer Wolf', 'Peter Schröder', 'Sabine Neumann', 'Christian Schwarz',
  'Katharina Zimmermann', 'Martin Braun', 'Susanne Krüger', 'Frank Hartmann', 'Nicole Lange',
  'Uwe Werner', 'Melanie Schmitt', 'Bernd Köhler', 'Patricia Fuchs', 'Oliver Meyer',
  'Sandra Bauer', 'Matthias Becker', 'Claudia Hoffmann', 'Jens Wagner', 'Birgit Schulz',
  'Thorsten Schneider', 'Anja Fischer', 'Sven Müller', 'Petra Weber', 'Ralf Schmidt',
  'Silke Klein', 'Dirk Neumann', 'Tanja Wolf', 'Marco Richter', 'Nadine Braun',
  'Carsten Lange', 'Stephanie Hartmann', 'René Werner', 'Andrea Schmitt', 'Guido Bauer',
  'Sandra Koch', 'Holger Meyer', 'Julia Neumann', 'Alexander Becker', 'Kathrin Wagner',
  'Tobias Schulz', 'Martina Fischer', 'Sebastian Müller', 'Christina Weber', 'Dennis Schmidt',
  'Sabrina Klein', 'Patrick Wolf', 'Vanessa Richter', 'Dominik Braun', 'Laura Hartmann',
  'Philipp Werner', 'Jennifer Schmitt', 'Marcel Bauer', 'Nicole Meyer', 'Fabian Koch',
  'Stefanie Becker', 'Alexander Neumann', 'Daniel Wagner', 'Sandra Schulz', 'Christian Fischer',
  'Anna Weber', 'Michael Schmidt', 'Julia Klein', 'Thomas Wolf', 'Katharina Richter',
  'Stefan Braun', 'Laura Hartmann', 'Andreas Werner', 'Christina Schmitt', 'Peter Bauer',
  'Sabine Meyer', 'Daniel Koch', 'Claudia Becker', 'Frank Neumann', 'Melanie Wagner',
  'Uwe Schulz', 'Birgit Fischer', 'Thorsten Müller', 'Anja Weber', 'Sven Schmidt',
  'Petra Klein', 'Ralf Wolf', 'Silke Richter', 'Dirk Braun', 'Tanja Hartmann',
  'Marco Werner', 'Nadine Schmitt', 'Carsten Bauer', 'Stephanie Meyer', 'René Koch',
  'Andrea Becker', 'Guido Neumann', 'Sandra Wagner', 'Holger Schulz', 'Julia Fischer',
  'Alexander Müller', 'Kathrin Weber', 'Tobias Schmidt', 'Martina Klein', 'Sebastian Wolf',
  'Christina Richter', 'Dennis Braun', 'Sabrina Hartmann', 'Patrick Werner', 'Vanessa Schmitt',
  'Dominik Bauer', 'Laura Meyer', 'Philipp Koch', 'Jennifer Becker', 'Marcel Neumann',
  'Nicole Wagner', 'Fabian Schulz', 'Stefanie Fischer', 'Alexander Müller', 'Daniel Weber',
];

// 80 echte Namen für zusätzliche Staff-Mitarbeiter (Friseure, Kosmetiker, Masseure etc.)
const STAFF_NAMES = [
  'Anna Müller', 'Tom Schneider', 'Lisa Bergmann', 'Felix Krause', 'Sophie Lehmann',
  'Max Hoffmann', 'Lena Wolf', 'Paul Richter', 'Emma Schäfer', 'Jonas Zimmermann',
  'Mia Becker', 'Leon Braun', 'Hannah Koch', 'Finn Wagner', 'Lina Schröder',
  'Erik Neumann', 'Clara Mayer', 'Noah Fuchs', 'Laura Keller', 'Ben Hartmann',
  'Julia Schmitt', 'Lukas Werner', 'Sarah Lange', 'Tim Schuster', 'Nina Krause',
  'Jan Becker', 'Katharina Wolf', 'Moritz Richter', 'Christina Schulz', 'David Fischer',
  'Sandra Meyer', 'Simon Koch', 'Jennifer Wagner', 'Philipp Neumann', 'Melanie Bauer',
  'Sebastian Schmidt', 'Stefanie Klein', 'Tobias Hoffmann', 'Andrea Wolf', 'Daniel Richter',
  'Nicole Becker', 'Michael Schulz', 'Sabine Fischer', 'Andreas Wagner', 'Petra Neumann',
  'Markus Bauer', 'Birgit Schmidt', 'Thomas Klein', 'Claudia Hoffmann', 'Frank Wolf',
  'Susanne Richter', 'Stefan Becker', 'Monika Schulz', 'Peter Fischer', 'Renate Wagner',
  'Uwe Neumann', 'Helga Bauer', 'Wolfgang Schmidt', 'Gisela Klein', 'Klaus Hoffmann',
  'Ingrid Wolf', 'Jürgen Richter', 'Margot Becker', 'Horst Schulz', 'Elisabeth Fischer',
  'Dieter Wagner', 'Marianne Neumann', 'Hans Bauer', 'Ruth Schmidt', 'Karl Klein',
  'Hildegard Hoffmann', 'Werner Wolf', 'Gerda Richter', 'Helmut Becker', 'Irmgard Schulz',
];

// 150 Kunden-Namen
const CUSTOMER_NAMES = [
  'Lisa Meyer', 'Paul Weber', 'Sophie Schmidt', 'Finn Müller', 'Emma Fischer', 'Jonas Wagner',
  'Mia Becker', 'Leon Schulz', 'Hannah Koch', 'Lukas Richter', 'Lina Hoffmann', 'Felix Wolf',
  'Anna Neumann', 'Max Braun', 'Laura Schneider', 'Tim Krause', 'Julia Lehmann', 'Noah Hartmann',
  'Clara Schmitt', 'Erik Werner', 'Sarah Lange', 'Jan Schuster', 'Nina Fuchs', 'David Keller',
  'Katharina Mayer', 'Moritz Zimmermann', 'Melanie Becker', 'Simon Wolf', 'Stefanie Richter',
  'Tobias Schulz', 'Jennifer Fischer', 'Andreas Wagner', 'Sabine Neumann', 'Michael Bauer',
  'Petra Schmidt', 'Thomas Klein', 'Claudia Hoffmann', 'Frank Becker', 'Nicole Wolf',
  'Daniel Richter', 'Christina Schulz', 'Markus Fischer', 'Sandra Wagner', 'Stefan Neumann',
  'Birgit Bauer', 'Peter Schmidt', 'Monika Klein', 'Uwe Hoffmann', 'Susanne Becker',
  'Wolfgang Wolf', 'Renate Richter', 'Klaus Schulz', 'Helga Fischer', 'Jürgen Wagner',
  'Ingrid Neumann', 'Horst Bauer', 'Margot Schmidt', 'Dieter Klein', 'Marianne Hoffmann',
  'Hans Becker', 'Ruth Wolf', 'Karl Richter', 'Gerda Schulz', 'Helmut Fischer', 'Irmgard Wagner',
  'Werner Neumann', 'Gisela Bauer', 'Elisabeth Schmidt', 'Heinz Klein', 'Maria Hoffmann',
  'Friedrich Becker', 'Barbara Wolf', 'Walter Richter', 'Christa Schulz', 'Georg Fischer',
  'Karin Wagner', 'Erich Neumann', 'Ute Bauer', 'Rolf Schmidt', 'Hildegard Klein',
  'Bruno Hoffmann', 'Erika Becker', 'Alfred Wolf', 'Inge Richter', 'Herbert Schulz',
  'Waltraud Fischer', 'Günter Wagner', 'Rosemarie Neumann', 'Willi Bauer', 'Brigitte Schmidt',
  'Heinrich Klein', 'Edith Hoffmann', 'Otto Becker', 'Helene Wolf', 'Frieda Richter',
  'Johann Schulz', 'Agnes Fischer', 'Anton Wagner', 'Margarete Neumann', 'Franz Bauer',
  'Theresa Schmidt', 'Joseph Klein', 'Cäcilia Hoffmann', 'Vinzenz Becker', 'Elisabeth Wolf',
  'Martin Richter', 'Katharina Schulz', 'Nikolaus Fischer', 'Barbara Wagner', 'Andreas Neumann',
  'Christoph Bauer', 'Maria Schmidt', 'Stefan Klein', 'Anna Hoffmann', 'Michael Becker',
  'Gabriele Wolf', 'Christian Richter', 'Petra Schulz', 'Matthias Fischer', 'Sabine Wagner',
  'Thomas Neumann', 'Claudia Bauer', 'Frank Schmidt', 'Andrea Klein', 'Peter Hoffmann',
  'Stefanie Becker', 'Daniel Wolf', 'Nicole Richter', 'Markus Schulz', 'Sandra Fischer',
  'Alexander Wagner', 'Julia Neumann', 'Tobias Bauer', 'Melanie Schmidt', 'Sebastian Klein',
  'Christina Hoffmann', 'Philipp Becker', 'Laura Wolf', 'Jan Richter', 'Katharina Schulz',
  'Simon Fischer', 'Sarah Wagner', 'Lukas Neumann', 'Anna Bauer', 'Max Schmidt',
  'Emma Klein', 'Leon Hoffmann', 'Mia Becker', 'Finn Wolf', 'Sophie Richter', 'Paul Schulz',
];

// Bewertungstexte (unterschiedliche Längen und Töne)
const REVIEW_COMMENTS = [
  'Super Erfahrung, gerne wieder!', 'Sehr freundlich und professionell.', 'Unkompliziert und schnell.',
  'Kann ich nur empfehlen.', 'War zufrieden, komme wieder.', 'Alles perfekt gelaufen.',
  'Tolles Team, danke!', 'Sehr zuvorkommend.', 'Hat meine Erwartungen übertroffen.',
  'Leider etwas lange Wartezeit.', 'Gut, aber Termin war verspätet.', 'Preis-Leistung stimmt.',
  'Nette Atmosphäre.', 'Bin begeistert.', 'War okay, nichts Besonderes.', 'Sehr empfehlenswert!',
  'Sauber und ordentlich.', 'Kompetent und sympathisch.', 'Etwas teuer, aber gut.',
  'Werde wieder buchen.', 'Unfreundliche Bedienung leider.', 'Top Service!',
  'Hat nicht ganz gepasst.', 'Sehr enttäuscht von der Qualität.', 'Gute Lage, nette Leute.',
  'Alles bestens.', 'Termin wurde kurzfristig abgesagt.', 'Rundum zufrieden.',
  'Nicht wieder.', 'Großartig!', 'Durchschnittlich.', 'Sehr zu empfehlen.',
  'Etwas verbesserungswürdig.', 'Perfekt für den Preis.', 'War in Ordnung.',
  'Ausgezeichnet!', 'Leider nicht wie erwartet.', 'Freundlicher Empfang.',
  'Schnell und unkompliziert.', 'Atmosphäre könnte besser sein.', 'Sehr gute Qualität.',
  'Mittelprächtig.', 'Hat Spaß gemacht.', 'Würde ich weiterempfehlen.',
];

function main() {
  let sql = fs.readFileSync(SEED_PATH, 'utf8');

  // 1) Owner-Namen ersetzen ('Owner 1' .. 'Owner 120')
  for (let i = 1; i <= 120; i++) {
    const name = OWNER_NAMES[i - 1];
    const re = new RegExp("'Owner " + i + "'", 'g');
    sql = sql.replace(re, "'" + name.replace(/'/g, "''") + "'");
  }

  // 2) STAFF MEMBERS: Zuerst 120 Owner-Staff (user_id gesetzt), dann 80 mit user_id NULL und echten Namen
  const staffMembersStart = sql.indexOf('-- ========== STAFF MEMBERS ==========');
  const staffMembersEnd = sql.indexOf('-- ========== STAFF_SERVICES ==========');
  if (staffMembersStart === -1 || staffMembersEnd === -1) throw new Error('STAFF MEMBERS or STAFF_SERVICES section not found');

  const ownerStaffLines = [];
  for (let v = 1; v <= 120; v++) {
    const name = OWNER_NAMES[v - 1].replace(/'/g, "''");
    const email = `venue-${v}-`; // wird aus Venue-Emails genommen – wir nutzen Platzhalter
    ownerStaffLines.push(`(${v}, ${v}, '${name}', NULL, NULL, NULL, NOW(), NOW())`);
  }
  const ownerStaffBlock = `-- ========== STAFF MEMBERS ==========
-- 120 Owner als Staff (user_id = Owner-User), jeder Venue hat genau einen Owner
INSERT INTO staff_members (venue_id, user_id, name, email, phone, description, created_at, updated_at) VALUES
${ownerStaffLines.join(',\n')};

-- Zusätzliche Mitarbeiter (ohne Login, user_id NULL)
INSERT INTO staff_members (venue_id, user_id, name, email, phone, description, created_at, updated_at) VALUES
`;

  const oldStaffBlock = sql.slice(staffMembersStart, staffMembersEnd);
  const oldStaffInserts = oldStaffBlock.replace(/.*?INSERT INTO staff_members[^;]+;/s, '').trim();
  const newStaffRows = [];
  const lines = oldStaffInserts.split(/\n/);
  let rowIndex = 0;
  for (const line of lines) {
    const m = line.match(/\((\d+),\s*'([^']+)',\s*'([^']*)',\s*(NULL|[^,]+)/);
    if (m) {
      const venueId = parseInt(m[1], 10);
      const realName = STAFF_NAMES[rowIndex % STAFF_NAMES.length].replace(/'/g, "''");
      const email = m[3] ? "'" + m[3].replace(/'/g, "''") + "'" : 'NULL';
      rowIndex++;
      newStaffRows.push(`(${venueId}, NULL, '${realName}', ${email}, NULL, NULL, NOW(), NOW())`);
    }
  }
  const newStaffBlock = ownerStaffBlock + newStaffRows.join(',\n') + ';\n\n';
  sql = sql.slice(0, staffMembersStart) + newStaffBlock + sql.slice(staffMembersEnd);

  // 3) STAFF_SERVICES: staff_member_id 1..80 -> 121..200 (weil 1..120 jetzt Owner sind)
  for (let n = 80; n >= 1; n--) {
    const re = new RegExp('\\((' + n + '),\\s*(\\d+),\\s*NOW\\(\\)\\)', 'g');
    sql = sql.replace(re, `(${n + 120}, $2, NOW())`);
  }
  // Owner-Staff-Services: Staff 1..120 je mit allen Services ihrer Venue (Venue v hat Services 3*(v-1)+1 bis 3*v)
  const ownerStaffServices = [];
  for (let v = 1; v <= 120; v++) {
    const s1 = 3 * (v - 1) + 1, s2 = 3 * (v - 1) + 2, s3 = 3 * v;
    ownerStaffServices.push(`(${v}, ${s1}, NOW()), (${v}, ${s2}, NOW()), (${v}, ${s3}, NOW())`);
  }
  const firstStaffServicesInsert = sql.indexOf('INSERT INTO staff_services (staff_member_id, service_id, created_at) VALUES');
  const firstNewline = sql.indexOf('\n', firstStaffServicesInsert);
  sql = sql.slice(0, firstNewline) + '\n' + ownerStaffServices.join(',\n') + ',\n' + sql.slice(firstNewline);

  // 4) AVAILABILITY_RULES: staff_member_id 1..80 -> 121..200
  for (let n = 80; n >= 1; n--) {
    sql = sql.replace(new RegExp('\\(NULL,\\s*' + n + ',\\s*(\\d+),', 'g'), `(NULL, ${n + 120}, $1,`);
  }
  // Owner-Verfügbarkeit: Staff 1..120, Mo–So 09:00–18:00
  const ownerAvail = [];
  for (let staffId = 1; staffId <= 120; staffId++) {
    for (let d = 0; d <= 6; d++) {
      ownerAvail.push(`(NULL, ${staffId}, ${d}, '09:00', '18:00', NOW())`);
    }
  }
  const firstNullStaffRule = sql.indexOf('(NULL, 121, 2,');
  if (firstNullStaffRule !== -1) {
    sql = sql.slice(0, firstNullStaffRule) + ownerAvail.join(',\n') + ',\n' + sql.slice(firstNullStaffRule);
  }

  // 5) BOOKINGS: staff_member_id 1..80 -> 121..200 (5. Spalte)
  for (let n = 80; n >= 1; n--) {
    const re = new RegExp(',\\s*' + n + ',\\s*\'Kunde', 'g');
    sql = sql.replace(re, `, ${n + 120}, 'Kunde`);
  }

  // 6) Kunden-Namen ersetzen ('Kunde 1' .. 'Kunde 150')
  for (let i = 1; i <= 150; i++) {
    const name = CUSTOMER_NAMES[i - 1] ? CUSTOMER_NAMES[i - 1].replace(/'/g, "''") : `Kunde ${i}`;
    sql = sql.replace(new RegExp("'Kunde " + i + "'", 'g'), "'" + name + "'");
  }

  // 7) REVIEWS: Viele unterschiedliche Bewertungen (Rating 1–5, verschiedene Kommentare)
  const reviewsSectionStart = sql.indexOf('-- ========== REVIEWS');
  const reviewsSectionEnd = sql.indexOf('SET FOREIGN_KEY_CHECKS = 1;');
  if (reviewsSectionStart !== -1 && reviewsSectionEnd !== -1) {
    const commentsEscaped = REVIEW_COMMENTS.map(c => "'" + c.replace(/'/g, "''") + "'").join(',');
    const reviewsBlock = `-- ========== REVIEWS (viele unterschiedliche Bewertungen 1–5, echte Kommentare) ==========
INSERT INTO reviews (customer_id, venue_id, booking_id, rating, comment, is_verified, created_at, updated_at)
SELECT customer_id, venue_id, id,
  1 + FLOOR(RAND() * 5),
  ELT(1 + FLOOR(RAND() * ${REVIEW_COMMENTS.length}), ${commentsEscaped}),
  TRUE, NOW(), NOW()
FROM bookings WHERE status = 'completed' AND customer_id IS NOT NULL;

`;
    sql = sql.slice(0, reviewsSectionStart) + reviewsBlock + sql.slice(reviewsSectionEnd);
  }

  fs.writeFileSync(SEED_PATH, sql, 'utf8');
  console.log('Seed transformed: echte Namen, Owner als Staff, viele Bewertungen.');
}

main();
