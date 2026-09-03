import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCRC32Table();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(len, 0);

  const body = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(body);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, body, crcBuf]);
}

export function generateAsteamPNG(size = 256) {
  // Generate RGBA buffer
  // Background: Rounded squircle with ASteam Primary #006857 (0, 104, 87)
  // Accent badge: #D31245 (211, 18, 69)
  const width = size;
  const height = size;
  const rawBytes = Buffer.alloc((width * 4 + 1) * height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.42;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawBytes[offset++] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      
      // Superellipse / rounded rect distance
      const dist = Math.pow(dx / radius, 4) + Math.pow(dy / radius, 4);

      if (dist <= 1.0) {
        // Antialiasing edge
        const edge = Math.max(0, Math.min(1, (1.0 - dist) * 10));
        
        // Check if within "A" glyph region
        // We draw stylized "A" in white (255,255,255)
        const nx = (x - cx) / radius; // -1 to 1
        const ny = (y - cy) / radius; // -1 to 1

        let isGlyph = false;
        let isAccent = false;

        // Accent dot at top right
        const dotDist = Math.hypot(nx - 0.45, ny + 0.45);
        if (dotDist < 0.18) {
          isAccent = true;
        }

        // Letter "A" strokes
        const leftLeg = Math.abs(nx - (-0.45 + (ny + 0.6) * 0.45));
        const rightLeg = Math.abs(nx - (0.45 - (ny + 0.6) * 0.45));
        const crossBar = (ny > 0.05 && ny < 0.22 && Math.abs(nx) < 0.35);

        if (ny >= -0.65 && ny <= 0.6) {
          if (leftLeg < 0.13 || rightLeg < 0.13 || crossBar) {
            isGlyph = true;
          }
        }

        if (isAccent) {
          // #D31245 (Accent Brand Red)
          rawBytes[offset++] = 211;
          rawBytes[offset++] = 18;
          rawBytes[offset++] = 69;
          rawBytes[offset++] = Math.round(255 * edge);
        } else if (isGlyph) {
          // White
          rawBytes[offset++] = 255;
          rawBytes[offset++] = 255;
          rawBytes[offset++] = 255;
          rawBytes[offset++] = Math.round(255 * edge);
        } else {
          // #006857 (Primary Teal)
          rawBytes[offset++] = 0;
          rawBytes[offset++] = 104;
          rawBytes[offset++] = 87;
          rawBytes[offset++] = Math.round(255 * edge);
        }
      } else {
        // Transparent
        rawBytes[offset++] = 0;
        rawBytes[offset++] = 0;
        rawBytes[offset++] = 0;
        rawBytes[offset++] = 0;
      }
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Non-interlaced
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(rawBytes, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

export function generateICO(pngBuffer) {
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image

  // Icon Directory Entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256
  entry[1] = 0; // height 256
  entry[2] = 0; // color count
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuffer.length, 8); // image size
  entry.writeUInt32LE(22, 12); // offset (6 + 16)

  return Buffer.concat([header, entry, pngBuffer]);
}

async function main() {
  const buildDir = path.resolve('build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  const png256 = generateAsteamPNG(256);
  fs.writeFileSync(path.join(buildDir, 'icon.png'), png256);
  console.log('✓ Generated build/icon.png (256x256)');

  const ico = generateICO(png256);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
  console.log('✓ Generated build/icon.ico');
}

main();
