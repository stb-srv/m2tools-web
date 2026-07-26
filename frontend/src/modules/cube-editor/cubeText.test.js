import { describe, it, expect } from 'vitest';
import { parseCubeTxt, buildCubeTxt } from './cubeText';

describe('parseCubeTxt', () => {
    it('parses a single valid section', () => {
        const text = 'section\nnpc\t20017\nitem\t50100\t3\nreward\t50200\t1\ngold\t1000\npercent\t80\nend\n';
        const recipes = parseCubeTxt(text);
        expect(recipes).toEqual([{
            npc: 20017,
            items: [{ vnum: 50100, count: 3 }],
            reward: { vnum: 50200, count: 1 },
            gold: 1000,
            percent: 80
        }]);
    });

    it('parses multiple materials in one recipe', () => {
        const text = 'section\nnpc\t20017\nitem\t1\t2\nitem\t3\t4\nreward\t99\t1\nend\n';
        const recipes = parseCubeTxt(text);
        expect(recipes[0].items).toEqual([{ vnum: 1, count: 2 }, { vnum: 3, count: 4 }]);
    });

    it('skips blocks without an "end" marker', () => {
        const text = 'section\nnpc\t20017\nreward\t99\t1\n';
        expect(parseCubeTxt(text)).toEqual([]);
    });

    it('skips a block whose reward vnum is 0 (no reward line)', () => {
        const text = 'section\nnpc\t20017\nend\n';
        expect(parseCubeTxt(text)).toEqual([]);
    });

    it('parses multiple sections', () => {
        const text = 'section\nnpc\t1\nreward\t10\t1\nend\n\nsection\nnpc\t2\nreward\t20\t1\nend\n';
        const recipes = parseCubeTxt(text);
        expect(recipes).toHaveLength(2);
        expect(recipes[0].reward.vnum).toBe(10);
        expect(recipes[1].reward.vnum).toBe(20);
    });
});

describe('buildCubeTxt', () => {
    it('returns an empty string for no recipes', () => {
        expect(buildCubeTxt([])).toBe('');
    });

    it('generates a section block for a single recipe', () => {
        const recipes = [{
            npc: 20017,
            items: [{ vnum: 50100, count: 3 }],
            reward: { vnum: 50200, count: 1 },
            gold: 1000,
            percent: 80
        }];
        expect(buildCubeTxt(recipes)).toBe(
            'section\nnpc\t20017\nitem\t50100\t3\nreward\t50200\t1\ngold\t1000\npercent\t80\nend\n\n'
        );
    });

    it('round-trips through parseCubeTxt', () => {
        const original = [{
            npc: 5, items: [{ vnum: 1, count: 2 }], reward: { vnum: 99, count: 1 }, gold: 50, percent: 100
        }];
        const roundTripped = parseCubeTxt(buildCubeTxt(original));
        expect(roundTripped).toEqual(original);
    });
});
