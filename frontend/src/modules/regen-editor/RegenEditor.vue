<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { parseRegenText, stringifyGroups } from './regenText';

const auth = useAuthStore();
const ui = useUiStore();

const TABS = [
    { id: 'visual', label: '🎨 Visual Editor' },
    { id: 'raw', label: '📝 Raw Text' }
];

const currentGroups = ref([]);
const selectedGroupIndex = ref(-1);
const currentTab = ref('visual');
const groupSearchQuery = ref('');
const rawText = ref('');
const saving = ref(false);

const mobNames = reactive({}); // vnum -> resolved mob name
const mobResults = ref([]);
const mobResultsVisible = ref(false);

const selectedGroup = computed(() => (selectedGroupIndex.value === -1 ? null : currentGroups.value[selectedGroupIndex.value]));

const filteredGroups = computed(() => {
    const q = groupSearchQuery.value.toLowerCase();
    if (!q) return currentGroups.value.map((g, idx) => ({ g, idx }));
    return currentGroups.value
        .map((g, idx) => ({ g, idx }))
        .filter(({ g }) => g.id.toLowerCase().includes(q));
});

function mobDisplay(vnum) {
    if (!vnum || vnum === '0') return vnum;
    return mobNames[vnum] ? `${vnum} (${mobNames[vnum]})` : vnum;
}

async function fetchMobName(vnum) {
    if (!vnum || vnum === '0' || mobNames[vnum]) return;
    try {
        const res = await fetch('/api/quest_builder/mobs/search?q=' + vnum, { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} });
        const mobs = await res.json();
        const match = mobs.find(m => m.vnum.toString() === vnum.toString());
        if (match) mobNames[vnum] = match.name;
    } catch { /* ignore - display falls back to the raw vnum */ }
}

async function onMobVnumInput() {
    const vnum = selectedGroup.value.vnum;
    fetchMobName(vnum);
    if (!vnum || vnum.length < 2) { mobResultsVisible.value = false; return; }
    try {
        const res = await fetch('/api/quest_builder/mobs/search?q=' + vnum, { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} });
        const mobs = await res.json();
        mobResults.value = mobs.slice(0, 10);
        mobResultsVisible.value = mobResults.value.length > 0;
    } catch { mobResultsVisible.value = false; }
}

function pickMob(m) {
    selectedGroup.value.vnum = m.vnum.toString();
    mobResultsVisible.value = false;
}

function selectGroup(idx) {
    selectedGroupIndex.value = idx;
    mobResultsVisible.value = false;
    if (currentGroups.value[idx].vnum && currentGroups.value[idx].vnum !== '0') fetchMobName(currentGroups.value[idx].vnum);
}

function createNewGroup() {
    const id = 'New_Group_' + (currentGroups.value.length + 1);
    currentGroups.value.push({ id, vnum: '0', points: [] });
    selectGroup(currentGroups.value.length - 1);
}

function deleteGroup(idx) {
    currentGroups.value.splice(idx, 1);
    if (selectedGroupIndex.value === idx) selectedGroupIndex.value = -1;
    else if (selectedGroupIndex.value > idx) selectedGroupIndex.value--;
}

function addSpawnPoint() {
    if (!selectedGroup.value) return;
    selectedGroup.value.points.push({ x: '0', y: '0', direction: '0' });
}

function removeSpawnPoint(idx) {
    selectedGroup.value.points.splice(idx, 1);
}

async function loadFromServer() {
    try {
        const res = await auth.authFetch('/api/regen/load?format=json');
        currentGroups.value = await res.json();
    } catch {
        ui.toast('Fehler beim Laden von regen.txt', 'error');
    }
}

async function saveToServer() {
    saving.value = true;
    try {
        const res = await auth.authFetch('/api/regen/save', {
            method: 'POST',
            body: JSON.stringify({ groups: currentGroups.value })
        });
        const data = await res.json();
        if (data.success) ui.toast('regen.txt gespeichert!', 'success');
        else ui.toast(data.error || 'Speichern fehlgeschlagen', 'error');
    } catch {
        ui.toast('Server-Fehler beim Speichern', 'error');
    } finally {
        saving.value = false;
    }
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
            currentGroups.value = parseRegenText(ev.target.result);
            selectedGroupIndex.value = currentGroups.value.length > 0 ? 0 : -1;
        };
        reader.readAsText(file);
    };
    input.click();
}

function downloadFile() {
    if (currentGroups.value.length === 0) return ui.toast('Keine Daten zum Speichern', 'warning');
    const data = stringifyGroups(currentGroups.value);
    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'regen.txt';
    a.click();
    URL.revokeObjectURL(url);
    ui.toast('Erfolgreich heruntergeladen!', 'success');
}

function switchTab(tab) {
    if (currentTab.value === tab) return;
    if (currentTab.value === 'raw' && tab === 'visual') {
        try { currentGroups.value = parseRegenText(rawText.value); } catch { /* keep previous groups on parse failure */ }
    }
    if (tab === 'raw') {
        rawText.value = stringifyGroups(currentGroups.value);
    }
    currentTab.value = tab;
}

onMounted(loadFromServer);
</script>

<template>
    <div class="page-header">
        <div class="header-breadcrumb">
            <router-link to="/index.html">Dashboard</router-link> / Regen Editor
        </div>
        <div class="header-main-row">
            <h1>REGEN <span class="gold">EDITOR</span></h1>
            <div class="tab-controls">
                <button
                    v-for="tab in TABS"
                    :key="tab.id"
                    class="tab-btn"
                    :class="{ active: currentTab === tab.id }"
                    @click="switchTab(tab.id)"
                >
                    {{ tab.label }}
                </button>
            </div>
            <div class="header-actions">
                <button class="m2-btn m2-btn-secondary" @click="openLocalFile">📁 Datei öffnen</button>
                <button class="m2-btn m2-btn-secondary" @click="downloadFile">📥 Download</button>
                <button class="m2-btn m2-btn-primary" :disabled="saving" @click="saveToServer">{{ saving ? '⏳' : '💾 Speichern' }}</button>
            </div>
        </div>
    </div>

    <div v-show="currentTab === 'visual'" class="tab-content active">
        <div class="visual-container">
            <aside class="group-sidebar">
                <div class="sidebar-search">
                    <input v-model="groupSearchQuery" type="text" placeholder="Suchen..." class="m2-input">
                    <button class="m2-btn m2-btn-primary small" @click="createNewGroup">+ GRUPPE ERSTELLEN</button>
                </div>
                <div class="group-list">
                    <div v-if="filteredGroups.length === 0" class="group-list-empty">Keine Gruppen geladen</div>
                    <div
                        v-for="{ g, idx } in filteredGroups"
                        :key="idx"
                        class="group-item"
                        :class="{ active: selectedGroupIndex === idx }"
                        @click="selectGroup(idx)"
                    >
                        <span class="group-item-id">{{ g.id }}</span>
                        <span class="group-item-mob">🐺 {{ mobDisplay(g.vnum || '0') }} / {{ g.points.length }} Spawns</span>
                    </div>
                </div>
            </aside>

            <section class="editor-area">
                <div v-if="!selectedGroup" class="editor-empty-state">
                    <div class="empty-icon">🐺</div>
                    <h3>Wähle eine Gruppe aus</h3>
                    <p>Wähle eine Regen-Gruppe aus der Liste aus oder erstelle eine neue.</p>
                </div>

                <div v-else class="editor-card">
                    <div class="group-header-fields">
                        <div class="m2-field-group">
                            <label class="m2-label">Group Name</label>
                            <input v-model="selectedGroup.id" type="text" class="m2-input" placeholder="GroupName">
                        </div>
                        <div class="m2-field-group">
                            <label class="m2-label">Mob VNUM</label>
                            <div class="search-input-wrapper">
                                <input v-model="selectedGroup.vnum" type="text" class="m2-input" placeholder="8001" @input="onMobVnumInput">
                                <div v-if="mobResultsVisible" class="mob-search-results">
                                    <div v-for="m in mobResults" :key="m.vnum" class="item-result-entry" @click="pickMob(m)">
                                        <strong>{{ m.vnum }}</strong> - {{ m.name }}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="m2-field-group">
                            <button class="m2-btn m2-btn-secondary" style="color:#f44336; border-color: rgba(244,67,54,0.2);" @click="deleteGroup(selectedGroupIndex)">🗑️ Gruppe löschen</button>
                        </div>
                    </div>

                    <div class="items-table-container">
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th style="width: 40px">#</th>
                                    <th>X</th>
                                    <th>Y</th>
                                    <th>Richtung</th>
                                    <th style="width: 40px"></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(p, idx) in selectedGroup.points" :key="idx">
                                    <td class="item-row-num">{{ idx + 1 }}</td>
                                    <td><input v-model="p.x" type="text" class="m2-input small"></td>
                                    <td><input v-model="p.y" type="text" class="m2-input small"></td>
                                    <td><input v-model="p.direction" type="text" class="m2-input small"></td>
                                    <td><button class="m2-btn small m2-btn-secondary" @click="removeSpawnPoint(idx)">🗑️</button></td>
                                </tr>
                            </tbody>
                        </table>
                        <button class="m2-btn m2-btn-secondary full-width" @click="addSpawnPoint">+ Spawn-Punkt hinzufügen</button>
                    </div>
                </div>
            </section>
        </div>
    </div>

    <div v-show="currentTab === 'raw'" class="tab-content active">
        <div class="raw-fixer-container">
            <textarea v-model="rawText" class="raw-editor" placeholder="Paste regen.txt here..."></textarea>
        </div>
    </div>
</template>

<style scoped>
.tab-controls { display: flex; gap: 8px; background: var(--bg-input); padding: 6px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); }
.tab-btn { background: transparent; border: none; color: var(--text-muted); padding: 10px 20px; font-size: 0.9rem; font-weight: 600; cursor: pointer; border-radius: calc(var(--radius-sm) - 2px); transition: all 0.3s ease; display: flex; align-items: center; gap: 8px; line-height: 1; }
.tab-btn.active { background: var(--bg-card); color: var(--gold-primary); box-shadow: var(--shadow-sm); }
.tab-btn:hover:not(.active) { color: var(--text-primary); background: var(--bg-hover); }

.visual-container { display: grid; grid-template-columns: 320px 1fr; gap: 25px; height: calc(100vh - 240px); min-height: 650px; }

.group-sidebar { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); display: flex; flex-direction: column; overflow: hidden; backdrop-filter: blur(20px); }
.sidebar-search { padding: 20px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-body); }
.group-list { flex: 1; overflow-y: auto; padding: 10px; }

.group-item { padding: 15px 20px; margin-bottom: 8px; border-radius: var(--radius-sm); border: 1px solid transparent; cursor: pointer; transition: var(--transition); display: flex; flex-direction: column; gap: 4px; position: relative; }
.group-item:hover { background: var(--bg-hover); border-color: var(--border-color); }
.group-item.active { background: rgba(195, 163, 74, 0.1); border-color: var(--gold-border); box-shadow: var(--shadow-sm); }
.group-item-id { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.group-item-mob { font-size: 0.75rem; color: var(--text-muted); font-family: 'Consolas', monospace; display: flex; align-items: center; gap: 6px; }
.group-item.active .group-item-id { color: var(--gold-primary); }

.group-list-empty { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 0.9rem; font-style: italic; }

.editor-area { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow-y: auto; position: relative; backdrop-filter: blur(20px); }
.editor-empty-state { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px; }
.empty-icon { font-size: 4rem; opacity: 0.2; margin-bottom: 20px; }
.editor-empty-state h3 { font-family: var(--font-heading); font-size: 1.5rem; margin-bottom: 10px; color: var(--gold-primary); }
.editor-empty-state p { color: var(--text-secondary); max-width: 300px; line-height: 1.6; }

.editor-card { padding: 35px; }
.group-header-fields { display: grid; grid-template-columns: 1fr 1fr 200px; gap: 25px; margin-bottom: 35px; align-items: end; }

.search-input-wrapper { position: relative; }
.mob-search-results { position: absolute; top: calc(100% + 5px); left: 0; right: 0; z-index: 20; background: var(--bg-navbar); border: 1px solid var(--border-color); border-radius: var(--radius-sm); max-height: 250px; overflow-y: auto; box-shadow: var(--shadow-lg); }

.items-table-container { margin-top: 20px; }
.items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.items-table th { text-align: left; padding: 12px 15px; font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; border-bottom: 2px solid var(--border-color); }
.items-table td { padding: 12px 15px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); vertical-align: middle; }
.items-table tr:hover td { background: var(--bg-hover); }

.item-row-num { color: var(--text-muted); font-weight: 700; font-size: 0.85rem; }

.item-result-entry { padding: 12px 15px; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: var(--transition); }
.item-result-entry:hover { background: var(--bg-hover); }
.item-result-entry:last-child { border-bottom: none; }

.raw-fixer-container { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 25px; height: calc(100vh - 240px); min-height: 650px; display: flex; flex-direction: column; gap: 20px; }
.raw-editor { flex: 1; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 20px; color: var(--text-primary); font-family: 'Consolas', monospace; font-size: 14px; line-height: 1.6; resize: none; outline: none; transition: var(--transition); width: 100%; }
.raw-editor:focus { border-color: var(--gold-primary); background: var(--bg-hover); box-shadow: var(--shadow-gold); }

.small { padding: 6px 12px; font-size: 0.75rem; }
.full-width { width: 100%; margin-top: 20px; }

@media (max-width: 1000px) {
    .visual-container { grid-template-columns: 1fr; height: auto; }
    .group-sidebar { height: 400px; }
    .group-header-fields { grid-template-columns: 1fr; }
}
</style>
