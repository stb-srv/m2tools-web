/**
 * M2-Tools – Quest Builder (Step-by-Step Wizard)
 */

/* ═══════════════════════════════════════════════════════
   DATA MODEL
   ═══════════════════════════════════════════════════════ */

let questData = {
    name: 'my_quest',
    states: [{ name: 'start', triggers: [createDefaultTrigger()] }]
};

let currentStep = 0;
let activeStateIndex = 0;
const TOTAL_STEPS = 7;

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

/* ═══════════════════════════════════════════════════════
   WIZARD NAVIGATION
   ═══════════════════════════════════════════════════════ */

async function init() {
    await window.m2Items.autoInit();
    setupNavigation();
    setupStep0();
    setupStep1();
    setupStep2();
    setupStep3();
    setupStep4();
    setupStep5();
    setupStep6();
    renderStep(0);
}

function setupNavigation() {
    document.getElementById('next-btn').addEventListener('click', () => goToStep(currentStep + 1));
    document.getElementById('prev-btn').addEventListener('click', () => goToStep(currentStep - 1));

    // Clickable progress dots
    document.querySelectorAll('.progress-step').forEach(el => {
        el.addEventListener('click', () => {
            const step = parseInt(el.dataset.step);
            if (step <= currentStep + 1) goToStep(step);
        });
    });

    // Import/Reset
    document.getElementById('import-quest-btn').addEventListener('click', () => {
        document.getElementById('import-quest-file').click();
    });
    document.getElementById('import-quest-file').addEventListener('change', handleImport);
    document.getElementById('reset-quest-btn').addEventListener('click', () => {
        window.m2Confirm('Neuen Quest erstellen?', 'Alle bisherigen Änderungen gehen verloren.', () => {
            questData = { name: 'my_quest', states: [{ name: 'start', triggers: [createDefaultTrigger()] }] };
            activeStateIndex = 0;
            document.getElementById('quest-name').value = '';
            goToStep(0);
        });
    });
}

function goToStep(step) {
    if (step < 0 || step >= TOTAL_STEPS) return;
    if (step > currentStep && !validateStep(currentStep)) return;
    currentStep = step;
    renderStep(step);
}

function renderStep(step) {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${step}`).classList.add('active');
    const fill = document.getElementById('progress-fill');
    fill.style.width = `${(step / (TOTAL_STEPS - 1)) * 100}%`;
    document.querySelectorAll('.progress-step').forEach((el, i) => {
        el.classList.remove('active', 'done');
        if (i === step) el.classList.add('active');
        else if (i < step) el.classList.add('done');
    });
    document.getElementById('prev-btn').disabled = step === 0;
    const nextBtn = document.getElementById('next-btn');
    if (step === TOTAL_STEPS - 1) { nextBtn.textContent = '✅ Fertig'; nextBtn.disabled = true; }
    else { nextBtn.textContent = 'Weiter →'; nextBtn.disabled = false; }
    document.getElementById('nav-step-label').textContent = `Schritt ${step + 1} von ${TOTAL_STEPS}`;
    const stateName = questData.states[activeStateIndex]?.name || 'start';
    document.querySelectorAll('.active-state-badge .accent').forEach(el => el.textContent = stateName);
    switch (step) {
        case 0: renderStep0(); break;
        case 1: renderStep1(); break;
        case 2: renderStep2(); break;
        case 3: renderStep3(); break;
        case 4: renderStep4(); break;
        case 5: renderStep5(); break;
        case 6: renderStep6(); break;
    }
}

function validateStep(step) {
    if (step === 0) {
        const name = document.getElementById('quest-name').value.trim();
        if (!name) { window.m2Toast('Bitte Quest-Namen vergeben', 'error'); return false; }
        questData.name = name.replace(/[^a-zA-Z0-9_]/g, '');
    }
    return true;
}

function setupStep0() {
    document.getElementById('quest-name').oninput = (e) => {
        questData.name = e.target.value.replace(/[^a-zA-Z0-9_]/g, '') || 'my_quest';
    };
    document.getElementById('add-state-btn').onclick = () => {
        const erklaerung = `
            <div style="font-size: 0.95rem; line-height: 1.5;">
                <b style="color: var(--gold-primary);">Was ist eigentlich ein State? 🤔</b><br>
                Ein "State" ist ein bestimmtes Kapitel oder ein Zwischenschritt in deinem Quest.<br><br>
                Jeder Quest startet vollautomatisch im State <b>start</b>. <br>
                Sobald der Spieler eine Aufgabe erledigt hat (z.B. mit dem Schmied gesprochen), kannst du den Quest in das nächste Kapitel verschieben (z.B. <b>gehe_zu_uriel</b>). Das verhindert, dass der Quest den Teil nochmal von vorne anfängt.<br><br>
                <i>Gute Namen für einen State sind z.B.: <span style="color: var(--gold-primary);">run</span>, <span style="color: var(--gold-primary);">kapitel_2</span> oder <span style="color: var(--gold-primary);">suche_die_glocke</span>.</i><br><br>
                <b>Tippe hier den Namen für deinen neuen State (dein neues Kapitel) ein:</b>
            </div>
        `;
        window.m2Prompt('Neuen State erstellen ❓', erklaerung, (name) => {
            if (name) {
                const safe = name.replace(/[^a-zA-Z0-9_]/g, '');
                if (questData.states.find(s => s.name === safe)) return window.m2Toast('Existiert bereits', 'error');
                questData.states.push({ name: safe, triggers: [createDefaultTrigger()] });
                renderStep0();
            }
        });
    };
    document.getElementById('active-state-select').onchange = (e) => { activeStateIndex = parseInt(e.target.value); renderStep1(); renderStep2(); renderStep3(); renderStep4(); renderStep5(); };
}

function renderStep0() {
    document.getElementById('state-chips').innerHTML = questData.states.map((s, i) => `
        <div class="state-chip ${i === 0 ? 'is-start' : ''}">
            <span>${i === 0 ? '▶ ' : ''}${s.name}</span>
            ${i > 0 ? `<button class="chip-remove" onclick="removeState(${i})">✕</button>` : ''}
        </div>`).join('');
    document.getElementById('active-state-select').innerHTML = questData.states.map((s, i) =>
        `<option value="${i}" ${i === activeStateIndex ? 'selected' : ''}>${s.name}</option>`).join('');
}

window.removeState = (idx) => { if (idx === 0) return; questData.states.splice(idx, 1); renderStep0(); };

function setupStep1() {
    document.querySelectorAll('.trigger-card').forEach(card => {
        card.onclick = () => {
            document.querySelectorAll('.trigger-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const type = card.dataset.type;
            getCurrentTrigger().type = type;
            updateTriggerTarget(type);
        };
    });
    setupSearch(document.getElementById('trigger-npc-search'), document.getElementById('trigger-npc-results'), '/api/cube/npcs/search', (item) => {
        const t = getCurrentTrigger(); t.npcVnum = item.vnum; t.npcName = item.name;
        document.getElementById('trigger-npc-search').value = `[${item.vnum}] ${item.name}`;
    });
    setupSearch(document.getElementById('trigger-mob-search'), document.getElementById('trigger-mob-results'), '/api/quest/mobs/search', (item) => {
        const t = getCurrentTrigger(); t.mobVnum = item.vnum; t.mobName = item.name;
        document.getElementById('trigger-mob-search').value = `[${item.vnum}] ${item.name}`;
    });
    setupSearch(document.getElementById('trigger-item-search'), document.getElementById('trigger-item-results'), 'item', (item) => {
        const t = getCurrentTrigger(); t.itemVnum = item.vnum; t.itemName = item.name;
        document.getElementById('trigger-item-search').value = `[${item.vnum}] ${item.name}`;
    });
    document.getElementById('trigger-chat-text').oninput = (e) => { getCurrentTrigger().chatText = e.target.value; };
    document.getElementById('trigger-timer-name').oninput = (e) => { getCurrentTrigger().timerName = e.target.value; };
}

function renderStep1() {
    const trigger = getCurrentTrigger();
    document.querySelectorAll('.trigger-card').forEach(c => c.classList.toggle('selected', c.dataset.type === trigger.type));
    updateTriggerTarget(trigger.type);
    document.getElementById('trigger-npc-search').value = trigger.npcVnum ? `[${trigger.npcVnum}] ${trigger.npcName}` : '';
    document.getElementById('trigger-mob-search').value = trigger.mobVnum ? `[${trigger.mobVnum}] ${trigger.mobName}` : '';
    document.getElementById('trigger-item-search').value = trigger.itemVnum ? `[${trigger.itemVnum}] ${trigger.itemName}` : '';
    document.getElementById('trigger-chat-text').value = trigger.chatText || '';
    document.getElementById('trigger-timer-name').value = trigger.timerName || '';
}

function updateTriggerTarget(type) {
    const fields = ['trigger-npc-field', 'trigger-mob-field', 'trigger-item-field', 'trigger-chat-field', 'trigger-timer-field'];
    fields.forEach(id => document.getElementById(id).classList.add('hidden'));
    if (type === 'click' || type === 'button') document.getElementById('trigger-npc-field').classList.remove('hidden');
    else if (type === 'kill') document.getElementById('trigger-mob-field').classList.remove('hidden');
    else if (type === 'use') document.getElementById('trigger-item-field').classList.remove('hidden');
    else if (type === 'chat') document.getElementById('trigger-chat-field').classList.remove('hidden');
    else if (type === 'timer') document.getElementById('trigger-timer-field').classList.remove('hidden');
}

function setupStep2() {
    document.getElementById('add-condition-btn').onclick = () => {
        getCurrentTrigger().conditions.push({ type: 'level_check', params: { operator: '>=', value: 1 } });
        renderStep2();
    };
}

function renderStep2() {
    const trigger = getCurrentTrigger();
    const container = document.getElementById('conditions-list');
    container.innerHTML = '';
    trigger.conditions.forEach((cond, i) => {
        container.appendChild(createConditionRow(cond, () => { trigger.conditions.splice(i, 1); renderStep2(); }));
    });
}

function setupStep3() {
    document.getElementById('dialog-title').addEventListener('input', (e) => { getCurrentTrigger().dialog.title = e.target.value; });
    document.getElementById('add-dialog-line-btn').addEventListener('click', () => { getCurrentTrigger().dialog.lines.push(''); renderStep3(); });
}

function renderStep3() {
    const trigger = getCurrentTrigger();
    document.getElementById('dialog-title').value = trigger.dialog.title || '';
    const container = document.getElementById('dialog-lines'); container.innerHTML = '';
    trigger.dialog.lines.forEach((line, i) => {
        const row = document.createElement('div'); row.className = 'dialog-line-row';
        row.innerHTML = `<textarea class="m2-textarea" style="flex:1">${window.m2Safe.escape(line)}</textarea><button class="m2-btn m2-btn-secondary small">✕</button>`;
        row.querySelector('textarea').oninput = (e) => { trigger.dialog.lines[i] = e.target.value; };
        row.querySelector('button').onclick = () => { trigger.dialog.lines.splice(i, 1); if (!trigger.dialog.lines.length) trigger.dialog.lines.push(''); renderStep3(); };
        container.appendChild(row);
    });
}

function setupStep4() {
    document.getElementById('add-action-btn').onclick = () => { getCurrentTrigger().actions.push({ type: 'give_item', params: {} }); renderStep4(); };
    document.querySelectorAll('.preset-chip').forEach(chip => {
        chip.onclick = () => { getCurrentTrigger().actions.push({ type: chip.dataset.preset, params: {} }); renderStep4(); };
    });
}

function renderStep4() {
    const trigger = getCurrentTrigger();
    const container = document.getElementById('actions-list'); container.innerHTML = '';
    trigger.actions.forEach((action, i) => {
        container.appendChild(createActionRow(action, () => { trigger.actions.splice(i, 1); renderStep4(); }));
    });
}

function setupStep5() {
    document.getElementById('add-select-option-btn').onclick = () => { getCurrentTrigger().selectOptions.push({ text: '', actions: [] }); renderStep5(); };
}

function renderStep5() {
    const trigger = getCurrentTrigger();
    const container = document.getElementById('select-options-list'); container.innerHTML = '';
    trigger.selectOptions.forEach((opt, i) => {
        const block = document.createElement('div'); block.className = 'select-option-block';
        block.innerHTML = `<div class="option-header"><input type="text" class="m2-input" placeholder="Text" value="${window.m2Safe.escape(opt.text)}"><button class="m2-btn m2-btn-secondary small">✕</button></div><div class="opt-act-list"></div><button class="m2-btn m2-btn-secondary small">+ Aktion</button>`;
        block.querySelector('input').oninput = (e) => { opt.text = e.target.value; };
        block.querySelector('button').onclick = () => { trigger.selectOptions.splice(i, 1); renderStep5(); };
        const actList = block.querySelector('.opt-act-list');
        opt.actions.forEach((act, ai) => { actList.appendChild(createActionRow(act, () => { opt.actions.splice(ai, 1); renderStep5(); })); });
        block.querySelector('button:last-child').onclick = () => { opt.actions.push({ type: 'set_state', params: {} }); renderStep5(); };
        container.appendChild(block);
    });
}

function setupStep6() {
    document.getElementById('copy-code-btn').onclick = () => { navigator.clipboard.writeText(generateLuaCode()); showToast('Code kopiert!', 'success'); };
    document.getElementById('export-quest-btn').onclick = () => exportQuest('.quest');
    document.getElementById('export-lua-btn').onclick = () => exportQuest('.lua');
}

function renderStep6() {
    const rawCode = generateLuaCode();
    document.getElementById('code-output').innerHTML = highlightLua(rawCode);
}

function createActionRow(action, onRemove) {
    const row = document.createElement('div'); row.className = 'action-row';
    row.innerHTML = `<select class="m2-select">
        <option value="give_item">Item geben</option>
        <option value="remove_item">Item entfernen</option>
        <option value="give_gold">Gold geben</option>
        <option value="remove_gold">Gold entfernen</option>
        <option value="set_state">State-Wechsel</option>
        <option value="set_flag">Flag setzen</option>
        <option value="inc_flag">Quest-Zähler +1 (Tötungen)</option>
        <option value="send_letter">Brief senden (send_letter)</option>
        <option value="warp">Teleportieren (warp)</option>
        <option value="spawn_mob">Monster spawnen</option>
        <option value="set_timer">Timer starten</option>
        <option value="clear_timer">Timer stoppen</option>
        <option value="notice">Nachricht (notice)</option>
        <option value="give_bonus">🌟 Attribut Bonus</option>
        <option value="custom_lua">Eigener Lua Code</option>
    </select><div class="params"></div><button class="m2-btn small">✕</button>`;
    const sel = row.querySelector('select'); sel.value = action.type;
    sel.onchange = (e) => { action.type = e.target.value; action.params = {}; renderActionParams(row.querySelector('.params'), action); };
    row.querySelector('button').onclick = onRemove;
    renderActionParams(row.querySelector('.params'), action);
    return row;
}

function renderActionParams(container, action) {
    container.innerHTML = '';
    const p = action.params || {};
    action.params = p; // Ensure ref exists

    if (action.type === 'give_item' || action.type === 'remove_item') {
        container.innerHTML = `
            <input type="text" class="m2-input it-search" placeholder="Item suchen...">
            <input type="number" class="m2-input amt-inpt" value="${p.amount || 1}" style="width:60px" title="Anzahl">
        `;
        const inpt = container.querySelector('.it-search');
        const amt = container.querySelector('.amt-inpt');
        inpt.value = p.vnum ? `[${p.vnum}] ${window.m2Items.getName(p.vnum)}` : '';
        setupSearch(inpt, null, 'item', (it) => { p.vnum = it.vnum; inpt.value = `[${it.vnum}] ${it.name}`; renderStep4(); });
        amt.oninput = (e) => p.amount = parseInt(e.target.value) || 1;
    } else if (action.type === 'give_gold' || action.type === 'remove_gold') {
        container.innerHTML = `<input type="number" class="m2-input amt-inpt" value="${p.amount || 0}" placeholder="Gold Betrag">`;
        container.querySelector('.amt-inpt').oninput = (e) => p.amount = parseInt(e.target.value) || 0;
    } else if (action.type === 'set_state') {
        container.innerHTML = `<select class="m2-select">${questData.states.map(s => `<option value="${s.name}" ${p.state === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}</select>`;
        container.querySelector('select').onchange = (e) => p.state = e.target.value;
    } else if (action.type === 'notice') {
        container.innerHTML = `<input type="text" class="m2-input txt-inpt" value="${p.message || ''}" placeholder="Nachrichtentext...">`;
        container.querySelector('.txt-inpt').oninput = (e) => p.message = e.target.value;
    } else if (action.type === 'set_timer') {
        container.innerHTML = `
            <input type="text" class="m2-input tmr-name" value="${p.timerName || 'my_timer'}" style="width:120px" placeholder="Name">
            <input type="number" class="m2-input tmr-sec" value="${p.seconds || 10}" style="width:70px" title="Sekunden">
        `;
        container.querySelector('.tmr-name').oninput = (e) => p.timerName = e.target.value;
        container.querySelector('.tmr-sec').oninput = (e) => p.seconds = parseInt(e.target.value) || 10;
    } else if (action.type === 'set_flag') {
        container.innerHTML = `
            <input type="text" class="m2-input name-inpt" value="${p.flagName || 'flag'}" placeholder="Flag-Name">
            <input type="number" class="m2-input val-inpt" value="${p.flagValue || 0}" style="width:70px" placeholder="Wert">
        `;
        container.querySelector('.name-inpt').oninput = (e) => p.flagName = e.target.value;
        container.querySelector('.val-inpt').oninput = (e) => p.flagValue = parseInt(e.target.value) || 0;
    } else if (action.type === 'inc_flag') {
        container.innerHTML = `<input type="text" class="m2-input name-inpt" value="${p.flagName || 'kill_count'}" placeholder="Zähler Name z.B. kill_count">`;
        container.querySelector('.name-inpt').oninput = (e) => p.flagName = e.target.value;
    } else if (action.type === 'send_letter') {
        container.innerHTML = `<input type="text" class="m2-input title-inpt" value="${p.title || 'Brief'}" placeholder="Brief-Titel...">`;
        container.querySelector('.title-inpt').oninput = (e) => p.title = e.target.value;
    } else if (action.type === 'warp') {
        container.innerHTML = `
            <input type="number" class="m2-input val-x" value="${p.x || 0}" style="width:80px" placeholder="X Koord">
            <input type="number" class="m2-input val-y" value="${p.y || 0}" style="width:80px" placeholder="Y Koord">
        `;
        container.querySelector('.val-x').oninput = (e) => p.x = parseInt(e.target.value) || 0;
        container.querySelector('.val-y').oninput = (e) => p.y = parseInt(e.target.value) || 0;
    } else if (action.type === 'spawn_mob') {
        container.innerHTML = `
            <input type="text" class="m2-input m-search" placeholder="Monster suchen...">
        `;
        const inpt = container.querySelector('.m-search');
        inpt.value = p.mobVnum ? `[${p.mobVnum}]` : '';
        setupSearch(inpt, null, '/api/quest/mobs/search', (it) => { p.mobVnum = it.vnum; inpt.value = `[${it.vnum}] ${it.name}`; });
    } else if (action.type === 'clear_timer') {
        container.innerHTML = `<input type="text" class="m2-input tmr-inpt" value="${p.timerName || 'my_timer'}" placeholder="Timer-Name">`;
        container.querySelector('.tmr-inpt').oninput = (e) => p.timerName = e.target.value;
    } else if (action.type === 'custom_lua') {
        container.innerHTML = `<input type="text" class="m2-input lua-inpt" value="${p.code || ''}" placeholder="z.B. pc.give_exp2(5000)">`;
        container.querySelector('.lua-inpt').oninput = (e) => p.code = e.target.value;
    } else if (action.type === 'give_bonus') {
        container.innerHTML = `
            <select class="m2-select bonus-type">
                <option value="apply.MAX_HP" ${p.bonusType === 'apply.MAX_HP' ? 'selected' : ''}>Max. TP</option>
                <option value="apply.MAX_SP" ${p.bonusType === 'apply.MAX_SP' ? 'selected' : ''}>Max. MP</option>
                <option value="apply.STR" ${p.bonusType === 'apply.STR' ? 'selected' : ''}>Stärke (STR)</option>
                <option value="apply.DEX" ${p.bonusType === 'apply.DEX' ? 'selected' : ''}>Beweglichkeit (DEX)</option>
                <option value="apply.INT" ${p.bonusType === 'apply.INT' ? 'selected' : ''}>Intelligenz (INT)</option>
                <option value="apply.CON" ${p.bonusType === 'apply.CON' ? 'selected' : ''}>Vitalität (VIT)</option>
                <option value="apply.ATT_GRADE_BONUS" ${p.bonusType === 'apply.ATT_GRADE_BONUS' ? 'selected' : ''}>Angriffswert</option>
                <option value="apply.DEF_GRADE_BONUS" ${p.bonusType === 'apply.DEF_GRADE_BONUS' ? 'selected' : ''}>Verteidigung</option>
            </select>
            <input type="number" class="m2-input val-inpt" placeholder="Wert (z.B. 10)" value="${p.value || 0}" style="width:80px">
            <select class="m2-select dur-type" style="width:110px">
                <option value="60*60*24*365*60" ${p.duration === '60*60*24*365*60' ? 'selected' : ''}>Permanent</option>
                <option value="60*60*24" ${p.duration === '60*60*24' ? 'selected' : ''}>1 Tag</option>
                <option value="60*60*24*7" ${p.duration === '60*60*24*7' ? 'selected' : ''}>7 Tage</option>
            </select>
        `;
        container.querySelector('.bonus-type').onchange = (e) => p.bonusType = e.target.value;
        container.querySelector('.val-inpt').oninput = (e) => p.value = parseInt(e.target.value) || 0;
        container.querySelector('.dur-type').onchange = (e) => p.duration = e.target.value;
    }
}

function createConditionRow(cond, onRemove) {
    const row = document.createElement('div'); row.className = 'condition-row';
    row.innerHTML = `<select class="m2-select">
        <option value="level_check">Level prüfen</option>
        <option value="item_check">Item besitzen</option>
        <option value="gold_check">Gold besitzen</option>
        <option value="alignment_check">Rangpunkte (Alignment)</option>
        <option value="race_check">Rasse prüfen</option>
        <option value="flag_check">Fortschritt / Quest Zähler (z.B. für Kills)</option>
    </select><div class="params"></div><button class="m2-btn small">✕</button>`;
    row.querySelector('select').value = cond.type;
    row.querySelector('button').onclick = onRemove;
    renderConditionParams(row.querySelector('.params'), cond);
    return row;
}

function renderConditionParams(container, cond) {
    container.innerHTML = '';
    const p = cond.params || {};
    cond.params = p;

    if (cond.type === 'level_check') {
        container.innerHTML = `
            <select class="m2-select op-sel">
                <option value=">=" ${p.operator === '>=' ? 'selected' : ''}>Mindestens (&gt;=)</option>
                <option value="==" ${p.operator === '==' ? 'selected' : ''}>Genau (==)</option>
                <option value="<=" ${p.operator === '<=' ? 'selected' : ''}>Höchstens (&lt;=)</option>
            </select>
            <input type="number" class="m2-input val-inpt" value="${p.value || 1}" style="width:80px" placeholder="Level">
        `;
        container.querySelector('.op-sel').onchange = (e) => p.operator = e.target.value;
        container.querySelector('.val-inpt').oninput = (e) => p.value = parseInt(e.target.value) || 1;
    } else if (cond.type === 'item_check') {
        container.innerHTML = `
            <input type="text" class="m2-input it-search" placeholder="Item...">
            <select class="m2-select op-sel">
                <option value=">=" ${p.operator === '>=' ? 'selected' : ''}>Mindestens (&gt;=)</option>
                <option value="==" ${p.operator === '==' ? 'selected' : ''}>Genau (==)</option>
            </select>
            <input type="number" class="m2-input val-inpt" value="${p.value || 1}" style="width:80px" title="Anzahl">
        `;
        const inpt = container.querySelector('.it-search');
        inpt.value = p.vnum ? `[${p.vnum}] ${window.m2Items.getName(p.vnum)}` : '';
        setupSearch(inpt, null, 'item', (it) => { p.vnum = it.vnum; inpt.value = `[${it.vnum}] ${it.name}`; });
        container.querySelector('.op-sel').onchange = (e) => p.operator = e.target.value;
        container.querySelector('.val-inpt').oninput = (e) => p.value = parseInt(e.target.value) || 1;
    } else if (cond.type === 'gold_check' || cond.type === 'alignment_check') {
        container.innerHTML = `
            <select class="m2-select op-sel">
                <option value=">=" ${p.operator === '>=' ? 'selected' : ''}>Mindestens (&gt;=)</option>
                <option value="<=" ${p.operator === '<=' ? 'selected' : ''}>Höchstens (&lt;=)</option>
            </select>
            <input type="number" class="m2-input val-inpt" style="width:100px" value="${p.value || 0}">
        `;
        container.querySelector('.op-sel').onchange = (e) => p.operator = e.target.value;
        container.querySelector('.val-inpt').oninput = (e) => p.value = parseInt(e.target.value) || 0;
    } else if (cond.type === 'race_check') {
        container.innerHTML = `
            <select class="m2-select val-inpt">
                <option value="0" ${p.value === 0 ? 'selected' : ''}>Krieger</option>
                <option value="1" ${p.value === 1 ? 'selected' : ''}>Ninja</option>
                <option value="2" ${p.value === 2 ? 'selected' : ''}>Sura</option>
                <option value="3" ${p.value === 3 ? 'selected' : ''}>Schamane</option>
            </select>
        `;
        container.querySelector('.val-inpt').onchange = (e) => p.value = parseInt(e.target.value) || 0;
    } else if (cond.type === 'flag_check') {
        container.innerHTML = `
            <input type="text" class="m2-input name-inpt" value="${p.flagName || 'flag'}" placeholder="Flag-Name">
            <select class="m2-select op-sel">
                <option value="==" ${p.operator === '==' ? 'selected' : ''}>Genau (==)</option>
                <option value=">=" ${p.operator === '>=' ? 'selected' : ''}>Mindestens (&gt;=)</option>
            </select>
            <input type="number" class="m2-input val-inpt" value="${p.value || 0}" style="width:80px">
        `;
        container.querySelector('.name-inpt').oninput = (e) => p.flagName = e.target.value;
        container.querySelector('.op-sel').onchange = (e) => p.operator = e.target.value;
        container.querySelector('.val-inpt').oninput = (e) => p.value = parseInt(e.target.value) || 0;
    }
}

function setupSearch(input, resultsDiv, type, onSelect) {
    let resDiv = resultsDiv;
    if (!resDiv) {
        resDiv = document.createElement('div'); resDiv.className = 'search-results hidden';
        input.parentNode.appendChild(resDiv);
    }
    input.oninput = () => {
        const q = input.value.trim();
        if (q.length < 1) { resDiv.classList.add('hidden'); return; }
        let data = [];
        if (type === 'item') {
            data = window.m2Items.search(q).slice(0, 20);
            renderResults(data, resDiv, onSelect);
        } else {
            fetch(type + '?q=' + encodeURIComponent(q)).then(r => r.json()).then(d => renderResults(d, resDiv, onSelect));
        }
    };
}

function renderResults(data, div, onSelect) {
    div.innerHTML = '';
    if (!data.length) { div.classList.add('hidden'); return; }
    data.forEach(it => {
        const d = document.createElement('div'); d.className = 'search-result-item';
        d.innerHTML = `[${it.vnum}] ${it.name}`;
        d.onclick = () => { onSelect(it); div.classList.add('hidden'); };
        div.appendChild(d);
    });
    div.classList.remove('hidden');
}

function generateLuaCode() {
    const tab = (n) => '\t'.repeat(n);
    let code = `quest ${questData.name} begin\n`;
    
    questData.states.forEach(s => {
        code += tab(1) + `state ${s.name} begin\n`;
        
        if (s.triggers && s.triggers.length > 0) {
            s.triggers.forEach(t => {
                // Ignore empty dummy triggers
                if (!t.type) return;

                code += tab(2) + buildWhenLine(t) + ` begin\n`;
                let indent = 3;
                
                // Conditions
                if (t.conditions && t.conditions.length > 0) {
                    const condStr = t.conditions.map(c => buildConditionString(c)).join(' and ');
                    code += tab(indent) + `if ${condStr} then\n`;
                    indent++;
                }
                
                // Dialog
                if (t.dialog) {
                    if (t.dialog.title && t.dialog.title.trim().length > 0) {
                        code += tab(indent) + `say_title("${window.m2Safe.lua(t.dialog.title)}")\n`;
                    }
                    if (t.dialog.lines && t.dialog.lines.length > 0) {
                        t.dialog.lines.forEach(line => {
                            if (line.trim().length > 0) {
                                code += tab(indent) + `say("${window.m2Safe.lua(line)}")\n`;
                            }
                        });
                    }
                }
                
                // Actions
                if (t.actions && t.actions.length > 0) {
                    t.actions.forEach(a => {
                        code += tab(indent) + buildActionString(a) + '\n';
                    });
                }
                
                // Select Branching
                if (t.selectOptions && t.selectOptions.length > 0) {
                    const opts = Object.values(t.selectOptions).map(opt => `"${window.m2Safe.lua(opt.text)}"`).join(', ');
                    code += tab(indent) + `local s = select(${opts})\n`;
                    
                    t.selectOptions.forEach((opt, idx) => {
                        if (idx === 0) {
                            code += tab(indent) + `if s == 1 then\n`;
                        } else {
                            code += tab(indent) + `elseif s == ${idx + 1} then\n`;
                        }
                        if (opt.actions && opt.actions.length > 0) {
                            opt.actions.forEach(a => {
                                code += tab(indent + 1) + buildActionString(a) + '\n';
                            });
                        }
                    });
                    code += tab(indent) + `end\n`;
                }
                
                // Close Conditions
                if (t.conditions && t.conditions.length > 0) {
                    indent--;
                    code += tab(indent) + `end\n`;
                }
                
                code += tab(2) + `end\n`; // End when
            });
        }
        code += tab(1) + `end\n`; // End state
    });
    
    code += `end\n`; // End quest
    return code;
}

function getCurrentTrigger() { return questData.states[activeStateIndex].triggers[0]; }
function createDefaultTrigger() { return { type: 'click', npcVnum: 0, actions: [], conditions: [], dialog: { lines: [] }, selectOptions: [] }; }
function handleImport(e) { /* Simplified */ }

function buildWhenLine(t) {
    switch (t.type) {
        case 'click': return `when ${t.npcVnum || 0}.click`;
        case 'kill': return `when kill with npc.get_race() == ${t.mobVnum || 0}`;
        case 'login': return 'when login';
        case 'levelup': return 'when levelup';
        case 'use': return `when ${t.itemVnum || 0}.use`;
        case 'button': return 'when button';
        case 'chat': return `when letter with chat == "${window.m2Safe.escape(t.chatText)}"`;
        case 'timer': return `when ${t.timerName || 'my_timer'}.timer`;
        case 'enter': return 'when enter';
        default: return `when ${t.type}`;
    }
}

function buildActionString(a) {
    const p = a.params || {};
    switch (a.type) {
        case 'give_item': return `pc.give_item2(${p.vnum || 0}, ${p.amount || 1})`;
        case 'remove_item': return `pc.remove_item(${p.vnum || 0}, ${p.amount || 1})`;
        case 'give_gold': return `pc.change_gold(${p.amount || 0})`;
        case 'remove_gold': return `pc.change_gold(-${p.amount || 0})`;
        case 'set_state': return `set_state("${p.state || 'start'}")`;
        case 'set_flag': return `pc.setqf("${escapeLua(p.flagName || 'flag')}", ${p.flagValue || 0})`;
        case 'inc_flag': return `pc.setqf("${escapeLua(p.flagName || 'kill_count')}", pc.getqf("${escapeLua(p.flagName || 'kill_count')}") + 1)`;
        case 'send_letter': return `send_letter("${window.m2Safe ? window.m2Safe.escape(p.title || 'Quest') : escapeLua(p.title || 'Quest')}")`;
        case 'warp': return `pc.warp(${p.x || 0}, ${p.y || 0})`;
        case 'spawn_mob': return `mob.spawn(${p.mobVnum || 0}, pc.get_local_x(), pc.get_local_y(), 1, 1, 1)`;
        case 'set_timer': return `timer("${escapeLua(p.timerName || 'my_timer')}", ${p.seconds || 10})`;
        case 'clear_timer': return `cleartimer("${escapeLua(p.timerName || 'my_timer')}")`;
        case 'notice': return `notice("${window.m2Safe ? window.m2Safe.escape(p.message || '') : escapeLua(p.message || '')}")`;
        case 'give_bonus': return `affect.add_collect(${p.bonusType || 'apply.MAX_HP'}, ${p.value || 0}, ${p.duration || '60*60*24*365*60'})`;
        case 'custom_lua': return p.code || '-- custom code';
        default: return `-- ${a.type}`;
    }
}

function buildConditionString(c) {
    const p = c.params || {};
    switch (c.type) {
        case 'level_check': return `pc.get_level() ${p.operator || '>='} ${p.value || 1}`;
        case 'item_check': return `pc.count_item(${p.vnum || 0}) ${p.operator || '>='} ${p.value || 1}`;
        case 'gold_check': return `pc.money() ${p.operator || '>='} ${p.value || 0}`;
        case 'flag_check': return `pc.getqf("${escapeLua(p.flagName || 'flag')}") ${p.operator || '=='} ${p.value || 0}`;
        case 'race_check': return `pc.get_job() == ${p.value || 0}`;
        case 'alignment_check': return `pc.get_alignment() ${p.operator || '>='} ${p.value || 0}`;
        default: return 'true';
    }
}

/* ═══════════════════════════════════════════════════════
   SYNTAX HIGHLIGHTING
   ═══════════════════════════════════════════════════════ */

function highlightLua(code) {
    const kws = ['quest', 'begin', 'end', 'state', 'when', 'if', 'then', 'else', 'elseif', 'local', 'and', 'or', 'not', 'with'];
    const fns = ['say', 'say_title', 'say_reward', 'select', 'set_state', 'send_letter', 'pc\\.give_item2', 'pc\\.remove_item', 'pc\\.count_item', 'pc\\.change_gold', 'pc\\.money', 'pc\\.get_level', 'pc\\.setqf', 'pc\\.getqf', 'pc\\.get_job', 'pc\\.get_alignment', 'npc\\.get_race', 'mob\\.spawn', 'warp', 'timer', 'cleartimer', 'notice'];

    let html = window.m2Safe.escape(code);
    html = html.replace(/(--.*)/g, '<span class="cmt">$1</span>');
    html = html.replace(/("(?:[^"\\]|\\.)*")/g, '<span class="str">$1</span>');
    html = html.replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
    kws.forEach(kw => { html = html.replace(new RegExp(`\\b(${kw})\\b`, 'g'), '<span class="kw">$1</span>'); });
    fns.forEach(fn => { html = html.replace(new RegExp(`(${fn})(?=\\()`, 'g'), '<span class="fn">$1</span>'); });
    return html;
}

/* ═══════════════════════════════════════════════════════
   IMPORT / EXPORT
   ═══════════════════════════════════════════════════════ */

function copyCode() {
    navigator.clipboard.writeText(generateLuaCode()).then(() => m2Toast('Code kopiert!', 'success')).catch(() => m2Toast('Kopieren fehlgeschlagen', 'error'));
}

async function exportQuest(ext = '.quest') {
    const code = generateLuaCode();
    const filename = questData.name || 'quest';
    const fullName = `${filename}${ext}`;
    try {
        const headers = window.auth ? { ...window.auth.authHeaders(), 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
        await fetch('/api/quest/save', { method: 'POST', headers, body: JSON.stringify({ filename, content: code }) });
    } catch (err) { /* ignore */ }

    const blob = new Blob([code], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fullName;
    a.click();
    URL.revokeObjectURL(a.href);
    m2Toast(`Quest "${fullName}" exportiert!`, 'success');
}

function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = parseQuestFile(ev.target.result);
            questData = parsed;
            document.getElementById('quest-name').value = parsed.name;
            activeStateIndex = 0;
            goToStep(0);
            m2Toast('Quest importiert!', 'success');
        } catch (err) { m2Toast('Import fehlgeschlagen: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
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

/* ═══════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════ */

// Utility functions are now provided by /shared/utils.js and /shared/layout.js

/* ═══════════════════════════════════════════════════════
   TEMPLATES
   ═══════════════════════════════════════════════════════ */

window.loadTemplate = function(type) {
    if (!confirm('Möchtest du diese Vorlage laden? Alle bisherigen Eingaben werden überschrieben!')) return;

    let d = { name: 'beispiel_quest', states: [] };
    
    if (type === 'dialog') {
        d.name = 'schmied_begruessung';
        d.states = [{
            name: 'start', triggers: [{
                type: 'click', npcVnum: 20016, npcName: 'Schmied',
                conditions: [{ type: 'level_check', params: { operator: '>=', value: 10 } }],
                dialog: { title: 'Schmied', lines: ['Hallo Fremder!', 'Du siehst schwach aus.', 'Ich kann dir eine stärkere Waffe geben.'] },
                selectOptions: [
                    { text: 'Ja, gerne!', actions: [
                        { type: 'give_item', params: { vnum: 19, amount: 1 } },
                        { type: 'notice', params: { message: 'Du hast ein Schwert+9 erhalten!' } },
                        { type: 'set_state', params: { state: 'fertig' } }
                    ]},
                    { text: 'Nein danke.', actions: [] }
                ],
                actions: []
            }]
        }, {
            name: 'fertig', triggers: [{ type: 'click', npcVnum: 20016, npcName: 'Schmied', conditions: [], dialog: { title: 'Schmied', lines: ['Ich habe dir bereits geholfen!'] }, selectOptions: [], actions: [] }]
        }];
    } else if (type === 'kill') {
        d.name = 'hundejagd_mission';
        d.states = [{
            name: 'start', triggers: [{
                type: 'click', npcVnum: 20011, npcName: 'Uriel', conditions: [],
                dialog: { title: 'Uriel', lines: ['Töte bitte 10 Wildhunde für mich!'] },
                selectOptions: [{ text: 'Mache ich!', actions: [{ type: 'set_state', params: { state: 'jagd' } }] }], actions: []
            }]
        }, {
            name: 'jagd', triggers: [{
                type: 'kill', mobVnum: 101, mobName: 'Wildhund', conditions: [], dialog: { lines: [] }, selectOptions: [],
                actions: [
                    { type: 'inc_flag', params: { flagName: 'hunde_kills' } },
                    { type: 'custom_lua', params: { code: 'if pc.getqf("hunde_kills") >= 10 then\n    notice("Du hast alle Hunde getötet! Gehe zu Uriel.")\n    set_state("belohnung")\nend' } }
                ]
            }]
        }, {
            name: 'belohnung', triggers: [{
                type: 'click', npcVnum: 20011, npcName: 'Uriel', conditions: [], dialog: { title: 'Uriel', lines: ['Danke für deine Hilfe!', 'Hier ist dein Gold.'] }, selectOptions: [],
                actions: [{ type: 'give_gold', params: { amount: 50000 } }, { type: 'set_state', params: { state: 'abgeschlossen' } }]
            }]
        }, {
            name: 'abgeschlossen', triggers: [createDefaultTrigger()]
        }];
    } else if (type === 'buff') {
        d.name = 'attribut_trank';
        d.states = [{
            name: 'start', triggers: [{
                type: 'use', itemVnum: 27987, itemName: 'Muschel', conditions: [], dialog: { lines: [] }, selectOptions: [],
                actions: [
                    { type: 'remove_item', params: { vnum: 27987, amount: 1 } },
                    { type: 'give_bonus', params: { bonusType: 'apply.MAX_HP', value: 1000, duration: '60*60*24*365*60' } },
                    { type: 'notice', params: { message: 'Du spürst eine unglaubliche Energie in dir! (+1000 TP Permanent)' } }
                ]
            }]
        }];
    } else if (type === 'login') {
        d.name = 'login_geschenk';
        d.states = [{
            name: 'start', triggers: [{
                type: 'login', conditions: [{ type: 'level_check', params: { operator: '>=', value: 30 } }], dialog: { lines: [] }, selectOptions: [],
                actions: [
                    { type: 'notice', params: { message: 'Willkommen zurück! Da du Level 30 erreicht hast, hier dein Reittier!' } },
                    { type: 'give_item', params: { vnum: 71114, amount: 1 } },
                    { type: 'set_state', params: { state: 'abgeschlossen' } }
                ]
            }]
        }, {
            name: 'abgeschlossen', triggers: [createDefaultTrigger()]
        }];
    }

    questData = d;
    document.getElementById('quest-name').value = d.name;
    activeStateIndex = 0;
    goToStep(0);
    m2Toast('Vorlage geladen!', 'success');
};

/* ═══════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════ */

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else setTimeout(init, 0);
