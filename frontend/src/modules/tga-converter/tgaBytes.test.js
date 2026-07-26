import { describe, it, expect } from 'vitest';
import { buildTgaBytes } from './tgaBytes';

describe('buildTgaBytes', () => {
    it('writes an 18-byte header for an uncompressed 32-bit true-color image', () => {
        const rgba = new Uint8Array([10, 20, 30, 40]); // 1x1 pixel
        const result = buildTgaBytes(1, 1, rgba);
        const header = result.slice(0, 18);

        expect(header[2]).toBe(2);   // image type: uncompressed true-color
        expect(header[12]).toBe(1);  // width low byte
        expect(header[13]).toBe(0);  // width high byte
        expect(header[14]).toBe(1);  // height low byte
        expect(header[15]).toBe(0);  // height high byte
        expect(header[16]).toBe(32); // bits per pixel
        expect(header[17]).toBe(8);  // alpha channel bits
    });

    it('encodes a 1x1 pixel body in BGRA order (from RGBA input)', () => {
        const rgba = new Uint8Array([10, 20, 30, 40]); // R,G,B,A
        const result = buildTgaBytes(1, 1, rgba);
        const body = result.slice(18);
        expect(Array.from(body)).toEqual([30, 20, 10, 40]); // B,G,R,A
    });

    it('flips rows vertically (TGA bottom-up vs. canvas top-down)', () => {
        // 1px wide, 2px tall: row0 (top) = [1,2,3,4], row1 (bottom) = [5,6,7,8]
        const rgba = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const result = buildTgaBytes(1, 2, rgba);
        const body = result.slice(18);
        // Output row0 must be the source's LAST row (5,6,7,8 -> BGRA 7,6,5,8),
        // output row1 must be the source's FIRST row (1,2,3,4 -> BGRA 3,2,1,4).
        expect(Array.from(body)).toEqual([7, 6, 5, 8, 3, 2, 1, 4]);
    });

    it('produces header + pixelCount*4 bytes total', () => {
        const width = 3;
        const height = 2;
        const rgba = new Uint8Array(width * height * 4).fill(0);
        const result = buildTgaBytes(width, height, rgba);
        expect(result.length).toBe(18 + width * height * 4);
    });
});
