import { defineStore } from 'pinia';
import router from '@/router';

const TOKEN_KEY = 'm2em_token';
const USER_KEY = 'm2em_user';
const ROLE_HIERARCHY = { admin: 3, editor: 2, viewer: 1 };

function readUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
        return null;
    }
}

/**
 * Ports public/core/auth.js. Also owns the module registry
 * (`/api/auth/modules/status`), previously fetched independently by
 * shared/layout.js and index.html - consolidated here into one
 * shared, cached fetch used by the dashboard, sub-nav, command
 * palette, and the router guard.
 */
export const useAuthStore = defineStore('auth', {
    state: () => ({
        token: localStorage.getItem(TOKEN_KEY) || null,
        user: readUser(),
        modules: [],
        modulesLoaded: false,
        needsSetup: false,
        setupChecked: false,
        idleTimeoutMinutes: 60,
        idleTimeoutLoaded: false
    }),
    getters: {
        isLoggedIn: (state) => !!state.token,
        role: (state) => state.user?.role || null
    },
    actions: {
        hasRole(requiredRole) {
            const level = ROLE_HIERARCHY[this.role] || 0;
            return this.role && level >= (ROLE_HIERARCHY[requiredRole] || 0);
        },

        /**
         * Mirrors core/auth.js's canAccess(): whether the current user
         * (or guest) may use a module at the given access level.
         */
        canAccess(accessLevel) {
            if (accessLevel === 'public') return true;
            if (!this.user) return false;
            if (this.user.role === 'admin') return true;
            if (accessLevel === 'user') return true;
            if (accessLevel === 'premium') return !!this.user.isPremium;
            if (accessLevel === 'admin') return this.user.role === 'admin';
            return false;
        },

        setSession(token, user) {
            this.token = token;
            this.user = user;
            localStorage.setItem(TOKEN_KEY, token);
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        },

        clearSession() {
            this.token = null;
            this.user = null;
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
        },

        async login(username, password) {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success && data.requires2FA) {
                return { success: true, requires2FA: true, pendingToken: data.pendingToken };
            }
            if (data.success) {
                this.setSession(data.token, data.user);
                return { success: true, user: data.user };
            }
            return { success: false, error: data.error || 'Login failed', needsVerification: data.needsVerification };
        },

        /**
         * Second step of login when the account has 2FA enabled - exchanges
         * the short-lived pendingToken from login() + a TOTP/recovery code
         * for a real session.
         */
        async verify2FA(pendingToken, code) {
            const res = await fetch('/api/auth/2fa/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pendingToken, code })
            });
            const data = await res.json();
            if (data.success) {
                this.setSession(data.token, data.user);
                return { success: true, user: data.user };
            }
            return { success: false, error: data.error || '2FA fehlgeschlagen' };
        },

        logout() {
            this.clearSession();
            router.push('/index.html');
        },

        /**
         * fetch() wrapper adding the bearer token; on 401/403 clears the
         * session and redirects to login with a ?redirect= back-link,
         * mirroring core/auth.js's authFetch (SPA navigation via the
         * router instead of a full page reload).
         */
        async authFetch(url, options = {}) {
            const headers = { ...(options.headers || {}) };
            if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
            if (options.body && !headers['Content-Type'] && ['POST', 'PUT', 'PATCH'].includes(options.method?.toUpperCase())) {
                headers['Content-Type'] = 'application/json';
            }

            const res = await fetch(url, { ...options, headers });
            // 401 only, not 403: 401 means the session itself is invalid
            // (expired/bad token) and warrants a forced logout. 403 means
            // the session is fine but this action isn't permitted (wrong
            // role, rate-limited, etc.) - logging the user out for that
            // is both wrong and, for rate-limits, actively harmful (a 429
            // is used for those specifically to avoid tripping this).
            if (res.status === 401) {
                this.clearSession();
                if (!router.currentRoute.value.path.includes('login')) {
                    router.push({ path: '/login.html', query: { redirect: router.currentRoute.value.fullPath } });
                }
            }
            return res;
        },

        /**
         * Idle-logout timeout (minutes), admin-configurable via the
         * Admin panel. Public endpoint so it applies to every session
         * without requiring a prior authenticated call.
         */
        async fetchIdleTimeout(force = false) {
            if (this.idleTimeoutLoaded && !force) return this.idleTimeoutMinutes;
            try {
                const res = await fetch('/api/admin/settings/public');
                const data = await res.json();
                this.idleTimeoutMinutes = Number.isFinite(data.idleTimeoutMinutes) ? data.idleTimeoutMinutes : 60;
                this.idleTimeoutLoaded = true;
            } catch (e) {
                console.error('[auth store] Failed to load idle timeout:', e);
            }
            return this.idleTimeoutMinutes;
        },

        async fetchModuleStatus(force = false) {
            if (this.modulesLoaded && !force) return this.modules;
            try {
                const res = await fetch('/api/auth/modules/status');
                this.modules = await res.json();
                this.modulesLoaded = true;
            } catch (e) {
                console.error('[auth store] Failed to load module status:', e);
            }
            return this.modules;
        },

        /**
         * Whether the in-app setup wizard (server/modules/setup/) still
         * needs to run - checked by the router guard on every navigation
         * until it resolves false once, then cached like fetchModuleStatus.
         */
        async checkSetupStatus(force = false) {
            if (this.setupChecked && !force) return this.needsSetup;
            try {
                const res = await fetch('/api/setup/status');
                const data = await res.json();
                this.needsSetup = !!data.needsSetup;
                this.setupChecked = true;
            } catch (e) {
                console.error('[auth store] Failed to load setup status:', e);
                // Fail open (assume no setup needed) rather than potentially
                // trapping every visitor on the wizard if the check itself
                // errors for an unrelated reason (e.g. a transient network blip).
                this.needsSetup = false;
                this.setupChecked = true;
            }
            return this.needsSetup;
        }
    }
});
