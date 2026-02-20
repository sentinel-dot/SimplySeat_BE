# Owner als Staff-Mitglied (konfigurierbar)

## Ziel

- **Owner** ist nicht nur Login, sondern auch die durchführende Person im Buchungssystem.
- Der Owner wird **einmal** als Eintrag in `staff_members` angelegt und über `user_id` mit dem User verknüpft.
- **Konfigurierbar**: Der Owner kann wählen, ob er alle Services oder nur bestimmte selbst durchführt (wie jeder andere Staff).

## Modell

- **users** (role=owner): Login, Venue-Zuordnung, Dashboard-Zugriff.
- **staff_members**: Pro Venue mindestens ein Eintrag mit `user_id = Owner-ID` → „der Owner als buchbare Person“.
  - Name = Owner-Name (oder Anzeigename „Inhaber“ / konfigurierbar).
  - **staff_services**: Nur die Services, die der Owner durchführen will (konfigurierbar, nicht mehr „immer alle“).
  - **availability_rules**: Wie bisher (z. B. aus Venue-Öffnungszeiten), damit Slots entstehen.

Vorteile:
- Kein doppelter Begriff „Inhaber“ vs. Owner: Es gibt einen Staff-Eintrag, der dem Owner zugeordnet ist.
- Owner kann im Dashboard „seinen“ Staff-Eintrag bearbeiten (welche Services, welche Zeiten).
- Wenn der Owner keine Services ausführt (z. B. nur Verwaltung), setzt man einfach keine staff_services für ihn; andere Mitarbeiter decken die Services ab.

## Schema

- `staff_members.user_id` (INT NULL, FK → users.id): Wenn gesetzt, ist dieser Staff-Eintrag der Dashboard-User (Owner oder später ggf. role=staff).

## Venue anlegen (createVenueFull)

1. Venue anlegen.
2. Owner-User anlegen (users).
3. Services anlegen.
4. **Ein** Staff-Eintrag anlegen:
   - `venue_id`, `name` = owner.name (oder „Inhaber“), `user_id` = owner.id, email/phone optional.
5. **staff_services** nur für die gewählten Services (Payload: `owner_service_indices`: Indizes der Services, die der Owner durchführt; Default: alle).
6. **availability_rules** für diesen Staff mit den Venue-Öffnungszeiten (wie bisher).
7. Venue-Öffnungszeiten (venue_id, staff_member_id NULL) für requires_staff=false beibehalten.

Es wird **kein** separater „Inhaber“-Eintrag mehr angelegt – der Owner-Staff-Eintrag ist genau dieser.

## Admin-Formular „Venue anlegen“

- Bereich „Owner als durchführende Person“ (nach Services, vor Öffnungszeiten):
  - Checkboxen pro Service: „Owner führt diesen Service aus“ (Default: alle angehakt).
  - Kurzer Hinweis: Owner kann das später im eigenen Dashboard anpassen.
- Payload: `owner_service_indices: number[]` (Indizes in der services-Liste, 0-basiert).

## Owner-Dashboard (später)

- Unter „Mitarbeiter“ (oder ähnlich) den eigenen Eintrag anzeigen (wo `staff_member.user_id = currentUser.id`) als „Sie“ / „Ihr Eintrag“.
- Owner kann dort Services zuordnen/entfernen und Verfügbarkeit bearbeiten (wie bei anderen Staff).

## Migration von alter Logik

- Bestehende Venues haben ggf. einen Staff „Inhaber“ ohne `user_id`. Optional: Migrationsskript, das für jede Venue den Owner-User ermittelt und den Staff „Inhaber“ (oder den einen Staff ohne user_id) mit `user_id` verknüpft und ggf. Namen auf owner.name setzt.
