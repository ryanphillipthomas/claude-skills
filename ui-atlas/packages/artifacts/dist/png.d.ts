export interface PngDimensions {
    width: number;
    height: number;
}
export declare function isPng(buffer: Buffer): boolean;
/**
 * Read width/height from a PNG IHDR chunk. Avoids pulling in an image library
 * just to record two numbers per capture.
 */
export declare function pngDimensions(buffer: Buffer): PngDimensions;
//# sourceMappingURL=png.d.ts.map