<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useItemService } from '@/composables/useItemService';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { useServerConnection } from '@/composables/useServerConnection';

const itemService = useItemService();
const auth = useAuthStore();
const ui = useUiStore();

const activeWorkspaceId = ref(null);
const serverConn = useServerConnection(activeWorkspaceId);
const deploying = ref(false);

async function loadActiveWorkspaceConnection() {
    try {
        const res = await auth.authFetch('/api/workspaces/active');
        const ws = res.ok ? await res.json() : null;
        activeWorkspaceId.value = ws?.id || null;
        if (activeWorkspaceId.value) await serverConn.load();
    } catch { /* no active workspace / no access - deploy button just stays hidden */ }
}

async function deployCubeToServer() {
    deploying.value = true;
    try {
        const output = buildCubeTxt();
        const result = await serverConn.deployCube('cube.txt', output);
        ui.toast(`An Server gesendet: ${result.remotePath}`, 'success');
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        deploying.value = false;
    }
}

const recipes = ref([]);
const npcNames = reactive({});

const editorOpen = ref(false);
const editingIndex = ref(-1);

const targetVnumInput = ref('');
const targetResults = ref([]);
const targetCount = ref(1);
const yangCost = ref(0);
const successChance = ref(100);
const npcVnum = ref(20017);
const npcSearchText = ref('');
const npcResults = ref([]);
const materials = ref([]); // { id, vnum, count, query, results }

const importFileInput = ref(null);
const editorSection = ref(null);

let materialSeq = 0;

const targetPreview = computed(() => {
    const vnum = parseInt(targetVnumInput.value);
    if (!vnum) return null;
    return { icon: itemService.getIconPath(vnum), name: itemService.getName(vnum) };
});

const stackWarning = computed(() => {
    const vnum = parseInt(targetVnumInput.value);
    if (!vnum) return false;
    return parseInt(targetCount.value) > 1 && itemService.getSize(vnum) > 1;
});

function materialPreview(row) {
    const vnum = parseInt(row.vnum);
    if (!vnum) return null;
    return { icon: itemService.getIconPath(vnum), name: itemService.getName(vnum) };
}

async function fetchNpcName(vnum) {
    if (!vnum || npcNames[vnum]) return;
    try {
        const res = await fetch(`/api/cube/npcs/search?q=${vnum}`);
        const data = await res.json();
        const match = data.find(n => n.vnum == vnum);
        if (match) npcNames[vnum] = match.name;
    } catch { /* keep showing the raw vnum */ }
}

async function resolveContextNames() {
    const npcVnums = [...new Set(recipes.value.map(r => r.npc))];
    for (const vnum of npcVnums) await fetchNpcName(vnum);
}

function onTargetSearchInput() {
    const q = targetVnumInput.value.toLowerCase();
    targetResults.value = q.length >= 1 ? itemService.search(q).slice(0, 50) : [];
}

function pickTarget(item) {
    targetVnumInput.value = item.vnum.toString();
    targetResults.value = [];
}

async function onNpcSearchInput() {
    const q = npcSearchText.value;
    if (q.length < 1) { npcResults.value = []; return; }
    try {
        const res = await fetch(`/api/cube/npcs/search?q=${encodeURIComponent(q)}`);
        npcResults.value = await res.json();
    } catch { npcResults.value = []; }
}

function pickNpc(npc) {
    npcSearchText.value = npc.name;
    npcVnum.value = npc.vnum;
    npcNames[npc.vnum] = npc.name;
    npcResults.value = [];
}

function addMaterialRow(vnum = '', count = 1) {
    if (materials.value.length >= 5) return;
    materials.value.push({ id: materialSeq++, vnum, count, query: '', results: [] });
}

function onMaterialSearchInput(row) {
    row.results = row.query ? itemService.search(row.query).slice(0, 50) : [];
}

function pickMaterial(row, item) {
    row.vnum = item.vnum;
    row.query = '';
    row.results = [];
}

function removeMaterial(idx) {
    materials.value.splice(idx, 1);
}

function showEditor(index = -1) {
    editingIndex.value = index;
    materials.value = [];

    if (index === -1) {
        targetVnumInput.value = '';
        targetCount.value = 1;
        yangCost.value = 0;
        successChance.value = 100;
        npcVnum.value = 20017;
        npcSearchText.value = npcNames[20017] || '';
        addMaterialRow();
    } else {
        const recipe = recipes.value[index];
        targetVnumInput.value = recipe.reward.vnum.toString();
        targetCount.value = recipe.reward.count || 1;
        yangCost.value = recipe.gold;
        successChance.value = recipe.percent;
        npcVnum.value = recipe.npc;
        npcSearchText.value = npcNames[recipe.npc] || '';
        recipe.items.forEach(item => addMaterialRow(item.vnum, item.count));
    }

    editorOpen.value = true;
    targetResults.value = [];
    npcResults.value = [];
    setTimeout(() => editorSection.value?.scrollIntoView({ behavior: 'smooth' }), 0);
}

function hideEditor() {
    editorOpen.value = false;
    editingIndex.value = -1;
}

function saveRecipe() {
    if (!targetVnumInput.value) { ui.toast('Bitte Ziel-Item auswählen!', 'warning'); return; }

    const recipe = {
        npc: parseInt(npcVnum.value),
        reward: { vnum: parseInt(targetVnumInput.value), count: parseInt(targetCount.value) || 1 },
        gold: parseInt(yangCost.value) || 0,
        percent: parseInt(successChance.value) || 0,
        items: materials.value.filter(m => parseInt(m.vnum)).map(m => ({ vnum: parseInt(m.vnum), count: parseInt(m.count) || 1 }))
    };

    if (editingIndex.value === -1) recipes.value.push(recipe);
    else recipes.value[editingIndex.value] = recipe;

    hideEditor();
}

async function deleteRecipe(index) {
    const confirmed = await ui.confirm('Löschen?', 'Rezept wirklich löschen?');
    if (confirmed) recipes.value.splice(index, 1);
}

function recipeReward(recipe) {
    const name = itemService.getName(recipe.reward.vnum);
    return {
        display: `${recipe.reward.count > 1 ? recipe.reward.count + 'x ' : ''}[${recipe.reward.vnum}] ${name}`,
        icon: itemService.getIconPath(recipe.reward.vnum),
        size: itemService.getSize(recipe.reward.vnum)
    };
}

function materialLabel(m) {
    return `[${m.vnum}] ${itemService.getName(m.vnum)}`;
}

function parseCubeTxt(text) {
    const blocks = text.split(/section/i);
    const parsed = [];
    blocks.forEach(block => {
        if (!block.trim() || !block.includes('end')) return;
        const recipe = { npc: 20017, items: [], reward: { vnum: 0, count: 1 }, gold: 0, percent: 100 };
        block.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            const key = parts[0]?.toLowerCase();
            const val1 = parseInt(parts[1]);
            const val2 = parseInt(parts[2]);
            if (key === 'npc') recipe.npc = val1;
            else if (key === 'item') recipe.items.push({ vnum: val1, count: val2 || 1 });
            else if (key === 'reward') recipe.reward = { vnum: val1, count: val2 || 1 };
            else if (key === 'gold') recipe.gold = val1;
            else if (key === 'percent') recipe.percent = val1;
        });
        if (recipe.reward.vnum) parsed.push(recipe);
    });
    return parsed;
}

function buildCubeTxt() {
    let output = '';
    recipes.value.forEach(recipe => {
        output += 'section\n';
        output += `npc\t${recipe.npc}\n`;
        recipe.items.forEach(item => { output += `item\t${item.vnum}\t${item.count}\n`; });
        output += `reward\t${recipe.reward.vnum}\t${recipe.reward.count}\n`;
        output += `gold\t${recipe.gold}\n`;
        output += `percent\t${recipe.percent}\n`;
        output += 'end\n\n';
    });
    return output;
}

async function handleExport() {
    const output = buildCubeTxt();
    try {
        const res = await auth.authFetch('/api/cube/save', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: output
        });
        ui.toast(res.ok ? 'Cube.txt erfolgreich auf dem Server gespeichert!' : 'Cube.txt lokal geladen (Server nicht erreichbar)', res.ok ? 'success' : 'warning');
    } catch {
        ui.toast('Cube.txt lokal geladen (Server nicht erreichbar)', 'warning');
    }

    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cube.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        recipes.value = parseCubeTxt(ev.target.result);
        await resolveContextNames();
    };
    reader.readAsText(file);
}

onMounted(async () => {
    await itemService.autoInit();
    try {
        const res = await fetch('/api/cube/load');
        if (res.ok) {
            recipes.value = parseCubeTxt(await res.text());
            await resolveContextNames();
        }
    } catch { /* start empty if no cube.txt exists yet */ }
    loadActiveWorkspaceConnection();
});
</script>

<template>
    <div class="page-header">
        <div class="header-breadcrumb">
            <router-link to="/index.html">Dashboard</router-link> / Cube Editor
        </div>
        <div class="header-main-row">
            <div class="title-meta">
                <h1>CUBE <span class="gold">EDITOR</span></h1>
                <p class="m2-hint">Erstelle und bearbeite deine Crafting-Rezepte professionell.</p>
            </div>
            <div class="header-actions">
                <button class="m2-btn m2-btn-secondary" @click="importFileInput.click()">📁 Datei öffnen</button>
                <input ref="importFileInput" type="file" class="hidden" accept=".txt" @change="handleImport">
                <button class="m2-btn m2-btn-primary" @click="handleExport">📥 Download (Cube.txt)</button>
                <button v-if="serverConn.connection.value?.remote_cube_path" class="m2-btn m2-btn-secondary" :disabled="deploying" @click="deployCubeToServer">
                    {{ deploying ? '⏳ Sende...' : '📡 An Server senden' }}
                </button>
                <button class="m2-btn m2-btn-secondary" @click="showEditor()">➕ Neues Rezept</button>
            </div>
        </div>
    </div>

    <div style="padding: 20px; max-width: 1400px; margin: 0 auto; width: 100%; box-sizing: border-box;">
        <section>
            <div v-if="editorOpen" ref="editorSection" class="m2-card editor-card">
                <div class="editor-header">
                    <h2>Rezept bearbeiten</h2>
                    <div class="npc-badge">
                        <label>NPC:</label>
                        <div class="search-input-wrapper tiny">
                            <input v-model="npcSearchText" type="text" placeholder="NPC suchen..." class="m2-input" @input="onNpcSearchInput">
                            <div v-if="npcResults.length" class="search-results">
                                <div v-for="n in npcResults" :key="n.vnum" class="search-item" @click="pickNpc(n)">
                                    <span><strong>[{{ n.vnum }}]</strong> {{ n.name }}</span>
                                </div>
                            </div>
                        </div>
                        <span class="npc-name-display">{{ npcNames[npcVnum] || npcVnum }}</span>
                    </div>
                </div>

                <div class="editor-grid">
                    <div class="field-item">
                        <label>Ziel-Item & Anzahl</label>
                        <div class="field-row-inline">
                            <div class="search-input-wrapper">
                                <input v-model="targetVnumInput" type="text" placeholder="Search..." class="m2-input" @input="onTargetSearchInput">
                                <div v-if="targetResults.length" class="search-results">
                                    <div v-for="i in targetResults" :key="i.vnum" class="search-item" @click="pickTarget(i)">
                                        <img :src="itemService.getIconPath(i.vnum)" style="width:24px"> <span>[{{ i.vnum }}] {{ i.name }}</span>
                                    </div>
                                </div>
                            </div>
                            <input v-model="targetCount" type="number" min="1" max="200" class="m2-input">
                        </div>
                        <div class="item-preview">
                            <img :src="targetPreview ? targetPreview.icon : '/shared/assets/no_icon.png'" alt="Preview" class="item-icon">
                            <span class="item-name" :style="{ color: targetPreview ? 'var(--gold-primary)' : 'var(--text-muted)' }">
                                {{ targetPreview ? `[${targetVnumInput}] ${targetPreview.name}` : 'Kein Item ausgewählt' }}
                            </span>
                        </div>
                        <div v-if="stackWarning" class="warning-text">Warnung: Item ist evtl. nicht stapelbar!</div>
                    </div>

                    <div class="field-row">
                        <div class="field-item small">
                            <label>Yang Kosten</label>
                            <input v-model="yangCost" type="number" class="m2-input">
                        </div>
                        <div class="field-item small">
                            <label>Erfolgschance (%)</label>
                            <input v-model="successChance" type="number" min="1" max="100" class="m2-input">
                        </div>
                    </div>

                    <div class="materials-section">
                        <h3>Benötigte Materialien (Max 5)</h3>
                        <div id="materials-container">
                            <div v-for="(row, idx) in materials" :key="row.id" class="material-row">
                                <div class="material-icon-box">
                                    <img :src="materialPreview(row) ? materialPreview(row).icon : '/shared/assets/no_icon.png'" alt="Icon" class="material-preview-img">
                                </div>
                                <div class="material-main">
                                    <div class="search-input-wrapper">
                                        <input v-model="row.query" type="text" class="material-vnum m2-input" placeholder="VNUM / Name suchen..." @input="onMaterialSearchInput(row)">
                                        <div v-if="row.results.length" class="search-results">
                                            <div v-for="i in row.results" :key="i.vnum" class="search-item" @click="pickMaterial(row, i)">
                                                <img :src="itemService.getIconPath(i.vnum)" style="width:24px"> <span>[{{ i.vnum }}] {{ i.name }}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="material-info">
                                        <div class="material-name-display">
                                            {{ materialPreview(row) ? materialLabel(row) : 'Kein Item ausgewählt' }}
                                        </div>
                                    </div>
                                </div>
                                <div class="material-qty">
                                    <label>Anzahl</label>
                                    <input v-model="row.count" type="number" class="material-count m2-input" min="1">
                                </div>
                                <button class="remove-material-btn" title="Entfernen" @click="removeMaterial(idx)">×</button>
                            </div>
                        </div>
                        <button class="m2-btn m2-btn-secondary small" @click="addMaterialRow()">+ Weiteres Item</button>
                    </div>
                </div>
                <div class="card-footer" style="margin-top: 20px; display:flex; gap: 10px;">
                    <button class="m2-btn m2-btn-primary" @click="saveRecipe">Speichern</button>
                    <button class="m2-btn m2-btn-secondary" @click="hideEditor">Abbrechen</button>
                </div>
            </div>
        </section>

        <section class="recipes-section">
            <h2>Aktuelle Rezepte</h2>
            <div class="recipe-grid">
                <div v-for="(recipe, index) in recipes" :key="index" class="recipe-card">
                    <div class="recipe-header">
                        <div class="recipe-title">
                            <div class="it-icon-box" :style="{ height: recipeReward(recipe).size * 32 + 'px', width: '32px', overflow: 'hidden' }">
                                <img :src="recipeReward(recipe).icon" class="item-icon">
                            </div>
                            <div>
                                <div class="item-name">{{ recipeReward(recipe).display }}</div>
                                <div class="npc-subtext">{{ npcNames[recipe.npc] || `NPC: ${recipe.npc}` }}</div>
                            </div>
                        </div>
                        <div class="recipe-chance">{{ recipe.percent }}%</div>
                    </div>
                    <div class="recipe-details">
                        <div class="recipe-cost">💰 {{ recipe.gold.toLocaleString() }} Yang</div>
                        <div class="recipe-mats-label">Materialien:</div>
                        <div class="recipe-mats">
                            <div v-for="(m, mIdx) in recipe.items" :key="mIdx" class="recipe-mat" :title="materialLabel(m)">
                                <img :src="itemService.getIconPath(m.vnum)" class="item-icon small">
                                <span class="mat-info"><span class="mat-count">{{ m.count }}x</span> [{{ m.vnum }}]</span>
                            </div>
                        </div>
                    </div>
                    <div class="recipe-actions">
                        <button class="m2-btn m2-btn-secondary small" @click="showEditor(index)">Edit</button>
                        <button class="m2-btn m2-btn-secondary small delete-btn" @click="deleteRecipe(index)">X</button>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
.editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 15px;
}

.editor-header h2 { margin-bottom: 0; font-family: var(--font-heading); color: var(--gold-primary); }

.npc-badge {
    background: var(--gold-subtle);
    border: 1px solid var(--gold-border);
    padding: 8px 15px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    gap: 10px;
}

.npc-badge label { font-size: 0.8rem; font-weight: 700; color: var(--gold-primary); text-transform: uppercase; }
.npc-name-display { font-size: 0.8rem; color: var(--text-heading); font-weight: 700; }

.editor-grid { display: flex; flex-direction: column; gap: 20px; }

.field-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.field-row-inline { display: flex; gap: 15px; }
.field-row-inline .search-input-wrapper { flex: 1; }
.field-row-inline input[type="number"] { width: 100px; }

.field-item { display: flex; flex-direction: column; gap: 8px; }
.field-item label { font-size: 0.9rem; color: var(--text-secondary); font-weight: 500; }

.search-input-wrapper { position: relative; }

.search-results {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 100%;
    width: max-content;
    max-width: 450px;
    background: var(--bg-card);
    border: 1px solid var(--gold-border);
    border-radius: var(--radius-sm);
    z-index: 100;
    max-height: 250px;
    overflow-y: auto;
    overflow-x: hidden;
    box-shadow: var(--shadow-lg);
    backdrop-filter: blur(10px);
}

.search-item { display: flex; align-items: center; gap: 12px; padding: 10px 15px; cursor: pointer; transition: var(--transition-fast); }
.search-item:hover { background: var(--bg-hover); }

.item-preview {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 15px;
    background: var(--bg-hover);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    margin-top: 10px;
    min-height: 64px;
}

.item-icon {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    padding: 2px;
    object-fit: contain;
}

.item-icon.small { width: 28px; height: 28px; }
.item-name { font-weight: 600; color: var(--text-heading); }

.warning-text { color: var(--warning); font-size: 0.8rem; margin-top: 8px; }

.materials-section h3 {
    font-size: 1rem;
    margin-bottom: 20px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 10px;
}
.materials-section h3::after { content: ''; flex: 1; height: 1px; background: var(--border-color); }

#materials-container { display: flex; flex-direction: column; gap: 15px; margin-bottom: 20px; }

.material-row {
    display: flex;
    align-items: center;
    gap: 20px;
    background: var(--bg-card);
    padding: 15px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    position: relative;
    transition: var(--transition);
}
.material-row:hover { border-color: var(--gold-border); background: var(--bg-hover); }

.material-icon-box {
    width: 48px;
    height: 48px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
}
.material-icon-box img { width: 40px; height: 40px; object-fit: contain; image-rendering: pixelated; }

.material-main { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; justify-content: center; }
.material-info { display: flex; align-items: center; gap: 4px; min-width: 0; }
.material-name-display {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--gold-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: 1.2rem;
}

.material-qty { display: flex; flex-direction: column; gap: 4px; width: 100px; }
.material-qty label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; }

.remove-material-btn {
    width: 32px;
    height: 32px;
    background: rgba(229, 57, 53, 0.1);
    border: 1px solid rgba(229, 57, 53, 0.2);
    color: var(--danger);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 1.2rem;
    transition: all 0.2s;
}
.remove-material-btn:hover { background: var(--danger); color: #fff; border-color: var(--danger); }

.recipes-section h2 { font-family: var(--font-heading); color: var(--gold-primary); margin-bottom: 25px; margin-top: 40px; }

.recipe-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 25px; }

.recipe-card {
    background: var(--bg-card);
    border-radius: var(--radius-md);
    padding: 24px;
    border: 1px solid var(--border-color);
    transition: var(--transition);
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-md);
    backdrop-filter: blur(10px);
}
.recipe-card:hover { transform: translateY(-5px); border-color: var(--gold-primary); box-shadow: 0 10px 25px rgba(0,0,0,0.3), var(--shadow-gold); }

.recipe-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
.recipe-title { display: flex; align-items: center; gap: 15px; }
.npc-subtext { font-size: 0.8rem; color: var(--text-muted); font-weight: 300; }

.recipe-chance { background: rgba(76, 175, 80, 0.1); color: var(--success); padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 700; }

.recipe-details { flex: 1; }
.recipe-cost { font-size: 1rem; color: var(--text-heading); margin-bottom: 15px; font-weight: 500; }
.recipe-mats-label { font-size: 0.8rem; color: var(--gold-primary); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8; }
.recipe-mats { display: flex; flex-direction: column; gap: 6px; }

.recipe-mat { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: var(--bg-hover); border-radius: var(--radius-sm); transition: background 0.2s; }
.mat-info { font-size: 0.9rem; color: var(--text-primary); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mat-count { color: var(--gold-primary); font-weight: 700; min-width: 25px; display: inline-block; }

.recipe-actions { display: flex; gap: 10px; border-top: 1px solid var(--border-color); padding-top: 20px; margin-top: 20px; }

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
.recipe-card, .editor-card { animation: fadeIn 0.4s ease forwards; }
</style>
