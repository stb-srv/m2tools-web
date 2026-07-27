import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

// Route paths are kept byte-identical to the old static HTML pages
// (see migration plan): server/modules/*/module.json's `url` field
// and the dashboard/nav links point at these exact paths, and the
// backend is out of scope for this migration.
const routes = [
    { path: '/', redirect: '/index.html' },
    { path: '/index.html', name: 'dashboard', component: () => import('@/pages/Dashboard.vue') },
    { path: '/login.html', name: 'login', component: () => import('@/pages/Login.vue') },
    { path: '/register.html', name: 'register', component: () => import('@/pages/Register.vue') },
    { path: '/forgot-password.html', name: 'forgot-password', component: () => import('@/pages/ForgotPassword.vue') },
    { path: '/reset-password.html', name: 'reset-password', component: () => import('@/pages/ResetPassword.vue') },
    { path: '/setup.html', name: 'setup', component: () => import('@/pages/Setup.vue') },
    { path: '/account.html', name: 'account', component: () => import('@/pages/Account.vue'), meta: { requiresAuth: true } },
    { path: '/admin.html', name: 'admin', component: () => import('@/pages/Admin.vue'), meta: { requiresAuth: true, requiresRole: 'admin' } },
    { path: '/teams.html', name: 'teams', component: () => import('@/pages/Teams.vue'), meta: { moduleId: 'teams' } },
    { path: '/workspaces.html', name: 'workspaces', component: () => import('@/pages/Workspaces.vue'), meta: { moduleId: 'workspaces' } },
    { path: '/workspace_settings.html', name: 'workspace-settings', component: () => import('@/pages/WorkspaceSettings.vue'), meta: { requiresAuth: true } },
    { path: '/guide.html', name: 'guide', component: () => import('@/pages/Guide.vue'), meta: { moduleId: 'guide' } },
    { path: '/patch_notes.html', name: 'patch-notes', component: () => import('@/pages/PatchNotes.vue') },

    { path: '/modules/cube_editor/index.html', name: 'cube-editor', component: () => import('@/modules/cube-editor/CubeEditor.vue'), meta: { moduleId: 'cube_editor' } },
    { path: '/modules/item_manager/index.html', name: 'item-manager', component: () => import('@/modules/item-manager/ItemManager.vue'), meta: { moduleId: 'item_manager' } },
    { path: '/modules/mob_drop_editor/index.html', name: 'mob-drop-editor', component: () => import('@/modules/mob-drop-editor/MobDropEditor.vue'), meta: { moduleId: 'mob_drop_editor' } },
    { path: '/modules/proto_import/index.html', name: 'proto-import', component: () => import('@/modules/proto-import/ProtoImport.vue'), meta: { moduleId: 'proto_import' } },
    { path: '/modules/quest_builder/index.html', name: 'quest-builder', component: () => import('@/modules/quest-builder/QuestBuilder.vue'), meta: { moduleId: 'quest_builder' } },
    { path: '/modules/regen_editor/index.html', name: 'regen-editor', component: () => import('@/modules/regen-editor/RegenEditor.vue'), meta: { moduleId: 'regen_editor' } },
    { path: '/modules/npc_shop_editor/index.html', name: 'npc-shop-editor', component: () => import('@/modules/npc-shop-editor/NpcShopEditor.vue'), meta: { moduleId: 'npc_shop_editor' } },
    { path: '/modules/locale_editor/index.html', name: 'locale-editor', component: () => import('@/modules/locale-editor/LocaleEditor.vue'), meta: { moduleId: 'locale_editor' } },
    { path: '/modules/server_status/index.html', name: 'server-status', component: () => import('@/modules/server-status/ServerStatusDashboard.vue'), meta: { moduleId: 'server_status' } },
    { path: '/modules/special_item_group/index.html', name: 'special-item-group', component: () => import('@/modules/special-item-group/SpecialItemGroup.vue'), meta: { moduleId: 'special_item_group' } },
    { path: '/modules/tga_converter/index.html', name: 'tga-converter', component: () => import('@/modules/tga-converter/TgaConverter.vue'), meta: { moduleId: 'tga_converter' } }
];

const router = createRouter({
    history: createWebHistory(),
    routes
});

/**
 * Client-side UX gating only - the same enforcement already happens
 * server-side on every /api/* call, this just avoids flashing a page
 * the user can't use. Two shapes:
 *  - `meta.moduleId`: access level is DB-driven and admin-editable at
 *    runtime (server/modules/*\/module.json + modules_config table),
 *    so it's looked up from the auth store's cached module list rather
 *    than hardcoded per route.
 *  - `meta.requiresAuth` (+ optional `meta.requiresRole`): static pages
 *    that aren't part of the module registry (account/admin/workspace
 *    settings).
 */
router.beforeEach(async (to) => {
    const auth = useAuthStore();

    // Blanket first check: while the in-app setup wizard hasn't run yet
    // (no JWT_SECRET/CREDENTIALS_ENCRYPTION_KEY configured on the server,
    // see server/config/runtimeConfig.js), every route redirects there -
    // nothing else in the app is meaningfully usable without it (there
    // isn't even an admin account yet). Once it's done, /setup.html itself
    // redirects away instead (defense in depth alongside the backend's own
    // needsSetup()-based 403 on re-running it).
    await auth.checkSetupStatus();
    if (auth.needsSetup && to.path !== '/setup.html') {
        return '/setup.html';
    }
    if (!auth.needsSetup && to.path === '/setup.html') {
        return '/login.html';
    }

    if (to.meta.moduleId) {
        await auth.fetchModuleStatus();
        const mod = auth.modules.find(m => m.id === to.meta.moduleId);
        const accessLevel = mod?.access_level || 'user';
        if (!auth.canAccess(accessLevel)) {
            return { path: '/login.html', query: { redirect: to.fullPath } };
        }
        return true;
    }

    if (to.meta.requiresAuth && !auth.isLoggedIn) {
        return { path: '/login.html', query: { redirect: to.fullPath } };
    }

    if (to.meta.requiresRole && auth.role !== to.meta.requiresRole) {
        return auth.isLoggedIn ? '/index.html' : { path: '/login.html', query: { redirect: to.fullPath } };
    }

    return true;
});

export default router;
