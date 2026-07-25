<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useItemService } from '@/composables/useItemService';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { generateLuaCode } from './questLua';

const itemService = useItemService();
const auth = useAuthStore();
const ui = useUiStore();

const TOTAL_STEPS = 7;
const STEP_LABELS = ['Grundlagen', 'Trigger', 'Bedingungen', 'Dialog', 'Aktionen', 'Verzweigung', 'Code & Export'];

const TRIGGER_TYPES = [
    { type: 'click', icon: '👤', name: 'NPC Klick', desc: 'Spieler klickt einen NPC an' },
    { type: 'kill', icon: '⚔️', name: 'Monster töten', desc: 'Spieler tötet ein bestimmtes Monster' },
    { type: 'login', icon: '🔑', name: 'Login', desc: 'Spieler loggt sich ein' },
    { type: 'levelup', icon: '⬆️', name: 'Level-Up', desc: 'Spieler steigt ein Level auf' },
    { type: 'use', icon: '🎒', name: 'Item benutzen', desc: 'Spieler benutzt ein bestimmtes Item' },
    { type: 'button', icon: '📩', name: 'Quest-Button', desc: 'Spieler klickt den Quest-Button' },
    { type: 'timer', icon: '⏱️', name: 'Timer', desc: 'Ein Timer läuft ab' },
    { type: 'chat', icon: '💬', name: 'Chat-Befehl', desc: 'Spieler gibt einen Befehl ein' },
    { type: 'enter', icon: '🚪', name: 'Bereich betreten', desc: 'Spieler betritt eine Zone' }
];

const ACTION_TYPES = [
    { value: 'give_item', label: '🎁 Item geben' },
    { value: 'remove_item', label: '❌ Item entfernen' },
    { value: 'give_gold', label: '💰 Gold geben' },
    { value: 'remove_gold', label: '💸 Gold entfernen' },
    { value: 'set_state', label: '🔄 State-Wechsel' },
    { value: 'set_flag', label: '🏁 Flag setzen' },
    { value: 'inc_flag', label: '📈 Quest-Zähler +1 (Tötungen)' },
    { value: 'send_letter', label: '✉️ Brief senden' },
    { value: 'warp', label: '🌀 Teleportieren' },
    { value: 'spawn_mob', label: '👹 Monster spawnen' },
    { value: 'set_timer', label: '⏱️ Timer starten' },
    { value: 'clear_timer', label: '⏹️ Timer stoppen' },
    { value: 'notice', label: '📢 Nachricht' },
    { value: 'give_bonus', label: '🌟 Attribut Bonus' },
    { value: 'custom_lua', label: '📝 Eigener Lua-Code' }
];

const CONDITION_TYPES = [
    { value: 'level_check', label: '⬆️ Level-Check' },
    { value: 'item_check', label: '🎒 Item-Check' },
    { value: 'gold_check', label: '💰 Gold-Check' },
    { value: 'alignment_check', label: '⚖️ Rangpunkte (Alignment)' },
    { value: 'race_check', label: '🛡️ Klassen-Check' },
    { value: 'flag_check', label: '🏁 Fortschritt / Quest-Zähler' }
];

const BONUS_TYPES = [
    { value: 'apply.MAX_HP', label: 'Max. TP' },
    { value: 'apply.MAX_SP', label: 'Max. MP' },
    { value: 'apply.STR', label: 'Stärke (STR)' },
    { value: 'apply.DEX', label: 'Beweglichkeit (DEX)' },
    { value: 'apply.INT', label: 'Intelligenz (INT)' },
    { value: 'apply.CON', label: 'Vitalität (VIT)' },
    { value: 'apply.ATT_GRADE_BONUS', label: 'Angriffswert' },
    { value: 'apply.DEF_GRADE_BONUS', label: 'Verteidigung' }
];

const BONUS_DURATIONS = [
    { value: '60*60*24*365*60', label: 'Permanent' },
    { value: '60*60*24', label: '1 Tag' },
    { value: '60*60*24*7', label: '7 Tage' }
];

const RACES = [
    { value: 0, label: 'Krieger' },
    { value: 1, label: 'Ninja' },
    { value: 2, label: 'Sura' },
    { value: 3, label: 'Schamane' }
];

let idSeq = 0;
const nextId = () => idSeq++;

function createDefaultTrigger() {
    return {
        type: 'click',
        npcVnum: 0, npcName: '',
        mobVnum: 0, mobName: '',
        itemVnum: 0, itemName: '',
        chatText: '', timerName: '',
        dialog: { title: '', lines: [''] },
        selectOptions: [],
        actions: [],
        conditions: []
    };
}

const questData = reactive({
    name: 'my_quest',
    states: [{ name: 'start', triggers: [createDefaultTrigger()] }]
});

const questNameInput = ref('my_quest');
const currentStep = ref(0);
const activeStateIndex = ref(0);

const currentState = computed(() => questData.states[activeStateIndex.value]);
const currentTrigger = computed(() => currentState.value.triggers[0]);

const importFileInput = ref(null);

/* ── Trigger target search (step 1) ─────────────────── */
const triggerNpcQuery = ref('');
const triggerNpcResults = ref([]);
const triggerMobQuery = ref('');
const triggerMobResults = ref([]);
const triggerItemQuery = ref('');
const triggerItemResults = ref([]);

async function searchApi(endpoint, query) {
    if (!query || query.length < 1) return [];
    try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`);
        return await res.json();
    } catch { return []; }
}

function syncTriggerQueryDisplays() {
    const t = currentTrigger.value;
    triggerNpcQuery.value = t.npcVnum ? `[${t.npcVnum}] ${t.npcName}` : '';
    triggerMobQuery.value = t.mobVnum ? `[${t.mobVnum}] ${t.mobName}` : '';
    triggerItemQuery.value = t.itemVnum ? `[${t.itemVnum}] ${t.itemName}` : '';
    triggerNpcResults.value = [];
    triggerMobResults.value = [];
    triggerItemResults.value = [];
}

watch(activeStateIndex, syncTriggerQueryDisplays);

async function onTriggerNpcSearch() {
    triggerNpcResults.value = await searchApi('/api/cube/npcs/search', triggerNpcQuery.value);
}
function pickTriggerNpc(item) {
    currentTrigger.value.npcVnum = item.vnum;
    currentTrigger.value.npcName = item.name;
    triggerNpcQuery.value = `[${item.vnum}] ${item.name}`;
    triggerNpcResults.value = [];
}
async function onTriggerMobSearch() {
    triggerMobResults.value = await searchApi('/api/quest/mobs/search', triggerMobQuery.value);
}
function pickTriggerMob(item) {
    currentTrigger.value.mobVnum = item.vnum;
    currentTrigger.value.mobName = item.name;
    triggerMobQuery.value = `[${item.vnum}] ${item.name}`;
    triggerMobResults.value = [];
}
function onTriggerItemSearch() {
    triggerItemResults.value = triggerItemQuery.value ? itemService.search(triggerItemQuery.value).slice(0, 20) : [];
}
function pickTriggerItem(item) {
    currentTrigger.value.itemVnum = item.vnum;
    currentTrigger.value.itemName = item.name;
    triggerItemQuery.value = `[${item.vnum}] ${item.name}`;
    triggerItemResults.value = [];
}

/* ── Step navigation ─────────────────────────────────── */
function validateStep(step) {
    if (step === 0) {
        const name = questNameInput.value.trim();
        if (!name) { ui.toast('Bitte Quest-Namen vergeben', 'error'); return false; }
        questData.name = name.replace(/[^a-zA-Z0-9_]/g, '');
        questNameInput.value = questData.name;
    }
    return true;
}

function goToStep(step) {
    if (step < 0 || step >= TOTAL_STEPS) return;
    if (step > currentStep.value && !validateStep(currentStep.value)) return;
    currentStep.value = step;
}

function progressStepClass(step) {
    return { active: step === currentStep.value, done: step < currentStep.value };
}

/* ── Step 0: States ──────────────────────────────────── */
async function addState() {
    const name = await ui.prompt(
        'Neuen State erstellen',
        'Ein "State" ist ein Kapitel/Zwischenschritt deines Quests. Jeder Quest startet im State "start". Gib einen Namen für den neuen State ein (z.B. "kapitel_2" oder "suche_die_glocke"):'
    );
    if (!name) return;
    const safe = name.replace(/[^a-zA-Z0-9_]/g, '');
    if (questData.states.find(s => s.name === safe)) { ui.toast('Existiert bereits', 'error'); return; }
    questData.states.push({ name: safe, triggers: [createDefaultTrigger()] });
}

function removeState(idx) {
    if (idx === 0) return;
    questData.states.splice(idx, 1);
    if (activeStateIndex.value >= questData.states.length) activeStateIndex.value = questData.states.length - 1;
}

/* ── Step 4/5: Actions ───────────────────────────────── */
function addAction(list, type = 'give_item') {
    list.push({ id: nextId(), type, params: {} });
}
function removeAction(list, idx) {
    list.splice(idx, 1);
}
function onActionTypeChange(action) {
    action.params = {};
}

function onActionItemSearch(action) {
    action.params._results = action.params._query ? itemService.search(action.params._query).slice(0, 20) : [];
}
function pickActionItem(action, item) {
    action.params.vnum = item.vnum;
    action.params._query = `[${item.vnum}] ${item.name}`;
    action.params._results = [];
}
async function onActionMobSearch(action) {
    action.params._results = await searchApi('/api/quest/mobs/search', action.params._query);
}
function pickActionMob(action, item) {
    action.params.mobVnum = item.vnum;
    action.params._query = `[${item.vnum}] ${item.name}`;
    action.params._results = [];
}

/* ── Step 2: Conditions ──────────────────────────────── */
function addCondition() {
    currentTrigger.value.conditions.push({ id: nextId(), type: 'level_check', params: { operator: '>=', value: 1 } });
}
function removeCondition(idx) {
    currentTrigger.value.conditions.splice(idx, 1);
}
function onConditionTypeChange(cond) {
    cond.params = {};
}
function onConditionItemSearch(cond) {
    cond.params._results = cond.params._query ? itemService.search(cond.params._query).slice(0, 20) : [];
}
function pickConditionItem(cond, item) {
    cond.params.vnum = item.vnum;
    cond.params._query = `[${item.vnum}] ${item.name}`;
    cond.params._results = [];
}

/* ── Step 3: Dialog ──────────────────────────────────── */
function addDialogLine() {
    currentTrigger.value.dialog.lines.push('');
}
function removeDialogLine(idx) {
    const lines = currentTrigger.value.dialog.lines;
    lines.splice(idx, 1);
    if (!lines.length) lines.push('');
}

/* ── Step 5: Select branching ────────────────────────── */
function addSelectOption() {
    currentTrigger.value.selectOptions.push({ id: nextId(), text: '', actions: [] });
}
function removeSelectOption(idx) {
    currentTrigger.value.selectOptions.splice(idx, 1);
}

const generatedCode = computed(() => generateLuaCode(questData));

/**
 * Deliberate, reviewed exception to "no v-html" for this migration:
 * the input here is Lua source code generated entirely by this
 * component's own data model (never raw user/HTML input), escaped
 * via escapeHtml() *before* any markup is added, then decorated with
 * a fixed set of <span> tags for syntax highlighting - the same
 * approach any code highlighter (e.g. Prism.js) uses. There is no
 * path for arbitrary HTML to reach this render.
 */
function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function highlightLua(code) {
    const kws = ['quest', 'begin', 'end', 'state', 'when', 'if', 'then', 'else', 'elseif', 'local', 'and', 'or', 'not', 'with'];
    const fns = ['say', 'say_title', 'say_reward', 'select', 'set_state', 'send_letter', 'pc\\.give_item2', 'pc\\.remove_item', 'pc\\.count_item', 'pc\\.change_gold', 'pc\\.money', 'pc\\.get_level', 'pc\\.setqf', 'pc\\.getqf', 'pc\\.get_job', 'pc\\.get_alignment', 'npc\\.get_race', 'mob\\.spawn', 'warp', 'timer', 'cleartimer', 'notice'];

    let html = escapeHtml(code);
    html = html.replace(/(--.*)/g, '<span class="cmt">$1</span>');
    html = html.replace(/("(?:[^"\\]|\\.)*")/g, '<span class="str">$1</span>');
    html = html.replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
    kws.forEach(kw => { html = html.replace(new RegExp(`\\b(${kw})\\b`, 'g'), '<span class="kw">$1</span>'); });
    fns.forEach(fn => { html = html.replace(new RegExp(`(${fn})(?=\\()`, 'g'), '<span class="fn">$1</span>'); });
    return html;
}

const highlightedCode = computed(() => highlightLua(generatedCode.value));

/* ── Import / Export ─────────────────────────────────── */
function copyCode() {
    navigator.clipboard.writeText(generatedCode.value)
        .then(() => ui.toast('Code kopiert!', 'success'))
        .catch(() => ui.toast('Kopieren fehlgeschlagen', 'error'));
}

async function exportQuest(ext = '.quest') {
    const code = generatedCode.value;
    const filename = questData.name || 'quest';
    const fullName = `${filename}${ext}`;
    try {
        await auth.authFetch('/api/quest/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, content: code })
        });
    } catch { /* export still proceeds as a local download below */ }

    const blob = new Blob([code], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fullName;
    a.click();
    URL.revokeObjectURL(a.href);
    ui.toast(`Quest "${fullName}" exportiert!`, 'success');
}

function parseQuestFile(text) {
    const data = { name: 'imported_quest', states: [] };
    const qm = text.match(/quest\s+(\w+)\s+begin/);
    if (qm) data.name = qm[1];

    const stateRegex = /state\s+(\w+)\s+begin([\s\S]*?)(?=state\s+\w+\s+begin|end\s*$)/g;
    let sm;
    while ((sm = stateRegex.exec(text)) !== null) {
        const state = { name: sm[1], triggers: [] };
        const whenRegex = /when\s+(.*?)\s+begin([\s\S]*?)end/g;
        let wm;
        while ((wm = whenRegex.exec(sm[2])) !== null) {
            const t = createDefaultTrigger();
            const wl = wm[1];
            if (wl.includes('.click')) { t.type = 'click'; const m = wl.match(/(\d+)\.click/); if (m) t.npcVnum = parseInt(m[1]); }
            else if (wl.includes('kill')) { t.type = 'kill'; const m = wl.match(/npc\.get_race\(\)\s*==\s*(\d+)/); if (m) t.mobVnum = parseInt(m[1]); }
            else if (wl.includes('login')) t.type = 'login';
            else if (wl.includes('levelup')) t.type = 'levelup';
            else if (wl.includes('.use')) { t.type = 'use'; const m = wl.match(/(\d+)\.use/); if (m) t.itemVnum = parseInt(m[1]); }
            else if (wl.includes('.timer')) { t.type = 'timer'; const m = wl.match(/(\w+)\.timer/); if (m) t.timerName = m[1]; }
            else if (wl.includes('button')) t.type = 'button';

            const tm = wm[2].match(/say_title\("([^"]*)"\)/); if (tm) t.dialog.title = tm[1];
            const sms = [...wm[2].matchAll(/say\("([^"]*)"\)/g)]; if (sms.length) t.dialog.lines = sms.map(m => m[1]);

            state.triggers.push(t);
        }
        if (!state.triggers.length) state.triggers.push(createDefaultTrigger());
        data.states.push(state);
    }
    if (!data.states.length) data.states.push({ name: 'start', triggers: [createDefaultTrigger()] });
    return data;
}

function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = parseQuestFile(ev.target.result);
            Object.assign(questData, parsed);
            questNameInput.value = parsed.name;
            activeStateIndex.value = 0;
            goToStep(0);
            ui.toast('Quest importiert!', 'success');
        } catch (err) {
            ui.toast('Import fehlgeschlagen: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

async function resetQuest() {
    const confirmed = await ui.confirm('Neuen Quest erstellen?', 'Alle bisherigen Änderungen gehen verloren.');
    if (!confirmed) return;
    Object.assign(questData, { name: 'my_quest', states: [{ name: 'start', triggers: [createDefaultTrigger()] }] });
    activeStateIndex.value = 0;
    questNameInput.value = 'my_quest';
    goToStep(0);
}

/* ── Templates ────────────────────────────────────────── */
const TEMPLATES = {
    dialog: {
        name: 'schmied_begruessung',
        states: [
            {
                name: 'start', triggers: [{
                    type: 'click', npcVnum: 20016, npcName: 'Schmied', mobVnum: 0, mobName: '', itemVnum: 0, itemName: '', chatText: '', timerName: '',
                    conditions: [{ id: nextId(), type: 'level_check', params: { operator: '>=', value: 10 } }],
                    dialog: { title: 'Schmied', lines: ['Hallo Fremder!', 'Du siehst schwach aus.', 'Ich kann dir eine stärkere Waffe geben.'] },
                    selectOptions: [
                        { id: nextId(), text: 'Ja, gerne!', actions: [
                            { id: nextId(), type: 'give_item', params: { vnum: 19, amount: 1 } },
                            { id: nextId(), type: 'notice', params: { message: 'Du hast ein Schwert+9 erhalten!' } },
                            { id: nextId(), type: 'set_state', params: { state: 'fertig' } }
                        ] },
                        { id: nextId(), text: 'Nein danke.', actions: [] }
                    ],
                    actions: []
                }]
            },
            { name: 'fertig', triggers: [{ type: 'click', npcVnum: 20016, npcName: 'Schmied', mobVnum: 0, mobName: '', itemVnum: 0, itemName: '', chatText: '', timerName: '', conditions: [], dialog: { title: 'Schmied', lines: ['Ich habe dir bereits geholfen!'] }, selectOptions: [], actions: [] }] }
        ]
    },
    kill: {
        name: 'hundejagd_mission',
        states: [
            { name: 'start', triggers: [{ type: 'click', npcVnum: 20011, npcName: 'Uriel', mobVnum: 0, mobName: '', itemVnum: 0, itemName: '', chatText: '', timerName: '', conditions: [], dialog: { title: 'Uriel', lines: ['Töte bitte 10 Wildhunde für mich!'] }, selectOptions: [{ id: nextId(), text: 'Mache ich!', actions: [{ id: nextId(), type: 'set_state', params: { state: 'jagd' } }] }], actions: [] }] },
            { name: 'jagd', triggers: [{ type: 'kill', npcVnum: 0, npcName: '', mobVnum: 101, mobName: 'Wildhund', itemVnum: 0, itemName: '', chatText: '', timerName: '', conditions: [], dialog: { title: '', lines: [] }, selectOptions: [],
                actions: [
                    { id: nextId(), type: 'inc_flag', params: { flagName: 'hunde_kills' } },
                    { id: nextId(), type: 'custom_lua', params: { code: 'if pc.getqf("hunde_kills") >= 10 then\n    notice("Du hast alle Hunde getötet! Gehe zu Uriel.")\n    set_state("belohnung")\nend' } }
                ] }] },
            { name: 'belohnung', triggers: [{ type: 'click', npcVnum: 20011, npcName: 'Uriel', mobVnum: 0, mobName: '', itemVnum: 0, itemName: '', chatText: '', timerName: '', conditions: [], dialog: { title: 'Uriel', lines: ['Danke für deine Hilfe!', 'Hier ist dein Gold.'] }, selectOptions: [],
                actions: [{ id: nextId(), type: 'give_gold', params: { amount: 50000 } }, { id: nextId(), type: 'set_state', params: { state: 'abgeschlossen' } }] }] },
            { name: 'abgeschlossen', triggers: [createDefaultTrigger()] }
        ]
    },
    buff: {
        name: 'attribut_trank',
        states: [
            { name: 'start', triggers: [{ type: 'use', npcVnum: 0, npcName: '', mobVnum: 0, mobName: '', itemVnum: 27987, itemName: 'Muschel', chatText: '', timerName: '', conditions: [], dialog: { title: '', lines: [] }, selectOptions: [],
                actions: [
                    { id: nextId(), type: 'remove_item', params: { vnum: 27987, amount: 1 } },
                    { id: nextId(), type: 'give_bonus', params: { bonusType: 'apply.MAX_HP', value: 1000, duration: '60*60*24*365*60' } },
                    { id: nextId(), type: 'notice', params: { message: 'Du spürst eine unglaubliche Energie in dir! (+1000 TP Permanent)' } }
                ] }] }
        ]
    },
    login: {
        name: 'login_geschenk',
        states: [
            { name: 'start', triggers: [{ type: 'login', npcVnum: 0, npcName: '', mobVnum: 0, mobName: '', itemVnum: 0, itemName: '', chatText: '', timerName: '', conditions: [{ id: nextId(), type: 'level_check', params: { operator: '>=', value: 30 } }], dialog: { title: '', lines: [] }, selectOptions: [],
                actions: [
                    { id: nextId(), type: 'notice', params: { message: 'Willkommen zurück! Da du Level 30 erreicht hast, hier dein Reittier!' } },
                    { id: nextId(), type: 'give_item', params: { vnum: 71114, amount: 1 } },
                    { id: nextId(), type: 'set_state', params: { state: 'abgeschlossen' } }
                ] }] },
            { name: 'abgeschlossen', triggers: [createDefaultTrigger()] }
        ]
    }
};

async function loadTemplate(key) {
    const confirmed = await ui.confirm('Vorlage laden?', 'Alle bisherigen Eingaben werden überschrieben!');
    if (!confirmed) return;
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    Object.assign(questData, { name: tpl.name, states: JSON.parse(JSON.stringify(tpl.states)) });
    questNameInput.value = tpl.name;
    activeStateIndex.value = 0;
    goToStep(0);
    ui.toast('Vorlage geladen!', 'success');
}

onMounted(async () => {
    await itemService.autoInit();
    syncTriggerQueryDisplays();
});
</script>

<template>
    <header>
        <div class="header-row">
            <h1>M2 <span class="accent">QUEST</span></h1>
            <div class="header-actions">
                <button class="m2-btn m2-btn-secondary small" @click="importFileInput.click()">📂 Import</button>
                <input ref="importFileInput" type="file" accept=".quest,.lua,.txt" class="hidden" @change="handleImport">
                <button class="m2-btn m2-btn-secondary small" @click="resetQuest">🔄 Reset</button>
            </div>
        </div>
        <p class="subtitle">Professioneller Metin2 Quest-Editor</p>
    </header>

    <div class="wizard-progress">
        <div class="progress-track">
            <div class="progress-fill" :style="{ width: (currentStep / (TOTAL_STEPS - 1) * 100) + '%' }"></div>
        </div>
        <div class="progress-steps">
            <div
                v-for="(label, step) in STEP_LABELS"
                :key="step"
                class="progress-step"
                :class="progressStepClass(step)"
                @click="step <= currentStep + 1 && goToStep(step)"
            >
                <div class="step-dot">{{ step + 1 }}</div>
                <span class="step-label">{{ label }}</span>
            </div>
        </div>
    </div>

    <!-- STEP 0: Grundlagen -->
    <div class="wizard-step" :class="{ active: currentStep === 0 }">
        <div class="step-card">
            <div class="step-header">
                <span class="step-number">01</span>
                <div>
                    <h2>📜 Quest Grundlagen</h2>
                    <p class="step-desc">Gib deinem Quest einen Namen und erstelle die States (Zustände) die dein Quest durchlaufen soll.</p>
                </div>
            </div>
            <div class="step-content">
                <div class="info-box">
                    <strong>💡 Was sind States?</strong>
                    <p>Ein Quest besteht aus mehreren <em>States</em> (Zuständen). Der Spieler wechselt zwischen States basierend auf seinen Aktionen. Jeder Quest beginnt immer im State <code>start</code>.</p>
                </div>

                <div class="m2-field-group">
                    <label class="m2-label">Quest-Name</label>
                    <input v-model="questNameInput" type="text" placeholder="mein_erster_quest" class="m2-input">
                    <span class="m2-hint">Nutze nur Buchstaben, Zahlen und Unterstriche.</span>
                </div>

                <div class="templates-section" style="margin-bottom: 30px; background: rgba(0,0,0,0.1); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 15px;">
                    <label class="m2-label" style="margin-bottom:10px; display:block;">📚 Komplett fertige Vorlage laden (Überschreibt deine Daten)</label>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button class="m2-btn m2-btn-secondary small" @click="loadTemplate('dialog')">💬 NPC Dialog</button>
                        <button class="m2-btn m2-btn-secondary small" @click="loadTemplate('kill')">⚔️ Sammel-/Kill-Quest</button>
                        <button class="m2-btn m2-btn-secondary small" @click="loadTemplate('buff')">🌟 Attribute Item</button>
                        <button class="m2-btn m2-btn-secondary small" @click="loadTemplate('login')">🔑 Login & Level-Up</button>
                    </div>
                </div>

                <div class="states-section">
                    <div class="section-title-row">
                        <h3>📋 States verwalten</h3>
                        <button class="m2-btn m2-btn-secondary small" @click="addState">+ State hinzufügen</button>
                    </div>
                    <div class="state-chips">
                        <div v-for="(s, i) in questData.states" :key="i" class="state-chip" :class="{ 'is-start': i === 0 }">
                            <span>{{ i === 0 ? '▶ ' : '' }}{{ s.name }}</span>
                            <button v-if="i > 0" class="chip-remove" @click="removeState(i)">✕</button>
                        </div>
                    </div>
                    <div class="m2-field-group state-select-field">
                        <label class="m2-label">Aktiver State</label>
                        <select v-model.number="activeStateIndex" class="m2-select">
                            <option v-for="(s, i) in questData.states" :key="i" :value="i">{{ s.name }}</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- STEP 1: Trigger -->
    <div class="wizard-step" :class="{ active: currentStep === 1 }">
        <div class="step-card">
            <div class="step-header">
                <span class="step-number">02</span>
                <div>
                    <h2>⚡ Trigger wählen</h2>
                    <p class="step-desc">Wähle aus, welches Event den Quest-Code in diesem State auslöst.</p>
                </div>
            </div>
            <div class="step-content">
                <div class="info-box">
                    <strong>💡 Was ist ein Trigger?</strong>
                    <p>Ein Trigger bestimmt <em>wann</em> der Quest-Code ausgeführt wird. Z.B. wenn ein Spieler einen NPC anklickt, ein Monster tötet oder sich einloggt.</p>
                </div>

                <div class="active-state-badge">State: <span class="accent">{{ currentState.name }}</span></div>

                <div class="trigger-type-grid">
                    <button
                        v-for="tt in TRIGGER_TYPES"
                        :key="tt.type"
                        class="trigger-card"
                        :class="{ selected: currentTrigger.type === tt.type }"
                        @click="currentTrigger.type = tt.type"
                    >
                        <span class="tc-icon">{{ tt.icon }}</span>
                        <span class="tc-name">{{ tt.name }}</span>
                        <span class="tc-desc">{{ tt.desc }}</span>
                    </button>
                </div>

                <div class="trigger-target-section">
                    <div v-if="currentTrigger.type === 'click' || currentTrigger.type === 'button'" class="m2-field-group">
                        <label class="m2-label">🔍 NPC auswählen</label>
                        <div class="search-input-wrapper">
                            <input v-model="triggerNpcQuery" type="text" placeholder="NPC suchen (Name oder VNUM)..." class="m2-input" @input="onTriggerNpcSearch">
                            <div v-if="triggerNpcResults.length" class="search-results">
                                <div v-for="n in triggerNpcResults" :key="n.vnum" class="search-result-item" @click="pickTriggerNpc(n)">[{{ n.vnum }}] {{ n.name }}</div>
                            </div>
                        </div>
                    </div>
                    <div v-else-if="currentTrigger.type === 'kill'" class="m2-field-group">
                        <label class="m2-label">🔍 Monster auswählen</label>
                        <div class="search-input-wrapper">
                            <input v-model="triggerMobQuery" type="text" placeholder="Monster suchen (Name oder VNUM)..." class="m2-input" @input="onTriggerMobSearch">
                            <div v-if="triggerMobResults.length" class="search-results">
                                <div v-for="m in triggerMobResults" :key="m.vnum" class="search-result-item" @click="pickTriggerMob(m)">[{{ m.vnum }}] {{ m.name }}</div>
                            </div>
                        </div>
                    </div>
                    <div v-else-if="currentTrigger.type === 'use'" class="m2-field-group">
                        <label class="m2-label">🔍 Item auswählen</label>
                        <div class="search-input-wrapper">
                            <input v-model="triggerItemQuery" type="text" placeholder="Item suchen (Name oder VNUM)..." class="m2-input" @input="onTriggerItemSearch">
                            <div v-if="triggerItemResults.length" class="search-results">
                                <div v-for="i in triggerItemResults" :key="i.vnum" class="search-result-item" @click="pickTriggerItem(i)">[{{ i.vnum }}] {{ i.name }}</div>
                            </div>
                        </div>
                    </div>
                    <div v-else-if="currentTrigger.type === 'chat'" class="m2-field-group">
                        <label class="m2-label">💬 Chat-Befehl</label>
                        <input v-model="currentTrigger.chatText" type="text" placeholder="/questbefehl" class="m2-input">
                    </div>
                    <div v-else-if="currentTrigger.type === 'timer'" class="m2-field-group">
                        <label class="m2-label">⏱️ Timer-Name</label>
                        <input v-model="currentTrigger.timerName" type="text" placeholder="my_timer" class="m2-input">
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- STEP 2: Bedingungen -->
    <div class="wizard-step" :class="{ active: currentStep === 2 }">
        <div class="step-card">
            <div class="step-header">
                <span class="step-number">03</span>
                <div>
                    <h2>🔍 Bedingungen <span class="optional-badge">Optional</span></h2>
                    <p class="step-desc">Setze Voraussetzungen die erfüllt sein müssen, damit der Quest-Code ausgeführt wird.</p>
                </div>
            </div>
            <div class="step-content">
                <div class="info-box">
                    <strong>💡 Wann brauche ich Bedingungen?</strong>
                    <p>Bedingungen prüfen z.B. ob der Spieler ein bestimmtes Level hat, genug Gold besitzt oder ein Item im Inventar hat. Ohne Bedingungen wird der Quest immer ausgeführt.</p>
                </div>

                <div class="active-state-badge">State: <span class="accent">{{ currentState.name }}</span></div>

                <div class="items-list">
                    <div v-for="(cond, idx) in currentTrigger.conditions" :key="cond.id" class="condition-row">
                        <select v-model="cond.type" class="m2-select" @change="onConditionTypeChange(cond)">
                            <option v-for="ct in CONDITION_TYPES" :key="ct.value" :value="ct.value">{{ ct.label }}</option>
                        </select>
                        <div class="condition-params">
                            <template v-if="cond.type === 'level_check'">
                                <select v-model="cond.params.operator" class="m2-select op-sel">
                                    <option value=">=">Mindestens (&gt;=)</option>
                                    <option value="==">Genau (==)</option>
                                    <option value="<=">Höchstens (&lt;=)</option>
                                </select>
                                <input v-model.number="cond.params.value" type="number" class="m2-input" style="width:80px" placeholder="Level">
                            </template>
                            <template v-else-if="cond.type === 'item_check'">
                                <div class="search-input-wrapper">
                                    <input v-model="cond.params._query" type="text" class="m2-input" placeholder="Item..." @input="onConditionItemSearch(cond)">
                                    <div v-if="cond.params._results && cond.params._results.length" class="search-results">
                                        <div v-for="i in cond.params._results" :key="i.vnum" class="search-result-item" @click="pickConditionItem(cond, i)">[{{ i.vnum }}] {{ i.name }}</div>
                                    </div>
                                </div>
                                <select v-model="cond.params.operator" class="m2-select op-sel">
                                    <option value=">=">Mindestens (&gt;=)</option>
                                    <option value="==">Genau (==)</option>
                                </select>
                                <input v-model.number="cond.params.value" type="number" class="m2-input" style="width:80px" title="Anzahl">
                            </template>
                            <template v-else-if="cond.type === 'gold_check' || cond.type === 'alignment_check'">
                                <select v-model="cond.params.operator" class="m2-select op-sel">
                                    <option value=">=">Mindestens (&gt;=)</option>
                                    <option value="<=">Höchstens (&lt;=)</option>
                                </select>
                                <input v-model.number="cond.params.value" type="number" class="m2-input" style="width:100px">
                            </template>
                            <template v-else-if="cond.type === 'race_check'">
                                <select v-model.number="cond.params.value" class="m2-select">
                                    <option v-for="r in RACES" :key="r.value" :value="r.value">{{ r.label }}</option>
                                </select>
                            </template>
                            <template v-else-if="cond.type === 'flag_check'">
                                <input v-model="cond.params.flagName" type="text" class="m2-input" placeholder="Flag-Name">
                                <select v-model="cond.params.operator" class="m2-select op-sel">
                                    <option value="==">Genau (==)</option>
                                    <option value=">=">Mindestens (&gt;=)</option>
                                </select>
                                <input v-model.number="cond.params.value" type="number" class="m2-input" style="width:80px">
                            </template>
                        </div>
                        <button class="m2-btn btn-icon" title="Entfernen" @click="removeCondition(idx)">✕</button>
                    </div>
                </div>

                <div class="add-row">
                    <button class="m2-btn m2-btn-secondary" @click="addCondition">+ Bedingung hinzufügen</button>
                </div>
            </div>
        </div>
    </div>

    <!-- STEP 3: Dialog -->
    <div class="wizard-step" :class="{ active: currentStep === 3 }">
        <div class="step-card">
            <div class="step-header">
                <span class="step-number">04</span>
                <div>
                    <h2>💬 Dialog erstellen <span class="optional-badge">Optional</span></h2>
                    <p class="step-desc">Schreibe den Text, den der NPC dem Spieler sagt.</p>
                </div>
            </div>
            <div class="step-content">
                <div class="info-box">
                    <strong>💡 Wie funktionieren Dialoge?</strong>
                    <p>NPC-Dialoge erscheinen als Textfenster im Spiel. Der <em>Titel</em> wird oben angezeigt, die <em>Zeilen</em> sind der Inhalt. Jede Zeile wird separat als <code>say()</code> ausgegeben.</p>
                </div>

                <div class="active-state-badge">State: <span class="accent">{{ currentState.name }}</span></div>

                <div class="dialog-editor">
                    <div class="m2-field-group">
                        <label class="m2-label">📌 Dialog-Titel</label>
                        <input v-model="currentTrigger.dialog.title" type="text" placeholder="Quest: Die verlorene Glocke" class="m2-input">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">📝 Dialog-Text</label>
                        <div class="dialog-lines" style="margin-bottom:15px">
                            <div v-for="(line, idx) in currentTrigger.dialog.lines" :key="idx" class="dialog-line-row">
                                <textarea class="m2-textarea" :value="line" @input="currentTrigger.dialog.lines[idx] = $event.target.value"></textarea>
                                <button class="m2-btn m2-btn-secondary small btn-icon" @click="removeDialogLine(idx)">✕</button>
                            </div>
                        </div>
                        <button class="m2-btn m2-btn-secondary small" @click="addDialogLine">+ Zeile hinzufügen</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- STEP 4: Aktionen -->
    <div class="wizard-step" :class="{ active: currentStep === 4 }">
        <div class="step-card">
            <div class="step-header">
                <span class="step-number">05</span>
                <div>
                    <h2>⚙️ Aktionen festlegen</h2>
                    <p class="step-desc">Bestimme, was passiert wenn der Quest ausgelöst wird.</p>
                </div>
            </div>
            <div class="step-content">
                <div class="info-box">
                    <strong>💡 Was sind Aktionen?</strong>
                    <p>Aktionen sind die Dinge die passieren: Items geben, Gold verteilen, den Spieler teleportieren, den Quest-State wechseln, usw.</p>
                </div>

                <div class="active-state-badge">State: <span class="accent">{{ currentState.name }}</span></div>

                <div class="items-list">
                    <div v-for="(action, idx) in currentTrigger.actions" :key="action.id" class="action-row">
                        <select v-model="action.type" class="m2-select" @change="onActionTypeChange(action)">
                            <option v-for="at in ACTION_TYPES" :key="at.value" :value="at.value">{{ at.label }}</option>
                        </select>
                        <div class="action-params">
                            <template v-if="action.type === 'give_item' || action.type === 'remove_item'">
                                <div class="search-input-wrapper">
                                    <input v-model="action.params._query" type="text" class="m2-input" placeholder="Item suchen..." @input="onActionItemSearch(action)">
                                    <div v-if="action.params._results && action.params._results.length" class="search-results">
                                        <div v-for="i in action.params._results" :key="i.vnum" class="search-result-item" @click="pickActionItem(action, i)">[{{ i.vnum }}] {{ i.name }}</div>
                                    </div>
                                </div>
                                <input v-model.number="action.params.amount" type="number" class="m2-input" style="width:60px" title="Anzahl">
                            </template>
                            <template v-else-if="action.type === 'give_gold' || action.type === 'remove_gold'">
                                <input v-model.number="action.params.amount" type="number" class="m2-input" placeholder="Gold Betrag">
                            </template>
                            <template v-else-if="action.type === 'set_state'">
                                <select v-model="action.params.state" class="m2-select">
                                    <option v-for="s in questData.states" :key="s.name" :value="s.name">{{ s.name }}</option>
                                </select>
                            </template>
                            <template v-else-if="action.type === 'notice'">
                                <input v-model="action.params.message" type="text" class="m2-input" placeholder="Nachrichtentext...">
                            </template>
                            <template v-else-if="action.type === 'set_timer'">
                                <input v-model="action.params.timerName" type="text" class="m2-input" style="width:120px" placeholder="Name">
                                <input v-model.number="action.params.seconds" type="number" class="m2-input" style="width:70px" title="Sekunden">
                            </template>
                            <template v-else-if="action.type === 'set_flag'">
                                <input v-model="action.params.flagName" type="text" class="m2-input" placeholder="Flag-Name">
                                <input v-model.number="action.params.flagValue" type="number" class="m2-input" style="width:70px" placeholder="Wert">
                            </template>
                            <template v-else-if="action.type === 'inc_flag'">
                                <input v-model="action.params.flagName" type="text" class="m2-input" placeholder="Zähler Name z.B. kill_count">
                            </template>
                            <template v-else-if="action.type === 'send_letter'">
                                <input v-model="action.params.title" type="text" class="m2-input" placeholder="Brief-Titel...">
                            </template>
                            <template v-else-if="action.type === 'warp'">
                                <input v-model.number="action.params.x" type="number" class="m2-input" style="width:80px" placeholder="X Koord">
                                <input v-model.number="action.params.y" type="number" class="m2-input" style="width:80px" placeholder="Y Koord">
                            </template>
                            <template v-else-if="action.type === 'spawn_mob'">
                                <div class="search-input-wrapper">
                                    <input v-model="action.params._query" type="text" class="m2-input" placeholder="Monster suchen..." @input="onActionMobSearch(action)">
                                    <div v-if="action.params._results && action.params._results.length" class="search-results">
                                        <div v-for="m in action.params._results" :key="m.vnum" class="search-result-item" @click="pickActionMob(action, m)">[{{ m.vnum }}] {{ m.name }}</div>
                                    </div>
                                </div>
                            </template>
                            <template v-else-if="action.type === 'clear_timer'">
                                <input v-model="action.params.timerName" type="text" class="m2-input" placeholder="Timer-Name">
                            </template>
                            <template v-else-if="action.type === 'custom_lua'">
                                <input v-model="action.params.code" type="text" class="m2-input" placeholder="z.B. pc.give_exp2(5000)">
                            </template>
                            <template v-else-if="action.type === 'give_bonus'">
                                <select v-model="action.params.bonusType" class="m2-select">
                                    <option v-for="b in BONUS_TYPES" :key="b.value" :value="b.value">{{ b.label }}</option>
                                </select>
                                <input v-model.number="action.params.value" type="number" class="m2-input" placeholder="Wert (z.B. 10)" style="width:80px">
                                <select v-model="action.params.duration" class="m2-select" style="width:110px">
                                    <option v-for="d in BONUS_DURATIONS" :key="d.value" :value="d.value">{{ d.label }}</option>
                                </select>
                            </template>
                        </div>
                        <button class="m2-btn btn-icon" title="Entfernen" @click="removeAction(currentTrigger.actions, idx)">✕</button>
                    </div>
                </div>

                <div class="add-row">
                    <button class="m2-btn m2-btn-secondary" @click="addAction(currentTrigger.actions)">+ Aktion hinzufügen</button>
                </div>

                <div class="action-presets">
                    <span class="presets-label">Schnellauswahl:</span>
                    <button class="preset-chip" @click="addAction(currentTrigger.actions, 'give_item')">🎁 Item geben</button>
                    <button class="preset-chip" @click="addAction(currentTrigger.actions, 'give_gold')">💰 Gold geben</button>
                    <button class="preset-chip" @click="addAction(currentTrigger.actions, 'set_state')">🔄 State wechseln</button>
                    <button class="preset-chip" @click="addAction(currentTrigger.actions, 'warp')">🌀 Teleportieren</button>
                    <button class="preset-chip" @click="addAction(currentTrigger.actions, 'notice')">📢 Nachricht</button>
                </div>
            </div>
        </div>
    </div>

    <!-- STEP 5: Verzweigung -->
    <div class="wizard-step" :class="{ active: currentStep === 5 }">
        <div class="step-card">
            <div class="step-header">
                <span class="step-number">06</span>
                <div>
                    <h2>❓ Verzweigung <span class="optional-badge">Optional</span></h2>
                    <p class="step-desc">Gib dem Spieler Auswahlmöglichkeiten mit verschiedenen Ergebnissen.</p>
                </div>
            </div>
            <div class="step-content">
                <div class="info-box">
                    <strong>💡 Wie funktioniert select()?</strong>
                    <p>Mit <code>select()</code> zeigst du dem Spieler mehrere Optionen. Je nach Wahl werden unterschiedliche Aktionen ausgeführt – z.B. quest annehmen oder ablehnen.</p>
                </div>

                <div class="active-state-badge">State: <span class="accent">{{ currentState.name }}</span></div>

                <div class="items-list">
                    <div v-for="(opt, idx) in currentTrigger.selectOptions" :key="opt.id" class="select-option-block">
                        <div class="option-header">
                            <span class="option-number">{{ idx + 1 }}</span>
                            <input v-model="opt.text" type="text" class="m2-input" placeholder="Text">
                            <button class="m2-btn m2-btn-secondary small btn-icon" @click="removeSelectOption(idx)">✕</button>
                        </div>
                        <div class="option-actions-area">
                            <h5>Aktionen bei dieser Auswahl:</h5>
                            <div class="opt-act-list items-list">
                                <div v-for="(action, ai) in opt.actions" :key="action.id" class="action-row">
                                    <select v-model="action.type" class="m2-select" @change="onActionTypeChange(action)">
                                        <option v-for="at in ACTION_TYPES" :key="at.value" :value="at.value">{{ at.label }}</option>
                                    </select>
                                    <div class="action-params">
                                        <template v-if="action.type === 'give_item' || action.type === 'remove_item'">
                                            <div class="search-input-wrapper">
                                                <input v-model="action.params._query" type="text" class="m2-input" placeholder="Item suchen..." @input="onActionItemSearch(action)">
                                                <div v-if="action.params._results && action.params._results.length" class="search-results">
                                                    <div v-for="i in action.params._results" :key="i.vnum" class="search-result-item" @click="pickActionItem(action, i)">[{{ i.vnum }}] {{ i.name }}</div>
                                                </div>
                                            </div>
                                            <input v-model.number="action.params.amount" type="number" class="m2-input" style="width:60px" title="Anzahl">
                                        </template>
                                        <template v-else-if="action.type === 'give_gold' || action.type === 'remove_gold'">
                                            <input v-model.number="action.params.amount" type="number" class="m2-input" placeholder="Gold Betrag">
                                        </template>
                                        <template v-else-if="action.type === 'set_state'">
                                            <select v-model="action.params.state" class="m2-select">
                                                <option v-for="s in questData.states" :key="s.name" :value="s.name">{{ s.name }}</option>
                                            </select>
                                        </template>
                                        <template v-else-if="action.type === 'notice'">
                                            <input v-model="action.params.message" type="text" class="m2-input" placeholder="Nachrichtentext...">
                                        </template>
                                        <template v-else-if="action.type === 'custom_lua'">
                                            <input v-model="action.params.code" type="text" class="m2-input" placeholder="z.B. pc.give_exp2(5000)">
                                        </template>
                                    </div>
                                    <button class="m2-btn btn-icon" title="Entfernen" @click="removeAction(opt.actions, ai)">✕</button>
                                </div>
                            </div>
                            <button class="m2-btn m2-btn-secondary small" @click="addAction(opt.actions, 'set_state')">+ Aktion</button>
                        </div>
                    </div>
                </div>

                <div class="add-row">
                    <button class="m2-btn m2-btn-secondary" @click="addSelectOption">+ Auswahl-Option hinzufügen</button>
                </div>
            </div>
        </div>
    </div>

    <!-- STEP 6: Code & Export -->
    <div class="wizard-step" :class="{ active: currentStep === 6 }">
        <div class="step-card">
            <div class="step-header">
                <span class="step-number">07</span>
                <div>
                    <h2>📝 Fertiger Lua-Code</h2>
                    <p class="step-desc">Dein Quest ist fertig! Hier ist der generierte Code.</p>
                </div>
            </div>
            <div class="step-content">
                <div class="info-box success-box">
                    <strong>🎉 Quest fertig!</strong>
                    <p>Kopiere den Code oder exportiere ihn als <code>.quest</code> Datei. Du kannst die Datei direkt in deinen Metin2 Server-Questordner kopieren.</p>
                </div>

                <div class="code-actions-bar">
                    <button class="btn ghost" @click="copyCode">📋 Code kopieren</button>
                    <button class="btn primary" @click="exportQuest('.quest')">⬇️ Als .quest exportieren</button>
                    <button class="btn ghost" @click="exportQuest('.lua')">⬇️ Als .lua exportieren</button>
                </div>

                <pre class="code-block"><code v-html="highlightedCode"></code></pre>
            </div>
        </div>
    </div>

    <div class="wizard-nav">
        <button class="m2-btn m2-btn-secondary" :disabled="currentStep === 0" @click="goToStep(currentStep - 1)">← Zurück</button>
        <div class="nav-info">
            <span>Schritt {{ currentStep + 1 }} von {{ TOTAL_STEPS }}</span>
        </div>
        <button class="m2-btn m2-btn-primary" :disabled="currentStep === TOTAL_STEPS - 1" @click="goToStep(currentStep + 1)">
            {{ currentStep === TOTAL_STEPS - 1 ? '✅ Fertig' : 'Weiter →' }}
        </button>
    </div>
</template>

<style scoped>
header {
    text-align: center;
    margin-bottom: 30px;
    position: relative;
    padding: 30px 20px 15px;
}

.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.header-actions { display: flex; gap: 8px; }

h1 { font-size: 2.2rem; letter-spacing: 2px; margin-bottom: 5px; }
.subtitle { color: var(--text-muted); font-size: 0.95rem; font-weight: 300; }

.wizard-progress { margin-bottom: 35px; position: relative; }

.progress-track { height: 3px; background: var(--border-color); border-radius: 3px; overflow: hidden; margin-bottom: 18px; }

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--gold-primary), var(--gold-accent));
    border-radius: 3px;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 0 10px var(--gold-primary);
}

.progress-steps { display: flex; justify-content: space-between; }

.progress-step { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; transition: var(--transition-fast); position: relative; }

.step-dot {
    width: 30px; height: 30px; border-radius: 50%;
    background: var(--bg-input); border: 2px solid var(--border-color);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 700; color: var(--text-muted);
    transition: all 0.3s ease;
}

.progress-step.active .step-dot { background: var(--gold-primary); border-color: var(--gold-primary); color: #111; box-shadow: 0 0 12px rgba(195, 163, 74, 0.4); transform: scale(1.15); }
.progress-step.done .step-dot { background: var(--success); border-color: var(--success); color: #fff; }
.progress-step.done .step-dot::after { content: '✓'; font-size: 0.8rem; }

.step-label { font-size: 0.7rem; color: var(--text-muted); text-align: center; max-width: 70px; transition: var(--transition-fast); }
.progress-step.active .step-label { color: var(--gold-primary); font-weight: 600; }
.progress-step.done .step-label { color: var(--success); }

.wizard-step { display: none; animation: stepIn 0.4s ease forwards; }
.wizard-step.active { display: block; }

@keyframes stepIn {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
}

.step-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 35px; backdrop-filter: blur(10px); margin-bottom: 100px; }

.step-header { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color); }

.step-number { font-family: var(--font-heading); font-size: 2.5rem; color: var(--gold-primary); opacity: 0.3; line-height: 1; font-weight: 700; flex-shrink: 0; }

.step-header h2 { margin-bottom: 6px; font-size: 1.4rem; display: flex; align-items: center; gap: 10px; }
.step-desc { color: var(--text-secondary); font-size: 0.95rem; line-height: 1.5; }

.optional-badge {
    font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px;
    background: var(--bg-input); color: var(--text-muted);
    padding: 3px 10px; border-radius: 20px; border: 1px solid var(--border-color);
    font-family: var(--font-body); font-weight: 600; vertical-align: middle;
}

.info-box { background: rgba(195, 163, 74, 0.08); border: 1px solid rgba(195, 163, 74, 0.2); border-radius: var(--radius-sm); padding: 18px 22px; margin-bottom: 25px; font-size: 0.9rem; line-height: 1.6; }
.info-box strong { display: block; margin-bottom: 6px; font-size: 0.85rem; }
.info-box p { margin: 0; color: var(--text-secondary); }
.info-box code { background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 3px; font-size: 0.85em; }
.success-box { background: rgba(76, 175, 80, 0.08); border-color: rgba(76, 175, 80, 0.3); }

.active-state-badge { display: inline-block; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 18px; font-size: 0.85rem; font-weight: 600; margin-bottom: 20px; }

.states-section { margin-top: 25px; }
.section-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.section-title-row h3 { font-family: var(--font-body); font-weight: 600; font-size: 1rem; }

.state-chips { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }

.state-chip { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 20px; border: 1px solid var(--border-color); background: var(--bg-input); font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); animation: fadeIn 0.3s ease; }
.state-chip.is-start { border-color: var(--gold-border); color: var(--gold-primary); }
.state-chip .chip-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; padding: 0 2px; line-height: 1; }
.state-chip .chip-remove:hover { color: var(--danger); }

.state-select-field { max-width: 300px; }

.trigger-type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 25px; }

.trigger-card {
    background: var(--bg-input); border: 2px solid var(--border-color); border-radius: var(--radius-sm);
    padding: 18px 14px; text-align: center; cursor: pointer; transition: all 0.25s ease;
    display: flex; flex-direction: column; align-items: center; gap: 6px; color: inherit; font-family: inherit;
}
.trigger-card:hover { border-color: var(--gold-border); background: var(--bg-hover); transform: translateY(-2px); }
.trigger-card.selected { border-color: var(--gold-primary); background: rgba(195, 163, 74, 0.1); box-shadow: 0 0 15px rgba(195, 163, 74, 0.15); }

.tc-icon { font-size: 1.8rem; }
.tc-name { font-weight: 600; font-size: 0.85rem; color: var(--text-primary); }
.tc-desc { font-size: 0.72rem; color: var(--text-muted); line-height: 1.3; }

.trigger-target-section { margin-top: 15px; }

.search-input-wrapper { position: relative; }

.search-results {
    position: absolute; top: 100%; left: 0; right: 0;
    background: var(--bg-card); border: 1px solid var(--gold-border);
    border-radius: 0 0 var(--radius-sm) var(--radius-sm); z-index: 1000;
    max-height: 250px; overflow-y: auto; box-shadow: var(--shadow-md);
}

.search-result-item { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; transition: var(--transition-fast); border-bottom: 1px solid var(--border-color); font-size: 0.9rem; color: var(--text-primary); }
.search-result-item:hover { background: var(--bg-hover); }
.search-result-item:last-child { border-bottom: none; }

.items-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }

.action-row, .condition-row {
    display: flex; align-items: flex-start; gap: 12px; padding: 16px;
    background: rgba(0, 0, 0, 0.15); border-radius: var(--radius-sm); border: 1px solid var(--border-color);
    animation: fadeIn 0.3s ease;
}

:global([data-theme="light"]) .action-row,
:global([data-theme="light"]) .condition-row {
    background: rgba(0, 0, 0, 0.03);
}

.action-row > select, .condition-row > select { min-width: 180px; width: 180px; flex-shrink: 0; }

.action-params, .condition-params { flex: 1; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.action-params input, .condition-params input, .action-params select, .condition-params select { max-width: 180px; }

.action-row .btn-icon, .condition-row .btn-icon { position: static; flex-shrink: 0; margin-top: 4px; }

.btn-icon { background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; padding: 6px; border-radius: 4px; transition: var(--transition-fast); line-height: 1; }
.btn-icon:hover { color: var(--danger); background: rgba(244, 67, 54, 0.1); }

.add-row { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; }

.action-presets { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color); }
.presets-label { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }

.preset-chip { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border-color); background: var(--bg-input); color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; transition: var(--transition-fast); font-family: inherit; }
.preset-chip:hover { border-color: var(--gold-primary); color: var(--gold-primary); }

.select-option-block { background: rgba(0, 0, 0, 0.15); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 18px; animation: fadeIn 0.3s ease; }
:global([data-theme="light"]) .select-option-block { background: rgba(0, 0, 0, 0.03); }

.option-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }

.option-number { background: var(--gold-primary); color: #111; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; flex-shrink: 0; }
.option-header input { flex: 1; }

.option-actions-area { margin-top: 10px; padding-left: 40px; border-left: 2px solid var(--gold-border); }
.option-actions-area h5 { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; margin-bottom: 8px; }

.dialog-editor { display: flex; flex-direction: column; gap: 20px; }
.dialog-lines { display: flex; flex-direction: column; gap: 8px; }
.dialog-line-row { display: flex; align-items: flex-start; gap: 8px; }
.dialog-line-row textarea { flex: 1; min-height: 44px; max-height: 120px; resize: vertical; font-size: 0.95rem; line-height: 1.5; }
.dialog-line-row .btn-icon { position: static; margin-top: 8px; }

.code-actions-bar { display: flex; gap: 12px; margin-bottom: 20px; }

.code-block {
    background: #0d0d14; border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    padding: 24px; overflow-x: auto; font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.85rem; line-height: 1.8; color: #d4d4d4; tab-size: 4; white-space: pre;
    max-height: 500px; overflow-y: auto; margin-bottom: 25px;
}
:global([data-theme="light"]) .code-block { background: #f5f2eb; color: #2a2a2a; }

.code-block :deep(.kw) { color: #c586c0; }
.code-block :deep(.fn) { color: #dcdcaa; }
.code-block :deep(.str) { color: #ce9178; }
.code-block :deep(.num) { color: #b5cea8; }
.code-block :deep(.cmt) { color: #6a9955; }

:global([data-theme="light"]) .code-block :deep(.kw) { color: #7b3db3; }
:global([data-theme="light"]) .code-block :deep(.fn) { color: #795e26; }
:global([data-theme="light"]) .code-block :deep(.str) { color: #a31515; }
:global([data-theme="light"]) .code-block :deep(.num) { color: #098658; }
:global([data-theme="light"]) .code-block :deep(.cmt) { color: #008000; }

.wizard-nav {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--bg-card); border-top: 1px solid var(--border-color);
    padding: 15px 30px; display: flex; justify-content: space-between; align-items: center;
    z-index: 1800; backdrop-filter: blur(15px);
}

.nav-info { font-size: 0.85rem; color: var(--text-muted); font-weight: 500; }

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 768px) {
    h1 { font-size: 1.6rem; }
    .step-card { padding: 22px; }
    .step-number { font-size: 1.8rem; }
    .trigger-type-grid { grid-template-columns: repeat(2, 1fr); }
    .action-row, .condition-row { flex-direction: column; }
    .action-params, .condition-params { flex-direction: column; width: 100%; }
    .action-params input, .condition-params input { max-width: 100%; }
    .step-label { display: none; }
    .progress-steps { gap: 4px; }
    .code-actions-bar { flex-direction: column; }
}

@media (max-width: 480px) {
    .trigger-type-grid { grid-template-columns: 1fr; }
    .header-actions { flex-direction: column; }
}
</style>
