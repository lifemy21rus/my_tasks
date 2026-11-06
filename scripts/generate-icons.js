'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = 1024;
const BG = [37, 99, 235];
const FG = [255, 255, 255];

function insideRoundedRect(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function drawMaster() {
  const radius = SRC * 0.22;
  const stroke = SRC * 0.082;
  const p1 = [SRC * 0.255, SRC * 0.525];
  const p2 = [SRC * 0.425, SRC * 0.69];
  const p3 = [SRC * 0.745, SRC * 0.355];
  const buf = Buffer.alloc(SRC * SRC * 4);

  for (let y = 0; y < SRC; y += 1) {
    for (let x = 0; x < SRC; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (!insideRoundedRect(px, py, SRC, radius)) continue;

      const d1 = distToSegment(px, py, p1[0], p1[1], p2[0], p2[1]);
      const d2 = distToSegment(px, py, p2[0], p2[1], p3[0], p3[1]);
      const onCheck = Math.min(d1, d2) <= stroke / 2;
      const color = onCheck ? FG : BG;

      const i = (y * SRC + x) * 4;
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
      buf[i + 3] = 255;
    }
  }
  return buf;
}

function resizePremultiplied(src, srcSize, dstSize) {
  const factor = srcSize / dstSize;
  const out = Buffer.alloc(dstSize * dstSize * 4);

  for (let y = 0; y < dstSize; y += 1) {
    for (let x = 0; x < dstSize; x += 1) {
      const x0 = Math.floor(x * factor);
      const y0 = Math.floor(y * factor);
      const x1 = Math.min(srcSize, Math.floor((x + 1) * factor));
      const y1 = Math.min(srcSize, Math.floor((y + 1) * factor));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * srcSize + sx) * 4;
          const alpha = src[i + 3] / 255;
          r += src[i] * alpha;
          g += src[i + 1] * alpha;
          b += src[i + 2] * alpha;
          a += alpha;
          count += 1;
        }
      }

      const o = (y * dstSize + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((a / count) * 255);
    }
  }
  return out;
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function encodeIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, png]);
}

function main() {
  const root = path.resolve(__dirname, '..');
  const buildDir = path.join(root, 'build');
  const assetsDir = path.join(root, 'src', 'assets');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  const master = drawMaster();
  const icon256 = resizePremultiplied(master, SRC, 256);
  const icon32 = resizePremultiplied(master, SRC, 32);
  const icon16 = resizePremultiplied(master, SRC, 16);

  const png256 = encodePng(256, 256, icon256);
  const png32 = encodePng(32, 32, icon32);
  const png16 = encodePng(16, 16, icon16);
  const ico = encodeIco(png256, 256);

  fs.writeFileSync(path.join(assetsDir, 'icon.png'), png256);
  fs.writeFileSync(path.join(assetsDir, 'tray.png'), png32);
  fs.writeFileSync(path.join(assetsDir, 'tray-16.png'), png16);
  fs.writeFileSync(path.join(buildDir, 'icon.png'), png256);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);

  console.log('Иконки созданы: src/assets/icon.png, src/assets/tray.png, build/icon.ico');
}

main();
