import { posix } from "node:path";
import { inflateRawSync } from "node:zlib";

interface ZipLimits {
  entries: number;
  entryBytes: number;
  totalBytes: number;
  compressionRatio: number;
}

const INVALID_ZIP = "The archive ZIP structure is invalid or unsupported.";

/** Inspect raw names and declared bounds before JSZip deduplicates or inflates them.
 * Backup v1 uses ordinary, single-disk ZIPs with ASCII, case-sensitive paths.
 * ZIP64, encryption and alternate Unicode-path headers are not part of v1.
 */
export function assertOwnerArchiveZip(input: Uint8Array, limits: ZipLimits): void {
  const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const requireBytes = (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset + length > data.length) throw new Error(INVALID_ZIP);
  };
  let end = -1;
  for (let offset = data.length - 22; offset >= Math.max(0, data.length - 65557); offset--) {
    if (data.readUInt32LE(offset) === 0x06054b50 && offset + 22 + data.readUInt16LE(offset + 20) === data.length) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error(INVALID_ZIP);
  const count = data.readUInt16LE(end + 10);
  if (count > limits.entries) throw new Error("The archive contains too many entries.");
  const centralSize = data.readUInt32LE(end + 12), centralStart = data.readUInt32LE(end + 16);
  if (data.readUInt16LE(end + 4) !== 0 || data.readUInt16LE(end + 6) !== 0 || data.readUInt16LE(end + 8) !== count || centralStart + centralSize !== end) throw new Error(INVALID_ZIP);
  const seen = new Set<string>();
  const contents: Array<{ start: number; end: number; size: number; method: number }> = [];
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = centralStart, expanded = 0;
  function checkExtra(offset: number, length: number) {
    const stop = offset + length;
    requireBytes(offset, length);
    while (offset < stop) {
      if (offset + 4 > stop) throw new Error(INVALID_ZIP);
      const kind = data.readUInt16LE(offset), size = data.readUInt16LE(offset + 2);
      if (kind === 0x0001 || kind === 0x7075 || offset + 4 + size > stop) throw new Error(INVALID_ZIP);
      offset += 4 + size;
    }
  }
  for (let index = 0; index < count; index++) {
    requireBytes(cursor, 46);
    if (data.readUInt32LE(cursor) !== 0x02014b50) throw new Error(INVALID_ZIP);
    const flags = data.readUInt16LE(cursor + 8), method = data.readUInt16LE(cursor + 10);
    const compressed = data.readUInt32LE(cursor + 20), size = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28), extraLength = data.readUInt16LE(cursor + 30), commentLength = data.readUInt16LE(cursor + 32);
    const local = data.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    requireBytes(cursor, next - cursor);
    if (next > end || data.readUInt16LE(cursor + 34) !== 0 || (flags & ~0x808) !== 0 || ![0, 8].includes(method)) throw new Error(INVALID_ZIP);
    const nameBytes = data.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString("utf8");
    if (!name || !/^[A-Za-z0-9_./-]+$/.test(name) || name.startsWith("/")) throw new Error("Archive path is unsafe.");
    const normalized = posix.normalize(name).replace(/\/$/, "");
    if (seen.has(normalized)) throw new Error("The archive contains duplicate paths.");
    seen.add(normalized);
    if (name.split("/").some(segment => segment === "." || segment === "..") || name.includes("//")) throw new Error("Archive path is unsafe.");
    if (size > limits.entryBytes) throw new Error("Archive file is larger than the safe limit.");
    expanded += size;
    if (expanded > limits.totalBytes) throw new Error("The archive expands beyond the safe validation limit.");
    checkExtra(cursor + 46 + nameLength, extraLength);
    requireBytes(local, 30);
    if (local >= centralStart || data.readUInt32LE(local) !== 0x04034b50 || data.readUInt16LE(local + 6) !== flags || data.readUInt16LE(local + 8) !== method) throw new Error(INVALID_ZIP);
    const localNameLength = data.readUInt16LE(local + 26), localExtraLength = data.readUInt16LE(local + 28);
    requireBytes(local + 30, localNameLength + localExtraLength);
    if (!nameBytes.equals(data.subarray(local + 30, local + 30 + localNameLength))) throw new Error(INVALID_ZIP);
    checkExtra(local + 30 + localNameLength, localExtraLength);
    if (!(flags & 8) && (data.readUInt32LE(local + 18) !== compressed || data.readUInt32LE(local + 22) !== size || data.readUInt32LE(local + 14) !== data.readUInt32LE(cursor + 16))) throw new Error(INVALID_ZIP);
    const contentEnd = local + 30 + localNameLength + localExtraLength + compressed;
    if (contentEnd > centralStart) throw new Error(INVALID_ZIP);
    ranges.push({ start: local, end: contentEnd });
    contents.push({ start: contentEnd - compressed, end: contentEnd, size, method });
    cursor = next;
  }
  if (cursor !== end) throw new Error(INVALID_ZIP);
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) if (ranges[i].start < ranges[i - 1].end) throw new Error(INVALID_ZIP);
  if (expanded / Math.max(1, data.length) > limits.compressionRatio) throw new Error("The archive compression ratio exceeds the safe validation limit.");
  // Header sizes are attacker-controlled. Bound actual inflation before JSZip
  // performs CRC checks, including payloads with dishonest declared sizes.
  for (const entry of contents) {
    const compressed = data.subarray(entry.start, entry.end);
    let size: number;
    try { size = entry.method === 0 ? compressed.length : inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.size) }).length; }
    catch { throw new Error("The archive exceeds its declared expansion bounds or contains invalid compressed data."); }
    if (size !== entry.size) throw new Error(INVALID_ZIP);
  }
}
