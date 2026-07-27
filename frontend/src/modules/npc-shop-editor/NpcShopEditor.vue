<script setup>
import { ref, computed, onMounted } from 'vue';
import { useItemService } from '@/composables/useItemService';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { parseShopText, stringifyShops } from './shopText';

const itemService = useItemService();
const auth = useAuthStore();
const ui = useUiStore();

const TABS = [
    { id: 'shops', label: '🏪 Shops' },
    { id: 'npc', label: '🧙 NPC-Datei' }
];
const currentTab = ref('shops');
const saving = ref(false);

// ── Shops (structured) ────────────────────────────────
const shops = ref([]);
const selectedShopIndex = ref(-1);
const shopSearchQuery = ref('');

const itemSearchOverlayOpen = ref(false);
const itemSearchQuery = ref('');
const itemSearchResults = ref([]);
const activeItemRowIndex = ref(-1);

const selectedShop = computed(() => (selectedShopIndex.value === -1 ? null : shops.value[selectedShopIndex.value]));

const filteredShops = computed(() => {
    const q = shopSearchQuery.value.toLowerCase();
    if (!q) return shops.value.map((s, idx) => ({ s, idx }));
    return shops.value.map((s, idx) => ({ s, idx })).filter(({ s }) => s.id.toLowerCase().includes(q));
});

function selectShop(idx) { selectedShopIndex.value = idx; }

function createNewShop() {
    const id = 'New_Shop_' + (shops.value.length + 1);
    shops.value.push({ id, items: [] });
    selectShop(shops.value.length - 1);
}

function deleteShop(idx) {
    shops.value.splice(idx, 1);
    if (selectedShopIndex.value === idx) selectedShopIndex.value = -1;
    else if (selectedShopIndex.value > idx) selectedShopIndex.value--;
}

function addShopItem() {
    if (!selectedShop.value) return;
    selectedShop.value.items.push({ vnum: '0', count: '1' });
}

function removeShopItem(idx) {
    selectedShop.value.items.splice(idx, 1);
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
    selectedShop.value.items[activeItemRowIndex.value].vnum = i.vnum;
    itemSearchOverlayOpen.value = false;
}

async function loadShops() {
    try {
        const res = await auth.authFetch('/api/npc_shop/shop/load?format=json');
        shops.value = await res.json();
    } catch {
        ui.toast('Fehler beim Laden von shop.txt', 'error');
    }
}

async function saveShops() {
    saving.value = true;
    try {
        const res = await auth.authFetch('/api/npc_shop/shop/save', {
            method: 'POST',
            body: JSON.stringify({ shops: shops.value })
        });
        const data = await res.json();
        if (data.success) ui.toast('shop.txt gespeichert!', 'success');
        else ui.toast(data.error || 'Speichern fehlgeschlagen', 'error');
    } catch {
        ui.toast('Server-Fehler beim Speichern', 'error');
    } finally {
        saving.value = false;
    }
}

function openLocalShopFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            shops.value = parseShopText(ev.target.result);
            selectedShopIndex.value = shops.value.length > 0 ? 0 : -1;
        };
        reader.readAsText(file);
    };
    input.click();
}

function downloadShopFile() {
    if (shops.value.length === 0) return ui.toast('Keine Daten zum Speichern', 'warning');
    const blob = new Blob([stringifyShops(shops.value)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shop.txt';
    a.click();
    URL.revokeObjectURL(url);
}

// ── NPC file (raw text) ───────────────────────────────
const npcText = ref('');
const npcLoaded = ref(false);

async function loadNpcFile() {
    try {
        const res = await auth.authFetch('/api/npc_shop/npc/load');
        npcText.value = await res.text();
        npcLoaded.value = true;
    } catch {
        ui.toast('Fehler beim Laden von npc.txt', 'error');
    }
}

async function saveNpcFile() {
    saving.value = true;
    try {
        const res = await auth.authFetch('/api/npc_shop/npc/save', {
            method: 'POST',
            body: JSON.stringify({ content: npcText.value })
        });
        const data = await res.json();
        if (data.success) ui.toast('npc.txt gespeichert!', 'success');
        else ui.toast(data.error || 'Speichern fehlgeschlagen', 'error');
    } catch {
        ui.toast('Server-Fehler beim Speichern', 'error');
    } finally {
        saving.value = false;
    }
}

function switchTab(tab) {
    currentTab.value = tab;
    if (tab === 'npc' && !npcLoaded.value) loadNpcFile();
}

onMounted(async () => {
    await itemService.autoInit();
    await loadShops();
});
</script>

<template>
    <div class="page-header">
        <div class="header-breadcrumb">
            <router-link to="/index.html">Dashboard</router-link> / NPC & Shop Editor
        </div>
        <div class="header-main-row">
            <h1>NPC & <span class="gold">SHOP</span></h1>
            <div class="tab-controls">
                <button v-for="tab in TABS" :key="tab.id" class="tab-btn" :class="{ active: currentTab === tab.id }" @click="switchTab(tab.id)">
                    {{ tab.label }}
                </button>
            </div>
            <div class="header-actions">
                <template v-if="currentTab === 'shops'">
                    <button class="m2-btn m2-btn-secondary" @click="openLocalShopFile">📁 Datei öffnen</button>
                    <button class="m2-btn m2-btn-secondary" @click="downloadShopFile">📥 Download</button>
                    <button class="m2-btn m2-btn-primary" :disabled="saving" @click="saveShops">{{ saving ? '⏳' : '💾 Speichern' }}</button>
                </template>
                <template v-else>
                    <button class="m2-btn m2-btn-primary" :disabled="saving" @click="saveNpcFile">{{ saving ? '⏳' : '💾 Speichern' }}</button>
                </template>
            </div>
        </div>
    </div>

    <div v-show="currentTab === 'shops'" class="tab-content active">
        <div class="visual-container">
            <aside class="group-sidebar">
                <div class="sidebar-search">
                    <input v-model="shopSearchQuery" type="text" placeholder="Suchen..." class="m2-input">
                    <button class="m2-btn m2-btn-primary small" @click="createNewShop">+ SHOP ERSTELLEN</button>
                </div>
                <div class="group-list">
                    <div v-if="filteredShops.length === 0" class="group-list-empty">Keine Shops geladen</div>
                    <div v-for="{ s, idx } in filteredShops" :key="idx" class="group-item" :class="{ active: selectedShopIndex === idx }" @click="selectShop(idx)">
                        <span class="group-item-id">{{ s.id }}</span>
                        <span class="group-item-mob">🛒 {{ s.items.length }} Items</span>
                    </div>
                </div>
            </aside>

            <section class="editor-area">
                <div v-if="!selectedShop" class="editor-empty-state">
                    <div class="empty-icon">🏪</div>
                    <h3>Wähle einen Shop aus</h3>
                    <p>Wähle einen Shop aus der Liste aus oder erstelle einen neuen.</p>
                </div>

                <div v-else class="editor-card">
                    <div class="group-header-fields">
                        <div class="m2-field-group">
                            <label class="m2-label">Shop Name</label>
                            <input v-model="selectedShop.id" type="text" class="m2-input" placeholder="ShopName">
                        </div>
                        <div class="m2-field-group">
                            <button class="m2-btn m2-btn-secondary" style="color:#f44336; border-color: rgba(244,67,54,0.2);" @click="deleteShop(selectedShopIndex)">🗑️ Shop löschen</button>
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
                                    <th style="width: 100px">Anzahl</th>
                                    <th style="width: 40px"></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(i, idx) in selectedShop.items" :key="idx">
                                    <td class="item-row-num">{{ idx + 1 }}</td>
                                    <td>
                                        <div class="item-icon-box" @click="openItemSearch(idx)">
                                            <img :src="itemService.getIconPath(i.vnum)">
                                        </div>
                                    </td>
                                    <td><input v-model="i.vnum" type="text" class="m2-input small"></td>
                                    <td>{{ itemService.getName(i.vnum) }}</td>
                                    <td class="item-input-cell"><input v-model="i.count" type="number" class="m2-input small"></td>
                                    <td><button class="m2-btn small m2-btn-secondary" @click="removeShopItem(idx)">🗑️</button></td>
                                </tr>
                            </tbody>
                        </table>
                        <button class="m2-btn m2-btn-secondary full-width" @click="addShopItem">+ Item hinzufügen</button>
                    </div>
                </div>
            </section>
        </div>
    </div>

    <div v-show="currentTab === 'npc'" class="tab-content active">
        <div class="raw-fixer-container">
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 10px;">
                npc.txt-Layouts unterscheiden sich stark zwischen Server-Cores - dieser Tab bearbeitet die Datei daher als reinen Text.
            </p>
            <textarea v-model="npcText" class="raw-editor" placeholder="Lädt..."></textarea>
        </div>
    </div>

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
.group-header-fields { display: grid; grid-template-columns: 1fr 200px; gap: 25px; margin-bottom: 35px; align-items: end; }

.items-table-container { margin-top: 20px; }
.items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.items-table th { text-align: left; padding: 12px 15px; font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; border-bottom: 2px solid var(--border-color); }
.items-table td { padding: 12px 15px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); vertical-align: middle; }
.items-table tr:hover td { background: var(--bg-hover); }

.item-row-num { color: var(--text-muted); font-weight: 700; font-size: 0.85rem; }
.item-icon-box { width: 34px; height: 34px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--gold-primary); overflow: hidden; cursor: crosshair; }
.item-icon-box:hover { border-color: var(--gold-primary); background: var(--bg-hover); }
.item-icon-box img { max-width: 32px; max-height: 32px; image-rendering: pixelated; }
.item-input-cell input { width: 100%; text-align: center; }

.raw-fixer-container { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 25px; height: calc(100vh - 240px); min-height: 650px; display: flex; flex-direction: column; gap: 20px; }
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
