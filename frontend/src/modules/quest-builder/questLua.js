/* ── Lua code generation (ported ~verbatim from the original vanilla-JS quest_builder) ──────────── */

export function luaEscape(s) {
    return (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Inverse of luaEscape(): every backslash in escaped output is always
// followed by exactly the one character it was protecting, so stripping
// the backslash in front of any escaped pair recovers the original.
export function luaUnescape(s) {
    return (s || '').replace(/\\(.)/g, '$1');
}

/* ── Shared id generator (trigger/action/condition/select-option list keys) ─ */
let idSeq = 0;
export function nextId() {
    return idSeq++;
}

export function createDefaultTrigger() {
    return {
        id: nextId(),
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

export function buildWhenLine(t) {
    switch (t.type) {
        case 'click': return `when ${t.npcVnum || 0}.click`;
        // Verified against 870 real production .quest files: every single
        // kill trigger in that corpus is "<mobVnum>.kill" (same shape as
        // .click/.use) - "kill with npc.get_race() == X" (the previous form
        // here) never occurs once and is not valid QuestLib grammar.
        case 'kill': return `when ${t.mobVnum || 0}.kill`;
        case 'login': return 'when login';
        case 'levelup': return 'when levelup';
        case 'use': return `when ${t.itemVnum || 0}.use`;
        case 'button': return 'when button';
        // NPC-scoped chat trigger - confirmed against the same real-quest
        // corpus (e.g. `when 20084.chat."Hallo!" begin`).
        case 'chat': return `when ${t.npcVnum || 0}.chat."${luaEscape(t.chatText)}"`;
        case 'timer': return `when ${t.timerName || 'my_timer'}.timer`;
        case 'enter': return 'when enter';
        // Fires when the player receives/reads an in-game letter - the
        // single most common trigger in the real corpus (41 occurrences),
        // almost always used as a state's "on entry" handler that sends the
        // next letter and/or sets up an NPC target. Takes no target.
        case 'letter': return 'when letter';
        default: return `when ${t.type}`;
    }
}

export function buildActionString(a) {
    const p = a.params || {};
    switch (a.type) {
        case 'give_item': return `pc.give_item2(${p.vnum || 0}, ${p.amount || 1})`;
        case 'remove_item': return `pc.remove_item(${p.vnum || 0}, ${p.amount || 1})`;
        case 'give_gold': return `pc.change_gold(${p.amount || 0})`;
        case 'remove_gold': return `pc.change_gold(-${p.amount || 0})`;
        case 'set_state': return `set_state("${p.state || 'start'}")`;
        case 'set_flag': return `pc.setqf("${luaEscape(p.flagName || 'flag')}", ${p.flagValue || 0})`;
        case 'inc_flag': return `pc.setqf("${luaEscape(p.flagName || 'kill_count')}", pc.getqf("${luaEscape(p.flagName || 'kill_count')}") + 1)`;
        case 'send_letter': return `send_letter("${luaEscape(p.title || 'Quest')}")`;
        case 'warp': return `pc.warp(${p.x || 0}, ${p.y || 0})`;
        case 'spawn_mob': return `mob.spawn(${p.mobVnum || 0}, pc.get_local_x(), pc.get_local_y(), 1, 1, 1)`;
        case 'set_timer': return `timer("${luaEscape(p.timerName || 'my_timer')}", ${p.seconds || 10})`;
        case 'clear_timer': return `cleartimer("${luaEscape(p.timerName || 'my_timer')}")`;
        case 'notice': return `notice("${luaEscape(p.message || '')}")`;
        case 'give_bonus': return `affect.add_collect(${p.bonusType || 'apply.MAX_HP'}, ${p.value || 0}, ${p.duration || '60*60*24*365*60'})`;
        case 'custom_lua': return p.code || '-- custom code';
        default: return `-- ${a.type}`;
    }
}

export function buildConditionString(c) {
    const p = c.params || {};
    switch (c.type) {
        case 'level_check': return `pc.get_level() ${p.operator || '>='} ${p.value || 1}`;
        case 'item_check': return `pc.count_item(${p.vnum || 0}) ${p.operator || '>='} ${p.value || 1}`;
        case 'gold_check': return `pc.money() ${p.operator || '>='} ${p.value || 0}`;
        case 'flag_check': return `pc.getqf("${luaEscape(p.flagName || 'flag')}") ${p.operator || '=='} ${p.value || 0}`;
        case 'race_check': return `pc.get_job() == ${p.value || 0}`;
        case 'alignment_check': return `pc.get_alignment() ${p.operator || '>='} ${p.value || 0}`;
        default: return 'true';
    }
}

export function generateLuaCode(questData) {
    const tab = (n) => '\t'.repeat(n);
    let code = `quest ${questData.name} begin\n`;

    questData.states.forEach(s => {
        code += tab(1) + `state ${s.name} begin\n`;

        (s.triggers || []).forEach(t => {
            if (!t.type) return;

            code += tab(2) + buildWhenLine(t) + ` begin\n`;
            let indent = 3;

            if (t.conditions && t.conditions.length > 0) {
                const condStr = t.conditions.map(c => buildConditionString(c)).join(' and ');
                code += tab(indent) + `if ${condStr} then\n`;
                indent++;
            }

            if (t.dialog) {
                if (t.dialog.title && t.dialog.title.trim().length > 0) {
                    code += tab(indent) + `say_title("${luaEscape(t.dialog.title)}")\n`;
                }
                if (t.dialog.lines && t.dialog.lines.length > 0) {
                    t.dialog.lines.forEach(line => {
                        if (line.trim().length > 0) code += tab(indent) + `say("${luaEscape(line)}")\n`;
                    });
                }
            }

            if (t.actions && t.actions.length > 0) {
                t.actions.forEach(a => { code += tab(indent) + buildActionString(a) + '\n'; });
            }

            if (t.selectOptions && t.selectOptions.length > 0) {
                const opts = t.selectOptions.map(opt => `"${luaEscape(opt.text)}"`).join(', ');
                code += tab(indent) + `local s = select(${opts})\n`;

                t.selectOptions.forEach((opt, idx) => {
                    code += tab(indent) + (idx === 0 ? `if s == 1 then\n` : `elseif s == ${idx + 1} then\n`);
                    if (opt.actions && opt.actions.length > 0) {
                        opt.actions.forEach(a => { code += tab(indent + 1) + buildActionString(a) + '\n'; });
                    }
                });
                code += tab(indent) + `end\n`;
            }

            if (t.conditions && t.conditions.length > 0) {
                indent--;
                code += tab(indent) + `end\n`;
            }

            code += tab(2) + `end\n`;
        });

        code += tab(1) + `end\n`;
    });

    code += `end\n`;
    return code;
}

/* ── Import: parse quest code back into the editor's structured format ──────
 *
 * Naive regex approaches ("match up to the next 'end'") break as soon as a
 * trigger contains its own nested begin/end block (an `if...then...end`
 * from a condition, or a `select()` branch) - the match stops at the FIRST
 * inner `end` instead of the trigger's own closing one, corrupting
 * everything parsed afterwards. Every boundary below is instead found with
 * findMatchingEnd(), which walks block-opener/closer tokens with a depth
 * counter so nesting is handled correctly. This only needs to round-trip
 * what generateLuaCode() itself produces (or a close hand-edited variant of
 * it), not arbitrary foreign Lua.
 */

const BLOCK_TOKEN_RE = /\b(begin|then|do|end)\b/g;

/** Index of the 'end' matching the opener already consumed at `pos`, or -1. */
function findMatchingEnd(text, pos) {
    BLOCK_TOKEN_RE.lastIndex = pos;
    let depth = 1;
    let m;
    while ((m = BLOCK_TOKEN_RE.exec(text)) !== null) {
        if (m[1] === 'end') {
            depth--;
            if (depth === 0) return m.index;
        } else {
            depth++;
        }
    }
    return -1;
}

/** Net block-depth change a single line introduces (openers minus closers). */
function lineDepthDelta(line) {
    let delta = 0;
    const re = /\b(begin|then|do|end)\b/g;
    let m;
    while ((m = re.exec(line)) !== null) delta += m[1] === 'end' ? -1 : 1;
    return delta;
}

/** Strips the common leading whitespace across a block's lines, then trims. */
function dedentBlock(text) {
    const lines = text.replace(/\n$/, '').split('\n');
    const indents = lines.filter(l => l.trim()).map(l => l.match(/^[\t ]*/)[0].length);
    const min = indents.length ? Math.min(...indents) : 0;
    return lines.map(l => l.slice(min)).join('\n').trim();
}

const QSTR = '"((?:[^"\\\\]|\\\\.)*)"';

/* Inverse of buildActionString() - one pattern per action type. Order only
 * matters between inc_flag/set_flag, since inc_flag's value expression
 * (`pc.getqf(...) + 1`) would never match set_flag's purely-numeric value
 * anyway, but inc_flag is still listed first for clarity. */
const ACTION_PATTERNS = [
    { type: 'give_item', re: /^pc\.give_item2\((\d+),\s*(\d+)\)$/, parse: m => ({ vnum: +m[1], amount: +m[2] }) },
    { type: 'remove_item', re: /^pc\.remove_item\((\d+),\s*(\d+)\)$/, parse: m => ({ vnum: +m[1], amount: +m[2] }) },
    { type: 'remove_gold', re: /^pc\.change_gold\(-(\d+)\)$/, parse: m => ({ amount: +m[1] }) },
    { type: 'give_gold', re: /^pc\.change_gold\((\d+)\)$/, parse: m => ({ amount: +m[1] }) },
    { type: 'inc_flag', re: new RegExp(`^pc\\.setqf\\(${QSTR},\\s*pc\\.getqf\\("\\1"\\)\\s*\\+\\s*1\\)$`), parse: m => ({ flagName: luaUnescape(m[1]) }) },
    { type: 'set_flag', re: new RegExp(`^pc\\.setqf\\(${QSTR},\\s*(-?\\d+)\\)$`), parse: m => ({ flagName: luaUnescape(m[1]), flagValue: +m[2] }) },
    { type: 'set_state', re: new RegExp(`^set_state\\(${QSTR}\\)$`), parse: m => ({ state: luaUnescape(m[1]) }) },
    { type: 'send_letter', re: new RegExp(`^send_letter\\(${QSTR}\\)$`), parse: m => ({ title: luaUnescape(m[1]) }) },
    { type: 'warp', re: /^pc\.warp\((-?\d+),\s*(-?\d+)\)$/, parse: m => ({ x: +m[1], y: +m[2] }) },
    { type: 'spawn_mob', re: /^mob\.spawn\((\d+),\s*pc\.get_local_x\(\),\s*pc\.get_local_y\(\),\s*1,\s*1,\s*1\)$/, parse: m => ({ mobVnum: +m[1] }) },
    { type: 'set_timer', re: new RegExp(`^timer\\(${QSTR},\\s*(\\d+)\\)$`), parse: m => ({ timerName: luaUnescape(m[1]), seconds: +m[2] }) },
    { type: 'clear_timer', re: new RegExp(`^cleartimer\\(${QSTR}\\)$`), parse: m => ({ timerName: luaUnescape(m[1]) }) },
    { type: 'notice', re: new RegExp(`^notice\\(${QSTR}\\)$`), parse: m => ({ message: luaUnescape(m[1]) }) },
    { type: 'give_bonus', re: /^affect\.add_collect\(([\w.]+),\s*(-?\d+),\s*([\w*]+)\)$/, parse: m => ({ bonusType: m[1], value: +m[2], duration: m[3] }) }
];

function parseActionLine(line) {
    for (const p of ACTION_PATTERNS) {
        const m = line.match(p.re);
        if (m) return { id: nextId(), type: p.type, params: p.parse(m) };
    }
    return null;
}

/* Inverse of buildConditionString(). */
const CONDITION_PATTERNS = [
    { type: 'level_check', re: /^pc\.get_level\(\)\s*(>=|==|<=)\s*(\d+)$/, parse: m => ({ operator: m[1], value: +m[2] }) },
    { type: 'item_check', re: /^pc\.count_item\((\d+)\)\s*(>=|==)\s*(\d+)$/, parse: m => ({ vnum: +m[1], operator: m[2], value: +m[3] }) },
    { type: 'gold_check', re: /^pc\.money\(\)\s*(>=|<=)\s*(\d+)$/, parse: m => ({ operator: m[1], value: +m[2] }) },
    { type: 'alignment_check', re: /^pc\.get_alignment\(\)\s*(>=|<=)\s*(-?\d+)$/, parse: m => ({ operator: m[1], value: +m[2] }) },
    { type: 'flag_check', re: new RegExp(`^pc\\.getqf\\(${QSTR}\\)\\s*(==|>=)\\s*(-?\\d+)$`), parse: m => ({ flagName: luaUnescape(m[1]), operator: m[2], value: +m[3] }) },
    { type: 'race_check', re: /^pc\.get_job\(\)\s*==\s*(\d+)$/, parse: m => ({ value: +m[1] }) }
];

function parseConditionClause(clause) {
    for (const p of CONDITION_PATTERNS) {
        const m = clause.trim().match(p.re);
        if (m) return { id: nextId(), type: p.type, params: p.parse(m) };
    }
    return null;
}

/**
 * Parses a trigger's (or select-branch's) inner body: dialog say()/
 * say_title() calls, flat action lines, and an optional select() branch
 * block - in the order generateLuaCode() itself emits them.
 */
function parseBody(text) {
    const dialog = { title: '', lines: [] };
    const actions = [];
    let selectOptions = [];
    const len = text.length;
    let pos = 0;

    function lineAt(p) {
        let end = text.indexOf('\n', p);
        if (end === -1) end = len;
        return { text: text.slice(p, end), nextPos: end < len ? end + 1 : len };
    }

    while (pos < len) {
        const { text: rawLine, nextPos } = lineAt(pos);
        const trimmed = rawLine.trim();
        if (!trimmed) { pos = nextPos; continue; }

        let m;
        if ((m = trimmed.match(new RegExp(`^say_title\\(${QSTR}\\)$`)))) {
            dialog.title = luaUnescape(m[1]); pos = nextPos; continue;
        }
        if ((m = trimmed.match(new RegExp(`^say\\(${QSTR}\\)$`)))) {
            dialog.lines.push(luaUnescape(m[1])); pos = nextPos; continue;
        }
        if ((m = trimmed.match(/^local s = select\((.*)\)$/))) {
            const optionTexts = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => luaUnescape(x[1]));

            let p2 = nextPos;
            while (p2 < len) {
                const probe = lineAt(p2);
                if (probe.text.trim()) break;
                p2 = probe.nextPos;
            }
            const ifLine = lineAt(p2).text.trim();

            if (/^if\s+s\s*==\s*1\s+then$/.test(ifLine)) {
                const thenKwIdx = text.indexOf('then', p2);
                const afterThen = thenKwIdx + 4;
                const endIdx = findMatchingEnd(text, afterThen);
                const inner = text.slice(afterThen, endIdx === -1 ? len : endIdx);
                const parts = inner.split(/\n[ \t]*elseif\s+s\s*==\s*\d+\s+then[ \t]*(?=\n|$)/);

                selectOptions = optionTexts.map((t, idx) => ({
                    id: nextId(),
                    text: t,
                    actions: parseBody(parts[idx] || '').actions
                }));

                pos = endIdx === -1 ? len : lineAt(endIdx).nextPos;
                continue;
            }
            // No matching "if s == 1 then" right after - not one of our own
            // select() blocks; skip just the declaration line.
            pos = nextPos;
            continue;
        }

        const delta = lineDepthDelta(trimmed);
        if (delta === 0) {
            actions.push(parseActionLine(trimmed) || { id: nextId(), type: 'custom_lua', params: { code: trimmed } });
            pos = nextPos;
        } else {
            // Multi-line nested block we don't otherwise recognize (custom
            // Lua with its own if/then/end etc.) - capture it whole.
            const openerMatch = trimmed.match(/\b(begin|then|do)\b/);
            if (!openerMatch) { pos = nextPos; continue; }
            const openerPos = pos + rawLine.indexOf(openerMatch[1]) + openerMatch[1].length;
            const endIdx = findMatchingEnd(text, openerPos);
            const blockEndPos = endIdx === -1 ? len : lineAt(endIdx).nextPos;
            const rawBlock = text.slice(pos, blockEndPos);
            actions.push({ id: nextId(), type: 'custom_lua', params: { code: dedentBlock(rawBlock) } });
            pos = blockEndPos;
        }
    }

    return { dialog, actions, selectOptions };
}

/** Parses a "when ... begin" clause's target back onto a fresh trigger. */
function parseWhenClause(t, wl) {
    if (/\.click$/.test(wl)) {
        t.type = 'click';
        const m = wl.match(/(\d+)\.click$/); if (m) t.npcVnum = parseInt(m[1], 10);
    } else if (/\.kill$/.test(wl)) {
        t.type = 'kill';
        const m = wl.match(/(\d+)\.kill$/); if (m) t.mobVnum = parseInt(m[1], 10);
    } else if (wl === 'letter') {
        t.type = 'letter';
    } else if (wl === 'login') {
        t.type = 'login';
    } else if (wl === 'levelup') {
        t.type = 'levelup';
    } else if (/\.use$/.test(wl)) {
        t.type = 'use';
        const m = wl.match(/(\d+)\.use$/); if (m) t.itemVnum = parseInt(m[1], 10);
    } else if (/\.timer$/.test(wl)) {
        t.type = 'timer';
        const m = wl.match(/(\S+)\.timer$/); if (m) t.timerName = m[1];
    } else if (wl === 'button') {
        t.type = 'button';
    } else if (wl === 'enter') {
        t.type = 'enter';
    } else if (/\.chat\./.test(wl)) {
        t.type = 'chat';
        const m = wl.match(new RegExp(`^(\\d+)\\.chat\\.${QSTR}$`)); if (m) { t.npcVnum = parseInt(m[1], 10); t.chatText = luaUnescape(m[2]); }
    }
    return t;
}

export function parseQuestCode(text) {
    const data = { name: 'imported_quest', states: [] };
    const qm = text.match(/quest\s+(\S+)\s+begin/);
    if (qm) data.name = qm[1];

    const stateOpenRe = /\bstate\s+(\w+)\s+begin\b/g;
    let sm;
    while ((sm = stateOpenRe.exec(text)) !== null) {
        const bodyStart = sm.index + sm[0].length;
        const bodyEnd = findMatchingEnd(text, bodyStart);
        const body = text.slice(bodyStart, bodyEnd === -1 ? text.length : bodyEnd);
        const state = { name: sm[1], triggers: [] };

        const whenOpenRe = /\bwhen\s+([\s\S]*?)\s+begin\b/g;
        let wm;
        while ((wm = whenOpenRe.exec(body)) !== null) {
            const t = parseWhenClause(createDefaultTrigger(), wm[1]);

            const triggerBodyStart = wm.index + wm[0].length;
            const triggerBodyEnd = findMatchingEnd(body, triggerBodyStart);
            const triggerBody = body.slice(triggerBodyStart, triggerBodyEnd === -1 ? body.length : triggerBodyEnd);

            let effectiveBody = triggerBody;
            const ifMatch = triggerBody.match(/^\s*if\s+([\s\S]+?)\s+then\b/);
            if (ifMatch) {
                t.conditions = ifMatch[1].split(/\s+and\s+/).map(parseConditionClause).filter(Boolean);
                const thenPos = ifMatch.index + ifMatch[0].length;
                const ifEndPos = findMatchingEnd(triggerBody, thenPos);
                effectiveBody = triggerBody.slice(thenPos, ifEndPos === -1 ? triggerBody.length : ifEndPos);
            }

            const parsed = parseBody(effectiveBody);
            t.dialog = (parsed.dialog.title || parsed.dialog.lines.length) ? parsed.dialog : { title: '', lines: [''] };
            t.actions = parsed.actions;
            t.selectOptions = parsed.selectOptions;

            state.triggers.push(t);
            whenOpenRe.lastIndex = triggerBodyEnd === -1 ? body.length : triggerBodyEnd + 3; // skip past this trigger's "end"
        }

        if (!state.triggers.length) state.triggers.push(createDefaultTrigger());
        data.states.push(state);
        stateOpenRe.lastIndex = bodyEnd === -1 ? text.length : bodyEnd + 3; // skip past this state's "end"
    }

    if (!data.states.length) data.states.push({ name: 'start', triggers: [createDefaultTrigger()] });
    return data;
}
