const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

// Create a single-image ICO file that embeds a PNG (Vista+ supports PNG-compressed ICO entries)
// We resize to fit within 64x64 while keeping aspect ratio, then letterbox onto a 64x64 transparent canvas.
function makeIcoFromPngBuffer(pngBuffer) {
  // ICO header structures
  const ICONDIR_SIZE = 6; // reserved(2) + type(2) + count(2)
  const ICONDIRENTRY_SIZE = 16;

  const imageData = Buffer.from(pngBuffer);
  const width = 64; // 64x64 canvas
  const height = 64;

  const header = Buffer.alloc(ICONDIR_SIZE);
  // reserved
  header.writeUInt16LE(0, 0);
  // type 1 = icon
  header.writeUInt16LE(1, 2);
  // count
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(ICONDIRENTRY_SIZE);
  // width and height are 1 byte; 0 means 256
  entry.writeUInt8(width === 256 ? 0 : Math.min(width, 255), 0);
  entry.writeUInt8(height === 256 ? 0 : Math.min(height, 255), 1);
  // color count (0 if no palette)
  entry.writeUInt8(0, 2);
  // reserved
  entry.writeUInt8(0, 3);
  // planes
  entry.writeUInt16LE(1, 4);
  // bit count
  entry.writeUInt16LE(32, 6);
  // bytes in resource
  entry.writeUInt32LE(imageData.length, 8);
  // image offset (header + one entry)
  entry.writeUInt32LE(ICONDIR_SIZE + ICONDIRENTRY_SIZE, 12);

  return Buffer.concat([header, entry, imageData]);
}

async function writeIcoFromPng(pngPath, outIcoPath) {
  // Load original image
  let img = nativeImage.createFromPath(pngPath);
  if (img.isEmpty()) throw new Error('PNG not found or invalid: ' + pngPath);

  // Compute fit size to preserve aspect within 64x64
  const { width: srcW, height: srcH } = img.getSize();
  const MAX = 64;
  let fitW = MAX,
    fitH = MAX;
  if (srcW && srcH) {
    const scale = Math.min(MAX / srcW, MAX / srcH);
    fitW = Math.max(1, Math.round(srcW * scale));
    fitH = Math.max(1, Math.round(srcH * scale));
  }

  // High-quality resize to the fit size (no stretching beyond fit)
  const resized = img.resize({ width: fitW, height: fitH, quality: 'best' });

  // Letterbox: composite onto a transparent 64x64 BGRA buffer, centered
  const srcBmp = resized.toBitmap(); // BGRA for fitW x fitH
  const canvasW = MAX,
    canvasH = MAX;
  const dstBmp = Buffer.alloc(canvasW * canvasH * 4, 0); // fully transparent
  const offsetX = Math.floor((canvasW - fitW) / 2);
  const offsetY = Math.floor((canvasH - fitH) / 2);
  for (let y = 0; y < fitH; y++) {
    const srcRowStart = y * fitW * 4;
    const dstRowStart = ((y + offsetY) * canvasW + offsetX) * 4;
    srcBmp.copy(dstBmp, dstRowStart, srcRowStart, srcRowStart + fitW * 4);
  }

  const composed = nativeImage.createFromBitmap(dstBmp, { width: canvasW, height: canvasH });
  const pngBuf = composed.toPNG();
  const icoBuf = makeIcoFromPngBuffer(pngBuf);
  await fs.promises.mkdir(path.dirname(outIcoPath), { recursive: true });
  await fs.promises.writeFile(outIcoPath, icoBuf);
  return outIcoPath;
}

module.exports = { writeIcoFromPng };
