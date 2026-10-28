/**
 * @fileoverview Zero-dependency in-memory ZIP archive builder (PKZIP / OOXML compatible).
 * Used to construct Microsoft Word (.docx) files natively in the browser without external packages.
 */

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Computes standard CRC-32 checksum for a Uint8Array.
 * @param {Uint8Array} bytes
 */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a standard ZIP archive buffer from a list of { name, content } entries.
 * @param {Array<{ name: string, data: string | Uint8Array }>} entries
 * @returns {Uint8Array}
 */
export function buildZipArchive(entries) {
  const encoder = new TextEncoder();
  const fileRecords = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes =
      typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local File Header (30 bytes + nameBytes.length)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Signature
    lv.setUint16(4, 20, true); // Version needed (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Store method (0)
    lv.setUint16(10, 0, true); // Mod time
    lv.setUint16(12, 0x21, true); // Mod date
    lv.setUint32(14, crc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // Filename length
    lv.setUint16(28, 0, true); // Extra length
    localHeader.set(nameBytes, 30);

    fileRecords.push({
      nameBytes,
      dataBytes,
      crc,
      size,
      localHeader,
      localOffset: offset
    });

    offset += localHeader.length + size;
  }

  // Central Directory
  const centralHeaders = [];
  let centralSize = 0;

  for (const rec of fileRecords) {
    const cdHeader = new Uint8Array(46 + rec.nameBytes.length);
    const cv = new DataView(cdHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central file header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // Store method
    cv.setUint16(12, 0, true); // Mod time
    cv.setUint16(14, 0x21, true); // Mod date
    cv.setUint32(16, rec.crc, true); // CRC-32
    cv.setUint32(20, rec.size, true); // Compressed size
    cv.setUint32(24, rec.size, true); // Uncompressed size
    cv.setUint16(28, rec.nameBytes.length, true); // Filename length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk number
    cv.setUint16(36, 0, true); // Internal attrs
    cv.setUint32(38, 0, true); // External attrs
    cv.setUint32(42, rec.localOffset, true); // Relative offset of local header
    cdHeader.set(rec.nameBytes, 46);

    centralHeaders.push(cdHeader);
    centralSize += cdHeader.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Disk with central dir
  ev.setUint16(8, fileRecords.length, true); // Entries on this disk
  ev.setUint16(10, fileRecords.length, true); // Total entries
  ev.setUint32(12, centralSize, true); // Size of central directory
  ev.setUint32(16, offset, true); // Offset of central directory
  ev.setUint16(20, 0, true); // Comment length

  // Combine all buffers
  const totalLength = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalLength);
  let writePtr = 0;

  for (const rec of fileRecords) {
    output.set(rec.localHeader, writePtr);
    writePtr += rec.localHeader.length;
    output.set(rec.dataBytes, writePtr);
    writePtr += rec.dataBytes.length;
  }

  for (const cd of centralHeaders) {
    output.set(cd, writePtr);
    writePtr += cd.length;
  }

  output.set(eocd, writePtr);
  return output;
}
