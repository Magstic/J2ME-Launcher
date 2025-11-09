// Local Header based entry extractor for ZIP/JAR
// Supports locating an entry by name and extracting its content using only LFH structures.
// Handles compression methods: store (0) and deflate (8).
// Attempts to handle Data Descriptor (flag bit 3) by locating its signature or inferring from next header.

const fs = require('fs-extra');
const zlib = require('zlib');

const SIG_LFH = 0x04034b50; // PK\x03\x04
const SIG_CDH = 0x02014b50; // PK\x01\x02 (central directory header)
const SIG_DD = 0x08074b50; // PK\x07\x08 (data descriptor)

function readU16(buf, off) {
  return buf.readUInt16LE(off);
}
function readU32(buf, off) {
  return buf.readUInt32LE(off);
}

function normalizeName(s) {
  return s.replace(/\\/g, '/');
}

function findNextHeaderPos(buf, from) {
  const nextLocal = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), from);
  const nextCentral = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), from);
  let next = -1;
  if (nextLocal !== -1) next = nextLocal;
  if (nextCentral !== -1) next = next === -1 ? nextCentral : Math.min(next, nextCentral);
  return next;
}

function findDataDescriptor(buf, dataStart) {
  const nextHeader = findNextHeaderPos(buf, dataStart + 1);
  const searchEnd = nextHeader !== -1 ? nextHeader : buf.length;
  const sigBuf = Buffer.from([0x50, 0x4b, 0x07, 0x08]);
  const ddPos = buf.indexOf(sigBuf, dataStart);
  if (ddPos !== -1 && ddPos < searchEnd) {
    const crc32 = readU32(buf, ddPos + 4);
    const compSize = readU32(buf, ddPos + 8);
    const uncompSize = readU32(buf, ddPos + 12);
    return { pos: ddPos, hasSignature: true, crc32, compSize, uncompSize };
  }
  // Signature-less DD: assume it's the 12 bytes right before next header
  if (nextHeader !== -1 && nextHeader - 12 >= dataStart) {
    try {
      const crc32 = readU32(buf, nextHeader - 12);
      const compSize = readU32(buf, nextHeader - 8);
      const uncompSize = readU32(buf, nextHeader - 4);
      return { pos: nextHeader - 12, hasSignature: false, crc32, compSize, uncompSize };
    } catch (_) {}
  }
  return null;
}

async function extractEntryFromLocalHeaders(jarPath, entryPath) {
  const targetNormUpper = normalizeName(entryPath).toUpperCase();
  const buf = await fs.readFile(jarPath);

  let pos = 0;
  const sigBuf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  while (true) {
    pos = buf.indexOf(sigBuf, pos);
    if (pos === -1) break;
    if (pos + 30 > buf.length) break;

    const gpbf = readU16(buf, pos + 6);
    const method = readU16(buf, pos + 8);
    const compSizeHeader = readU32(buf, pos + 18);
    const uncompSizeHeader = readU32(buf, pos + 22);
    const nameLen = readU16(buf, pos + 26);
    const extraLen = readU16(buf, pos + 28);
    const nameStart = pos + 30;
    if (nameStart + nameLen > buf.length) break;
    const nameBuf = buf.slice(nameStart, nameStart + nameLen);
    const nameUtf8 = normalizeName(nameBuf.toString('utf8'));
    const nameL1 = normalizeName(nameBuf.toString('latin1'));
    const dataStart = nameStart + nameLen + extraLen;

    if (nameUtf8.toUpperCase() === targetNormUpper || nameL1.toUpperCase() === targetNormUpper) {
      // Determine compressed data range
      let compSize = compSizeHeader;
      let dataEnd = null;
      if (compSizeHeader > 0) {
        dataEnd = dataStart + compSizeHeader;
      } else {
        // Use data descriptor
        const dd = findDataDescriptor(buf, dataStart);
        if (dd) {
          compSize = dd.compSize;
          dataEnd = dataStart + compSize;
        }
      }
      if (!dataEnd || dataEnd > buf.length) {
        // Fallback: limit to next header if present
        const nextHeader = findNextHeaderPos(buf, dataStart + 1);
        if (nextHeader !== -1) dataEnd = nextHeader;
      }
      if (!dataEnd || dataEnd > buf.length) return null;

      const compSlice = buf.slice(dataStart, dataEnd);
      if (method === 0) {
        // stored
        return Buffer.from(compSlice);
      } else if (method === 8) {
        // deflate
        try {
          // Prefer exact-size if available; otherwise try streaming inflate on the slice
          return await new Promise((resolve, reject) => {
            const inf = zlib.createInflateRaw();
            const chunks = [];
            inf.on('data', (c) => chunks.push(c));
            inf.on('end', () => resolve(Buffer.concat(chunks)));
            inf.on('error', reject);
            inf.end(compSlice);
          });
        } catch (_) {
          try {
            // Last resort: attempt inflate on the remainder of file (may include trailing bytes)
            return await new Promise((resolve, reject) => {
              const inf = zlib.createInflateRaw();
              const chunks = [];
              inf.on('data', (c) => chunks.push(c));
              inf.on('end', () => resolve(Buffer.concat(chunks)));
              inf.on('error', reject);
              inf.end(buf.slice(dataStart));
            });
          } catch (e2) {
            return null;
          }
        }
      } else {
        // Unsupported compression (e.g., deflate64, implode, shrink)
        return null;
      }
    }

    // Advance to next header region
    pos = nameStart + nameLen + extraLen + Math.max(0, compSizeHeader || 0);
    if (pos <= nameStart) pos = nameStart + 1;
  }

  return null;
}

module.exports = {
  extractEntryFromLocalHeaders,
};
