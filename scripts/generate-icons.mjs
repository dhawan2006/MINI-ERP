/**
 * scripts/generate-icons.mjs
 *
 * Generates Windows ICO file from build/icon.png.
 * The ICO contains all standard Windows icon sizes (16, 24, 32, 48, 64, 128, 256)
 * embedded as PNG data, which Windows Vista+ and electron-builder both support.
 *
 * Usage:
 *   node scripts/generate-icons.mjs
 *
 * Prerequisites:
 *   jimp is listed in devDependencies and available after `npm ci`.
 *
 * Output:
 *   build/icon.ico  — required by electron-builder for Windows NSIS installer
 */

import { Jimp } from 'jimp';
import { writeFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ROOT = new URL('..', import.meta.url).pathname;
const SRC_PNG = resolve(PROJECT_ROOT, 'build', 'icon.png');
const OUT_ICO = resolve(PROJECT_ROOT, 'build', 'icon.ico');

// Standard Windows icon sizes. 256 is stored as 0 in the ICO directory entry.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  // ── Validate source ──────────────────────────────────────────────────────
  if (!existsSync(SRC_PNG)) {
    console.error(`[generate-icons] ❌ Source PNG not found: ${SRC_PNG}`);
    process.exit(1);
  }

  const srcSize = statSync(SRC_PNG).size;
  console.log(`[generate-icons] Source PNG: ${SRC_PNG} (${srcSize} bytes)`);

  const src = await Jimp.read(SRC_PNG);
  if (src.width < 256 || src.height < 256) {
    console.warn(`[generate-icons] ⚠️  Source PNG is ${src.width}x${src.height}. Recommend at least 512x512 for crisp Windows icons.`);
  }

  // ── Render each size to PNG buffer ───────────────────────────────────────
  const pngBuffers = [];
  for (const size of ICO_SIZES) {
    const resized = src.clone().resize({ w: size, h: size });
    const buf = await resized.getBuffer('image/png');
    pngBuffers.push({ size, buf });
    console.log(`[generate-icons]   ${size}x${size} PNG → ${buf.length} bytes`);
  }

  // ── Assemble ICO binary ──────────────────────────────────────────────────
  // ICO format:
  //   ICONDIR        6 bytes  (reserved=0, type=1, count=N)
  //   ICONDIRENTRY   16 bytes each  (width, height, colorCount, reserved,
  //                                  planes, bitCount, bytesInRes, imageOffset)
  //   PNG data       N × variable
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  const tocSize = headerSize + numImages * entrySize;

  let totalSize = tocSize;
  for (const { buf } of pngBuffers) totalSize += buf.length;

  const ico = Buffer.alloc(totalSize);
  let offset = 0;

  // ICONDIR header
  ico.writeUInt16LE(0, offset); offset += 2;          // Reserved (must be 0)
  ico.writeUInt16LE(1, offset); offset += 2;          // Image type: 1 = ICO
  ico.writeUInt16LE(numImages, offset); offset += 2;  // Number of images

  // ICONDIRENTRY array
  let imageDataOffset = tocSize;
  for (const { size, buf } of pngBuffers) {
    // Width/height: 256 is stored as 0 per ICO spec
    const dim = size >= 256 ? 0 : size;
    ico.writeUInt8(dim, offset); offset++;             // Width
    ico.writeUInt8(dim, offset); offset++;             // Height
    ico.writeUInt8(0, offset); offset++;               // Color count (0 = >256)
    ico.writeUInt8(0, offset); offset++;               // Reserved
    ico.writeUInt16LE(1, offset); offset += 2;         // Color planes
    ico.writeUInt16LE(32, offset); offset += 2;        // Bits per pixel
    ico.writeUInt32LE(buf.length, offset); offset += 4; // Size of image data
    ico.writeUInt32LE(imageDataOffset, offset); offset += 4; // Offset to data
    imageDataOffset += buf.length;
  }

  // Image data
  for (const { buf } of pngBuffers) {
    buf.copy(ico, offset);
    offset += buf.length;
  }

  // ── Write output ─────────────────────────────────────────────────────────
  writeFileSync(OUT_ICO, ico);
  console.log(`[generate-icons] ✅ ICO written: ${OUT_ICO} (${ico.length} bytes)`);
}

main().catch((err) => {
  console.error('[generate-icons] ❌ Fatal error:', err.message || err);
  process.exit(1);
});
