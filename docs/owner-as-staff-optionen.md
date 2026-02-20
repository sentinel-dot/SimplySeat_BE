# Owner als „durchführende Person“ bei Services (Option 10)

**→ Aktuelle Logik (Owner als Staff, konfigurierbar):** Siehe [owner-als-staff-logik.md](./owner-als-staff-logik.md).

## Ausgangslage

- **Owner** = User in `users` (Dashboard-Login), kein Eintrag in `staff_members`.
- **Services** mit `requires_staff = true`: Slots werden nur für Mitarbeiter erzeugt, die in `staff_services` mit diesem Service verknüpft sind.
- **Folge**: Venue nur mit Owner, keine Staff → bei `requires_staff = true` gibt es **keine Slots** und keine Buchungen.

Ziel: Jeder Service soll standardmäßig „vom Owner durchführbar“ sein, ohne dass Nutzer:innen zwingend echte Mitarbeiter anlegen müssen.

---

## Option A: Owner nur in der Logik (kein eigener Staff-Eintrag)

- **Idee**: Wenn für einen Service **kein** Staff in `staff_services` existiert, Slots trotzdem erzeugen und Buchungen mit `staff_member_id = NULL` zulassen; im System gilt „NULL = Owner führt aus“.

- **Vorteile**: Kein doppelter Eintrag (Owner nur in `users`), klare Trennung „Login“ vs. „Durchführende Person“.

- **Nachteile**:
  - Availability-Service muss an mehreren Stellen erweitert werden (Fall „kein Staff“ → Venue-Öffnungszeiten nutzen, Slots mit `staff_member_id = NULL`).
  - Buchungslogik und -anzeige müssen überall `staff_member_id = NULL` als „Owner“ interpretieren.
  - Später, wenn doch Staff dazu kommt, muss klar sein: NULL nur erlaubt, wenn weiterhin kein Staff für diesen Service existiert (oder nur als explizite „Owner“-Buchung).

---

## Option B: Owner als fester Staff „Inhaber“ (empfohlen)

- **Idee**: Beim Anlegen eines Venues **immer** einen zusätzlichen Eintrag in `staff_members` anlegen (z. B. Name „Inhaber“), mit:
  - Verknüpfung zu **allen** Services dieses Venues (`staff_services`),
  - denselben **Öffnungszeiten** wie das Venue (über `availability_rules` mit `staff_member_id = Inhaber`, `venue_id = NULL`).

- **Vorteile**:
  - Keine Änderung im Availability- oder Buchungs-Service nötig; alles läuft wie bei „normalem“ Staff.
  - Jedes Venue hat mindestens eine Person, die jeden Service anbieten kann.
  - Owner kann später echte Mitarbeiter dazu nehmen; „Inhaber“ bleibt als Option im Buchungsfluss (z. B. „Inhaber“ vs. „Anna“).
  - Einfach erweiterbar: z. B. Spalte `user_id` in `staff_members`, um den Inhaber-Staff dem Owner-User zuzuordnen (für Anzeige „Sie“ / „Inhaber (du)“ im Dashboard).

- **Nachteile**:
  - Ein zusätzlicher Datensatz pro Venue (ein Staff „Inhaber“).
  - Konzeptionell: „Inhaber“ ist eine Rolle/Darstellung des Owners im Buchungssystem, nicht ein zweiter Login.

---

## Empfehlung: Option B umsetzen

- In **createVenueFull** (nach Anlegen von Venue, Owner-User und Services):
  1. Einen Staff mit Namen **„Inhaber“** anlegen (`staff_members`, `venue_id = neues Venue`).
  2. Für jeden angelegten Service einen Eintrag in **staff_services** (Inhaber ↔ Service).
  3. Für jede Öffnungszeiten-Zeile eine **availability_rule** mit `staff_member_id = Inhaber`, `venue_id = NULL`, gleicher `day_of_week`, `start_time`, `end_time` wie die Venue-Öffnungszeiten.

- **Name**: Einheitlich „Inhaber“ (oder später optional „{owner.name} (Inhaber)“).

- **Später optional**:
  - Spalte `staff_members.user_id` (NULLable, FK auf `users.id`): Beim Anlegen des Inhaber-Staffs `user_id = Owner-User` setzen. Dann im Owner-Dashboard diese Zeile als „Sie / Inhaber“ kennzeichnen und ggf. vor Löschen schützen.

Damit ist „Owner führt standardmäßig jeden Service aus“ abgebildet, ohne die bestehende Availability-/Buchungslogik zu verändern.

---

## Umgesetzt (Option B)

- In **createVenueFull** wird nach den vom User angelegten Staff-Einträgen ein weiterer Staff **„Inhaber“** angelegt.
- Dieser erhält in **staff_services** alle angelegten Services.
- Für ihn werden **availability_rules** mit denselben Öffnungszeiten wie das Venue gespeichert (`venue_id = NULL`, `staff_member_id = Inhaber`).
- Die Venue-Öffnungszeiten (venue_id gesetzt, staff_member_id NULL) bleiben unverändert für Services mit `requires_staff = false`.
