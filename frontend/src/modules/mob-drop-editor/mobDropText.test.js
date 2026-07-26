import { describe, it, expect } from 'vitest';
import { parseMobDropText, stringifyGroups, fixRawText } from './mobDropText';

describe('parseMobDropText', () => {
    it('parses a single group with items', () => {
        const text = 'Group\tMy_Group\n{\n\tMob\t8001\n\tType\tdrop\n\t1\t50100\t1\t500\n}\n';
        const groups = parseMobDropText(text);
        expect(groups).toEqual([{
            id: 'My_Group', mob: '8001', type: 'drop',
            lines: [{ vnum: '50100', count: '1', prob: '500' }]
        }]);
    });

    it('returns an empty array for empty/nullish input', () => {
        expect(parseMobDropText('')).toEqual([]);
        expect(parseMobDropText(null)).toEqual([]);
    });

    it('ignores comment lines starting with //', () => {
        const text = '// comment\nGroup\tG1\n{\n\tMob\t1\n\tType\tdrop\n}\n';
        expect(parseMobDropText(text)).toEqual([{ id: 'G1', mob: '1', type: 'drop', lines: [] }]);
    });

    it('parses multiple groups', () => {
        const text = 'Group\tA\n{\n\tMob\t1\n\tType\tdrop\n}\n\nGroup\tB\n{\n\tMob\t2\n\tType\tdrop\n}\n';
        const groups = parseMobDropText(text);
        expect(groups).toHaveLength(2);
        expect(groups[0].id).toBe('A');
        expect(groups[1].id).toBe('B');
    });
});

describe('stringifyGroups', () => {
    it('serializes a group back to text', () => {
        const groups = [{ id: 'My_Group', mob: '8001', type: 'drop', lines: [{ vnum: '50100', count: '1', prob: '500' }] }];
        expect(stringifyGroups(groups)).toBe('Group\tMy_Group\n{\n\tMob\t8001\n\tType\tdrop\n\t1\t50100\t1\t500\n}\n\n');
    });

    it('round-trips through parseMobDropText', () => {
        const original = [{ id: 'G1', mob: '5', type: 'drop', lines: [{ vnum: '1', count: '2', prob: '3' }] }];
        expect(parseMobDropText(stringifyGroups(original))).toEqual(original);
    });
});

describe('fixRawText', () => {
    it('replaces umlauts with ASCII transliteration in group names', () => {
        expect(fixRawText('Group\tKönig_Gruppe\n')).toBe('Group\tKoenig_Gruppe\n');
    });

    it('replaces spaces with underscores in group names', () => {
        expect(fixRawText('Group\tMy Group Name\n')).toBe('Group\tMy_Group_Name\n');
    });

    it('leaves non-Group lines untouched', () => {
        expect(fixRawText('Mob\t8001\nType\tdrop\n')).toBe('Mob\t8001\nType\tdrop\n');
    });

    it('returns an empty string for nullish input', () => {
        expect(fixRawText(null)).toBe('');
        expect(fixRawText(undefined)).toBe('');
    });
});
