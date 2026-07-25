/**
 * M2-Tools – Core Theme System
 * Persistent Dark/Light theme management.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'm2em_theme';
    const DEFAULT_THEME = 'dark';

    function getTheme() {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        window.dispatchEvent(new CustomEvent('m2-theme-changed', { detail: theme }));
    }

    function toggleTheme() {
        const current = getTheme();
        applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    function init() {
        // Enforce dark theme if no choice has been made yet
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) {
            applyTheme('dark');
        } else {
            applyTheme(saved);
        }
    }


    window.m2Theme = {
        init,
        toggle: toggleTheme,
        get: getTheme,
        set: applyTheme
    };

    // Auto-init
    init();
})();
