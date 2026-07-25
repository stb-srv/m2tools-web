/**
 * M2-Tools – Shared Utilities
 * Zentrale Hilfsfunktionen für alle Frontend-Module.
 */

window.m2Safe = {
    /**
     * Verhindert XSS durch Escaping von HTML-Sonderzeichen.
     */
    escape: (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'),
    
    /**
     * Escaped Sonderzeichen für Lua-Strings.
     */
    lua: (s) => (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
};

window.m2UI = {
    /**
     * Zeigt eine Toast-Benachrichtigung an.
     */
    toast(message, type = 'info') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    /**
     * Ein einfacher Bestätigungsdialog (Ersatz für window.confirm).
     */
    confirm(title, text, onConfirm) {
        if (window.m2Confirm) return window.m2Confirm(title, text, onConfirm);
        if (confirm(`${title}\n\n${text}`)) onConfirm();
    },

    /**
     * Ein einfacher Eingabedialog (Ersatz für window.prompt).
     */
    prompt(title, text, onResult) {
        if (window.m2Prompt) return window.m2Prompt(title, text, onResult);
        const res = prompt(`${title}\n\n${text}`);
        if (res !== null) onResult(res);
    }
};

/**
 * Hilfsfunktion zum Kopieren in die Zwischenablage.
 */
window.m2Copy = (text) => {
    navigator.clipboard.writeText(text)
        .then(() => window.m2UI.toast('In Zwischenablage kopiert!', 'success'))
        .catch(() => window.m2UI.toast('Kopieren fehlgeschlagen', 'error'));
};
