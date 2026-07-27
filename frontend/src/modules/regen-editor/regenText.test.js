import { describe, it, expect } from 'vitest';
import { parseRegenText, stringifyGroups } from './regenText';

describe('parseRegenText', () => {
    it('parses a single group with spawn points', () => {
        const text = 'Group\tForest_A\n{\n\tVnum\t8001\n\t100\t200\t0\n}\n';
        const groups = parseRegenText(text);
        expect(groups).toEqual([{
            id: 'Forest_A', vnum: '8001',
            points: [{ x: '100', y: '200', direction: '0' }]
        }]);
    });

    it('returns an empty array for empty/nullish input', () => {
        expect(parseRegenText('')).toEqual([]);
        expect(parseRegenText(null)).toEqual([]);
    });

    it('ignores comment lines starting with //', () => {
        const text = '// comment\nGroup\tG1\n{\n\tVnum\t1\n}\n';
        expect(parseRegenText(text)).toEqual([{ id: 'G1', vnum: '1', points: [] }]);
    });

    it('parses multiple groups', () => {
        const text = 'Group\tA\n{\n\tVnum\t1\n}\n\nGroup\tB\n{\n\tVnum\t2\n}\n';
        const groups = parseRegenText(text);
        expect(groups).toHaveLength(2);
        expect(groups[0].id).toBe('A');
        expect(groups[1].id).toBe('B');
    });
});

describe('stringifyGroups', () => {
    it('serializes a group back to text', () => {
        const groups = [{ id: 'Forest_A', vnum: '8001', points: [{ x: '100', y: '200', direction: '0' }] }];
        expect(stringifyGroups(groups)).toBe('Group\tForest_A\n{\n\tVnum\t8001\n\t100\t200\t0\n}\n\n');
    });

    it('round-trips through parseRegenText', () => {
        const original = [{ id: 'G1', vnum: '5', points: [{ x: '1', y: '2', direction: '3' }] }];
        expect(parseRegenText(stringifyGroups(original))).toEqual(original);
    });
});
