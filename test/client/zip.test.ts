import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "../../src/client/admin/zip";

const bytes = (s: string) => new TextEncoder().encode(s);

type Read = { name: string; flags: number; crc: number; data: Uint8Array };

function readZip(buf: ArrayBuffer): Read[] {
  const view = new DataView(buf);
  const end = buf.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: Read[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const nameLen = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, at + 46, nameLen));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    expect(view.getUint16(offset + 8, true), "stored, not deflated").toBe(0);
    const size = view.getUint32(offset + 18, true);
    const localNameLen = view.getUint16(offset + 26, true);
    out.push({
      name,
      flags: view.getUint16(offset + 6, true),
      crc: view.getUint32(offset + 14, true),
      data: new Uint8Array(buf, offset + 30 + localNameLen, size),
    });
    at += 46 + nameLen;
  }
  return out;
}

describe("zipStore", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes every file with its UTF-8 name, CRC and exact bytes", async () => {
    const modified = new Date(2026, 9, 31, 15, 42, 10);
    const files = [
      { name: "Åsa Ölund - 1 (replaced).jpg", data: bytes("first photo") },
      { name: "Kim - 1.jpg", data: new Uint8Array([0, 255, 1, 254]) },
    ];
    const zip = readZip(await zipStore(files.map((f) => ({ ...f, modified }))).arrayBuffer());
    expect(zip.map((f) => f.name)).toEqual(files.map((f) => f.name));
    for (const [i, f] of zip.entries()) {
      expect(f.flags & 0x0800, "UTF-8 name flag").toBe(0x0800);
      expect(f.crc).toBe(crc32(files[i]!.data));
      expect([...f.data]).toEqual([...files[i]!.data]);
    }
  });

  it("writes a valid empty archive", async () => {
    expect(readZip(await zipStore([]).arrayBuffer())).toEqual([]);
  });
});
