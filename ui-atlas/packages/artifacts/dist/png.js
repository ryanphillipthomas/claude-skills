import { UiAtlasError } from '@ui-atlas/protocol';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export function isPng(buffer) {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}
/**
 * Read width/height from a PNG IHDR chunk. Avoids pulling in an image library
 * just to record two numbers per capture.
 */
export function pngDimensions(buffer) {
    if (!isPng(buffer) || buffer.length < 24) {
        throw new UiAtlasError('capture.failed', 'screenshot bytes are not a valid PNG', {
            detail: { byteLength: buffer.length },
        });
    }
    if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
        throw new UiAtlasError('capture.failed', 'PNG is missing its IHDR chunk');
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width === 0 || height === 0) {
        throw new UiAtlasError('capture.failed', 'PNG reports a zero dimension', {
            detail: { width, height },
        });
    }
    return { width, height };
}
//# sourceMappingURL=png.js.map