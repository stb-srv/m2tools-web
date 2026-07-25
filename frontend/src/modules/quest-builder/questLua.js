/* ── Lua code generation (ported ~verbatim from the original vanilla-JS quest_builder) ──────────── */

export function luaEscape(s) {
    return (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildWhenLine(t) {
    switch (t.type) {
        case 'click': return `when ${t.npcVnum || 0}.click`;
        case 'kill': return `when kill with npc.get_race() == ${t.mobVnum || 0}`;
        case 'login': return 'when login';
        case 'levelup': return 'when levelup';
        case 'use': return `when ${t.itemVnum || 0}.use`;
        case 'button': return 'when button';
        case 'chat': return `when letter with chat == "${luaEscape(t.chatText)}"`;
        case 'timer': return `when ${t.timerName || 'my_timer'}.timer`;
        case 'enter': return 'when enter';
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
