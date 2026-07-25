# ⚔️ M2-Tools – Development Guide (Version 2.0)

Willkommen im neuen modularen System von **M2-Tools**. Dieser Guide beschreibt den professionellen Workflow zur Erstellung und Integration neuer Module (Apps), damit sie nahtlos in das Design- und Sicherheitssystem passen.

---

## 🏗️ 1. Die Modul-Architektur

Jedes Modul besteht aus zwei Teilen:
1.  **Frontend**: Ein Ordner in `public/modules/<modul_id>/` (HTML, JS, CSS).
2.  **Backend**: Ein Ordner in `server/modules/<modul_id>/` (Server-Logik & Routen).

---

## 🚀 2. Schritt-für-Schritt Integration

### 📁 Schritt A: Frontend erstellen
Erstelle einen Ordner unter `public/modules/mein_neues_modul/`.
Die `index.html` sollte folgendes Grundgerüst nutzen:

```html
<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
    <!-- Core & Layout Injections -->
    <link rel="stylesheet" href="/shared/shared.css">
    <script src="/core/theme.js"></script>
    <script src="/core/i18n.js"></script>
    <script src="/core/auth.js"></script>
    <script src="/shared/layout.js"></script>
</head>
<body>
    <main class="m2-main-content">
        <h1>Mein Modul</h1>
        <!-- Hier kommt dein Content hin -->
    </main>
    <script src="app.js"></script>
</body>
</html>
```
*Hinweis: `layout.js` injiziert automatisch die Navbar, den Footer, das Partikel-System und das CSS-Theming.*

### ⚙️ Schritt B: Backend (API) erstellen
Erstelle den Ordner `server/modules/mein_neues_modul/`.
1.  **router.js**: Definiert die Endpunkte.
2.  **controller.js**: Enthält die Logik.

**Beispiel `router.js`:**
```javascript
const express = require('express');
const router = express.Router();
const controller = require('./controller');
const auth = require('../../middleware/auth'); // Optional für Security

router.get('/data', auth, controller.getData);
module.exports = router;
```

### 🔗 Schritt C: Modul registrieren (WICHTIGSTES ELEMENT)
Trage dein Modul in `server/config/modules.js` ein. Dadurch wird es **automatisch** im Dashboard und in der Navigationsleiste angezeigt!

```javascript
{
    id: 'mein_neues_modul',
    name: 'Mein Modul',
    desc: 'Kurze Beschreibung...',
    icon: '✨',
    url: '/modules/mein_neues_modul/index.html',
    api: '/api/mein_neues_modul',
    defaultAccess: 'user', // 'public', 'user' oder 'admin'
    category: 'Development'
}
```

Zusätzlich musst du den Router in der `server.js` einmalig einbinden:
`registerModule('./server/modules/mein_neues_modul/router', 'Mein Modul', '/api/mein_modul');`

---

## 🎨 3. Design-System & Standards

### 🧬 Globale Variablen
Verwende niemals hardcodierte Farben! Nutze immer die Variablen aus `shared.css`:
*   `var(--gold-primary)`: Goldene Akzente
*   `var(--bg-card)`: Hintergründe für Panels (Glassmorphism)
*   `var(--text-primary)`: Haupt-Schriftfarbe
*   `var(--border-color)`: Standard-Rahmen

### 🔐 Authentifizierung (Frontend)
Um geschützte Daten vom Backend zu laden, nutze die `m2Auth.authFetch` Methode:
```javascript
const res = await window.m2Auth.authFetch('/api/mein_modul/data');
const data = await res.json();
```
*Dies sendet automatisch den JWT-Token im Header mit.*

---

## 🌍 4. Mehrsprachigkeit (i18n)

Um Texte zu übersetzen, füge sie in `public/i18n/de.json` und `en.json` hinzu:
1.  **Navigation**: `nav.mein_modul`
2.  **Content**: Nutze das Attribut `data-i18n="mein.key"` in deinem HTML.
3.  **JS**: `window.m2i18n.get('mein.key')`

---

## ✅ 5. Checkliste für den Release
- [ ] Modul in `server/config/modules.js` eingetragen?
- [ ] API-Routen in `server.js` registriert?
- [ ] CSS nutzt globale Variablen (Kein Plain White/Black)?
- [ ] `m2Auth.authFetch` für API-Anfragen genutzt?
- [ ] Icons und Beschreibungen in beiden Sprachen vorhanden?

---
*M2-Tools – Robust. Modular. Edel.*
