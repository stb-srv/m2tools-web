<script setup>
import { ref, computed, onMounted } from 'vue';
import { useItemService } from '@/composables/useItemService';
import { useUiStore } from '@/stores/ui';

const itemService = useItemService();
const ui = useUiStore();

const searchInput = ref('');
const debouncedQuery = ref('');
const showSettings = ref(false);
let debounceTimer;

function onSearchInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debouncedQuery.value = searchInput.value; }, 300);
}

const allEntries = computed(() => Object.entries(itemService.items));

const filteredEntries = computed(() => {
    const q = debouncedQuery.value.toLowerCase();
    if (!q) return allEntries.value;
    return allEntries.value.filter(([vnum, data]) =>
        vnum.includes(q) || (data.name && data.name.toLowerCase().includes(q))
    );
});

const displayList = computed(() => filteredEntries.value.slice(0, 200));
const remainingCount = computed(() => Math.max(0, filteredEntries.value.length - 200));

const uniqueIconsCount = computed(() => {
    const bases = new Set(allEntries.value.map(([vnum]) => itemService.getBaseVnum(vnum)));
    return bases.size;
});

function itemName(vnum, data) {
    return data.name || `VNUM ${vnum}`;
}

function isMapped(vnum) {
    return itemService.getBaseVnum(vnum) != vnum;
}

function paddedBase(vnum) {
    return itemService.getBaseVnum(vnum).toString().padStart(5, '0');
}

function boxHeight(data) {
    return `${(data.size || 1) * 32}px`;
}

function onIconError(e) {
    if (e.target.dataset.failed) return;
    e.target.dataset.failed = 'true';
    e.target.src = '/shared/assets/no_icon.png';
}

function openFilePicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            itemService.initNames(ev.target.result);
            ui.toast('item_names.txt erfolgreich importiert!', 'success');
            showSettings.value = false;
        };
        reader.readAsText(file);
    };
    input.click();
}

onMounted(async () => {
    const hasData = await itemService.autoInit();
    if (!hasData) showSettings.value = true;
});
</script>

<template>
    <div class="page-header">
        <div class="header-breadcrumb">
            <router-link to="/index.html">Dashboard</router-link> / <span class="accent-text">ITEM-MANAGER</span>
        </div>

        <div class="header-main-row">
            <div class="title-meta">
                <h1>Item-Manager & Icons</h1>
                <p class="m2-hint">Zentrale Prüfung von Namen, VNUMs und Icons (+0 bis +9 Logik).</p>
            </div>
            <div class="header-actions">
                <button class="m2-btn m2-btn-secondary" title="Einstellungen" @click="showSettings = true">⚙️</button>
            </div>
        </div>
    </div>

    <div class="manager-layout glass-panel">
        <div class="filter-bar">
            <div class="m2-input-group search-box">
                <div class="input-icon-box">🔍</div>
                <input
                    v-model="searchInput"
                    type="text"
                    class="m2-input"
                    placeholder="Nach VNUM oder Name suchen..."
                    @input="onSearchInput"
                >
            </div>
            <div class="stats-row">
                <span>Geladene Items: <strong>{{ allEntries.length }}</strong></span>
                <span class="m2-badge">Icons: <strong>{{ uniqueIconsCount }}</strong></span>
            </div>
        </div>

        <div class="item-table-container">
            <div class="table-header">
                <div class="col-icon">Icon</div>
                <div class="col-vnum">VNUM</div>
                <div class="col-name">Item Name</div>
                <div class="col-base">Icon-File (Basis-ID)</div>
                <div class="col-status">Status</div>
            </div>
            <div class="item-list">
                <div v-if="displayList.length === 0" class="list-empty">
                    Keine Items geladen. Bitte importiere deine item_names.txt.
                </div>
                <div v-for="[vnum, data] in displayList" :key="vnum" class="item-row">
                    <div class="it-icon-box" :style="{ height: boxHeight(data) }">
                        <img :src="itemService.getIconPath(vnum)" @error="onIconError">
                    </div>
                    <div class="it-vnum">{{ vnum }}</div>
                    <div class="it-name">{{ itemName(vnum, data) }}</div>
                    <div class="it-base">{{ paddedBase(vnum) }}.tga</div>
                    <div class="it-status" :class="isMapped(vnum) ? 'status-mapped' : 'status-valid'">
                        {{ isMapped(vnum) ? `Mapped (+${vnum % 10})` : 'Basis-ID' }}
                    </div>
                </div>
                <div v-if="remainingCount > 0" class="list-empty">
                    ... und {{ remainingCount }} weitere Items (Suche verfeinern für mehr Details).
                </div>
            </div>
        </div>
    </div>

    <div class="modal-overlay" :class="{ hidden: !showSettings }">
        <div class="modal-box glass-panel">
            <div class="modal-header">
                <h2>⚙️ Item-Datenbank Import</h2>
                <button class="close-modal" @click="showSettings = false">✕</button>
            </div>
            <div class="modal-body">
                <p class="m2-hint">Lade deine Spieldaten hoch, um die Icons im gesamten System aktuell zu halten.</p>

                <div class="setting-item">
                    <div class="s-info">
                        <strong>item_names.txt</strong>
                        <span>Dient als primäre Quelle für Namen und VNUMs.</span>
                    </div>
                    <div class="m2-file-drop" @click="openFilePicker">
                        <span>item_names.txt hier ablegen</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="m2-btn m2-btn-primary full-width" @click="showSettings = false">FERTIG</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.manager-layout {
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
    height: calc(100vh - 250px);
}

.filter-bar {
    padding: 25px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 30px;
    flex-shrink: 0;
}

.search-box { flex: 1; max-width: 600px; }
.stats-row { display: flex; gap: 20px; font-size: 0.85rem; color: var(--text-secondary); }
.stats-row strong { color: var(--gold-primary); }

.item-table-container {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

.table-header {
    background: var(--bg-navbar);
    display: grid;
    grid-template-columns: 80px 100px 1fr 180px 120px;
    gap: 15px;
    padding: 12px 25px;
    font-size: 0.7rem;
    font-weight: 800;
    color: var(--gold-primary);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    border-bottom: 1px solid var(--border-color);
    position: sticky; top: 0; z-index: 10;
}

.item-list { padding: 15px 25px; display: flex; flex-direction: column; gap: 5px; }

.item-row {
    display: grid;
    grid-template-columns: 80px 100px 1fr 180px 120px;
    gap: 15px;
    align-items: center;
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--border-color);
    padding: 8px 15px;
    border-radius: var(--radius-sm);
    transition: 0.2s;
}

.item-row:hover { background: var(--bg-hover); border-color: var(--gold-border); transform: translateX(5px); }

.it-icon-box {
    width: 32px;
    min-height: 32px;
    max-height: 96px;
    background: rgba(0,0,0,0.3); border-radius: 4px; border: 1px solid var(--border-color);
    display: flex; align-items: center; justify-content: center; overflow: hidden;
    flex-shrink: 0;
}

.it-icon-box img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }

.it-vnum { font-family: monospace; font-weight: 800; color: var(--gold-primary); font-size: 0.9rem; }
.it-name { font-weight: 700; color: var(--text-primary); }
.it-base { font-family: monospace; color: var(--text-secondary); font-size: 0.8rem; background: var(--bg-input); padding: 4px 8px; border-radius: 3px; }

.it-status { font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }

.status-valid { color: var(--success); }
.status-mapped { color: var(--info); }

.modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: var(--bg-body);
    opacity: 0.98;
    backdrop-filter: blur(10px);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
}
.modal-overlay.hidden { display: none !important; }

.modal-box { width: 500px; max-width: 95%; overflow: hidden; }
.modal-header { padding: 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); }
.modal-body { padding: 30px; display: flex; flex-direction: column; gap: 20px; }
.modal-footer { padding: 20px 30px; border-top: 1px solid var(--border-color); }

.m2-file-drop {
    border: 2px dashed var(--border-color); background: rgba(255,255,255,0.03);
    padding: 30px; text-align: center; border-radius: var(--radius-sm);
    cursor: pointer; transition: 0.3s; color: var(--text-secondary); font-size: 0.85rem; font-weight: 700;
}

.m2-file-drop:hover { border-color: var(--gold-primary); background: var(--bg-hover); color: var(--gold-primary); }

.list-empty { padding: 50px; text-align: center; color: var(--text-muted); font-size: 0.9rem; }
.close-modal { background: none; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer; }
</style>
