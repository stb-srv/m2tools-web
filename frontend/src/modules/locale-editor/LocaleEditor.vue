<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();

const entries = ref([]);
const searchQuery = ref('');
const saving = ref(false);

const filteredEntries = computed(() => {
    const q = searchQuery.value.toLowerCase();
    if (!q) return entries.value.map((e, idx) => ({ e, idx }));
    return entries.value
        .map((e, idx) => ({ e, idx }))
        .filter(({ e }) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
});

async function loadEntries() {
    try {
        const res = await auth.authFetch('/api/locale_editor/load');
        entries.value = await res.json();
    } catch {
        ui.toast('Fehler beim Laden von locale_string.txt', 'error');
    }
}

async function saveEntries() {
    saving.value = true;
    try {
        const res = await auth.authFetch('/api/locale_editor/save', {
            method: 'POST',
            body: JSON.stringify({ entries: entries.value })
        });
        const data = await res.json();
        if (data.success) ui.toast('locale_string.txt gespeichert!', 'success');
        else ui.toast(data.error || 'Speichern fehlgeschlagen', 'error');
    } catch {
        ui.toast('Server-Fehler beim Speichern', 'error');
    } finally {
        saving.value = false;
    }
}

function addEntry() {
    entries.value.unshift({ key: '', value: '' });
}

function removeEntry(idx) {
    entries.value.splice(idx, 1);
}

function openLocalFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const parsed = [];
            for (const line of ev.target.result.split(/\r?\n/)) {
                if (!line.trim() || line.trim().startsWith('//')) continue;
                const tabIdx = line.indexOf('\t');
                if (tabIdx === -1) continue;
                parsed.push({ key: line.slice(0, tabIdx), value: line.slice(tabIdx + 1) });
            }
            entries.value = parsed;
        };
        reader.readAsText(file);
    };
    input.click();
}

function downloadFile() {
    if (entries.value.length === 0) return ui.toast('Keine Daten zum Speichern', 'warning');
    const text = entries.value.map(e => `${e.key}\t${e.value}`).join('\n') + '\n';
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'locale_string.txt';
    a.click();
    URL.revokeObjectURL(url);
}

onMounted(loadEntries);
</script>

<template>
    <div class="page-header">
        <div class="header-breadcrumb">
            <router-link to="/index.html">Dashboard</router-link> / Locale-String Editor
        </div>
        <div class="header-main-row">
            <h1>LOCALE-STRING <span class="gold">EDITOR</span></h1>
            <div class="header-actions">
                <button class="m2-btn m2-btn-secondary" @click="openLocalFile">📁 Datei öffnen</button>
                <button class="m2-btn m2-btn-secondary" @click="downloadFile">📥 Download</button>
                <button class="m2-btn m2-btn-primary" :disabled="saving" @click="saveEntries">{{ saving ? '⏳' : '💾 Speichern' }}</button>
            </div>
        </div>
    </div>

    <div class="locale-container">
        <div class="locale-toolbar">
            <input v-model="searchQuery" type="text" class="m2-input" placeholder="Schlüssel oder Wert durchsuchen...">
            <button class="m2-btn m2-btn-primary" @click="addEntry">+ Eintrag hinzufügen</button>
            <span class="entry-count">{{ filteredEntries.length }} / {{ entries.length }} Einträge</span>
        </div>

        <div class="locale-table-scroll">
            <table class="items-table">
                <thead>
                    <tr><th style="width: 30%">Schlüssel</th><th>Wert</th><th style="width: 40px"></th></tr>
                </thead>
                <tbody>
                    <tr v-if="filteredEntries.length === 0"><td colspan="3" style="text-align:center; opacity:0.6; padding: 30px;">Keine Einträge</td></tr>
                    <tr v-for="{ e, idx } in filteredEntries" :key="idx">
                        <td><input v-model="e.key" type="text" class="m2-input small mono"></td>
                        <td><input v-model="e.value" type="text" class="m2-input small"></td>
                        <td><button class="m2-btn small m2-btn-secondary" @click="removeEntry(idx)">🗑️</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<style scoped>
.locale-container { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); display: flex; flex-direction: column; height: calc(100vh - 240px); min-height: 650px; overflow: hidden; backdrop-filter: blur(20px); }
.locale-toolbar { padding: 20px 25px; display: flex; align-items: center; gap: 15px; border-bottom: 1px solid var(--border-color); background: var(--bg-body); }
.locale-toolbar .m2-input { flex: 1; }
.entry-count { font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }

.locale-table-scroll { flex: 1; overflow-y: auto; padding: 15px 25px; }
.items-table { width: 100%; border-collapse: collapse; }
.items-table th { text-align: left; padding: 12px 15px; font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; border-bottom: 2px solid var(--border-color); position: sticky; top: 0; background: var(--bg-card); }
.items-table td { padding: 8px 15px; border-bottom: 1px solid var(--border-color); }
.items-table tr:hover td { background: var(--bg-hover); }

.m2-input.small { padding: 8px 12px; font-size: 0.85rem; }
.mono { font-family: 'Consolas', monospace; }
</style>
