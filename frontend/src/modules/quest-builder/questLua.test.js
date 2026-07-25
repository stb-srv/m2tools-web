import { describe, it, expect } from 'vitest';
import { luaEscape, buildWhenLine, buildActionString, buildConditionString, generateLuaCode } from './questLua';

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

    it('builds a kill trigger keyed off mobVnum', () => {
        expect(buildWhenLine({ type: 'kill', mobVnum: 202 })).toBe('when kill with npc.get_race() == 202');
    });

    it('escapes the chat text of a chat trigger', () => {
        expect(buildWhenLine({ type: 'chat', chatText: 'give "sword"' })).toBe('when letter with chat == "give \\"sword\\""');
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
