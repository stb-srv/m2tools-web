import { defineStore } from 'pinia';

const STORAGE_KEY = 'm2em_theme';
const DEFAULT_THEME = 'dark';

/**
 * Ports public/core/theme.js. shared.css keys its custom properties
 * off `data-theme` on <html>, so that attribute is kept in sync as a
 * side effect of every theme change.
 */
export const useThemeStore = defineStore('theme', {
    state: () => ({
        theme: localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME
    }),
    actions: {
        init() {
            this.apply(this.theme);
        },
        apply(theme) {
            this.theme = theme;
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem(STORAGE_KEY, theme);
        },
        toggle() {
            this.apply(this.theme === 'dark' ? 'light' : 'dark');
        }
    }
});
