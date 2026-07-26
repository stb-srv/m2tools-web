<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();

const workspaces = ref([]);
const activeId = ref(null);
const userTeams = ref([]);
const loading = ref(true);
const storageLimit = ref(0);

function usageMb(ws) {
    return ((ws.usage || 0) / 1024 / 1024).toFixed(1);
}
function limitMb() {
    return (storageLimit.value / 1024 / 1024).toFixed(0);
}
function usagePercent(ws) {
    return Math.min(100, ((ws.usage || 0) / (storageLimit.value || 1)) * 100);
}
function isNearLimit(ws) {
    return (ws.usage || 0) > storageLimit.value * 0.9;
}

const createModalOpen = ref(false);
const wsName = ref('');
const wsTeam = ref('');
const wsDesc = ref('');
const wsPath = ref('');

function teamLabel(ws) {
    if (!ws.team_id) return { icon: '👤', text: 'PERSONAL', personal: true };
    const team = userTeams.value.find(t => t.id === ws.team_id);
    return { icon: '👥', text: `TEAM: ${team ? team.name : 'Unknown'}`, personal: false };
}

async function loadWorkspaces() {
    loading.value = true;
    try {
        const wsRes = await auth.authFetch('/api/workspaces');
        const data = await wsRes.json();
        workspaces.value = data.workspaces || [];
        activeId.value = data.activeId;
        storageLimit.value = data.limit || 0;

        const teamsRes = await auth.authFetch('/api/teams');
        userTeams.value = await teamsRes.json();
    } catch (e) {
        console.error(e);
        ui.toast('Fehler beim Laden', 'error');
    } finally {
        loading.value = false;
    }
}

function showCreateModal() {
    wsName.value = '';
    wsTeam.value = '';
    wsDesc.value = '';
    wsPath.value = '';
    createModalOpen.value = true;
}

async function submitCreate() {
    if (!wsName.value) { ui.toast('Bitte Name angeben', 'warning'); return; }

    const res = await auth.authFetch('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({
            name: wsName.value,
            description: wsDesc.value,
            base_path: wsPath.value,
            team_id: wsTeam.value ? parseInt(wsTeam.value) : null
        })
    });

    if (res.ok) {
        ui.toast('Workspace erstellt', 'success');
        createModalOpen.value = false;
        loadWorkspaces();
    }
}

async function selectWorkspace(id) {
    const res = await auth.authFetch('/api/workspaces/select', { method: 'POST', body: JSON.stringify({ id }) });
    if (res.ok) {
        ui.toast('Erfolgreich gewechselt', 'success');
        loadWorkspaces();
    }
}

async function deleteWorkspace(id) {
    const confirmed = await ui.confirm('Löschen?', 'Willst du diesen Workspace wirklich löschen?');
    if (!confirmed) return;
    const res = await auth.authFetch(`/api/workspaces/${id}`, { method: 'DELETE' });
    if (res.ok) {
        ui.toast('Gelöscht', 'success');
        loadWorkspaces();
    }
}

onMounted(loadWorkspaces);
</script>

<template>
    <div class="ws-container">
        <div style="margin-bottom: 20px;">
            <router-link to="/index.html" class="m2-btn m2-btn-secondary" style="text-decoration:none; display:inline-flex; align-items:center; gap:8px;">⬅ Dashboard</router-link>
        </div>

        <header class="ws-header">
            <h1>WORKSPACES <span class="accent">MANAGER</span></h1>
            <p>Verwalte verschiedene Server-Profile und Projekte.</p>
        </header>

        <div class="ws-grid">
            <div v-if="!loading && workspaces.length === 0" style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-muted);">
                Noch keine Workspaces vorhanden.
            </div>
            <div v-for="ws in workspaces" :key="ws.id" class="ws-card" :class="{ active: activeId === ws.id }">
                <span v-if="activeId === ws.id" class="badge-active">AKTIV</span>
                <div class="ws-card-body">
                    <div :style="{ fontSize: '0.7rem', color: teamLabel(ws).personal ? 'var(--text-muted)' : 'var(--gold-secondary, var(--gold-primary))', marginBottom: '5px' }">
                        {{ teamLabel(ws).icon }} {{ teamLabel(ws).text }}
                    </div>
                    <div class="ws-card-title">{{ ws.name }}</div>
                    <div class="ws-card-path">📂 {{ ws.base_path || 'Nicht festgelegt' }}</div>
                    <div class="ws-card-desc">{{ ws.description || '-' }}</div>
                    <div class="ws-storage-wrap">
                        <div class="m2-storage-label">
                            <span>💾 Speicher</span>
                            <span>{{ usageMb(ws) }}MB / {{ limitMb() }}MB</span>
                        </div>
                        <div class="m2-storage-bar">
                            <div class="m2-storage-fill" :class="{ danger: isNearLimit(ws) }" :style="{ width: usagePercent(ws) + '%' }"></div>
                        </div>
                    </div>
                </div>
                <div class="ws-actions">
                    <button v-if="activeId !== ws.id" class="m2-btn m2-btn-primary m2-btn-sm" @click="selectWorkspace(ws.id)">Aktivieren</button>
                    <router-link :to="`/workspace_settings.html?id=${ws.id}`" class="m2-btn m2-btn-secondary m2-btn-sm" style="text-decoration:none;">⚙️ Settings</router-link>
                    <button class="m2-btn m2-btn-secondary m2-btn-sm" @click="deleteWorkspace(ws.id)">Löschen</button>
                </div>
            </div>
        </div>

        <div style="text-align: center;">
            <button class="m2-btn m2-btn-primary" @click="showCreateModal">✨ Neuen Workspace anlegen</button>
        </div>
    </div>

    <div v-if="createModalOpen" class="m2-overlay" @click.self="createModalOpen = false">
        <div class="m2-modal">
            <h3 class="m2-modal-title">Neuen Workspace anlegen</h3>
            <div class="m2-modal-body">
                <div class="m2-field-group">
                    <label>Name</label>
                    <input v-model="wsName" type="text" class="m2-input" placeholder="Mein Projekt" required>

                    <label>Zugehöriges Team</label>
                    <select v-model="wsTeam" class="m2-select">
                        <option value="">Persönlich (Privat)</option>
                        <option v-for="t in userTeams" :key="t.id" :value="t.id">{{ t.name }}</option>
                    </select>

                    <label>Beschreibung</label>
                    <textarea v-model="wsDesc" class="m2-input" style="height: 60px;" placeholder="Kurze Info..."></textarea>

                    <label>Server-Pfad (Basis)</label>
                    <input v-model="wsPath" type="text" class="m2-input" placeholder="C:\Metin2Server\share\locale\germany">
                </div>
            </div>
            <div class="m2-modal-footer">
                <button class="m2-btn m2-btn-secondary" @click="createModalOpen = false">Abbrechen</button>
                <button class="m2-btn m2-btn-primary" @click="submitCreate">Speichern</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.ws-container { max-width: 1000px; margin: 40px auto; padding: 0 20px; }

.ws-header { text-align: center; margin-bottom: 50px; }
.ws-header h1 { font-size: 3rem; font-family: var(--font-heading); color: var(--text-heading); }
.ws-header h1 .accent { color: var(--gold-primary); text-shadow: 0 0 15px var(--gold-glow); }
.ws-header p { color: var(--text-secondary); margin-top: 10px; }

.ws-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 30px; margin-bottom: 40px; }

.ws-card {
    background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md);
    padding: 25px; position: relative; transition: all 0.3s;
    display: flex; flex-direction: column; justify-content: space-between;
    min-height: 240px;
}
.ws-card:hover { border-color: var(--gold-primary); transform: translateY(-3px); box-shadow: var(--shadow-md); }
.ws-card.active { border-color: var(--gold-primary); box-shadow: 0 0 25px rgba(212, 175, 55, 0.15); }

.ws-card-body { flex: 1; }
.ws-card-title { font-size: 1.25rem; color: var(--text-heading); margin-bottom: 8px; font-weight: 700; font-family: var(--font-heading); }
.ws-card-path { font-size: 0.8rem; color: var(--text-muted); word-break: break-all; margin-bottom: 12px; font-family: var(--font-mono); }
.ws-card-desc { font-size: 0.9rem; line-height: 1.4; margin-bottom: 20px; color: var(--text-muted); }

.ws-storage-wrap { margin-bottom: 10px; }
.ws-storage-wrap .m2-storage-label { font-size: 0.75rem; }

.ws-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; padding-top: 15px; border-top: 1px solid var(--border-color); }

.m2-btn-sm { padding: 6px 12px; font-size: 0.8rem; height: 32px; }

.badge-active { position: absolute; top: 15px; right: 15px; background: var(--gold-primary); color: #000; font-size: 0.65rem; font-weight: 800; padding: 3px 10px; border-radius: var(--radius-full); box-shadow: 0 0 10px var(--gold-glow); }

.m2-modal-body input, .m2-modal-body textarea { margin-top: 10px; width: 100%; }
.m2-modal-body label { font-size: 0.85rem; color: var(--text-muted); margin-top: 15px; display: block; }
</style>
