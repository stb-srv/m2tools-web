import { describe, it, expect } from 'vitest';
import { parseShopText, stringifyShops } from './shopText';

describe('parseShopText', () => {
    it('parses a single shop with items', () => {
        const text = 'Weapon_Shop\n{\n\t50100\t100\n\t50101\t50\n}\n';
        expect(parseShopText(text)).toEqual([{
            id: 'Weapon_Shop',
            items: [{ vnum: '50100', count: '100' }, { vnum: '50101', count: '50' }]
        }]);
    });

    it('returns an empty array for empty/nullish input', () => {
        expect(parseShopText('')).toEqual([]);
        expect(parseShopText(null)).toEqual([]);
    });

    it('ignores comment lines starting with //', () => {
        const text = '// comment\nShop_A\n{\n\t1\t1\n}\n';
        expect(parseShopText(text)).toEqual([{ id: 'Shop_A', items: [{ vnum: '1', count: '1' }] }]);
    });

    it('parses multiple shops', () => {
        const text = 'A\n{\n\t1\t1\n}\n\nB\n{\n\t2\t2\n}\n';
        const shops = parseShopText(text);
        expect(shops).toHaveLength(2);
        expect(shops[0].id).toBe('A');
        expect(shops[1].id).toBe('B');
    });
});

describe('stringifyShops', () => {
    it('serializes a shop back to text', () => {
        const shops = [{ id: 'Weapon_Shop', items: [{ vnum: '50100', count: '100' }] }];
        expect(stringifyShops(shops)).toBe('Weapon_Shop\n{\n\t50100\t100\n}\n\n');
    });

    it('round-trips through parseShopText', () => {
        const original = [{ id: 'Shop_A', items: [{ vnum: '1', count: '2' }] }];
        expect(parseShopText(stringifyShops(original))).toEqual(original);
    });
});
