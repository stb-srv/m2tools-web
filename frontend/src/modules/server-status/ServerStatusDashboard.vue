<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { useServerConnection } from '@/composables/useServerConnection';

const auth = useAuthStore();
const ui = useUiStore();

const activeWorkspaceId = ref(null);
const serverConn = useServerConnection(activeWorkspaceId);

const testResult = ref(null);
const statusResult = ref(null);
const testing = ref(false);
const fetchingStatus = ref(false);
const autoRefresh = ref(false);
let autoRefreshTimer = null;

// Server-side cooldowns default to 30s (test) / 10s (command) - 60s keeps
// auto-refresh comfortably above both regardless of admin-configured values.
const AUTO_REFRESH_INTERVAL_MS = 60 * 1000;

async function runTest() {
    testing.value = true;
    try {
        testResult.value = await serverConn.test();
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        testing.value = false;
    }
}

async function fetchStatus() {
    fetchingStatus.value = true;
    try {
        statusResult.value = await serverConn.runCommand('status');
    } catch (err) {
        ui.toast(err.message, 'error');
        statusResult.value = null;
    } finally {
        fetchingStatus.value = false;
    }
}

function refreshAll() {
    runTest();
    if (serverConn.connection.value?.cmd_status) fetchStatus();
}

function toggleAutoRefresh() {
    autoRefresh.value = !autoRefresh.value;
    if (autoRefresh.value) {
        refreshAll();
        autoRefreshTimer = setInterval(refreshAll, AUTO_REFRESH_INTERVAL_MS);
    } else if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
}

onMounted(async () => {
    try {
        const res = await auth.authFetch('/api/workspaces/active');
        const ws = await res.json();
        activeWorkspaceId.value = ws?.id || null;
        if (activeWorkspaceId.value) await serverConn.load();
    } catch {
        ui.toast('Fehler beim Laden des Workspaces', 'error');
    }
});

onUnmounted(() => {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
});
</script>

<template>
    <div class="page-header">
        <div class="header-breadcrumb"><router-link to="/index.html">Dashboard</router-link> / Server-Status</div>
        <div class="header-main-row">
            <h1>SERVER-<span class="gold">STATUS</span></h1>
            <div class="header-actions">
                <button class="m2-btn m2-btn-secondary" :class="{ 'is-active': autoRefresh }" @click="toggleAutoRefresh">
                    {{ autoRefresh ? '⏸️ Auto-Refresh aus' : '▶️ Auto-Refresh (60s)' }}
                </button>
                <button class="m2-btn m2-btn-primary" @click="refreshAll">🔄 Jetzt aktualisieren</button>
            </div>
        </div>
    </div>

    <div v-if="!activeWorkspaceId" class="status-empty">
        <div class="empty-icon">📁</div>
        <h3>Kein Workspace aktiv</h3>
        <p>Wähle zuerst einen Workspace aus, um dessen Server-Status zu sehen.</p>
    </div>

    <div v-else-if="!serverConn.connection.value?.ssh_host" class="status-empty">
        <div class="empty-icon">🔌</div>
        <h3>Keine Server-Verbindung konfiguriert</h3>
        <p>Richte unter "Server-Verbindungen" in den Workspace-Einstellungen zuerst SSH/DB-Zugangsdaten ein.</p>
    </div>

    <div v-else class="status-container">
        <div class="status-card">
            <h2>🔌 Verbindung</h2>
            <div class="status-grid">
                <div class="status-row"><span class="status-label">SSH-Host</span><span>{{ serverConn.connection.value.ssh_host }}:{{ serverConn.connection.value.ssh_port }}</span></div>
                <div class="status-row"><span class="status-label">Datenbank</span><span>{{ serverConn.connection.value.db_host || '—' }}</span></div>
            </div>
            <div class="status-actions">
                <button class="m2-btn m2-btn-primary" :disabled="testing" @click="runTest">{{ testing ? '⏳' : '🔍 Verbindung testen' }}</button>
            </div>
            <div v-if="testResult" class="badge-row">
                <span class="status-badge" :class="testResult.ssh?.ok ? 'badge-ok' : 'badge-fail'">SSH: {{ testResult.ssh ? (testResult.ssh.ok ? 'OK' : testResult.ssh.error) : 'nicht konfiguriert' }}</span>
                <span class="status-badge" :class="testResult.db?.ok ? 'badge-ok' : 'badge-fail'">DB: {{ testResult.db ? (testResult.db.ok ? 'OK' : testResult.db.error) : 'nicht konfiguriert' }}</span>
            </div>
        </div>

        <div class="status-card">
            <h2>📊 Status-Kommando</h2>
            <p v-if="!serverConn.connection.value.cmd_status" style="color: var(--text-secondary); font-size: 0.85rem;">
                Kein Status-Kommando konfiguriert (siehe Server-Verbindungen &rarr; Kommandos).
            </p>
            <template v-else>
                <div class="status-actions">
                    <button class="m2-btn m2-btn-primary" :disabled="fetchingStatus" @click="fetchStatus">{{ fetchingStatus ? '⏳' : '📊 Status abrufen' }}</button>
                </div>
                <pre v-if="statusResult" class="console-box">{{ statusResult.stdout || '(keine Ausgabe)' }}<template v-if="statusResult.stderr">
---stderr---
{{ statusResult.stderr }}</template></pre>
            </template>
        </div>
    </div>
</template>

<style scoped>
.status-empty { text-align: center; padding: 80px 20px; color: var(--text-secondary); }
.status-empty .empty-icon { font-size: 4rem; opacity: 0.2; margin-bottom: 20px; }
.status-empty h3 { font-family: var(--font-heading); color: var(--gold-primary); margin-bottom: 10px; }

.status-container { max-width: 900px; margin: 0 auto; display: grid; gap: 25px; padding: 20px; }
.status-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 30px; backdrop-filter: blur(15px); }
.status-card h2 { font-family: var(--font-heading); margin-bottom: 20px; color: var(--gold-primary); }

.status-grid { display: grid; gap: 10px; margin-bottom: 20px; }
.status-row { display: flex; justify-content: space-between; padding: 10px 15px; background: var(--bg-input); border-radius: var(--radius-sm); border: 1px solid var(--border-color); }
.status-label { color: var(--text-muted); font-size: 0.85rem; }

.status-actions { display: flex; gap: 10px; margin-bottom: 15px; }

.badge-row { display: flex; gap: 10px; flex-wrap: wrap; }
.status-badge { padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
.badge-ok { background: rgba(76, 175, 80, 0.15); color: var(--success); border: 1px solid rgba(76, 175, 80, 0.3); }
.badge-fail { background: rgba(244, 67, 54, 0.15); color: var(--danger); border: 1px solid rgba(244, 67, 54, 0.3); }

.console-box { background: #0a0a12; color: #8bc34a; border-radius: var(--radius-sm); padding: 20px; font-family: 'Consolas', monospace; font-size: 0.85rem; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; border: 1px solid var(--border-color); }

.m2-btn.is-active { border-color: var(--gold-primary); color: var(--gold-primary); }
</style>
