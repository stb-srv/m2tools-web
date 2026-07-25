<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useItemService } from '@/composables/useItemService';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const itemService = useItemService();
const auth = useAuthStore();
const ui = useUiStore();

const TABS = [
    { id: 'visual', label: '🎨 Visual Editor' },
    { id: 'rates', label: '📈 Rate Manager' },
    { id: 'raw', label: '✨ Raw Fixer' }
];

const currentGroups = ref([]);
const selectedGroupIndex = ref(-1);
const currentTab = ref('visual');
const groupSearchQuery = ref('');
const rawText = ref('');

const mobNames = reactive({}); // vnum -> resolved mob name
const mobResults = ref([]);
const mobResultsVisible = ref(false);

const itemSearchOverlayOpen = ref(false);
const itemSearchQuery = ref('');
const itemSearchResults = ref([]);
const activeItemRowIndex = ref(-1);

const rateSearchQuery = ref('');
const batchActionType = ref('multiply');
const batchActionValue = ref(1.5);

const selectedGroup = computed(() => (selectedGroupIndex.value === -1 ? null : currentGroups.value[selectedGroupIndex.value]));

const filteredGroups = computed(() => {
    const q = groupSearchQuery.value.toLowerCase();
    if (!q) return currentGroups.value.map((g, idx) => ({ g, idx }));
    return currentGroups.value
        .map((g, idx) => ({ g, idx }))
        .filter(({ g }) => g.id.toLowerCase().includes(q));
});

const flatRates = computed(() => {
    const list = [];
    currentGroups.value.forEach((group, gIdx) => {
        group.lines.forEach((line, lIdx) => {
            list.push({ groupName: group.id, gIdx, lIdx, line });
        });
    });
    return list;
});

const filteredRates = computed(() => {
    const q = rateSearchQuery.value.toLowerCase();
    if (!q) return flatRates.value;
    return flatRates.value.filter(({ line, groupName }) => {
        const name = itemService.getName(line.vnum).toLowerCase();
        return line.vnum.toString().includes(q) || name.includes(q) || groupName.toLowerCase().includes(q);
    });
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
    const vnum = selectedGroup.value.mob;
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
    selectedGroup.value.mob = m.vnum.toString();
    mobResultsVisible.value = false;
}

function selectGroup(idx) {
    selectedGroupIndex.value = idx;
    mobResultsVisible.value = false;
    if (currentGroups.value[idx].mob && currentGroups.value[idx].mob !== '0') fetchMobName(currentGroups.value[idx].mob);
}

function createNewGroup() {
    const id = 'New_Group_' + (currentGroups.value.length + 1);
    currentGroups.value.push({ id, mob: '0', type: 'drop', lines: [] });
    selectGroup(currentGroups.value.length - 1);
}

function addItemToCurrentGroup() {
    if (!selectedGroup.value) return;
    selectedGroup.value.lines.push({ vnum: '0', count: '1', prob: '1000' });
}

function removeItemLine(idx) {
    selectedGroup.value.lines.splice(idx, 1);
}

function openItemSearch(idx) {
    activeItemRowIndex.value = idx;
    itemSearchQuery.value = '';
    itemSearchResults.value = [];
    itemSearchOverlayOpen.value = true;
}

function onItemSearchInput() {
    if (!itemSearchQuery.value) { itemSearchResults.value = []; return; }
    itemSearchResults.value = itemService.search(itemSearchQuery.value).slice(0, 50);
}

function pickItem(i) {
    selectedGroup.value.lines[activeItemRowIndex.value].vnum = i.vnum;
    itemSearchOverlayOpen.value = false;
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
            currentGroups.value = parseMobDropText(ev.target.result);
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
    a.download = 'mob_drop_item.txt';
    a.click();
    URL.revokeObjectURL(url);
    ui.toast('Erfolgreich heruntergeladen!', 'success');
}

function applyBatchAction() {
    const type = batchActionType.value;
    const val = parseFloat(batchActionValue.value);
    if (isNaN(val)) { ui.toast('Ungültiger Wert', 'error'); return; }

    let count = 0;
    filteredRates.value.forEach(({ line }) => {
        let current = parseFloat(line.prob);
        let newVal = current;
        if (type === 'multiply') newVal = current * val;
        else if (type === 'add') newVal = current + val;
        else if (type === 'set') newVal = val;
        newVal = Math.floor(newVal);
        if (newVal < 0) newVal = 0;
        line.prob = newVal;
        count++;
    });
    ui.toast(`${count} Einträge aktualisiert.`, 'success');
}

function fixRawText() {
    const map = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
    rawText.value = rawText.value.replace(/Group\t([^\r\n]+)/g, (m, name) => {
        let n = name;
        for (const [k, v] of Object.entries(map)) n = n.split(k).join(v);
        return `Group\t${n.split(' ').join('_')}`;
    });
    ui.toast('Fix abgeschlossen.', 'success');
}

function parseMobDropText(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const groups = [];
    let curr = null;
    for (let l of lines) {
        l = l.trim();
        if (!l || l.startsWith('//')) continue;
        if (l.toLowerCase().startsWith('group')) {
            const name = l.substring(5).trim();
            curr = { id: name, mob: '0', type: 'drop', lines: [] };
            continue;
        }
        if (l === '}' && curr) { groups.push(curr); curr = null; continue; }
        if (curr) {
            const p = l.split(/\s+/);
            if (p[0] === 'Mob') curr.mob = p[1];
            else if (p[0] === 'Type') curr.type = p[1];
            else if (!isNaN(p[0])) curr.lines.push({ vnum: p[1], count: p[2] || '1', prob: p[3] || '1' });
        }
    }
    return groups;
}

function stringifyGroups(groups) {
    let out = '';
    groups.forEach(g => {
        out += `Group\t${g.id}\n{\n\tMob\t${g.mob}\n\tType\t${g.type}\n`;
        g.lines.forEach((l, i) => out += `\t${i + 1}\t${l.vnum}\t${l.count}\t${l.prob}\n`);
        out += `}\n\n`;
    });
    return out;
}

function switchTab(tab) {
    if (currentTab.value === tab) return;
    if (currentTab.value === 'raw' && tab === 'visual') {
        try { currentGroups.value = parseMobDropText(rawText.value); } catch { /* keep previous groups on parse failure */ }
    }
    if (tab === 'raw') {
        rawText.value = stringifyGroups(currentGroups.value);
    }
    currentTab.value = tab;
}

onMounted(async () => {
    await itemService.autoInit();
});
</script>

<template>
    <div class="page-header">
        <div class="header-breadcrumb">
            <router-link to="/index.html">Dashboard</router-link> / Mob-Drop Editor
        </div>
        <div class="header-main-row">
            <h1>MOB-DROP <span class="gold">EDITOR</span></h1>
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
                <button class="m2-btn m2-btn-primary" @click="downloadFile">📥 Download</button>
            </div>
        </div>
    </div>

    <!-- ── TAB: VISUAL EDITOR ─────────────────────────── -->
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
                        <span class="group-item-mob">📂 {{ mobDisplay(g.mob || '0') }} / {{ g.lines.length }} Items</span>
                    </div>
                </div>
            </aside>

            <section class="editor-area">
                <div v-if="!selectedGroup" class="editor-empty-state">
                    <div class="empty-icon">📦</div>
                    <h3>Wähle eine Gruppe aus</h3>
                    <p>Wähle eine Drop-Gruppe aus der Liste aus oder erstelle eine neue.</p>
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
                                <input v-model="selectedGroup.mob" type="text" class="m2-input" placeholder="8001" @input="onMobVnumInput">
                                <div v-if="mobResultsVisible" class="mob-search-results">
                                    <div v-for="m in mobResults" :key="m.vnum" class="item-result-entry" @click="pickMob(m)">
                                        <strong>{{ m.vnum }}</strong> - {{ m.name }}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="m2-field-group">
                            <label class="m2-label">Type</label>
                            <input v-model="selectedGroup.type" type="text" class="m2-input" readonly>
                            <span class="m2-hint">Standard: drop</span>
                        </div>
                    </div>

                    <div class="items-table-container">
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th style="width: 40px">#</th>
                                    <th style="width: 50px">Icon</th>
                                    <th style="width: 100px">VNUM</th>
                                    <th>Name</th>
                                    <th style="width: 80px">Anzahl</th>
                                    <th style="width: 100px">Rate (%)</th>
                                    <th style="width: 40px"></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(l, idx) in selectedGroup.lines" :key="idx">
                                    <td class="item-row-num">{{ idx + 1 }}</td>
                                    <td>
                                        <div class="item-icon-box" @click="openItemSearch(idx)">
                                            <img :src="itemService.getIconPath(l.vnum)">
                                        </div>
                                    </td>
                                    <td><input v-model="l.vnum" type="text" class="m2-input small"></td>
                                    <td>{{ itemService.getName(l.vnum) }}</td>
                                    <td class="item-input-cell"><input v-model="l.count" type="number" class="m2-input small"></td>
                                    <td class="item-input-cell"><input v-model="l.prob" type="number" class="m2-input small"></td>
                                    <td><button class="m2-btn small m2-btn-secondary" @click="removeItemLine(idx)">🗑️</button></td>
                                </tr>
                            </tbody>
                        </table>
                        <button class="m2-btn m2-btn-secondary full-width" @click="addItemToCurrentGroup">+ Item hinzufügen</button>
                    </div>
                </div>
            </section>
        </div>
    </div>

    <!-- ── TAB: RATE MANAGER ─────────────────────────── -->
    <div v-show="currentTab === 'rates'" class="tab-content active">
        <div class="rates-container">
            <div class="rates-toolbar">
                <div class="toolbar-section">
                    <label class="m2-label">Massenauswahl & Filter</label>
                    <div class="toolbar-row">
                        <input v-model="rateSearchQuery" type="text" class="m2-input" placeholder="Item Name oder VNUM suchen...">
                    </div>
                </div>

                <div class="toolbar-section">
                    <label class="m2-label">Batch-Aktionen (Alle sichtbaren)</label>
                    <div class="toolbar-row">
                        <select v-model="batchActionType" class="m2-input" style="width: 140px">
                            <option value="multiply">Multiplizieren (x)</option>
                            <option value="add">Addieren (+)</option>
                            <option value="set">Festsetzen (=)</option>
                        </select>
                        <input v-model="batchActionValue" type="number" class="m2-input" style="width: 100px" step="0.1">
                        <button class="m2-btn m2-btn-primary" @click="applyBatchAction">Anwenden</button>
                    </div>
                </div>

                <div class="toolbar-stats">
                    <div class="stat-item"><span class="stat-label">Einträge:</span> <span>{{ filteredRates.length }}</span></div>
                </div>
            </div>

            <div class="rates-table-scroll">
                <table class="items-table">
                    <thead>
                        <tr>
                            <th style="width: 50px">Icon</th>
                            <th style="width: 100px">VNUM</th>
                            <th>Item Name</th>
                            <th>Drop-Gruppe (Quelle)</th>
                            <th style="width: 150px">Aktuelle Rate (%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in filteredRates" :key="`${entry.gIdx}-${entry.lIdx}`">
                            <td><div class="item-icon-box"><img :src="itemService.getIconPath(entry.line.vnum)"></div></td>
                            <td class="res-vnum">{{ entry.line.vnum }}</td>
                            <td class="item-name-cell">{{ itemService.getName(entry.line.vnum) }}</td>
                            <td class="rate-group-name">{{ entry.groupName }}</td>
                            <td class="item-input-cell"><input v-model="entry.line.prob" type="number" class="m2-input small"></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- ── TAB: RAW FIXER ────────────────────────────── -->
    <div v-show="currentTab === 'raw'" class="tab-content active">
        <div class="raw-fixer-container">
            <div class="fixer-toolbar">
                <button class="m2-btn m2-btn-secondary" @click="fixRawText">✨ Automatisch Fixen</button>
                <p class="fixer-info">Korrigiert Umlaute (ä &rarr; ae) und ersetzt Leerzeichen in Gruppennamen.</p>
            </div>
            <textarea v-model="rawText" class="raw-editor" placeholder="Paste mob_drop_item.txt here..."></textarea>
        </div>
    </div>

    <!-- Overlay for Item Search -->
    <div v-if="itemSearchOverlayOpen" class="m2-overlay" @click.self="itemSearchOverlayOpen = false">
        <div class="m2-modal">
            <h3 class="m2-modal-title">Item suchen</h3>
            <div class="m2-field-group">
                <input v-model="itemSearchQuery" type="text" class="m2-input" placeholder="Schwert+9..." autofocus @input="onItemSearchInput">
            </div>
            <div class="search-results-list">
                <div v-for="i in itemSearchResults" :key="i.vnum" class="item-result-entry" @click="pickItem(i)">
                    <div class="res-icon"><img :src="itemService.getIconPath(i.vnum)"></div>
                    <span class="res-vnum">{{ i.vnum }}</span>
                    <span class="res-name">{{ i.name }}</span>
                </div>
            </div>
            <div class="m2-modal-footer">
                <button class="m2-btn m2-btn-secondary" @click="itemSearchOverlayOpen = false">Abbrechen</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.tab-controls { display: flex; gap: 8px; background: var(--bg-input); padding: 6px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); }
.tab-btn {
    background: transparent; border: none; color: var(--text-muted);
    padding: 10px 20px; font-size: 0.9rem; font-weight: 600; cursor: pointer;
    border-radius: calc(var(--radius-sm) - 2px); transition: all 0.3s ease;
    display: flex; align-items: center; gap: 8px; line-height: 1;
}
.tab-btn.active { background: var(--bg-card); color: var(--gold-primary); box-shadow: var(--shadow-sm); }
.tab-btn:hover:not(.active) { color: var(--text-primary); background: var(--bg-hover); }

.tab-content { opacity: 1; }

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
.group-header-fields { display: grid; grid-template-columns: 1fr 1fr 150px; gap: 25px; margin-bottom: 35px; }

.search-input-wrapper { position: relative; }
.mob-search-results {
    position: absolute; top: calc(100% + 5px); left: 0; right: 0; z-index: 20;
    background: var(--bg-navbar); border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    max-height: 250px; overflow-y: auto; box-shadow: var(--shadow-lg);
}

.items-table-container { margin-top: 20px; }
.items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.items-table th { text-align: left; padding: 12px 15px; font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; border-bottom: 2px solid var(--border-color); }
.items-table td { padding: 12px 15px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); vertical-align: middle; }
.items-table tr:hover td { background: var(--bg-hover); }

.item-row-num { color: var(--text-muted); font-weight: 700; font-size: 0.85rem; }
.item-icon-box { width: 34px; height: 34px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--gold-primary); overflow: hidden; cursor: crosshair; }
.item-icon-box:hover { border-color: var(--gold-primary); background: var(--bg-hover); }
.item-icon-box img { max-width: 32px; max-height: 32px; image-rendering: pixelated; }

.item-name-cell { font-size: 0.9rem; color: var(--text-secondary); }
.item-input-cell input { width: 100%; text-align: center; }

.rates-container { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); display: flex; flex-direction: column; height: calc(100vh - 240px); min-height: 650px; overflow: hidden; }
.rates-toolbar { padding: 25px; background: var(--gold-subtle); border-bottom: 1px solid var(--border-color); display: flex; gap: 40px; align-items: flex-end; }
.toolbar-section { display: flex; flex-direction: column; gap: 10px; }
.toolbar-row { display: flex; gap: 12px; align-items: center; }
.rates-table-scroll { flex: 1; overflow-y: auto; padding: 25px; scrollbar-width: thin; scrollbar-color: var(--gold-primary) transparent; }

.toolbar-stats { margin-left: auto; display: flex; gap: 20px; padding: 12px 25px; background: var(--bg-input); border-radius: var(--radius-sm); align-self: stretch; align-items: center; border: 1px solid var(--border-color); }
.stat-item { display: flex; flex-direction: column; align-items: center; }
.stat-label { font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); }
.stat-item span:last-child { font-family: var(--font-heading); color: var(--gold-primary); font-size: 1.1rem; }

.rate-group-name { color: var(--text-muted); font-size: 0.8rem; font-family: 'Consolas', monospace; }

.raw-fixer-container { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 25px; height: calc(100vh - 240px); min-height: 650px; display: flex; flex-direction: column; gap: 20px; }
.fixer-toolbar { display: flex; align-items: center; gap: 20px; padding: 15px; background: rgba(195, 163, 74, 0.05); border-radius: var(--radius-sm); border: 1px solid var(--gold-border); }
.fixer-info { font-size: 0.85rem; color: var(--text-secondary); }
.raw-editor { flex: 1; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 20px; color: var(--text-primary); font-family: 'Consolas', monospace; font-size: 14px; line-height: 1.6; resize: none; outline: none; transition: var(--transition); width: 100%; }
.raw-editor:focus { border-color: var(--gold-primary); background: var(--bg-hover); box-shadow: var(--shadow-gold); }

.search-results-list { max-height: 400px; overflow-y: auto; margin: 15px 0; border: 1px solid var(--border-color); border-radius: var(--radius-sm); }
.item-result-entry { padding: 12px 15px; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: var(--transition); display: flex; align-items: center; gap: 15px; }
.item-result-entry:hover { background: var(--bg-hover); }
.item-result-entry:last-child { border-bottom: none; }
.res-icon { width: 32px; height: 32px; background: var(--bg-input); border-radius: 4px; display: flex; align-items: center; justify-content: center; }
.res-vnum { font-weight: 700; color: var(--gold-primary); min-width: 60px; }
.res-name { font-size: 0.9rem; color: var(--text-primary); }

.small { padding: 6px 12px; font-size: 0.75rem; }
.full-width { width: 100%; margin-top: 20px; }

@media (max-width: 1000px) {
    .visual-container { grid-template-columns: 1fr; height: auto; }
    .group-sidebar { height: 400px; }
    .group-header-fields { grid-template-columns: 1fr; }
}
</style>
