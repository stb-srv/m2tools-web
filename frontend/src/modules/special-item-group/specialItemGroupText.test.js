import { describe, it, expect } from 'vitest';
import { parseSpecialItemGroup, buildSpecialItemGroupString, itemPercent } from './specialItemGroupText';

// parseSpecialItemGroup stamps `id: Date.now() + Math.random()` on every
// group/item, so results aren't byte-for-byte deterministic - strip `id`
// before asserting equality on everything else.
function withoutIds(groups) {
    return groups.map(({ id, items, ...g }) => ({
        ...g,
        items: items.map(({ id: itemId, ...it }) => it)
    }));
}

const fakeItemService = { getName: (vnum) => (vnum === 50100 ? 'Kleiner Heiltrank' : `Item ${vnum}`) };

describe('parseSpecialItemGroup', () => {
    it('parses a single group with one item', () => {
        const text = 'Group\tChest_A\n{\n\tVnum\t90000\n\tType\tNORMAL\n\t1\t50100\t1\t500\t# Kleiner Heiltrank\n}\n';
        const groups = withoutIds(parseSpecialItemGroup(text));
        expect(groups).toEqual([{
            name: 'Chest_A', vnum: 90000, type: 'NORMAL', comment: '',
            items: [{ vnum: 50100, count: 1, prob: 500, comment: 'Kleiner Heiltrank' }]
        }]);
    });

    it('ignores comment lines and blank lines', () => {
        const text = '# a comment\n\nGroup\tG1\n{\n\tVnum\t1\n\tType\tNORMAL\n}\n';
        const groups = withoutIds(parseSpecialItemGroup(text));
        expect(groups).toEqual([{ name: 'G1', vnum: 1, type: 'NORMAL', comment: '', items: [] }]);
    });

    it('parses multiple groups', () => {
        const text = 'Group\tA\n{\n\tVnum\t1\n}\n\nGroup\tB\n{\n\tVnum\t2\n}\n';
        const groups = parseSpecialItemGroup(text);
        expect(groups).toHaveLength(2);
        expect(groups[0].name).toBe('A');
        expect(groups[1].name).toBe('B');
    });

    it('ignores item lines with fewer than 4 fields', () => {
        const text = 'Group\tA\n{\n\t1\t50100\n}\n';
        const groups = parseSpecialItemGroup(text);
        expect(groups[0].items).toEqual([]);
    });
});

describe('buildSpecialItemGroupString', () => {
    it('returns an empty string for no groups', () => {
        expect(buildSpecialItemGroupString([], fakeItemService)).toBe('');
    });

    it('generates a group block with a vnum-named chest and one item', () => {
        const groups = [{
            name: 'Chest_A', vnum: 90000, type: 'NORMAL',
            items: [{ vnum: 50100, count: 1, prob: 500, comment: '' }]
        }];
        const output = buildSpecialItemGroupString(groups, fakeItemService);
        expect(output).toContain('Group\tChest_A');
        expect(output).toContain('Vnum\t90000\t# Item 90000');
        expect(output).toContain('1\t50100\t1\t500\t# Kleiner Heiltrank');
    });

    it('falls back to the item service name when no comment is set', () => {
        const groups = [{ name: 'G', vnum: 0, type: 'NORMAL', items: [{ vnum: 50100, count: 1, prob: 1, comment: '' }] }];
        const output = buildSpecialItemGroupString(groups, fakeItemService);
        expect(output).toContain('# Kleiner Heiltrank');
    });
});

describe('itemPercent', () => {
    it('computes the weighted percentage of an item within its group', () => {
        const group = { items: [{ prob: 10 }, { prob: 30 }] };
        expect(itemPercent(group, group.items[0])).toBe('25.0');
        expect(itemPercent(group, group.items[1])).toBe('75.0');
    });

    it('does not divide by zero when all weights are 0', () => {
        const group = { items: [{ prob: 0 }] };
        expect(itemPercent(group, group.items[0])).toBe('0.0');
    });
});
