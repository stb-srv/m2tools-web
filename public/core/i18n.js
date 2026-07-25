/**
 * M2-Tools – i18n System
 * Lightweight language switcher with localStorage persistence and standardized paths.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'm2em_lang';
    const FALLBACK_LANG = 'de';
    const SUPPORTED = ['de', 'en'];
    let currentLang = FALLBACK_LANG;
    let translations = {};
    let onChangeCallbacks = [];

    function getNestedValue(obj, path) {
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);
    }

    async function loadLanguage(lang) {
        if (!SUPPORTED.includes(lang)) lang = FALLBACK_LANG;
        // Standardize to root /i18n/
        const res = await fetch(`/i18n/${lang}.json`);
        try {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            translations = await res.json();
            currentLang = lang;
            localStorage.setItem(STORAGE_KEY, lang);
            applyTranslations();
            window.dispatchEvent(new CustomEvent('m2-lang-changed', { detail: lang }));
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
            if (el.hasAttribute('data-i18n-attr')) {
                el.setAttribute(el.getAttribute('data-i18n-attr'), val);
            } else {
                el.textContent = val;
            }
        });
        document.documentElement.lang = currentLang;
    }

    function t(key, fallback) {
        const val = getNestedValue(translations, key);
        return val !== null ? val : (fallback || key);
    }

    function init() {
        const saved = localStorage.getItem(STORAGE_KEY);
        currentLang = SUPPORTED.includes(saved) ? saved : FALLBACK_LANG;
        loadLanguage(currentLang);
    }

    window.m2i18n = {
        t,
        currentLang: () => currentLang,
        switch: (lang) => loadLanguage(lang),
        onChange: (cb) => onChangeCallbacks.push(cb),
        init,
        refresh: applyTranslations
    };

    // Auto-init
    init();
})();
