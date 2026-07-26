import { describe, it, expect } from 'vitest';
import { luaEscape, buildWhenLine, buildActionString, buildConditionString, generateLuaCode, parseQuestCode } from './questLua';

describe('luaEscape', () => {
    it('escapes backslashes and double quotes', () => {
        expect(luaEscape('say "hi"\\path')).toBe('say \\"hi\\"\\\\path');
    });

    it('returns an empty string for null/undefined', () => {
        expect(luaEscape(null)).toBe('');
        expect(luaEscape(undefined)).toBe('');
    });
});

describe('buildWhenLine', () => {
    it('builds a click trigger', () => {
        expect(buildWhenLine({ type: 'click', npcVnum: 101 })).toBe('when 101.click');
    });

    it('builds a kill trigger from mobVnums', () => {
        expect(buildWhenLine({ type: 'kill', mobVnums: [{ vnum: 202, name: 'Wolf' }] })).toBe('when 202.kill');
    });

    it('falls back to the legacy single mobVnum when mobVnums is empty', () => {
        expect(buildWhenLine({ type: 'kill', mobVnum: 202, mobVnums: [] })).toBe('when 202.kill');
    });

    it('chains several monster VNUMs with "or"', () => {
        expect(buildWhenLine({ type: 'kill', mobVnums: [{ vnum: 101, name: 'A' }, { vnum: 102, name: 'B' }, { vnum: 103, name: 'C' }] }))
            .toBe('when 101.kill or 102.kill or 103.kill');
    });

    it('builds an NPC-scoped chat trigger and escapes its text', () => {
        expect(buildWhenLine({ type: 'chat', npcVnum: 9999, chatText: 'give "sword"' })).toBe('when 9999.chat."give \\"sword\\""');
    });

    it('falls back to a bare trigger type for unknown types', () => {
        expect(buildWhenLine({ type: 'something_new' })).toBe('when something_new');
    });
});

describe('buildActionString', () => {
    it('builds give_item with defaults when params are missing', () => {
        expect(buildActionString({ type: 'give_item', params: {} })).toBe('pc.give_item2(0, 1)');
    });

    it('builds give_item with explicit vnum/amount', () => {
        expect(buildActionString({ type: 'give_item', params: { vnum: 50100, amount: 3 } })).toBe('pc.give_item2(50100, 3)');
    });

    it('negates the amount for remove_gold', () => {
        expect(buildActionString({ type: 'remove_gold', params: { amount: 500 } })).toBe('pc.change_gold(-500)');
    });

    it('escapes flag names for set_flag', () => {
        expect(buildActionString({ type: 'set_flag', params: { flagName: 'my"flag', flagValue: 1 } })).toBe('pc.setqf("my\\"flag", 1)');
    });

    it('passes custom_lua code through verbatim', () => {
        expect(buildActionString({ type: 'custom_lua', params: { code: 'pc.chat("hi")' } })).toBe('pc.chat("hi")');
    });

    it('falls back to a comment for unknown action types', () => {
        expect(buildActionString({ type: 'unknown_action', params: {} })).toBe('-- unknown_action');
    });
});

describe('buildConditionString', () => {
    it('builds a level check with defaults', () => {
        expect(buildConditionString({ type: 'level_check', params: {} })).toBe('pc.get_level() >= 1');
    });

    it('builds a level check with an explicit operator/value', () => {
        expect(buildConditionString({ type: 'level_check', params: { operator: '<', value: 30 } })).toBe('pc.get_level() < 30');
    });

    it('builds an item check', () => {
        expect(buildConditionString({ type: 'item_check', params: { vnum: 123, operator: '>=', value: 2 } })).toBe('pc.count_item(123) >= 2');
    });

    it('defaults unknown condition types to true', () => {
        expect(buildConditionString({ type: 'unknown_check', params: {} })).toBe('true');
    });
});

describe('generateLuaCode', () => {
    it('generates a minimal quest with no triggers', () => {
        const code = generateLuaCode({ name: 'my_quest', states: [{ name: 'start', triggers: [] }] });
        expect(code).toBe('quest my_quest begin\n\tstate start begin\n\tend\nend\n');
    });

    it('generates a click trigger with dialog and a give_item action', () => {
        const questData = {
            name: 'test_quest',
            states: [{
                name: 'start',
                triggers: [{
                    type: 'click',
                    npcVnum: 101,
                    conditions: [],
                    dialog: { title: '', lines: ['Hello there'] },
                    actions: [{ type: 'give_item', params: { vnum: 50100, amount: 1 } }],
                    selectOptions: []
                }]
            }]
        };
        const code = generateLuaCode(questData);
        expect(code).toContain('quest test_quest begin');
        expect(code).toContain('when 101.click begin');
        expect(code).toContain('say("Hello there")');
        expect(code).toContain('pc.give_item2(50100, 1)');
    });

    it('wraps actions in an if-block when conditions are present', () => {
        const questData = {
            name: 'q',
            states: [{
                name: 'start',
                triggers: [{
                    type: 'login',
                    conditions: [{ type: 'level_check', params: { operator: '>=', value: 10 } }],
                    dialog: null,
                    actions: [{ type: 'give_gold', params: { amount: 100 } }],
                    selectOptions: []
                }]
            }]
        };
        const code = generateLuaCode(questData);
        expect(code).toContain('if pc.get_level() >= 10 then');
        expect(code).toContain('pc.change_gold(100)');
    });

    it('generates select branching for multiple options', () => {
        const questData = {
            name: 'q',
            states: [{
                name: 'start',
                triggers: [{
                    type: 'button',
                    conditions: [],
                    dialog: null,
                    actions: [],
                    selectOptions: [
                        { text: 'Yes', actions: [{ type: 'give_gold', params: { amount: 10 } }] },
                        { text: 'No', actions: [] }
                    ]
                }]
            }]
        };
        const code = generateLuaCode(questData);
        expect(code).toContain('local s = select("Yes", "No")');
        expect(code).toContain('if s == 1 then');
        expect(code).toContain('elseif s == 2 then');
    });

    it('skips triggers with no type', () => {
        const questData = { name: 'q', states: [{ name: 'start', triggers: [{ type: '' }] }] };
        const code = generateLuaCode(questData);
        expect(code).toBe('quest q begin\n\tstate start begin\n\tend\nend\n');
    });
});

describe('parseQuestCode', () => {
    it('recovers the quest name and a bare state/trigger with no body', () => {
        const code = 'quest my_quest begin\n\tstate start begin\n\tend\nend\n';
        const data = parseQuestCode(code);
        expect(data.name).toBe('my_quest');
        expect(data.states).toHaveLength(1);
        expect(data.states[0].name).toBe('start');
    });

    it('round-trips a click trigger with dialog and a give_item action', () => {
        const original = {
            name: 'test_quest',
            states: [{
                name: 'start',
                triggers: [{
                    type: 'click', npcVnum: 101,
                    conditions: [],
                    dialog: { title: 'Titel', lines: ['Hello there'] },
                    actions: [{ type: 'give_item', params: { vnum: 50100, amount: 3 } }],
                    selectOptions: []
                }]
            }]
        };
        const parsed = parseQuestCode(generateLuaCode(original));
        const t = parsed.states[0].triggers[0];
        expect(t.type).toBe('click');
        expect(t.npcVnum).toBe(101);
        expect(t.dialog.title).toBe('Titel');
        expect(t.dialog.lines).toEqual(['Hello there']);
        expect(t.actions).toEqual([{ id: expect.any(Number), type: 'give_item', params: { vnum: 50100, amount: 3 } }]);
    });

    it('does not stop at the first nested "end" when a trigger has conditions (regression)', () => {
        const original = {
            name: 'q',
            states: [{
                name: 'start',
                triggers: [{
                    type: 'login',
                    conditions: [{ type: 'level_check', params: { operator: '>=', value: 10 } }],
                    dialog: null,
                    actions: [{ type: 'give_gold', params: { amount: 100 } }],
                    selectOptions: []
                }, {
                    type: 'levelup',
                    conditions: [],
                    dialog: { title: '', lines: ['second trigger survived'] },
                    actions: [],
                    selectOptions: []
                }]
            }]
        };
        const parsed = parseQuestCode(generateLuaCode(original));
        const triggers = parsed.states[0].triggers;
        expect(triggers).toHaveLength(2);
        expect(triggers[0].conditions).toEqual([{ id: expect.any(Number), type: 'level_check', params: { operator: '>=', value: 10 } }]);
        expect(triggers[0].actions).toEqual([{ id: expect.any(Number), type: 'give_gold', params: { amount: 100 } }]);
        expect(triggers[1].type).toBe('levelup');
        expect(triggers[1].dialog.lines).toEqual(['second trigger survived']);
    });

    it('round-trips select() branching with per-option actions', () => {
        const original = {
            name: 'q',
            states: [{
                name: 'start',
                triggers: [{
                    type: 'button',
                    conditions: [],
                    dialog: null,
                    actions: [],
                    selectOptions: [
                        { text: 'Yes', actions: [{ type: 'give_gold', params: { amount: 10 } }] },
                        { text: 'No', actions: [{ type: 'notice', params: { message: 'Schade!' } }] }
                    ]
                }]
            }]
        };
        const parsed = parseQuestCode(generateLuaCode(original));
        const opts = parsed.states[0].triggers[0].selectOptions;
        expect(opts).toHaveLength(2);
        expect(opts[0].text).toBe('Yes');
        expect(opts[0].actions).toEqual([{ id: expect.any(Number), type: 'give_gold', params: { amount: 10 } }]);
        expect(opts[1].text).toBe('No');
        expect(opts[1].actions).toEqual([{ id: expect.any(Number), type: 'notice', params: { message: 'Schade!' } }]);
    });

    it('round-trips a multi-line custom_lua action containing its own if/end block', () => {
        const rawCode = 'if pc.getqf("hunde_kills") >= 10 then\n    notice("Fertig!")\n    set_state("belohnung")\nend';
        const original = {
            name: 'q',
            states: [{
                name: 'jagd',
                triggers: [{
                    type: 'kill', mobVnums: [{ vnum: 101, name: 'Wildhund' }],
                    conditions: [],
                    dialog: null,
                    actions: [
                        { type: 'inc_flag', params: { flagName: 'hunde_kills' } },
                        { type: 'custom_lua', params: { code: rawCode } }
                    ],
                    selectOptions: []
                }]
            }]
        };
        const generated = generateLuaCode(original);
        const parsed = parseQuestCode(generated);
        const actions = parsed.states[0].triggers[0].actions;
        expect(actions[0]).toEqual({ id: expect.any(Number), type: 'inc_flag', params: { flagName: 'hunde_kills' } });
        expect(actions[1].type).toBe('custom_lua');
        expect(actions[1].params.code).toBe(rawCode);

        // A second generate/parse pass should be stable (idempotent).
        expect(generateLuaCode(parsed)).toBe(generated);
    });

    it('recovers multiple states and multiple triggers per state', () => {
        const code = [
            'quest multi begin',
            '\tstate start begin',
            '\t\twhen 20011.click begin',
            '\t\t\tsay("Hallo")',
            '\t\tend',
            '\t\twhen 101.kill begin',
            '\t\t\tnotice("gejagt")',
            '\t\tend',
            '\tend',
            '\tstate belohnung begin',
            '\t\twhen login begin',
            '\t\tend',
            '\tend',
            'end',
            ''
        ].join('\n');
        const data = parseQuestCode(code);
        expect(data.states.map(s => s.name)).toEqual(['start', 'belohnung']);
        expect(data.states[0].triggers.map(t => t.type)).toEqual(['click', 'kill']);
        expect(data.states[0].triggers[1].mobVnums).toEqual([{ vnum: 101, name: '' }]);
        expect(data.states[1].triggers[0].type).toBe('login');
    });

    it('round-trips a kill trigger with several monster VNUMs chained by "or"', () => {
        const original = {
            name: 'q',
            states: [{
                name: 'jagd',
                triggers: [{
                    type: 'kill',
                    mobVnums: [{ vnum: 631, name: 'A' }, { vnum: 632, name: 'B' }, { vnum: 633, name: 'C' }],
                    conditions: [], dialog: null,
                    actions: [{ type: 'give_item', params: { vnum: 30220, amount: 1 } }],
                    selectOptions: []
                }]
            }]
        };
        const generated = generateLuaCode(original);
        expect(generated).toContain('when 631.kill or 632.kill or 633.kill begin');

        const parsed = parseQuestCode(generated);
        const t = parsed.states[0].triggers[0];
        expect(t.type).toBe('kill');
        expect(t.mobVnums).toEqual([{ vnum: 631, name: '' }, { vnum: 632, name: '' }, { vnum: 633, name: '' }]);
        expect(t.actions).toEqual([{ id: expect.any(Number), type: 'give_item', params: { vnum: 30220, amount: 1 } }]);
    });

    it('parses an NPC-scoped chat trigger', () => {
        const code = 'quest q begin\n\tstate start begin\n\t\twhen 9999.chat."hilfe" begin\n\t\tend\n\tend\nend\n';
        const data = parseQuestCode(code);
        const t = data.states[0].triggers[0];
        expect(t.type).toBe('chat');
        expect(t.npcVnum).toBe(9999);
        expect(t.chatText).toBe('hilfe');
    });

    it('round-trips a letter trigger (no target)', () => {
        const original = {
            name: 'q',
            states: [{
                name: 'start',
                triggers: [{ type: 'letter', conditions: [], dialog: null, actions: [{ type: 'send_letter', params: { title: 'Hallo' } }], selectOptions: [] }]
            }]
        };
        const generated = generateLuaCode(original);
        expect(generated).toContain('when letter begin');
        const parsed = parseQuestCode(generated);
        expect(parsed.states[0].triggers[0].type).toBe('letter');
        expect(parsed.states[0].triggers[0].actions).toEqual([{ id: expect.any(Number), type: 'send_letter', params: { title: 'Hallo' } }]);
    });
});
