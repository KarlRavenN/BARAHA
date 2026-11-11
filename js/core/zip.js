// Minimal, zero-dependency ZIP reader and writer for browser and Node.js.
// Compliant with PKZip 2.0 (Stored / Method 0) with UTF-8 filename support.

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Creates a ZIP file Blob or Uint8Array.
 * @param {Array<{name: string, data: Uint8Array|ArrayBuffer|string|Blob}>} files
 * @returns {Promise<Blob>}
 */
export async function createZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const file of files) {
    let data;
    if (file.data instanceof Blob) {
      data = new Uint8Array(await file.data.arrayBuffer());
    } else if (file.data instanceof Uint8Array) {
      data = file.data;
    } else if (file.data instanceof ArrayBuffer) {
      data = new Uint8Array(file.data);
    } else if (typeof file.data === 'string') {
      data = encoder.encode(file.data);
    } else {
      data = new Uint8Array(0);
    }

    const nameBytes = encoder.encode(file.name.replace(/\\/g, '/'));
    const crc = crc32(data);
    const size = data.length;

    // Local file header (30 bytes + name)
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true);         // Version needed: 2.0
    lv.setUint16(6, 0x0800, true);     // Flags: UTF-8
    lv.setUint16(8, 0, true);          // Compression: 0 (Stored)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);      // Compressed size
    lv.setUint32(22, size, true);      // Uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);         // Extra field length
    local.set(nameBytes, 30);

    localHeaders.push(local, data);

    // Central directory header (46 bytes + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true);         // Version made by
    cv.setUint16(6, 20, true);         // Version needed
    cv.setUint16(8, 0x0800, true);     // Flags: UTF-8
    cv.setUint16(10, 0, true);         // Compression: 0
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);         // Extra field length
    cv.setUint16(32, 0, true);         // File comment length
    cv.setUint16(34, 0, true);         // Disk start
    cv.setUint16(36, 0, true);         // Internal attributes
    cv.setUint32(38, 0, true);         // External attributes
    cv.setUint32(42, offset, true);    // Relative offset of local header
    central.set(nameBytes, 46);

    centralHeaders.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalParts = [...localHeaders, ...centralHeaders, eocd];
  return new Blob(totalParts, { type: 'application/zip' });
}

/**
 * Extracts files from a ZIP Blob or ArrayBuffer.
 * @param {Blob|ArrayBuffer|Uint8Array} source
 * @returns {Promise<Array<{name: string, data: Uint8Array, text: () => string}>>}
 */
export async function readZip(source) {
  let buf;
  if (source instanceof Blob) {
    buf = new Uint8Array(await source.arrayBuffer());
  } else if (source instanceof ArrayBuffer) {
    buf = new Uint8Array(source);
  } else {
    buf = source;
  }

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const files = [];
  let pos = 0;

  while (pos < buf.length - 4) {
    const sig = view.getUint32(pos, true);
    if (sig === 0x04034b50) {
      // Local file header
      const compMethod = view.getUint16(pos + 8, true);
      const compSize = view.getUint32(pos + 18, true);
      const uncompSize = view.getUint32(pos + 22, true);
      const nameLen = view.getUint16(pos + 26, true);
      const extraLen = view.getUint16(pos + 28, true);
      const name = decoder.decode(buf.subarray(pos + 30, pos + 30 + nameLen));
      const dataOffset = pos + 30 + nameLen + extraLen;
      const data = buf.subarray(dataOffset, dataOffset + uncompSize);

      if (compMethod === 0) {
        // Stored
        files.push({
          name,
          data,
          text: () => decoder.decode(data),
        });
      } else {
        throw new Error(`Unsupported ZIP compression method: ${compMethod}. Expected Stored (0).`);
      }
      pos = dataOffset + compSize;
    } else if (sig === 0x02014b50 || sig === 0x06054b50) {
      break; // Reached central directory
    } else {
      pos++;
    }
  }

  return files;
}
