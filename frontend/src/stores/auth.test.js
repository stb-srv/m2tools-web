import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/router', () => ({
    default: {
        push: vi.fn(),
        currentRoute: { value: { path: '/index.html', fullPath: '/index.html' } }
    }
}));

import { useAuthStore } from './auth';

// Node 22's built-in experimental `localStorage` global shadows happy-dom's
// and throws without a --localstorage-file flag - stub a plain in-memory
// implementation instead so the store's localStorage.getItem/setItem calls
// (unrelated to what these tests actually check: canAccess/hasRole) don't blow up.
function createMemoryStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear()
    };
}

beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    setActivePinia(createPinia());
});

describe('canAccess', () => {
    it('always allows public modules, even for guests', () => {
        const auth = useAuthStore();
        expect(auth.canAccess('public')).toBe(true);
    });

    it('denies user/premium/admin modules to guests', () => {
        const auth = useAuthStore();
        expect(auth.canAccess('user')).toBe(false);
        expect(auth.canAccess('premium')).toBe(false);
        expect(auth.canAccess('admin')).toBe(false);
    });

    it('lets a plain user access "user" modules but not premium/admin', () => {
        const auth = useAuthStore();
        auth.user = { role: 'user', isPremium: false };
        expect(auth.canAccess('user')).toBe(true);
        expect(auth.canAccess('premium')).toBe(false);
        expect(auth.canAccess('admin')).toBe(false);
    });

    it('lets a premium user access premium modules', () => {
        const auth = useAuthStore();
        auth.user = { role: 'user', isPremium: true };
        expect(auth.canAccess('premium')).toBe(true);
    });

    it('lets an admin access everything regardless of premium flag', () => {
        const auth = useAuthStore();
        auth.user = { role: 'admin', isPremium: false };
        expect(auth.canAccess('user')).toBe(true);
        expect(auth.canAccess('premium')).toBe(true);
        expect(auth.canAccess('admin')).toBe(true);
    });
});

describe('hasRole', () => {
    it('is falsy when logged out', () => {
        const auth = useAuthStore();
        expect(auth.hasRole('viewer')).toBeFalsy();
    });

    it('respects the role hierarchy (admin > editor > viewer)', () => {
        const auth = useAuthStore();
        auth.user = { role: 'editor' };
        expect(auth.hasRole('viewer')).toBe(true);
        expect(auth.hasRole('editor')).toBe(true);
        expect(auth.hasRole('admin')).toBe(false);
    });

    it('an admin satisfies every role requirement', () => {
        const auth = useAuthStore();
        auth.user = { role: 'admin' };
        expect(auth.hasRole('viewer')).toBe(true);
        expect(auth.hasRole('editor')).toBe(true);
        expect(auth.hasRole('admin')).toBe(true);
    });

    it('treats an unknown role as having no privileges', () => {
        const auth = useAuthStore();
        auth.user = { role: 'banned' };
        expect(auth.hasRole('viewer')).toBe(false);
    });
});
