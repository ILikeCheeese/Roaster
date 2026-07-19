// Generate GrandVault PWA icons with zero image dependencies (raw PNG via zlib).
// A deep-green rounded tile with a cream keyhole. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/icons');
mkdirSync(OUT, { recursive: true });

const BG = [11, 61, 46]; // brand green
const FG = [244, 241, 234]; // cream

function png(size) {
  const buf = Buffer.alloc(size * size * 4);
  const r = size * 0.18; // corner radius
  const cx = size / 2;
  const keyR = size * 0.13; // keyhole circle radius
  const keyCy = size * 0.42;
  const stemW = size * 0.09;
  const stemTop = keyCy;
  const stemBot = size * 0.68;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Rounded-rect mask for the tile.
      const inTile = insideRounded(x, y, size, r);
      let col = inTile ? BG : [0, 0, 0];
      let a = inTile ? 255 : 0;

      // Keyhole: circle + trapezoid stem, drawn in cream.
      const dc = Math.hypot(x - cx, y - keyCy);
      const inCircle = dc <= keyR;
      const inStem =
        y >= stemTop &&
        y <= stemBot &&
        Math.abs(x - cx) <= stemW * (0.5 + (y - stemTop) / (stemBot - stemTop));
      if (inTile && (inCircle || inStem)) {
        col = FG;
        a = 255;
      }
      buf[i] = col[0];
      buf[i + 1] = col[1];
      buf[i + 2] = col[2];
      buf[i + 3] = a;
    }
  }
  return encodePng(buf, size, size);
}

function insideRounded(x, y, size, r) {
  const minX = r, minY = r, maxX = size - r, maxY = size - r;
  if (x >= minX && x <= maxX) return y >= 0 && y < size;
  if (y >= minY && y <= maxY) return x >= 0 && x < size;
  const cxr = x < minX ? minX : maxX;
  const cyr = y < minY ? minY : maxY;
  return Math.hypot(x - cxr, y - cyr) <= r;
}

function encodePng(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // filter byte 0 per row
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

writeFileSync(path.join(OUT, 'icon-192.png'), png(192));
writeFileSync(path.join(OUT, 'icon-512.png'), png(512));
console.log('Wrote public/icons/icon-192.png and icon-512.png');

// Also emit a Windows .ico (PNG-compressed entries at 256/48/32) for the
// desktop shortcut. Consumed by scripts/pack-app.mjs.
function ico(sizes) {
  const images = sizes.map((s) => ({ size: s, data: png(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.size >= 256 ? 0 : img.size; // width (0 = 256)
    e[1] = img.size >= 256 ? 0 : img.size; // height
    e[2] = 0; // palette
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}
writeFileSync(path.join(OUT, 'grandvault.ico'), ico([256, 48, 32]));
console.log('Wrote public/icons/grandvault.ico');
