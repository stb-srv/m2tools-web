<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useItemService } from '@/composables/useItemService';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { parseSpecialItemGroup, buildSpecialItemGroupString as buildSpecialItemGroupStringFor, itemPercent } from './specialItemGroupText';

const itemService = useItemService();
const auth = useAuthStore();
const ui = useUiStore();

const groups = ref([]);
const currentGroupIndex = ref(-1);
const groupSearchQuery = ref('');
const settingsModalOpen = ref(false);

const itemSearchOverlayOpen = ref(false);
const itemSearchQuery = ref('');
const itemSearchResults = ref([]);
const activeItemRowIndex = ref(-1); // -1 = target chest vnum, >=0 = item row

let autoSaveTimeout = null;
let suppressAutoSave = true; // avoid an autosave firing from the initial load

const selectedGroup = computed(() => (currentGroupIndex.value === -1 ? null : groups.value[currentGroupIndex.value]));

const filteredGroups = computed(() => {
    const q = groupSearchQuery.value.toLowerCase();
    return groups.value
        .map((g, idx) => ({ g, idx }))
        .filter(({ g }) =>
            itemService.getName(g.vnum).toLowerCase().includes(q) ||
            g.name.toLowerCase().includes(q) ||
            g.vnum.toString().includes(q) ||
            (g.comment && g.comment.toLowerCase().includes(q))
        );
});

const totalItemsCount = computed(() => groups.value.reduce((acc, g) => acc + g.items.length, 0));

const targetName = computed(() => (selectedGroup.value && itemService.getName(selectedGroup.value.vnum)) || 'Keine Truhe ausgewählt');

function onGroupVnumInput() {
    const group = selectedGroup.value;
    const itemName = itemService.getName(group.vnum);
    if (itemName) {
        group.name = itemName.replace(/[^a-zA-Z0-9_+]/g, '_');
        group.comment = itemName;
    }
}

function onItemVnumInput(item) {
    const itemName = itemService.getName(item.vnum);
    if (itemName) item.comment = itemName;
}

function selectGroup(idx) {
    currentGroupIndex.value = idx;
}

function createGroup() {
    groups.value.push({
        id: Date.now() + Math.random(),
        name: `Group_${groups.value.length + 1}`,
        vnum: 0,
        type: 'NORMAL',
        comment: '',
        items: []
    });
    selectGroup(groups.value.length - 1);
}

function addItem() {
    if (!selectedGroup.value) return;
    selectedGroup.value.items.push({ id: Date.now() + Math.random(), vnum: 0, count: 1, prob: 10, comment: '' });
}

function removeItem(idx) {
    selectedGroup.value.items.splice(idx, 1);
}

function openItemSearch(rowIndex) {
    activeItemRowIndex.value = rowIndex;
    itemSearchQuery.value = '';
    itemSearchResults.value = [];
    itemSearchOverlayOpen.value = true;
}

function onItemSearchInput() {
    itemSearchResults.value = itemSearchQuery.value ? itemService.search(itemSearchQuery.value).slice(0, 50) : [];
}

function pickItem(i) {
    const group = selectedGroup.value;
    if (activeItemRowIndex.value === -1) {
        group.vnum = i.vnum;
        group.name = i.name.replace(/[^a-zA-Z0-9_+]/g, '_');
        group.comment = i.name;
    } else {
        const it = group.items[activeItemRowIndex.value];
        it.vnum = i.vnum;
        it.comment = i.name;
    }
    itemSearchOverlayOpen.value = false;
}

function createFileInput(handler) {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => handler(ev.target.result);
        reader.readAsText(file);
    };
    input.click();
}

function handleSpecialGroupsImport(text) {
    try {
        const parsed = parseSpecialItemGroup(text);
        if (parsed.length === 0) throw new Error('Keine validen Gruppen gefunden.');
        groups.value = parsed;
        ui.toast(`${groups.value.length} Gruppen erfolgreich geladen! (Noch nicht auf Server gespeichert)`, 'success');
        settingsModalOpen.value = false;
    } catch (err) {
        ui.toast('Import fehlgeschlagen: ' + err.message, 'error');
    }
}

function handleItemNamesImport(text) {
    itemService.initNames(text);
    ui.toast('Item-Datenbank aktualisiert!', 'success');
    settingsModalOpen.value = false;
}

async function performServerSave(isSilent = false) {
    const output = buildSpecialItemGroupStringFor(groups.value, itemService);
    if (!output) return;
    try {
        const res = await auth.authFetch('/api/special_item_group/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: output })
        });
        const data = await res.json();
        if (data.success && !isSilent) ui.toast('Erfolgreich auf Server gespeichert!', 'success');
        else if (!data.success) throw new Error(data.error);
    } catch (err) {
        if (!isSilent) ui.toast('Fehler beim Speichern auf dem Server', 'error');
        console.error(err);
    }
}

function scheduleAutoSave() {
    if (suppressAutoSave) return;
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => performServerSave(true), 1500);
}

function downloadFile() {
    const output = buildSpecialItemGroupStringFor(groups.value, itemService);
    if (!output) { ui.toast('Keine Gruppen vorhanden!', 'warning'); return; }
    const blob = new Blob([output], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = 'special_item_group.txt';
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    ui.toast('special_item_group.txt wurde heruntergeladen!', 'success');
}

// Any edit anywhere in `groups` schedules a debounced autosave to the
// server - replaces the original's per-field oninput saveToLocal() calls.
watch(groups, scheduleAutoSave, { deep: true });

onMounted(async () => {
    const initialized = await itemService.autoInit();
    if (!initialized) console.warn('[SpecialGroups] Failed to load item data.');

    try {
        const res = await auth.authFetch('/api/special_item_group/load');
        const text = await res.text();
        if (text && text.trim().length > 0) groups.value = parseSpecialItemGroup(text);
    } catch (err) {
        console.error('Failed to load special_item_group.txt from server:', err);
        ui.toast('Fehler beim Laden vom Server', 'error');
    }

    if (groups.value.length === 0) settingsModalOpen.value = true;
    suppressAutoSave = false;
});
</script>

<template>
    <div class="page-header">
        <div class="header-breadcrumb">
            <router-link to="/index.html">Dashboard</router-link> / <span class="accent-text">SPEZIELLE ITEM-GRUPPE</span>
        </div>
        <div class="header-main-row">
            <div class="title-meta">
                <h1>Spezielle Item-Gruppe</h1>
                <p class="m2-hint">Verwalte Truheninhalte und Belohnungs-Gruppen professionell.</p>
            </div>
            <div class="header-actions">
                <button class="m2-btn m2-btn-secondary" title="Einstellungen" @click="settingsModalOpen = true">⚙️</button>
                <button class="m2-btn m2-btn-secondary" @click="createFileInput(handleSpecialGroupsImport)">📥 Importieren</button>
                <button class="m2-btn m2-btn-primary" @click="performServerSave(false)">💾 Auf Server Speichern</button>
                <button class="m2-btn m2-btn-primary" @click="downloadFile">📦 Download (TXT)</button>
            </div>
        </div>
    </div>

    <div class="editor-layout-main">
        <aside class="groups-sidebar glass-panel">
            <div class="sidebar-search">
                <div class="m2-input-group">
                    <div class="input-icon-box">🔍</div>
                    <input v-model="groupSearchQuery" type="text" class="m2-input" placeholder="Suchen...">
                </div>
            </div>

            <div class="sidebar-actions">
                <button class="m2-btn m2-btn-secondary full-width" @click="createGroup">➕ GRUPPE ERSTELLEN</button>
            </div>

            <div class="groups-list">
                <div v-if="filteredGroups.length === 0" class="list-empty">Keine Gruppen</div>
                <div
                    v-for="{ g, idx } in filteredGroups"
                    :key="g.id"
                    class="group-item"
                    :class="{ active: idx === currentGroupIndex }"
                    @click="selectGroup(idx)"
                >
                    <div class="g-icon">{{ idx + 1 }}</div>
                    <div class="g-info">
                        <span class="g-name">{{ g.name }}</span>
                        <small>ID: {{ g.vnum }} • {{ g.items.length }} Items</small>
                    </div>
                </div>
            </div>

            <div class="sidebar-footer">{{ groups.length }} Gruppen • {{ totalItemsCount }} Gegenstände</div>
        </aside>

        <div class="editor-stage">
            <div v-if="!selectedGroup" class="no-selection-placeholder">
                <div class="p-icon">🎁</div>
                <h3>Wähle eine Gruppe zum Bearbeiten</h3>
                <p>Suche links nach einer Gruppe oder erstelle eine neue.</p>
            </div>

            <div v-else class="editor-content">
                <div class="group-config-container glass-panel" style="padding: 25px; display: flex; flex-direction: column; gap: 20px;">
                    <div class="m2-field-group" style="margin: 0;">
                        <label class="m2-label">Ziel-Truhe (VNUM)</label>
                        <div style="display: flex; gap: 15px; align-items: center; background: var(--bg-input); border: 1px solid var(--border-color); padding: 12px 15px; border-radius: var(--radius-md); box-shadow: inset 0 2px 5px rgba(0,0,0,0.1);">
                            <div style="width: 54px; height: 54px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--gold-border); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px var(--gold-subtle); flex-shrink: 0;">
                                <img :src="itemService.getIconPath(selectedGroup.vnum)" style="max-width: 40px; max-height: 40px; object-fit: contain;">
                            </div>
                            <div style="flex: 1; display: flex; flex-direction: column; gap: 5px;">
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input v-model.number="selectedGroup.vnum" type="number" class="m2-input" placeholder="VNUM..." style="padding: 8px 12px; width: 140px; text-align: center; font-weight: bold; background: var(--bg-body);" @input="onGroupVnumInput">
                                    <button class="m2-btn m2-btn-primary small" style="padding: 8px 15px; display: flex; align-items: center; gap: 5px;" @click="openItemSearch(-1)">
                                        <span>🔍</span> Suchen
                                    </button>
                                </div>
                                <span style="font-size: 0.9rem; font-weight: 700; color: var(--gold-primary); letter-spacing: 0.5px;">{{ targetName }}</span>
                            </div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
                        <div class="m2-field-group" style="margin: 0;">
                            <label class="m2-label">Gruppenname</label>
                            <input v-model="selectedGroup.name" type="text" class="m2-input" placeholder="z.B. Chest_Drop">
                        </div>
                        <div class="m2-field-group" style="margin: 0;">
                            <label class="m2-label">Kommentar / Echter Name</label>
                            <input v-model="selectedGroup.comment" type="text" class="m2-input" placeholder="Truhe des Jotun...">
                        </div>
                        <div class="m2-field-group" style="margin: 0;">
                            <label class="m2-label">Typ</label>
                            <select v-model="selectedGroup.type" class="m2-input">
                                <option value="NORMAL">NORMAL</option>
                                <option value="PCT">PCT (Wahrscheinlichkeit)</option>
                                <option value="ATTR">ATTR</option>
                                <option value="QUEST">QUEST</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="items-list-container">
                    <div class="list-header-row">
                        <div class="col-id">#</div>
                        <div class="col-vnum">Item</div>
                        <div class="col-comment">Name</div>
                        <div class="col-count">Anzahl</div>
                        <div class="col-prob">Chance/Gewicht</div>
                        <div class="col-actions"></div>
                    </div>

                    <div class="items-rows">
                        <div v-for="(it, idx) in selectedGroup.items" :key="it.id" class="item-row">
                            <div class="col-id" style="font-weight: 800; font-size: 1.1rem; color: var(--gold-primary); text-align: center;">{{ idx + 1 }}</div>

                            <div class="col-vnum">
                                <div class="vnum-input-box">
                                    <div style="width: 32px; height: 32px; background: rgba(0,0,0,0.1); border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                                        <img :src="itemService.getIconPath(it.vnum)" class="row-icon">
                                    </div>
                                    <input v-model.number="it.vnum" type="number" placeholder="VNUM" @input="onItemVnumInput(it)">
                                    <button class="m2-btn m2-btn-secondary small" style="padding: 4px 8px; border-radius: 4px; width: auto;" title="Item suchen" @click="openItemSearch(idx)">🔍</button>
                                </div>
                            </div>

                            <div class="col-comment">
                                <div class="name-badge">{{ itemService.getName(it.vnum) || '-' }}</div>
                            </div>

                            <div class="col-count">
                                <input v-model.number="it.count" type="number" min="1" style="text-align: center; font-weight: bold; padding: 6px;">
                            </div>

                            <div class="col-prob">
                                <div class="prob-wrapper">
                                    <input v-model.number="it.prob" type="number" min="0" style="padding: 6px 45px 6px 10px; font-weight: bold;">
                                    <span class="prob-pct">{{ itemPercent(selectedGroup, it) }}%</span>
                                </div>
                            </div>

                            <div class="col-actions" style="display: flex; justify-content: center;">
                                <button class="action-btn delete" title="Löschen" @click="removeItem(idx)">✕</button>
                            </div>
                        </div>
                    </div>

                    <button class="add-item-row-btn" @click="addItem">➕ NEUES ITEM HINZUFÜGEN</button>
                </div>
            </div>
        </div>
    </div>

    <!-- ── SETTINGS MODAL ───────────────────────── -->
    <div v-if="settingsModalOpen" class="modal-overlay">
        <div class="modal-box glass-panel" style="max-width: 500px;">
            <div class="modal-header">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;"><span>⚙️</span> Einstellungen</h3>
                <button class="close-modal" @click="settingsModalOpen = false">✕</button>
            </div>
            <div class="modal-body">
                <p class="m2-hint" style="margin: 0;">Verwalte deine Item-Datenbank und Importe.</p>

                <div class="setting-item">
                    <div class="s-info">
                        <strong>Item-Datenbank</strong>
                        <span>Verwendet für die Namensauflösung im Editor.</span>
                    </div>
                    <div class="m2-file-drop" @click="createFileInput(handleItemNamesImport)">
                        <span>item_names.txt hochladen</span>
                    </div>
                </div>

                <div class="setting-item">
                    <div class="s-info">
                        <strong>Vorhandene Gruppen importieren</strong>
                        <span>Lade deine special_item_group.txt hoch.</span>
                    </div>
                    <div class="m2-file-drop" @click="createFileInput(handleSpecialGroupsImport)">
                        <span>special_item_group.txt hochladen</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="m2-btn m2-btn-primary full-width" @click="settingsModalOpen = false">SCHLIESSEN</button>
            </div>
        </div>
    </div>

    <!-- Overlay for Item Search -->
    <div v-if="itemSearchOverlayOpen" class="modal-overlay">
        <div class="modal-box glass-panel" style="max-width: 500px; max-height: 80vh;">
            <div class="modal-header">
                <h3 style="margin: 0;">Item Suchen</h3>
                <button class="close-modal" @click="itemSearchOverlayOpen = false">✕</button>
            </div>
            <div class="m2-field-group" style="padding: 20px 25px 5px; margin: 0;">
                <div class="m2-input-group" style="position: relative;">
                    <div class="input-icon-box" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 1.1rem; pointer-events: none;">🔍</div>
                    <input v-model="itemSearchQuery" type="text" class="m2-input" placeholder="Nach Name oder VNUM suchen..." style="padding-left: 40px;" autofocus @input="onItemSearchInput">
                </div>
            </div>
            <div class="search-results-list" style="padding: 15px 25px 25px 25px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px;">
                <div v-for="i in itemSearchResults" :key="i.vnum" class="item-result-entry" @click="pickItem(i)">
                    <div class="res-icon"><img :src="itemService.getIconPath(i.vnum)"></div>
                    <div class="res-vnum">{{ i.vnum }}</div>
                    <div class="res-name">{{ i.name }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.editor-layout-main {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 25px;
    margin-top: 20px;
    height: calc(100vh - 250px);
    align-items: stretch;
}

@media (max-width: 1100px) {
    .editor-layout-main { grid-template-columns: 1fr; height: auto; }
}

.groups-sidebar {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow: hidden;
    backdrop-filter: blur(25px);
}

.sidebar-actions { margin-top: 15px; margin-bottom: 20px; }

.groups-list {
    flex: 1;
    overflow-y: auto;
    margin: 0 -10px;
    padding: 0 10px;
}

.group-item {
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 12px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: 0.25s;
    display: flex;
    align-items: center;
    gap: 12px;
}

.group-item:hover { border-color: var(--gold-primary); transform: translateX(5px); background: var(--bg-hover); }
.group-item.active { border-color: var(--gold-primary); background: var(--gold-subtle); box-shadow: 0 0 15px var(--gold-subtle); }

.g-icon {
    width: 32px; height: 32px;
    background: var(--bg-body);
    border-radius: 4px;
    border: 1px solid var(--border-color);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1.1rem; color: var(--gold-primary);
}
.g-name { display: block; font-weight: 700; color: var(--text-primary); font-size: 0.9rem; }
.g-info small { color: var(--text-secondary); font-size: 0.7rem; }

.sidebar-footer {
    padding-top: 15px;
    border-top: 1px solid var(--border-color);
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: center;
}

.editor-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.no-selection-placeholder {
    align-self: center;
    margin: auto;
    text-align: center;
    color: var(--text-secondary);
}
.no-selection-placeholder .p-icon { font-size: 4rem; margin-bottom: 20px; opacity: 0.3; }

.editor-content { flex: 1; display: flex; flex-direction: column; gap: 20px; overflow: hidden; }

.vnum-input-box {
    display: flex;
    align-items: center;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    gap: 10px;
    transition: 0.3s;
}

.vnum-input-box:focus-within { border-color: var(--gold-primary); background: var(--bg-hover); box-shadow: 0 0 10px var(--gold-subtle); }
.vnum-input-box input { border: none !important; background: transparent !important; padding: 6px 0 !important; width: 80px; font-weight: 800; color: var(--gold-primary); flex: 1; min-width: 60px; }

.items-list-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    overflow: hidden;
}

.list-header-row {
    background: var(--bg-input);
    display: grid;
    grid-template-columns: 40px 240px 1fr 100px 120px 50px;
    gap: 15px;
    padding: 15px 20px;
    font-size: 0.75rem;
    font-weight: 800;
    color: var(--gold-primary);
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 2px solid var(--border-color);
}

.items-rows { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }

.item-row {
    display: grid;
    grid-template-columns: 40px 240px 1fr 100px 120px 50px;
    gap: 15px;
    align-items: center;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    padding: 12px 15px;
    border-radius: var(--radius-md);
    position: relative;
    overflow: hidden;
    transition: 0.2s;
    box-shadow: var(--shadow-sm);
}

.item-row:hover { background: var(--bg-hover); border-color: var(--gold-border); transform: scale(1.005); }

.col-id { color: var(--text-secondary); font-family: monospace; font-size: 0.8rem; }
.row-icon { width: 24px; height: 24px; object-fit: contain; }

.col-comment { display: flex; flex-direction: column; gap: 4px; }
.name-badge { font-size: 0.7rem; font-weight: 700; color: var(--text-primary); opacity: 0.8; }

.prob-wrapper { position: relative; display: flex; align-items: center; }
.prob-pct { position: absolute; right: 8px; font-size: 0.65rem; color: var(--text-secondary); font-weight: 800; pointer-events: none; }

.add-item-row-btn {
    margin: 15px;
    background: transparent;
    border: 1px dashed var(--border-color);
    color: var(--text-secondary);
    padding: 15px;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 800;
    font-size: 0.75rem;
    transition: 0.3s;
}

.add-item-row-btn:hover { border-color: var(--gold-primary); color: var(--gold-primary); background: var(--bg-hover); }

.modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: var(--bg-overlay, rgba(0, 0, 0, 0.5));
    backdrop-filter: blur(5px);
    display: flex; justify-content: flex-end; align-items: stretch; z-index: 9000;
}

.modal-box {
    width: 450px; max-width: 100%; display: flex; flex-direction: column; gap: 0; padding: 0; overflow: hidden;
    height: 100vh;
    border-radius: 0;
    border-right: none;
    border-top: none;
    border-bottom: none;
    animation: slideInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1);
}
@keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
}
.modal-header { padding: 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.modal-body { padding: 30px; display: flex; flex-direction: column; gap: 20px; flex: 1; overflow-y: auto; }
.modal-footer { padding: 20px 30px; border-top: 1px solid var(--border-color); flex-shrink: 0; }

.setting-item { display: flex; flex-direction: column; gap: 10px; }
.s-info strong { display: block; color: var(--gold-primary); }
.s-info span { font-size: 0.8rem; color: var(--text-secondary); }

.m2-file-drop {
    border: 2px dashed var(--border-color); background: var(--bg-input);
    padding: 30px; text-align: center; border-radius: var(--radius-sm);
    cursor: pointer; transition: 0.3s; color: var(--text-secondary); font-size: 0.85rem; font-weight: 700;
}

.m2-file-drop:hover { border-color: var(--gold-primary); background: var(--bg-hover); color: var(--gold-primary); }

.close-modal { background: none; border: none; font-size: 1.5rem; color: var(--text-secondary); cursor: pointer; }
.close-modal:hover { color: var(--danger); }

.action-btn.delete {
    background: rgba(229, 57, 53, 0.1);
    color: #e53935;
    border: 1px solid rgba(229, 57, 53, 0.2);
    width: 32px; height: 32px; border-radius: 4px;
    cursor: pointer; transition: 0.2s;
}
.action-btn.delete:hover { background: #e53935; color: #fff; }

.item-result-entry {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 10px 15px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: 0.2s;
}
.item-result-entry:hover {
    background: var(--bg-hover);
    border-color: var(--gold-primary);
    transform: translateX(5px);
}
.item-result-entry .res-icon {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-body);
    border-radius: 4px;
    border: 1px solid var(--border-color);
    flex-shrink: 0;
}
.item-result-entry .res-icon img {
    max-width: 28px;
    max-height: 28px;
    object-fit: contain;
}
.item-result-entry .res-vnum {
    min-width: 70px;
    font-family: monospace;
    color: var(--gold-primary);
    font-size: 0.9rem;
    font-weight: 600;
}
.item-result-entry .res-name {
    flex: 1;
    font-weight: 600;
    color: var(--text-heading);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.list-empty { padding: 40px; text-align: center; color: var(--text-muted); }
</style>
