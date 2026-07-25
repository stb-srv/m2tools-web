/**
 * M2 Easy Manager – i18n System
 * Lightweight language switcher with localStorage persistence.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'm2em_lang';
    const FALLBACK_LANG = 'de';
    const SUPPORTED = ['de', 'en'];
    let currentLang = FALLBACK_LANG;
    let translations = {};
    let onChangeCallbacks = [];

    /* ── helpers ─────────────────────────────────────────── */

    function getNestedValue(obj, path) {
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);
    }

    function detectBasePath() {
        // Determine where the i18n folder is relative to the current page
        const scripts = document.querySelectorAll('script[src*="i18n.js"]');
        if (scripts.length) {
            const src = scripts[0].getAttribute('src');
            return src.replace('i18n.js', '');
        }
        // Default: assume we are in public/ or apps/xxx/
        const depth = (window.location.pathname.match(/apps\/[^/]+/g) || []).length;
        if (depth) return '../../i18n/';
        return 'i18n/';
    }

    /* ── core ────────────────────────────────────────────── */

    async function loadLanguage(lang) {
        if (!SUPPORTED.includes(lang)) lang = FALLBACK_LANG;
        const base = detectBasePath();
        try {
            const res = await fetch(`${base}${lang}.json`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            translations = await res.json();
            currentLang = lang;
            localStorage.setItem(STORAGE_KEY, lang);
            applyTranslations();
            updateSwitcher();
            onChangeCallbacks.forEach(cb => cb(lang));
        } catch (err) {
            console.error(`[i18n] Failed to load ${lang}.json`, err);
        }
    }

    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const val = getNestedValue(translations, key);
            if (val === null) return;
            // Support placeholder attribute
            if (el.hasAttribute('data-i18n-attr')) {
                el.setAttribute(el.getAttribute('data-i18n-attr'), val);
            } else {
                el.textContent = val;
            }
        });
        // Update html lang
        document.documentElement.lang = currentLang;
    }

    /** Translate a key programmatically */
    function t(key, fallback) {
        const val = getNestedValue(translations, key);
        return val !== null ? val : (fallback || key);
    }

    /* ── switcher UI ─────────────────────────────────────── */

    function createSwitcher() {
        const container = document.createElement('div');
        container.className = 'i18n-switcher';
        container.id = 'language-switcher';

        const flagMap = { de: '🇩🇪', en: '🇬🇧' };

        SUPPORTED.forEach(lang => {
            const btn = document.createElement('button');
            btn.className = `i18n-btn ${lang === currentLang ? 'active' : ''}`;
            btn.dataset.lang = lang;
            btn.textContent = flagMap[lang] || lang.toUpperCase();
            btn.title = lang === 'de' ? 'Deutsch' : 'English';
            btn.addEventListener('click', () => loadLanguage(lang));
            container.appendChild(btn);
        });

        return container;
    }

    function updateSwitcher() {
        document.querySelectorAll('.i18n-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === currentLang);
        });
    }

    function injectSwitcher() {
        const target = document.querySelector('[data-i18n-switcher]') || document.querySelector('header');
        if (!target) return;
        const existing = document.getElementById('language-switcher');
        if (existing) existing.remove();
        const switcher = createSwitcher();
        target.style.position = 'relative';
        target.appendChild(switcher);
    }

    /* ── init ────────────────────────────────────────────── */

    function init() {
        const saved = localStorage.getItem(STORAGE_KEY);
        currentLang = SUPPORTED.includes(saved) ? saved : FALLBACK_LANG;
        injectSwitcher();
        loadLanguage(currentLang);
    }

    /* ── public API ──────────────────────────────────────── */

    window.i18n = {
        t,
        currentLang: () => currentLang,
        switch: (lang) => loadLanguage(lang),
        onChange: (cb) => onChangeCallbacks.push(cb),
        init,
        refresh: applyTranslations
    };

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
