export type ZipEntry = { name: string; data: Uint8Array; modified: Date };

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const dosTime = (d: Date) => (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
const dosDate = (d: Date) => ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

const UTF8_NAMES = 0x0800;

function header(size: number, fields: [bytes: 2 | 4, value: number][]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const [bytes, value] of fields) {
    if (bytes === 2) view.setUint16(at, value, true);
    else view.setUint32(at, value, true);
    at += bytes;
  }
  return out;
}

/** An uncompressed (STORE) zip: photos are JPEGs already, so deflating them buys nothing. */
export function zipStore(entries: ZipEntry[]): Blob {
  const parts: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const time = dosTime(entry.modified);
    const date = dosDate(entry.modified);
    const local = header(30, [[4, 0x04034b50], [2, 20], [2, UTF8_NAMES], [2, 0], [2, time], [2, date], [4, crc], [4, size], [4, size], [2, name.length], [2, 0]]);
    parts.push(local, name, entry.data as Uint8Array<ArrayBuffer>);
    const record = header(46, [
      [4, 0x02014b50], [2, 20], [2, 20], [2, UTF8_NAMES], [2, 0], [2, time], [2, date], [4, crc], [4, size], [4, size],
      [2, name.length], [2, 0], [2, 0], [2, 0], [2, 0], [4, 0], [4, offset],
    ]);
    central.push(record, name);
    offset += local.length + name.length + size;
    centralSize += record.length + name.length;
  }
  const end = header(22, [[4, 0x06054b50], [2, 0], [2, 0], [2, entries.length], [2, entries.length], [4, centralSize], [4, offset], [2, 0]]);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
