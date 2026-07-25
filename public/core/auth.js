/**
 * M2-Tools – Core Auth Client Helper
 * Handles JWT tokens, role management, and protected routes.
 */
(function () {
    'use strict';

    const TOKEN_KEY = 'm2em_token';
    const USER_KEY = 'm2em_user';

    const PUBLIC_PAGES = [
        '/index.html',
        '/login.html',
        '/register.html',
        '/modules/cube_editor/',
    ];

    const PROTECTED_PAGES = [
        '/modules/quest_builder/',
        '/modules/admin/',
        '/modules/db_mob_drop_editor/',
        '/teams.html',
        '/workspaces.html'
    ];

    // Initialize early to avoid race conditions
    window.m2Auth = {};

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
    function clearAuth() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

    function getUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); }
        catch { return null; }
    }

    function setUser(user) { localStorage.setItem(USER_KEY, JSON.stringify(user)); }
    function isLoggedIn() { return !!getToken(); }
    function getRole() { const u = getUser(); return u ? u.role : null; }

    function hasRole(requiredRole) {
        const hierarchy = { admin: 3, editor: 2, viewer: 1 };
        const role = getRole();
        return role && (hierarchy[role] || 0) >= (hierarchy[requiredRole] || 0);
    }

    function authHeaders() {
        const token = getToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    async function authFetch(url, options = {}) {
        const headers = { ...authHeaders(), ...(options.headers || {}) };
        
        // Auto-set JSON content type for common write methods if body exists
        if (options.body && !headers['Content-Type'] && ['POST', 'PUT', 'PATCH'].includes(options.method?.toUpperCase())) {
            headers['Content-Type'] = 'application/json';
        }

        const res = await fetch(url, { ...options, headers });
        if (res.status === 401 || res.status === 403) {
            clearAuth();
            if (!isPublicPage()) redirectToLogin();
        }
        return res;
    }

    async function login(username, password) {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            setToken(data.token);
            setUser(data.user);
            return { success: true, user: data.user };
        }
        return { success: false, error: data.error || 'Login failed', needsVerification: data.needsVerification };
    }

    function logout() {
        clearAuth();
        window.location.href = '/index.html';
    }

    function isPublicPage() {
        const path = window.location.pathname;
        return PUBLIC_PAGES.some(p => path === p || path.startsWith(p));
    }

    function isProtectedPage() {
        const path = window.location.pathname;
        // Check for exact matches and sub-dirs
        return PROTECTED_PAGES.some(p => path === p || path.startsWith(p));
    }

    function redirectToLogin() {
        const currentPath = window.location.pathname;
        if (!currentPath.includes('login.html')) {
            window.location.href = '/login.html?redirect=' + encodeURIComponent(currentPath);
        }
    }

    function redirectToDashboard() {
        window.location.href = '/index.html';
    }

    function init() {
        if (isProtectedPage() && !isLoggedIn()) {
            redirectToLogin();
            return;
        }
    }

    function canAccess(accessLevel) {
        if (accessLevel === 'public') return true;
        
        const user = getUser();
        if (!user) return false;
        if (user.role === 'admin') return true;
        
        if (accessLevel === 'user') return true;
        if (accessLevel === 'premium') return !!user.isPremium;
        if (accessLevel === 'admin') return user.role === 'admin';
        
        return false;
    }

    Object.assign(window.m2Auth, {
        init, login, logout,
        getToken, getUser, setUser, getRole, hasRole,
        canAccess,
        isLoggedIn, isPublicPage,
        authFetch, authHeaders,
        redirectToDashboard, redirectToLogin
    });

    // Auto-init
    init();
})();
