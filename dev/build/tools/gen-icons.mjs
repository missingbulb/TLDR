// Generates placeholder extension icons (a white "T" on the accent blue) at the four required sizes,
// using only node's built-in zlib — no image dependency. Replace icons/ with real branding before
// a Chrome Web Store submission. Re-run with `node dev/build/tools/gen-icons.mjs`.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This tool lives in dev/build/tools/; the extension icons are extension/icons/.
const iconsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'extension', 'icons');
const BG = [37, 99, 235, 255]; // accent blue
const FG = [255, 255, 255, 255];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// A simple "T": a horizontal bar near the top and a vertical bar down the middle.
function isGlyph(x, y, size) {
  const m = Math.round(size * 0.2); // margin
  const barTop = Math.round(size * 0.28);
  const barThick = Math.max(1, Math.round(size * 0.13));
  const inTopBar = y >= barTop && y < barTop + barThick && x >= m && x < size - m;
  const stemX = Math.round(size / 2 - barThick / 2);
  const inStem = x >= stemX && x < stemX + barThick && y >= barTop && y < size - m;
  return inTopBar || inStem;
}

function pngFor(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = isGlyph(x, y, size) ? FG : BG;
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(iconsDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = resolve(iconsDir, `icon${size}.png`);
  writeFileSync(file, pngFor(size));
  console.log(`wrote ${file}`);
}
