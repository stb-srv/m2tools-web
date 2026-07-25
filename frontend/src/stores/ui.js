import { defineStore } from 'pinia';

let nextToastId = 1;

/**
 * Replaces the window.m2Toast/m2Alert/m2Confirm/m2Prompt globals from
 * shared/utils.js + shared/layout.js's modal functions. confirm/alert/
 * prompt return Promises instead of taking callbacks - nicer with
 * async/await, same call-site simplicity as the old globals.
 */
export const useUiStore = defineStore('ui', {
    state: () => ({
        toasts: [],
        modal: null, // { type: 'confirm'|'alert'|'prompt', title, message, okText, cancelText, defaultValue, resolve }
        commandPaletteOpen: false
    }),
    actions: {
        toggleCommandPalette() {
            this.commandPaletteOpen = !this.commandPaletteOpen;
        },

        toast(message, type = 'info', duration = 4000) {
            const id = nextToastId++;
            this.toasts.push({ id, message, type });
            setTimeout(() => this.dismissToast(id), duration);
        },

        dismissToast(id) {
            this.toasts = this.toasts.filter(t => t.id !== id);
        },

        alert(title, message, okText = 'OK') {
            return new Promise((resolve) => {
                this.modal = { type: 'alert', title, message, okText, resolve };
            });
        },

        confirm(title, message, okText = 'Ja', cancelText = 'Nein') {
            return new Promise((resolve) => {
                this.modal = { type: 'confirm', title, message, okText, cancelText, resolve };
            });
        },

        prompt(title, message, defaultValue = '') {
            return new Promise((resolve) => {
                this.modal = { type: 'prompt', title, message, defaultValue, resolve };
            });
        },

        closeModal(result) {
            if (this.modal) this.modal.resolve(result);
            this.modal = null;
        }
    }
});
