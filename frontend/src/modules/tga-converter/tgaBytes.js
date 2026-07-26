/**
 * Pure TGA byte-encoding math, extracted out of createImageTGA() in
 * TgaConverter.vue. Everything canvas/Image-related stays in the .vue
 * component; this only does the part that's actually pure data
 * transformation - given already-decoded top-down RGBA pixel data (e.g.
 * from ctx.getImageData().data), builds the uncompressed 32-bit TGA byte
 * layout Metin2 expects for item/icon textures: an 18-byte header
 * followed by bottom-up, BGRA-ordered pixel data.
 */
export function buildTgaBytes(width, height, rgbaData) {
    const header = new Uint8Array(18);
    header[2] = 2;
    header[12] = width & 0xFF;
    header[13] = (width >> 8) & 0xFF;
    header[14] = height & 0xFF;
    header[15] = (height >> 8) & 0xFF;
    header[16] = 32;
    header[17] = 8;

    const pixelCount = width * height;
    const tgaData = new Uint8Array(pixelCount * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const sourceY = height - 1 - y;
            const sourceIdx = (sourceY * width + x) * 4;
            const targetIdx = (y * width + x) * 4;

            tgaData[targetIdx + 0] = rgbaData[sourceIdx + 2]; // B
            tgaData[targetIdx + 1] = rgbaData[sourceIdx + 1]; // G
            tgaData[targetIdx + 2] = rgbaData[sourceIdx + 0]; // R
            tgaData[targetIdx + 3] = rgbaData[sourceIdx + 3]; // A
        }
    }

    return new Uint8Array([...header, ...tgaData]);
}
