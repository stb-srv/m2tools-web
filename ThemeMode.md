# M2-Tools Theme & Design System

Dieses Dokument beschreibt, wie neue Seiten und Module erstellt werden müssen, damit sie nahtlos in das **M2-Tools** Ökosystem passen und sowohl den **Dark Mode** als auch den **Light Mode** korrekt unterstützen.

## 1. Grundprinzipien
- **Modularität**: Jedes Modul sollte seine eigene `style.css` und `app.js` haben, aber die globalen Ressourcen von `/shared/` und `/core/` nutzen.
- **CSS Variablen**: Verwende **NIEMALS** feste Farbcodes (z. B. `#000` oder `black`). Nutze immer die vordefinierten CSS-Variablen.
- **Konsistenz**: Nutze die `layout.js`, um automatisch die Navigation und den Footer einzubinden.

---

## 2. Erforderliche Dateien in jeder HTML-Seite

Jede neue Seite muss folgende Skripte und Styles im `<head>` laden:

```html
<!-- Globales Design-System -->
<link rel="stylesheet" href="/shared/shared.css">

<!-- Core Logik (Theme, Auth, i18n) -->
<script src="/core/theme.js"></script>
<script src="/core/auth.js"></script>
<script src="/core/i18n.js"></script>

<!-- Automatisches Layout (Navbar/Footer Injektion) -->
<script src="/shared/layout.js"></script>
```

---

## 3. CSS Variablen (Design Token)

Verwende diese Variablen in deiner Modul-spezifischen `style.css`:

### Hintergründe
- `var(--bg-body)` – Haupt-Hintergrund der Seite.
- `var(--bg-card)` – Hintergrund für Boxen/Cards (mit Glassmorphism-Effekt).
- `var(--bg-input)` – Hintergrund für Formularfelder und dunkle Akzente.
- `var(--bg-hover)` – Subtiler Hintergrund für Hover-Effekte.

### Texte
- `var(--text-primary)` – Standard Textfarbe.
- `var(--text-secondary)` – Weniger wichtiger Text (Grau).
- `var(--text-heading)` – Titel und Überschriften (Weiß in Dark, Dunkel in Light).
- `var(--gold-primary)` – Die Haupt-Akzentfarbe (Gold).

### Rahmen & Schatten
- `var(--border-color)` – Standard Rahmenfarbe (transparent-weiß/schwarz).
- `var(--gold-border)` – Goldener Rahmen für Fokus-Elemente.
- `var(--shadow-md)` – Standard Schatten.

---

## 4. Standardisierte UI-Klassen

Nutze diese Klassen, um sofort den M2-Tools Look zu erhalten:

### Buttons
- `.m2-btn .m2-btn-primary`: Goldener Haupt-Button.
- `.m2-btn .m2-btn-secondary`: Dunkler/Grauer Alternativ-Button.

### Container
- `.m2-main-content`: Der Hauptcontainer (zentriert alles und lässt Platz für die Navbar).
- `.m2-card`: Eine Box mit Rahmen und Schatten.

### Formulare
- `.m2-input`: Standard Eingabefeld.
- `.m2-select`: Standard Dropdown.
- `.m2-label`: Goldene Beschriftung über Eingabefeldern.

---

## 5. JavaScript UI Utilitys

Über `layout.js` stehen globale UI-Funktionen zur Verfügung, die statt `alert()` oder `confirm()` genutzt werden sollten:

- `window.m2Toast(message, type)` – Zeigt eine Benachrichtigung (type: 'success', 'error', 'info').
- `window.m2Alert(title, message)` – Ein schöneres Alert-Fenster.
- `window.m2Confirm(title, message, callback)` – Bestätigungsdialog.
- `window.m2Prompt(title, message, callback)` – Eingabeaufforderung.

---

## 6. Theme Mode Prüfung
Um sicherzustellen, dass dein Modul im Light Mode funktioniert:
1. Öffne die Konsole oder nutze den Theme-Switcher in der Navbar.
2. Prüfe, ob es "dunkle Löcher" gibt (hartcodierte Farben wie `rgba(0,0,0,0.5)`).
3. Ersetze diese durch `var(--bg-input)` oder `var(--bg-body)`.

---
*Erstellt von Senior Dev Antigravity für M2-Tools*
