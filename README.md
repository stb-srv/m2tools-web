# ⚔️ M2-Tools

Ein modulares Web-Toolkit für die Entwicklung von **Metin2**-Privatservern: Item-, Quest-, Cube- und Mob-Drop-Bearbeitung, Proto-Import, TGA-Konvertierung sowie Team- und Workspace-Verwaltung – alles über eine einzige, rollenbasierte Web-Oberfläche.

Backend: modulares Express-System (`server/`) · Frontend: Vue 3 + Vite Single-Page-App (`frontend/`)

---

## Inhalt

- [Features](#features)
- [Tech-Stack](#tech-stack)
- [Voraussetzungen](#voraussetzungen)
- [Lokale Entwicklung](#lokale-entwicklung)
- [Konfiguration (.env)](#konfiguration-env)
- [Produktion / Deployment](#produktion--deployment)
- [Docker](#docker)
- [Coolify](#coolify)
- [Tests](#tests)
- [CI](#ci)
- [Projektstruktur](#projektstruktur)
- [Zugriffslevel & Rollen](#zugriffslevel--rollen)
- [Neues Modul hinzufügen](#neues-modul-hinzufügen)

---

## Features

Module werden zur Laufzeit automatisch geladen (`server/modules/<id>/module.json`) und erscheinen dynamisch im Dashboard – die Tabelle unten spiegelt den aktuellen Stand wider.

| Modul | Beschreibung | Zugriffslevel |
|---|---|---|
| 🛠️ **Cube Editor** | Bearbeitet Crafting-Rezepte direkt in `cube.txt` | public |
| 📦 **Mob-Drop Editor** | Korrigiert Gruppennamen und Item-Drops | public |
| 🎁 **Spezielle Item-Gruppe** | Bearbeitet Truheninhalte/Drops aus `special_item_group.txt` | public |
| 🖼️ **TGA Converter** | Konvertiert PNG/JPG in das Metin2-TGA-Format | public |
| 📖 **Benutzerhandbuch** | Interaktiver Guide für Workspaces, Teams und Editoren | public |
| 📥 **Proto Importer** | Importiert eigene `item_proto`/`mob_proto` in die Datenbank | user |
| 📜 **Quest Builder** | Erstellt Metin2-Quests Schritt für Schritt und generiert Lua-Code ([Syntax-Referenz](./QUEST_SYNTAX.md)) | user |
| 📁 **Workspaces** | Verwaltet mehrere Server-Profile/Bearbeitungsumgebungen | user |
| 👥 **Teams** | Gemeinsames Arbeiten an Projekten in Teams | user |
| 🔌 **Server-Verbindungen** | SSH/SFTP- und Live-DB-Verbindung zum eigenen Metin2-Server (inkl. verschlüsselter Zugangsdaten, Audit-Log, Command-Allowlist) | premium |
| 🎒 **Item-Manager & Icons** | Zentrale Verwaltung von Namen, VNUMs und Iconbox-Größen | admin |

Zugriffslevel sind zur Laufzeit über das Admin-Panel änderbar, unabhängig vom Default in `module.json`.

Weitere Plattform-Features:
- **Auth-System**: JWT-Login, E-Mail-Verifizierung (SMTP optional, sonst Auto-Verify im Dev-Modus), Wegwerf-E-Mail-Sperre, Rollen (`admin` / `editor` / `viewer`)
- **Workspaces**: pro Nutzer/Team isolierte SQLite-Proto-DBs, Icon-/Datei-Upload mit Quota und Zip-Slip-Schutz
- **i18n**: Deutsch/Englisch, zur Laufzeit nachladbar ohne Frontend-Rebuild
- **Security**: Helmet-CSP ohne `unsafe-inline` für Scripts, Rate-Limiting (global + verschärft für Login/Register/Resend), verschlüsselte Zugangsdaten (AES), Audit-Log für Server-Verbindungs-Aktionen

## Tech-Stack

| Bereich | Technologie |
|---|---|
| Backend | Node.js, Express, better-sqlite3 / MySQL2, JWT, bcryptjs, Helmet, ssh2 |
| Frontend | Vue 3 (Composition API), Vite, Pinia, vue-router, vue-i18n |
| Tests | Jest (Backend), Vitest (Frontend-Unit), Playwright (E2E) |
| CI | GitHub Actions |
| Deployment | Docker (Multi-Stage-Build) |

## Voraussetzungen

- Node.js 20+
- npm
- Für SQLite (Standard): keine weiteren Abhängigkeiten
- Für MySQL/MariaDB: ein erreichbarer Server (`DB_TYPE=mysql`)

## Lokale Entwicklung

```bash
# Backend-Abhängigkeiten
npm install

# Frontend-Abhängigkeiten
cd frontend && npm install && cd ..
```

Zwei Prozesse parallel starten:

```bash
node server.js              # Backend auf :3001
cd frontend && npm run dev  # Vite Dev-Server auf :5173, proxied /api, /assets, /basic, /i18n zu :3001
```

Öffne anschließend `http://localhost:5173`. Ohne gesetztes `JWT_SECRET`/`CREDENTIALS_ENCRYPTION_KEY` führt der erste Aufruf automatisch zum **Setup-Wizard** (`/setup.html`), der Admin-Konto und Sicherheitsschlüssel im Browser einrichtet – siehe [Konfiguration (.env)](#konfiguration-env). Sind beide Werte bereits per `.env`/Umgebungsvariable gesetzt, wird der Wizard übersprungen und stattdessen (wie bisher) automatisch ein `admin`-Konto mit im Server-Log angezeigtem Initial-Passwort angelegt.

## Konfiguration (.env)

Kopiere `.env.example` nach `.env` und passe die Werte an:

| Variable | Zweck |
|---|---|
| `PORT` | Backend-Port (Standard `3001`) |
| `DB_TYPE` | `sqlite` (Standard) oder `mysql`/`mariadb` |
| `SQLITE_PATH` | Optionaler Pfad zur SQLite-Datei |
| `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` | Nur bei `DB_TYPE=mysql` |
| `ICONS_PATH` | Optionales externes Icon-Verzeichnis (sonst `public/assets/items/`) |
| `JWT_SECRET` | Session-Secret. **Optional** – bleibt es zusammen mit `CREDENTIALS_ENCRYPTION_KEY` leer, übernimmt der [Setup-Wizard](#setup-wizard--erstkonfiguration) die Generierung im Browser. Manuell gesetzt: ohne Angabe zufällig pro Prozessstart (Sessions überleben dann keinen Neustart) |
| `CREDENTIALS_ENCRYPTION_KEY` | Verschlüsselt gespeicherte SSH/DB-Zugangsdaten (Server-Verbindungen). **Optional** – wird wie `JWT_SECRET` normalerweise vom Setup-Wizard generiert und dauerhaft in `data/runtime-config.json` gespeichert. Manuell gesetzt: kein Zufalls-Fallback, verschlüsselte Bestandsdaten ohne diesen Key machen den Serverstart unmöglich |
| `ALLOWED_ORIGINS` | Komma-separierte Liste erlaubter Frontend-Origins in Produktion (sonst CORS offen); auch per Wizard setzbar |
| `BASE_URL` | Externe URL für E-Mail-Verifizierungslinks; auch per Wizard setzbar |
| `SMTP_*` | SMTP-Zugangsdaten für Verifizierungs-Mails; ohne Konfiguration werden neue Konten automatisch verifiziert (Dev-Modus); auch per Wizard setzbar |

Manuelle Secrets generieren (nur nötig, wenn du den Wizard **nicht** nutzen und Secrets stattdessen selbst verwalten willst – siehe unten):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # CREDENTIALS_ENCRYPTION_KEY
```

### Setup-Wizard (Erstkonfiguration)

Sind `JWT_SECRET` und `CREDENTIALS_ENCRYPTION_KEY` beim ersten Start nicht gesetzt (weder in `.env` noch als Umgebungsvariable), leitet die App jeden Aufruf automatisch auf `/setup.html` um. Dort werden im Browser eingerichtet:

1. **Admin-Konto** (Benutzername, optional E-Mail, Passwort) – ersetzt das bisherige "Zufallspasswort im Server-Log".
2. **Domain/CORS** (`ALLOWED_ORIGINS`, `BASE_URL`) – vorbefüllt mit der aktuell aufgerufenen Adresse.
3. **SMTP** (optional, überspringbar).

Beim Abschluss generiert der Server `JWT_SECRET` und `CREDENTIALS_ENCRYPTION_KEY` automatisch und speichert alles dauerhaft in `data/runtime-config.json` (im selben Volume wie die SQLite-DB – übersteht Neustarts/Redeploys). Danach ist der Wizard gesperrt (`/api/setup/init` antwortet mit 403) und `/setup.html` leitet auf `/login.html` um.

**Power-User-Pfad:** Wer Secrets lieber selbst verwaltet, setzt `JWT_SECRET`/`CREDENTIALS_ENCRYPTION_KEY` (und optional `SMTP_*`) einfach direkt als Umgebungsvariable – der Wizard wird dann automatisch übersprungen, und es gilt wieder das klassische Verhalten (Zufalls-Admin-Konto, Passwort im Log).

## Produktion / Deployment

```bash
cd frontend && npm run build   # baut nach public/dist/
node server.js                # serviert das gebaute Frontend + API auf einem Port
```

## Docker

```bash
# CREDENTIALS_ENCRYPTION_KEY (und optional JWT_SECRET, ALLOWED_ORIGINS) in .env setzen
docker compose up --build
```

Der Container baut das Frontend im Multi-Stage-Build und startet Backend + gebautes Frontend auf Port `3001`. `data/` (SQLite-DB) und `public/basic/` (Quests, `cube.txt` etc.) werden als benannte Volumes persistiert. Ein `/health`-Endpoint mit echtem DB-Ping ist für Healthchecks/Monitoring eingerichtet.

## Coolify

M2-Tools lässt sich ohne manuelle `.env`-Pflege über [Coolify](https://coolify.io/) deployen – Secrets richtet der [Setup-Wizard](#setup-wizard--erstkonfiguration) im Browser ein.

1. **Neue Ressource anlegen**: In Coolify eine neue "Application" aus diesem Git-Repo erstellen, Build-Pack **Dockerfile** wählen (nicht "Docker Compose" – das vorhandene `docker-compose.yml` ist für lokale/manuelle Deployments gedacht, Coolifys eigenes Domain-/SSL-Handling passt besser zum reinen Dockerfile-Modus).
2. **Persistenten Speicher einrichten** (wichtig): Im "Storages"-Tab der Ressource zwei Volumes anlegen und mounten:
   - `/app/data` (SQLite-DB **und** die vom Setup-Wizard generierten Secrets)
   - `/app/public/basic` (Quests, `cube.txt` etc.)

   Coolify liest die `VOLUME`-Direktiven aus dem Dockerfile beim Dockerfile-Build-Pack **nicht** automatisch aus – ohne diesen Schritt gehen DB und Secrets beim nächsten Redeploy verloren.
3. **Port**: `3001` als exponierten Container-Port setzen. Domain/SSL übernimmt Coolifys eigener Proxy automatisch.
4. **Healthcheck** (optional): In Coolifys Healthcheck-Einstellungen `/health` eintragen (liefert `200` inkl. echtem DB-Ping).
5. **Deployen**, zugewiesene Domain aufrufen → automatische Weiterleitung zum Setup-Wizard → Admin-Konto anlegen, fertig.

Wer Secrets lieber selbst verwalten will, kann `JWT_SECRET`/`CREDENTIALS_ENCRYPTION_KEY` (und optional `SMTP_*`) direkt als Coolify-Umgebungsvariablen setzen (siehe [Konfiguration (.env)](#konfiguration-env)) – der Wizard wird dann automatisch übersprungen.

## Tests

```bash
# Backend (Jest)
npm test

# Frontend Unit-Tests (Vitest)
cd frontend && npm test

# Frontend Build + E2E (Playwright, gegen den echten Server)
cd frontend && npm run build && npx playwright install --with-deps chromium && npm run test:e2e
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) läuft bei jedem Push/PR auf `master`: Backend-Tests, Frontend-Unit-Tests, Frontend-Build und Playwright-Smoke-Test. `.github/dependabot.yml` hält Backend-/Frontend-npm-Pakete, GitHub Actions und das Docker-Base-Image wöchentlich aktuell.

## Projektstruktur

```
server/               Express-Backend
  modules/<id>/        Router, Controller, module.json pro Feature
  services/             SSH/SFTP, Remote-DB, Storage, Proto-Import, Audit-Log
  config/               DB-Adapter (SQLite/MySQL) + zentrales Schema
  utils/                 Sanitizer, Verschlüsselung, SQL-Mapper, Workspace-Helper

frontend/             Vue 3 + Vite SPA
  src/modules/<id>/     Eine .vue-Komponente pro Feature-Modul
  src/pages/             Dashboard, Login, Workspaces, Teams, Admin, ...
  src/stores/            Pinia (auth, ui)
  e2e/                    Playwright-Specs

tests/                Backend Jest-Tests
data/                 SQLite-DB + Uploads (Laufzeit, git-ignored)
```

Detaillierter Guide zum Anlegen neuer Module: [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md).

## Zugriffslevel & Rollen

Jedes Modul hat ein `defaultAccess`-Level, das Admins zur Laufzeit im Admin-Panel überschreiben können:

- **public** – ohne Login nutzbar
- **user** – jeder eingeloggte, verifizierte Nutzer
- **premium** – Nutzer mit `is_premium`-Flag
- **admin** – nur Nutzer mit Rolle `admin`

Nutzerrollen (`admin` / `editor` / `viewer`) sind hierarchisch und getrennt vom Modul-Zugriffslevel – ein Admin hat immer Zugriff auf alle Module.

## Neues Modul hinzufügen

Siehe [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) für die Schritt-für-Schritt-Anleitung (Frontend-Komponente, Route, Backend-Router, `module.json`, Design-System, i18n, Release-Checkliste).
