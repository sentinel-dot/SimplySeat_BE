# SimplySeat Backend + DB auf Railway deployen (Step-by-Step)

Railway nutzt **keine** `.env`-Datei. Alle Variablen werden im **Variables**-Tab des Projekts (oder per Railway CLI) gesetzt. Fehlt eine Pflichtvariable, startet die App nicht.

---

## Teil 1: Railway-Account & Projekt

1. **Account:** Gehe zu [railway.app](https://railway.app) und melde dich an (z. B. mit GitHub).
2. **Neues Projekt:** Klicke auf **"New Project"**.
3. **Leeres Projekt wählen:** Wähle **"Deploy from GitHub repo"** (oder "Empty Project", wenn du später per CLI/Git verbindest).

---

## Teil 2: MySQL-Datenbank auf Railway

4. **MySQL hinzufügen:** Im Projekt-Dashboard klicke auf **"+ New"** → **"Database"** → **"Add MySQL"**.
5. **Service öffnen:** Klicke auf den neuen MySQL-Service.
6. **Variablen prüfen:** Unter **Variables** siehst du u. a.:
   - `MYSQL_URL` – von Railway gesetzte Verbindungs-URL
   - `MYSQL_PUBLIC_URL` – öffentlich erreichbare URL (falls du sie brauchst)
   - Optional: `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_PORT`
7. **DB-Name merken:** Der Datenbankname steht in der URL bzw. in `MYSQL_DATABASE`. Dein Backend nutzt diese URL später automatisch, sobald sie verknüpft ist.

---

## Teil 3: Backend-Service erstellen und mit GitHub verbinden

8. **Backend-Service:** Zurück im Projekt: **"+ New"** → **"GitHub Repo"** (oder "Empty Service" für manuelles Deploy).
9. **Repo auswählen:** Wähle dein **SimplySeat_BE**-Repository und den Branch (z. B. `main`).
10. **Root-Verzeichnis:** Falls das Backend nicht im Repo-Root liegt, unter **Settings** → **Root Directory** den Ordner angeben (ansonsten leer lassen).
11. **Build & Start:** Railway erkennt Node.js über `package.json`. Es wird ausgeführt:
    - `npm install`
    - `npm run build` (→ `tsc`, erzeugt `dist/`)
    - `npm start` (→ `node dist/server.js`)
    Falls kein automatischer Build läuft: unter **Settings** → **Build Command** `npm run build` und **Start Command** `npm start` setzen.

---

## Teil 4: Datenbank mit Backend verknüpfen

12. **MySQL an Backend anbinden:** Im Backend-Service: **"Variables"** → **"+ New Variable"** → **"Add Reference"** (oder "Add Variable").
13. **Referenz auf MySQL:** Wähle den MySQL-Service und die Variable **`MYSQL_URL`** (oder **`MYSQL_PUBLIC_URL`**). Railway setzt die Variable im Backend mit dem Wert aus der DB – URL musst du nicht kopieren und bleibt aktuell.

Alternativ: Wenn du keine Referenz siehst, im MySQL-Service **`MYSQL_URL`** oder **`MYSQL_PUBLIC_URL`** kopieren und im Backend-Service als **`MYSQL_URL`** einfügen.

---

## Teil 5: Pflicht-Variablen im Backend setzen

14. Im **Backend-Service** unter **Variables** folgende Variablen setzen:

| Variable      | Wert / Hinweis |
|---------------|----------------|
| `NODE_ENV`    | `production` (Railway setzt das oft automatisch.) |
| `PORT`        | Wird von Railway gesetzt – **nicht** manuell überschreiben. |
| `JWT_SECRET`  | Mind. 32 Zeichen. Z. B. erzeugen: `openssl rand -base64 32` |
| **DB**        | Entweder `MYSQL_URL` oder `MYSQL_PUBLIC_URL` per Referenz (siehe Schritt 12–13) **oder** manuell die URL aus dem MySQL-Service kopieren. |

---

## Teil 6: Optionale Variablen (CORS, E-Mail, etc.)

15. Je nach Bedarf im Backend **Variables** ergänzen:

| Variable          | Beschreibung |
|-------------------|--------------|
| `FRONTEND_URL`    | Eine erlaubte Origin für CORS, z. B. `https://deine-app.vercel.app` |
| `FRONTEND_URLS`   | Mehrere Origins, komma-getrennt (z. B. Production + Vercel-Preview-URLs) |
| `CUSTOMER_JWT_SECRET` | Optional; für Kunden-Login, sonst wird `JWT_SECRET` genutzt. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | E-Mail (z. B. Brevo). Wenn nicht gesetzt: E-Mails nur im Log. |
| `MAIL_FROM`       | Absender in E-Mails, z. B. `SimplySeat<noreply@simplyseat.de>` |
| `PUBLIC_APP_URL`  | Basis-URL für Links in E-Mails (z. B. Frontend-URL). |

---

## Teil 7: Deploy auslösen und URL sichern

16. **Deploy:** Nach dem Speichern der Variablen baut und startet Railway automatisch. Unter **"Deployments"** siehst du Logs; bei Fehlern zeigt die App fehlende/invalide Variablen an.
17. **Öffentliche URL:** Im Backend-Service: **Settings** → **Networking** → **"Generate Domain"**. Die URL (z. B. `https://simplyseat-be-production.up.railway.app`) ist deine Backend-API-URL.
18. **Frontend anpassen:** Im Frontend die API-Basis-URL auf diese Railway-URL setzen. CORS ist erlaubt, wenn `FRONTEND_URL` / `FRONTEND_URLS` die Frontend-Domain enthält.

---

## Kurz-Checkliste

- [ ] Railway-Projekt erstellt
- [ ] MySQL-Datenbank als Service hinzugefügt
- [ ] Backend-Service aus GitHub-Repo erstellt
- [ ] `MYSQL_URL` oder `MYSQL_PUBLIC_URL` im Backend gesetzt (Referenz oder Kopie aus MySQL-Service)
- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` mit mind. 32 Zeichen
- [ ] `FRONTEND_URL` (oder `FRONTEND_URLS`) für CORS
- [ ] Öffentliche Domain für das Backend generiert
- [ ] Deploy erfolgreich; Logs prüfen bei Absturz

---

## Wo du die Logs siehst (inkl. deiner Logger-Klasse)

Railway zeigt **stdout/stderr** deiner App. Dein Logger schreibt jetzt zusätzlich auf **stdout**, daher erscheinen alle `logger.info()`, `logger.error()` etc. dort.

**So findest du die Logs:**
1. Railway Dashboard → dein **Projekt** öffnen  
2. **Backend-Service** (nicht MySQL) anklicken  
3. Oben den Tab **„Deployments“** wählen → letzten **Deploy** anklicken  
4. Rechts bzw. unten **„View Logs“** oder **„Logs“** – dort siehst du den kompletten Output (Build + Runtime) mit deinen Logger-Zeilen.

Alternativ: Im Backend-Service direkt den Tab **„Logs“** (falls vorhanden) – zeigt die Logs des aktuell laufenden Deploys.

---

## Bei 502 „Application failed to respond“

1. **Logs prüfen:** Im Backend-Service → **Deployments** → letzten Deploy öffnen → **View Logs**. Dort siehst du:
   - **Fehlende Variablen:** Die App beendet sich mit einer Liste (z. B. `JWT_SECRET`, `MYSQL_URL`). Diese im **Variables**-Tab setzen.
   - **DB-Verbindung fehlgeschlagen:** „Failed to connect to database“ → `MYSQL_URL` oder `MYSQL_PUBLIC_URL` prüfen (Referenz auf MySQL-Service oder korrekte URL).
   - **App startet:** Wenn „Backend-Server running on http://0.0.0.0:…“ erscheint, läuft der Server; dann kann ein Timeout oder ein anderes Netz-Problem vorliegen → erneut deployen oder Domain neu generieren.

2. **Host-Bindung:** In Production lauscht die App auf `0.0.0.0` (nicht nur localhost), damit Railway sie erreichen kann.

3. **PORT:** Railway setzt `PORT` automatisch. Nicht manuell überschreiben.

---

## Neuesten Stand vom Repo ziehen (neu deployen)

- **Automatisch:** Wenn der Service mit GitHub verbunden ist, deployt Railway bei jedem **Push** auf den verknüpften Branch (z. B. `main`) automatisch. Einfach `git push` – Railway baut und startet den neuen Stand.
- **Manuell im Dashboard:** Backend-Service öffnen → **Deployments** → **"Deploy"** bzw. **"Redeploy"** (oder über die drei Punkte beim letzten Deploy). Mit **"Deploy"** wird der **neueste Commit** des verbundenen Branches gezogen und neu gebaut.
- **Command Palette:** Im Railway-Dashboard **Cmd+K** (Mac) bzw. **Strg+K** (Windows) → **"Deploy Latest Commit"** wählen – startet einen Deploy vom letzten Stand des Branches.
- **Per CLI:** `railway redeploy` (baut den letzten Deploy neu; für neuen Code zuerst pushen, dann im Dashboard „Deploy“ nutzen oder erneut pushen, damit der neueste Commit gezogen wird).

**Branch prüfen:** Unter **Settings** des Backend-Services siehst du, welcher Branch verwendet wird. Nur Pushes auf diesen Branch lösen Auto-Deploys aus.

---

## npm-Warnung „Use \`--omit=dev\` instead“

Die Meldung `npm warn config production Use --omit=dev instead` kommt von der Art, wie Railway/npm `npm install` ausführt (veraltete Option `--production`). Sie ist **harmlos** und beeinflusst den Build nicht.

- **Einfach ignorieren** – Railway bestätigt, dass die Warnung keine Folgen hat.
- **Optional:** Im Backend-Service unter **Variables** die Variable **`NPM_CONFIG_OMIT`** = **`dev`** setzen. Dann nutzt npm beim Install die neue Option; die Warnung kann verschwinden (je nach Railway-Build-Stack).
- **Vollständige Kontrolle:** Eigenes **Dockerfile** verwenden und darin z. B. `RUN npm install --omit=dev` ausführen – dann bestimmst du den genauen Befehl.

---

## Hinweise

- **Keine `.env` auf Railway:** Alle Werte nur über Variables (oder Railway CLI).
- **DB-Migrationen:** Falls du Schema-Migrationen (z. B. SQL-Skripte) hast, diese einmalig gegen die Railway-MySQL-URL ausführen (lokal mit gesetzter `MYSQL_URL` oder `MYSQL_PUBLIC_URL` oder über ein Migrations-Script im CI/Deploy).
- **Logs:** Bei Startfehlern prüft die App fehlende Variablen und schreibt sie ins Log – dort steht, was ergänzt werden muss.
