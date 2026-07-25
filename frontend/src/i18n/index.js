import { createI18n } from 'vue-i18n';

const STORAGE_KEY = 'm2em_lang';
const FALLBACK_LANG = 'de';
const SUPPORTED = ['de', 'en'];

const saved = localStorage.getItem(STORAGE_KEY);
const initialLocale = SUPPORTED.includes(saved) ? saved : FALLBACK_LANG;

/**
 * Ports public/core/i18n.js. Messages are fetched at runtime from the
 * existing public/i18n/{de,en}.json (not bundled at build time), so
 * translators can keep editing those files without a frontend rebuild -
 * same operational behavior as today.
 */
export const i18n = createI18n({
    legacy: false,
    locale: initialLocale,
    fallbackLocale: FALLBACK_LANG,
    messages: {}
});

async function loadLocaleMessages(lang) {
    if (i18n.global.availableLocales.includes(lang)) return;
    const res = await fetch(`/i18n/${lang}.json`);
    if (!res.ok) throw new Error(`[i18n] Failed to load ${lang}.json: HTTP ${res.status}`);
    const messages = await res.json();
    i18n.global.setLocaleMessage(lang, messages);
}

export async function switchLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = FALLBACK_LANG;
    await loadLocaleMessages(lang);
    i18n.global.locale.value = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
}

/** Loads the persisted/default locale. Call once before mounting the app. */
export async function initI18n() {
    await loadLocaleMessages(initialLocale);
    document.documentElement.lang = initialLocale;
}
