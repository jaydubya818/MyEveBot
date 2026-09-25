import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import JSZip from "jszip";

// A raw ZIP writer is necessary: JSZip's writer collapses duplicate names too.
export function rawArchive(entries: Array<{ name: string; content: Uint8Array }>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), content = Buffer.from(entry.content);
    const header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(crc32(content), 14); header.writeUInt32LE(content.length, 18); header.writeUInt32LE(content.length, 22); header.writeUInt16LE(name.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8);
    directory.writeUInt32LE(crc32(content), 16); directory.writeUInt32LE(content.length, 20); directory.writeUInt32LE(content.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, name, content); central.push(directory, name); offset += header.length + name.length + content.length;
  }
  const index = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, index, end]);
}

export async function duplicateArchive(archive: Uint8Array, path: string, alias = path): Promise<Buffer> {
  const zip = await JSZip.loadAsync(archive);
  const entries = await Promise.all(Object.values(zip.files).map(async file => ({ name: file.name, content: await file.async("uint8array") })));
  entries.push({ name: alias, content: await zip.file(path)!.async("uint8array") });
  return rawArchive(entries);
}

export async function changeArchiveJson(archive: Uint8Array, path: string, change: (value: Record<string, unknown>) => void): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(archive);
  const value = JSON.parse(await zip.file(path)!.async("string"));
  change(value);
  const content = JSON.stringify(value);
  zip.file(path, content);
  if (path !== "manifest.json") {
    const hash = (text: string) => createHash("sha256").update(text).digest("hex");
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    const checksums = JSON.parse(await zip.file("checksums.json")!.async("string"));
    checksums[path] = manifest.checksums[path] = hash(content);
    const index = JSON.stringify(checksums); zip.file("checksums.json", index);
    for (const entry of manifest.files) {
      const updated = entry.path === path ? content : entry.path === "checksums.json" ? index : null;
      if (updated !== null) { entry.bytes = Buffer.byteLength(updated); entry.sha256 = hash(updated); }
    }
    zip.file("manifest.json", JSON.stringify(manifest));
  }
  return zip.generateAsync({ type: "uint8array" });
}
