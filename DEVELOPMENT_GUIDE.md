# ⚔️ M2-Tools – Development Guide (Version 3.0)

Willkommen im modularen System von **M2-Tools**. Das Frontend ist eine Vue 3 + Vite Single-Page-App (`frontend/`), das Backend bleibt ein modulares Express-System (`server/`). Dieser Guide beschreibt den Workflow zur Integration neuer Module, damit sie nahtlos ins Design-, Auth- und i18n-System passen.

---

## 🏗️ 1. Die Modul-Architektur

Jedes Modul besteht aus zwei Teilen:
1.  **Frontend**: Ein Ordner in `frontend/src/modules/<modul-id>/` (eine `.vue`-Komponente pro Modul).
2.  **Backend**: Ein Ordner in `server/modules/<modul_id>/` (Server-Logik & Routen) – unverändert gegenüber Version 2.0.

---

## 🚀 2. Schritt-für-Schritt Integration

### 📁 Schritt A: Frontend erstellen
Erstelle `frontend/src/modules/mein-neues-modul/MeinNeuesModul.vue`:

```vue
<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();
const data = ref(null);

onMounted(async () => {
    const res = await auth.authFetch('/api/mein_neues_modul/data');
    data.value = await res.json();
});
</script>

<template>
    <h1>Mein Modul</h1>
    <!-- {{ }} escaped automatisch - nie v-html für Server-/Nutzerdaten -->
</template>
```

Layout (Navbar, SubNav, Partikel-Hintergrund, Theming) kommt automatisch von `MainLayout.vue` – ein Modul muss dafür nichts einbinden.

### 🧭 Schritt B: Route registrieren
Trage die Route in `frontend/src/router/index.js` ein (URL muss exakt dem `url`-Feld aus `module.json`, Schritt D, entsprechen):

```javascript
{
    path: '/modules/mein_neues_modul/index.html',
    name: 'mein-neues-modul',
    component: () => import('@/modules/mein-neues-modul/MeinNeuesModul.vue'),
    meta: { moduleId: 'mein_neues_modul' } // dynamische Zugriffsprüfung, siehe Schritt D
}
```

### ⚙️ Schritt C: Backend (API) erstellen
Erstelle den Ordner `server/modules/mein_neues_modul/`.
1.  **router.js**: Definiert die Endpunkte.
2.  **controller.js**: Enthält die Logik.

**Beispiel `router.js`:**
```javascript
const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth } = require('../auth/middleware'); // Optional für Security

router.get('/data', requireAuth, controller.getData);
module.exports = router;
```

### 🔗 Schritt D: Modul registrieren (WICHTIGSTES ELEMENT)
Erstelle `server/modules/mein_neues_modul/module.json`. Dadurch wird es **automatisch** im Dashboard, in der Navigationsleiste und im Router-Guard berücksichtigt:

```json
{
    "id": "mein_neues_modul",
    "name": "Mein Modul",
    "desc": "Kurze Beschreibung...",
    "icon": "✨",
    "url": "/modules/mein_neues_modul/index.html",
    "api": "/api/mein_neues_modul",
    "defaultAccess": "user",
    "category": "Development"
}
```

`defaultAccess` ist `'public'`, `'user'`, `'premium'` oder `'admin'` – per Admin-Panel zur Laufzeit änderbar (`modules_config`-Tabelle), der Router-Guard liest das dynamisch, nicht aus `module.json` selbst.

Der Router in `server.js` bindet Module automatisch anhand des Ordnernamens ein – kein manueller Eintrag nötig.

---

## 🎨 3. Design-System & Standards

### 🧬 Globale Variablen
Verwende niemals hardcodierte Farben! Nutze immer die Variablen aus `frontend/src/assets/shared.css`:
*   `var(--gold-primary)`: Goldene Akzente
*   `var(--bg-card)`: Hintergründe für Panels (Glassmorphism)
*   `var(--text-primary)`: Haupt-Schriftfarbe
*   `var(--border-color)`: Standard-Rahmen

Wiederkehrende Layout-Patterns (Page-Header, Glass-Panel, Input-Group mit Icon, Badges) sind zentral in `shared.css` definiert – nicht pro Modul neu erfinden.

### 🔐 Authentifizierung (Frontend)
Um geschützte Daten vom Backend zu laden, nutze `authFetch` aus dem Auth-Store:
```javascript
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
const res = await auth.authFetch('/api/mein_modul/data');
const data = await res.json();
```
*Dies sendet automatisch den JWT-Token im Header mit und leitet bei 401/403 zum Login weiter.*

### 🔒 Escaping
`{{ }}`-Interpolation in Templates escaped automatisch – das ist der Grund für den Umstieg auf Vue. **Kein `v-html` für Server- oder Nutzerdaten** (Ausnahme nur für selbst generierten, bereits escapten Code wie im Quest-Builder-Codeblock, siehe dort als Referenz).

### 💬 Dialoge & Toasts
Nutze den UI-Store statt eigener Modals:
```javascript
import { useUiStore } from '@/stores/ui';
const ui = useUiStore();
ui.toast('Gespeichert!', 'success');
const confirmed = await ui.confirm('Titel', 'Nachricht?');
```

---

## 🌍 4. Mehrsprachigkeit (i18n)

Um Texte zu übersetzen, füge sie in `public/i18n/de.json` und `en.json` hinzu:
1.  **Navigation**: `nav.mein_modul`
2.  **Template**: `{{ $t('mein.key') }}`
3.  **Script**: `const { t } = useI18n(); t('mein.key')`

Die JSON-Dateien werden zur Laufzeit per `fetch` geladen (nicht gebundlet) – Übersetzungen lassen sich ohne Frontend-Rebuild aktualisieren.

---

## ✅ 5. Checkliste für den Release
- [ ] `module.json` in `server/modules/<id>/` angelegt?
- [ ] API-Router in `server/modules/<id>/router.js` (wird automatisch geladen)?
- [ ] Route in `frontend/src/router/index.js` mit `meta.moduleId` eingetragen?
- [ ] CSS nutzt globale Variablen (kein Plain White/Black)?
- [ ] `authStore.authFetch` für geschützte API-Anfragen genutzt?
- [ ] Kein `v-html` für Server-/Nutzerdaten verwendet?
- [ ] Icons und Beschreibungen in beiden Sprachen vorhanden?
- [ ] `npm run build` in `frontend/` fehlerfrei?

---

## 🛠️ Lokale Entwicklung

Zwei Prozesse parallel:
```bash
node server.js              # Backend auf :3001
cd frontend && npm run dev  # Vite Dev-Server auf :5173, proxied /api, /assets, /basic, /i18n zu :3001
```

Für Produktion/Vollintegrationstests:
```bash
cd frontend && npm run build   # baut nach public/dist/
node server.js                # serviert das gebaute Frontend + API auf einem Port
```

---
*M2-Tools – Robust. Modular. Edel.*
