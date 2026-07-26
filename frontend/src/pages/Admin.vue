<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();

const API = {
    modules: '/api/admin/modules',
    updateModule: '/api/admin/modules/update',
    users: '/api/admin/users',
    updateUser: '/api/admin/users/update',
    settings: '/api/admin/settings',
    updateSettings: '/api/admin/settings/update',
    teams: '/api/teams/admin/list',
    deleteTeam: '/api/teams/admin/delete'
};

const modules = ref([]);
const users = ref([]);
const teams = ref([]);

const settings = ref({
    storageStd: 150,
    storagePre: 300,
    wsMax: 1,
    teamsMax: 3,
    teamSize: 5
});

async function loadData() {
    try {
        const [modRes, userRes, setRes, teamRes] = await Promise.all([
            auth.authFetch(API.modules),
            auth.authFetch(API.users),
            auth.authFetch(API.settings),
            auth.authFetch(API.teams)
        ]);

        const modData = await modRes.json();
        if (Array.isArray(modData)) modules.value = modData;

        const userData = await userRes.json();
        if (Array.isArray(userData)) users.value = userData;

        const setData = await setRes.json();
        settings.value = {
            storageStd: Math.round(parseInt(setData.storage_limit_standard || 157286400) / 1024 / 1024),
            storagePre: Math.round(parseInt(setData.storage_limit_premium || 314572800) / 1024 / 1024),
            wsMax: setData.max_workspaces_per_user || 1,
            teamsMax: setData.max_teams_per_user || 3,
            teamSize: setData.max_team_members || 5
        };

        const teamData = await teamRes.json();
        if (Array.isArray(teamData)) teams.value = teamData;
    } catch (err) {
        console.error(err);
        ui.toast('Fehler beim Laden: ' + err.message, 'error');
    }
}

async function updateModuleConfig(m) {
    try {
        const res = await auth.authFetch(API.updateModule, {
            method: 'POST',
            body: JSON.stringify({ id: m.id, access_level: m.access_level, is_visible_guests: m.is_visible_guests })
        });
        if ((await res.json()).success) ui.toast('Modul-Konfiguration gespeichert', 'success');
    } catch {
        ui.toast('Fehler beim Speichern', 'error');
    }
}

async function updateUserRole(u) {
    try {
        const res = await auth.authFetch(API.updateUser, {
            method: 'POST',
            body: JSON.stringify({ userId: u.id, role: u.role, isPremium: u.isPremium ? 1 : 0 })
        });
        if ((await res.json()).success) ui.toast('Benutzer aktualisiert', 'success');
    } catch {
        ui.toast('Fehler beim Speichern', 'error');
    }
}

async function deleteTeamAdmin(teamId) {
    const confirmed = await ui.confirm('Team löschen?', 'Dieses Team wirklich unwiderruflich löschen? Alle Mitglieder werden entfernt.');
    if (!confirmed) return;
    try {
        const res = await auth.authFetch(API.deleteTeam, { method: 'POST', body: JSON.stringify({ teamId }) });
        if ((await res.json()).success) {
            ui.toast('Team gelöscht', 'success');
            loadData();
        }
    } catch {
        ui.toast('Fehler beim Löschen', 'error');
    }
}

async function saveSystemSettings() {
    try {
        const { storageStd, storagePre, wsMax, teamsMax, teamSize } = settings.value;
        if (isNaN(storageStd) || isNaN(storagePre)) throw new Error('Bitte valide Zahlen eingeben');

        const payload = {
            storage_limit_standard: Math.round(storageStd * 1024 * 1024),
            storage_limit_premium: Math.round(storagePre * 1024 * 1024),
            max_workspaces_per_user: parseInt(wsMax),
            max_teams_per_user: parseInt(teamsMax),
            max_team_members: parseInt(teamSize)
        };

        const res = await auth.authFetch(API.updateSettings, { method: 'POST', body: JSON.stringify(payload) });
        if ((await res.json()).success) ui.toast('System-Einstellungen gespeichert', 'success');
    } catch (err) {
        ui.toast('Fehler: ' + err.message, 'error');
    }
}

onMounted(loadData);
</script>

<template>
    <header style="text-align: center; margin-bottom: 50px;">
        <div class="header-breadcrumb"><router-link to="/index.html">Dashboard</router-link> / Admin Panel</div>
        <h1 style="font-family: var(--font-heading); font-size: 3rem; letter-spacing: 3px; margin-top: 15px;">🛡️ ADMIN <span class="gold">PANEL</span></h1>
        <p style="color: var(--text-secondary); margin-top: 10px; font-size: 1.1rem; letter-spacing: 1px;">Verwalte Module, Berechtigungen und Benutzerzugriffe</p>
    </header>

    <div class="admin-container">
        <div class="admin-card">
            <h2>📦 Items & Icons</h2>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px;">
                <div>
                    <p style="color: var(--text-secondary); margin-bottom: 5px;">Synchronisiere deine <code>item_proto.sql</code> und verwalte die Icon-Vorschau.</p>
                    <small style="opacity: 0.6;">Automatische Größen-Erkennung (1x1, 1x2, 1x3) aktiv.</small>
                </div>
                <router-link to="/modules/item_manager/index.html" class="m2-btn m2-btn-primary">🎒 Item-Manager öffnen</router-link>
            </div>
        </div>

        <div class="admin-card">
            <h2>🛠️ Modul-Berechtigungen</h2>
            <table class="admin-table">
                <thead>
                    <tr><th>ID</th><th>Modul</th><th>Berechtigung</th><th>Sichtbarkeit</th><th>Status</th></tr>
                </thead>
                <tbody>
                    <tr v-for="m in modules" :key="m.id">
                        <td><code>{{ m.id }}</code></td>
                        <td><strong>{{ m.name }}</strong></td>
                        <td>
                            <select v-model="m.access_level" class="m2-select-admin" @change="updateModuleConfig(m)">
                                <option value="public">🌐 Öffentlich</option>
                                <option value="user">👤 Account benötigt</option>
                                <option value="premium">🌟 Premium-Nutzer</option>
                                <option value="admin">🛡️ Nur Admins</option>
                            </select>
                        </td>
                        <td>
                            <input :id="`visible-${m.id}`" v-model="m.is_visible_guests" type="checkbox" @change="updateModuleConfig(m)">
                            <label :for="`visible-${m.id}`" style="font-size:0.8rem; opacity:0.8;">Gästen anzeigen</label>
                        </td>
                        <td><small style="color:var(--text-muted)">Live gespeichert</small></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="admin-card">
            <h2>👥 Benutzerverwaltung</h2>
            <table class="admin-table">
                <thead>
                    <tr><th>ID</th><th>Benutzername</th><th>Rolle</th><th>Premium</th><th>Erstellt am</th><th>Aktion</th></tr>
                </thead>
                <tbody>
                    <tr v-for="u in users" :key="u.id">
                        <td>{{ u.id }}</td>
                        <td>{{ u.username }} <small v-if="u.displayName">({{ u.displayName }})</small></td>
                        <td>
                            <select v-model="u.role" class="m2-select-admin" @change="updateUserRole(u)">
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                            </select>
                        </td>
                        <td>
                            <input v-model="u.isPremium" type="checkbox" @change="updateUserRole(u)">
                            <span v-if="u.isPremium" class="status-badge badge-premium">Premium</span>
                        </td>
                        <td>{{ new Date(u.createdAt).toLocaleDateString() }}</td>
                        <td><button class="m2-btn m2-btn-secondary" style="padding: 2px 8px; font-size: 0.7rem;">Details</button></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="admin-card">
            <h2>🛡️ Team-Verwaltung (Alle Teams)</h2>
            <table class="admin-table">
                <thead>
                    <tr><th>ID</th><th>Team-Name</th><th>Besitzer (Owner)</th><th>Mitglieder</th><th>Erstellt am</th><th>Aktion</th></tr>
                </thead>
                <tbody>
                    <tr v-for="t in teams" :key="t.id">
                        <td>{{ t.id }}</td>
                        <td><strong>{{ t.name }}</strong></td>
                        <td>{{ t.owner_name }} <small>(ID: {{ t.owner_id }})</small></td>
                        <td><span class="status-badge badge-user">{{ t.memberCount }} Mitglieder</span></td>
                        <td>{{ new Date(t.created_at).toLocaleDateString() }}</td>
                        <td>
                            <button class="m2-btn m2-btn-secondary" style="padding: 2px 8px; font-size: 0.7rem; color: #f44336; border-color: rgba(244,67,54,0.2);" @click="deleteTeamAdmin(t.id)">
                                Löschen
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="admin-card">
            <h2>⚙️ System-Einstellungen</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="m2-field-group">
                    <label class="m2-label">Standard Speicherlimit pro Workspace (MB)</label>
                    <input v-model.number="settings.storageStd" type="number" class="m2-input" placeholder="z.B. 150">
                    <span class="m2-hint">Limit je Workspace für reguläre Benutzer (nicht pro Account) - greift bei 10% Überschreitung</span>
                </div>
                <div class="m2-field-group">
                    <label class="m2-label">Premium Speicherlimit pro Workspace (MB)</label>
                    <input v-model.number="settings.storagePre" type="number" class="m2-input" placeholder="z.B. 300">
                    <span class="m2-hint">Limit je Workspace für Premium-Accounts - greift bei 10% Überschreitung</span>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 20px;">
                <div class="m2-field-group">
                    <label class="m2-label">Max. Workspaces per User</label>
                    <input v-model.number="settings.wsMax" type="number" class="m2-input" placeholder="z.B. 1">
                    <span class="m2-hint">Normaler User</span>
                </div>
                <div class="m2-field-group">
                    <label class="m2-label">Max. Teams per User</label>
                    <input v-model.number="settings.teamsMax" type="number" class="m2-input" placeholder="z.B. 3">
                    <span class="m2-hint">In wie vielen Teams darf man sein?</span>
                </div>
                <div class="m2-field-group">
                    <label class="m2-label">Max. Team Size</label>
                    <input v-model.number="settings.teamSize" type="number" class="m2-input" placeholder="z.B. 5">
                    <span class="m2-hint">Mitglieder pro Team</span>
                </div>
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
                <button class="m2-btn m2-btn-primary" @click="saveSystemSettings">💾 Einstellungen speichern</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.admin-container {
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: 30px;
    padding: 20px;
}

.admin-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 30px; backdrop-filter: blur(15px); }
.admin-card h2 { font-family: var(--font-heading); margin-bottom: 25px; color: var(--gold-primary); display: flex; align-items: center; gap: 10px; }

.admin-table { width: 100%; border-collapse: collapse; }
.admin-table th { text-align: left; padding: 15px; border-bottom: 2px solid var(--border-color); color: var(--text-secondary); font-size: 0.9rem; }
.admin-table td { padding: 15px; border-bottom: 1px solid var(--border-color); }

.status-badge { padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
.badge-premium { background: var(--gold-primary); color: #000; }
.badge-admin { background: #E91E63; color: #fff; }
.badge-user { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); }
</style>
