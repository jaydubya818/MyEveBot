import { createHash } from "node:crypto";

import JSZip from "jszip";
import { assertOwnerArchiveZip } from "./owner-archive-zip";

import { CURRENT_DATABASE_MIGRATION } from "@/lib/database-schema";
import {
  loadOwnerDataDomains,
  OWNER_DATA_DOMAINS,
  ownerDataDatabaseQuery,
  type OwnerDataCategory,
  type OwnerDataCompleteness,
  type OwnerDataPortability,
  type OwnerDataQuery,
  type OwnerDataRow,
} from "@/lib/owner-data-domains";

export { OWNER_DATA_DOMAINS } from "@/lib/owner-data-domains";
export type { OwnerDataCategory, OwnerDataCompleteness, OwnerDataDomain, OwnerDataPortability, OwnerDataScope } from "@/lib/owner-data-domains";

export const OWNER_ARCHIVE_FORMAT = "myeve-backup";
export const OWNER_ARCHIVE_VERSION = 1;
export const OWNER_ARCHIVE_MAX_BYTES = 25 * 1024 * 1024;
export const OWNER_ARCHIVE_MAX_ENTRIES = 64;
export const OWNER_ARCHIVE_MAX_ENTRY_BYTES = 10 * 1024 * 1024;
export const OWNER_ARCHIVE_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const OWNER_ARCHIVE_MAX_COMPRESSION_RATIO = 100;

export interface OwnerDataBundle {
  exportedAt: string;
  ownerFingerprint: string;
  categories: Record<string, OwnerDataCategory>;
}

export interface OwnerDataInventoryItem {
  id: string;
  name: string;
  description: string;
  restorable: boolean;
  deletable: boolean;
  sensitivity: "standard" | "sensitive";
  dependencies: string[];
  ownerScope: "owner_scoped" | "single_owner_legacy";
  completeness: OwnerDataCompleteness;
  portability: OwnerDataPortability;
  notes: string[];
  recordCount: number;
  approximateBytes: number;
}

interface ArchiveFileManifest { path: string; sha256: string; bytes: number; recordCount: number | null }
interface ArchiveDomainManifest {
  id: string;
  name: string;
  required: boolean;
  completeness: OwnerDataCompleteness;
  portability: OwnerDataPortability;
  recordCount: number;
  dependencies: string[];
  ownerScope?: "owner_scoped" | "single_owner_legacy";
  notes: string[];
}
interface OwnerArchiveManifest {
  format: typeof OWNER_ARCHIVE_FORMAT;
  version: typeof OWNER_ARCHIVE_VERSION;
  createdAt: string;
  verifiedAtCreation: true;
  sourceTemplateVersion: string;
  schemaVersion: string;
  domains: ArchiveDomainManifest[];
  checksums: Record<string, string>;
  files: ArchiveFileManifest[];
  exclusions: string[];
}

export interface OwnerArchiveValidation {
  valid: true;
  exportedAt: string;
  version: number;
  fileCount: number;
  recordCount: number;
  uncompressedBytes: number;
  domains: ArchiveDomainManifest[];
}

const EXCLUSIONS = [
  "Credentials and authentication tokens",
  "Web session and webhook secrets",
  "Provider authorization identifiers",
  "Browser cookies, passwords, and provider desktop credentials",
  "Live control leases, execution tokens, and provider sessions as reusable authority",
  "Internal blob and sandbox storage keys",
  "Referenced file contents not explicitly marked embedded",
];
// Shared by export and verification. Match credential concepts, not usage fields
// such as input_tokens or explanatory owner prose. No value-pattern scanner.
const FORBIDDEN_ARCHIVE_KEYS = /^(?:(?:access|refresh|auth|bearer|session|webhook|client|oauth|id|recovery|continuation)?tokens?|(?:client|webhook|session)?secrets?|passwords?|authorization|(?:vnc|provider|storage)?credentials?|(?:set|session)?cookies?|(?:api|access|private|storage)key|blob(?:url|path)|databaseurl|connectionstring)$/i;
const COMPLETENESS_VALUES = new Set<OwnerDataCompleteness>(["complete", "partial", "metadata_only", "referenced_only", "unavailable"]);
const PORTABILITY_VALUES = new Set<OwnerDataPortability>(["fully_restorable", "restorable_with_reconnection", "partially_restorable", "non_restorable", "reference_only", "unavailable"]);
const OWNER_SCOPE_VALUES = new Set(["owner_scoped", "single_owner_legacy"]);

function portableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item instanceof Date) return item.toISOString();
    return item;
  }, 2);
}
const bytes = (value: string): number => Buffer.byteLength(value, "utf8");
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const countRecords = (category: OwnerDataCategory): number => Object.values(category.records).reduce((total, rows) => total + rows.length, 0);

function assertNoSecretFields(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object") continue;
    for (const [key, item] of Object.entries(current)) {
      if (FORBIDDEN_ARCHIVE_KEYS.test(key.replace(/[-_\s]/g, ""))) {
        // Never include untrusted keys, paths, or values in errors/logs.
        throw new Error("Unsafe secret-bearing field in owner archive.");
      }
      if (item !== null && typeof item === "object") pending.push(item);
    }
  }
}

function parseArchiveJson(raw: string): unknown {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error("The archive contains invalid JSON."); }
  // JSON.parse collapses duplicate object keys. Inspect every JSON string
  // token that is a key as well, so a shadowed object cannot hide credentials.
  for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"/g)) {
    let next = match.index + match[0].length;
    while (/\s/.test(raw[next] ?? "") && next < raw.length) next++;
    if (raw[next] === ":") {
      assertNoSecretFields({ [JSON.parse(match[0]) as string]: null });
    }
  }
  assertNoSecretFields(value);
  return value;
}

function markdownValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return `\`${portableJson(value).replaceAll("\n", " ")}\``;
  return String(value).replaceAll("\n", " ");
}

function humanReadableCategory(name: string, category: OwnerDataCategory): string {
  const output = [
    `# ${name}`, "", category.description, "",
    `Completeness: ${category.completeness.replaceAll("_", " ")}`,
    `Portability: ${category.portability.replaceAll("_", " ")}`, "",
    ...category.notes.flatMap((note) => [`> ${note}`, ""]),
  ];
  for (const [recordType, records] of Object.entries(category.records)) {
    output.push(`## ${recordType.replace(/([A-Z])/g, " $1")}`, "");
    if (records.length === 0) {
      output.push("No records.", "");
      continue;
    }
    for (const [index, record] of records.entries()) {
      const heading = typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : `${recordType} ${index + 1}`;
      output.push(`### ${heading}`, "");
      for (const [key, value] of Object.entries(record)) output.push(`- **${key}:** ${markdownValue(value)}`);
      output.push("");
    }
  }
  return output.join("\n");
}

export async function collectOwnerData(ownerId: string, query: OwnerDataQuery = ownerDataDatabaseQuery, now = new Date()): Promise<OwnerDataBundle> {
  const categories = await loadOwnerDataDomains(ownerId, query);
  assertNoSecretFields(categories);
  return { exportedAt: now.toISOString(), ownerFingerprint: sha256(ownerId).slice(0, 16), categories };
}

export function ownerDataInventory(bundle: OwnerDataBundle): OwnerDataInventoryItem[] {
  return Object.entries(bundle.categories).map(([id, category]) => {
    const domain = OWNER_DATA_DOMAINS.find((candidate) => candidate.id === id);
    return {
      id,
      name: domain?.name ?? id,
      description: category.description,
      restorable: domain?.restorable ?? false,
      deletable: domain?.deletable ?? false,
      sensitivity: domain?.sensitivity ?? "standard",
      dependencies: domain?.dependencies ?? [],
      ownerScope: domain?.ownerScope ?? "owner_scoped",
      completeness: category.completeness,
      portability: category.portability,
      notes: category.notes,
      recordCount: countRecords(category),
      approximateBytes: bytes(portableJson(category)),
    };
  });
}

export async function createOwnerArchive(bundle: OwnerDataBundle): Promise<Buffer> {
  assertNoSecretFields(bundle.categories);
  const zip = new JSZip();
  const files: ArchiveFileManifest[] = [];
  const domains: ArchiveDomainManifest[] = [];
  const readme = [
    "# MyEve Backup", "", `Created: ${bundle.exportedAt}`,
    `Format: ${OWNER_ARCHIVE_FORMAT} v${OWNER_ARCHIVE_VERSION}`,
    "Verified at creation: yes", "",
    "This owner-neutral archive contains canonical MyEve records in machine-readable JSON and human-readable Markdown.",
    "The JSON files are canonical for a future restore; the Markdown files are for inspection.", "",
    "It does not contain passwords, API keys, OAuth tokens, webhook secrets, provider authorization identifiers, or internal storage keys.",
    "Files marked referenced or external are metadata only and are not backed up as binary content.",
    "Connected apps require owner reconnection. Restored schedules and webhooks must remain disabled until owner review.", "",
    "Browser Profiles require provider reconnection and grant reconciliation. Computer, control, and Approval records are non-restorable history and never confer authority.", "",
    "Use MyEve's Owner Data Center to verify checksums and compatibility before restore.",
    "Restore mutation is not enabled in this release.", "",
  ].join("\n");
  zip.file("README.md", readme);
  files.push({ path: "README.md", sha256: sha256(readme), bytes: bytes(readme), recordCount: null });

  for (const [id, category] of Object.entries(bundle.categories)) {
    const domain = OWNER_DATA_DOMAINS.find((candidate) => candidate.id === id);
    const recordCount = countRecords(category);
    domains.push({ id, name: domain?.name ?? id, required: domain?.required ?? false, completeness: category.completeness, portability: category.portability, recordCount, dependencies: domain?.dependencies ?? [], ownerScope: domain?.ownerScope ?? "owner_scoped", notes: category.notes });
    const path = `data/${id}.json`;
    const content = portableJson({ domain: id, completeness: category.completeness, portability: category.portability, notes: category.notes, records: category.records });
    zip.file(path, content);
    files.push({ path, sha256: sha256(content), bytes: bytes(content), recordCount });
    const humanPath = `human/${id}.md`;
    const human = humanReadableCategory(domain?.name ?? id, category);
    zip.file(humanPath, human);
    files.push({ path: humanPath, sha256: sha256(human), bytes: bytes(human), recordCount: null });
  }

  const checksums = Object.fromEntries(files.map((file) => [file.path, file.sha256]));
  const checksumContent = portableJson(checksums);
  zip.file("checksums.json", checksumContent);
  files.push({ path: "checksums.json", sha256: sha256(checksumContent), bytes: bytes(checksumContent), recordCount: null });
  const manifest: OwnerArchiveManifest = {
    format: OWNER_ARCHIVE_FORMAT,
    version: OWNER_ARCHIVE_VERSION,
    createdAt: bundle.exportedAt,
    verifiedAtCreation: true,
    sourceTemplateVersion: "myeve-v1",
    schemaVersion: CURRENT_DATABASE_MIGRATION.replace(/\.sql$/, ""),
    domains,
    checksums,
    files,
    exclusions: EXCLUSIONS,
  };
  zip.file("manifest.json", portableJson(manifest));
  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  await validateOwnerArchive(archive);
  return archive;
}

function parseManifest(raw: string): OwnerArchiveManifest {
  const parsed = parseArchiveJson(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("This is not a supported MyEve backup archive.");
  const value = parsed as Partial<OwnerArchiveManifest>;
  if (value.format !== OWNER_ARCHIVE_FORMAT) throw new Error("This is not a MyEve backup archive.");
  if (typeof value.version !== "number" || value.version > OWNER_ARCHIVE_VERSION) throw new Error(`This backup uses an unsupported format version; this MyEve supports up to version ${OWNER_ARCHIVE_VERSION}.`);
  if (value.version !== OWNER_ARCHIVE_VERSION || typeof value.createdAt !== "string" || value.verifiedAtCreation !== true || typeof value.schemaVersion !== "string" || !Array.isArray(value.domains) || value.checksums === null || typeof value.checksums !== "object" || !Array.isArray(value.files)) {
    throw new Error("This is not a supported MyEve backup archive.");
  }
  return value as OwnerArchiveManifest;
}

function archivePathIsUnsafe(name: string): boolean {
  return name.startsWith("/") || name.includes("\\") || name.split("/").some((segment) => segment === ".." || segment === ".");
}

export async function validateOwnerArchive(input: Uint8Array): Promise<OwnerArchiveValidation> {
  if (input.byteLength === 0) throw new Error("The selected archive is empty.");
  if (input.byteLength > OWNER_ARCHIVE_MAX_BYTES) throw new Error("The selected archive is larger than 25 MB.");
  assertOwnerArchiveZip(input, { entries: OWNER_ARCHIVE_MAX_ENTRIES, entryBytes: OWNER_ARCHIVE_MAX_ENTRY_BYTES, totalBytes: OWNER_ARCHIVE_MAX_UNCOMPRESSED_BYTES, compressionRatio: OWNER_ARCHIVE_MAX_COMPRESSION_RATIO });
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(input, { checkCRC32: true }); }
  catch { throw new Error("The archive ZIP structure or checksum is invalid."); }
  const entries = Object.values(zip.files);
  if (entries.length > OWNER_ARCHIVE_MAX_ENTRIES) throw new Error("The archive contains too many entries.");
  for (const entry of entries) {
    const original = (entry as JSZip.JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
    if (archivePathIsUnsafe(original)) throw new Error("Archive path is unsafe.");
  }
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("The archive manifest is missing.");
  const manifest = parseManifest(await manifestFile.async("string"));
  if (manifest.files.length === 0 || manifest.files.length > OWNER_ARCHIVE_MAX_ENTRIES) throw new Error("The archive file list is invalid.");

  let uncompressedBytes = 0;
  let recordCount = 0;
  const seen = new Set<string>();
  for (const expected of manifest.files) {
    if (!expected || typeof expected.path !== "string" || archivePathIsUnsafe(expected.path) || typeof expected.sha256 !== "string" || !Number.isSafeInteger(expected.bytes) || expected.bytes < 0 || expected.bytes > OWNER_ARCHIVE_MAX_ENTRY_BYTES || seen.has(expected.path)) throw new Error("The archive manifest contains an invalid file entry.");
    if (!expected.path.endsWith(".json") && !expected.path.endsWith(".md")) throw new Error("Archive file type is not allowed.");
    seen.add(expected.path);
    const file = zip.file(expected.path);
    if (!file) throw new Error("Archive file is missing.");
    const content = await file.async("uint8array");
    if (content.byteLength > OWNER_ARCHIVE_MAX_ENTRY_BYTES) throw new Error("Archive file is larger than the safe limit.");
    uncompressedBytes += content.byteLength;
    if (uncompressedBytes > OWNER_ARCHIVE_MAX_UNCOMPRESSED_BYTES) throw new Error("The archive expands beyond the safe validation limit.");
    if (content.byteLength !== expected.bytes || sha256(content) !== expected.sha256) throw new Error("Archive integrity check failed.");
    if (expected.path.endsWith(".json")) parseArchiveJson(Buffer.from(content).toString("utf8"));
    if (typeof expected.recordCount === "number") recordCount += expected.recordCount;
  }
  if (uncompressedBytes / Math.max(1, input.byteLength) > OWNER_ARCHIVE_MAX_COMPRESSION_RATIO) throw new Error("The archive compression ratio exceeds the safe validation limit.");
  const unexpected = entries.find((file) => !file.dir && file.name !== "manifest.json" && !seen.has(file.name));
  if (unexpected) throw new Error("Archive contains an unexpected file.");
  if (!seen.has("checksums.json")) throw new Error("The archive is missing checksum metadata.");
  const domainIds = new Set(manifest.domains.map((domain) => domain.id));
  if (
    domainIds.size !== manifest.domains.length ||
    manifest.domains.some((domain) =>
      !domain.id ||
      typeof domain.required !== "boolean" ||
      !COMPLETENESS_VALUES.has(domain.completeness) ||
      !PORTABILITY_VALUES.has(domain.portability) ||
      (domain.ownerScope !== undefined && !OWNER_SCOPE_VALUES.has(domain.ownerScope)) ||
      !seen.has(`data/${domain.id}.json`),
    )
  ) throw new Error("The archive domain manifest is invalid.");
  const missingRequired = OWNER_DATA_DOMAINS.filter((domain) => domain.required && !domainIds.has(domain.id));
  if (missingRequired.length > 0) throw new Error(`The archive is missing required domain data: ${missingRequired.map((domain) => domain.name).join(", ")}`);
  const checksumFile = zip.file("checksums.json");
  if (!checksumFile) throw new Error("The archive is missing checksum metadata.");
  const checksumDocument = parseArchiveJson(await checksumFile.async("string")) as Record<string, unknown>;
  const expectedChecksumPaths = manifest.files.filter((file) => file.path !== "checksums.json").map((file) => file.path).sort();
  if (
    Object.keys(checksumDocument).sort().join("\n") !== expectedChecksumPaths.join("\n") ||
    expectedChecksumPaths.some((path) => checksumDocument[path] !== manifest.checksums[path])
  ) throw new Error("The archive checksum index does not match the manifest.");

  return { valid: true, exportedAt: manifest.createdAt, version: manifest.version, fileCount: manifest.files.length, recordCount, uncompressedBytes, domains: manifest.domains };
}

export const OWNER_DATA_RETENTION = [
  { dataClass: "Conversations, Goals, Knowledge, Agents, Results, and routines", policy: "Kept until the owner deletes or archives them." },
  { dataClass: "Active memories", policy: "Kept until the owner uses Forget; forgotten memories are excluded from exports." },
  { dataClass: "Run and approval evidence", policy: "Kept as the durable audit trail for completed or failed work." },
  { dataClass: "Computer and control history", policy: "Kept as non-restorable operational evidence; provider credentials and live authority are never included." },
] as const;

export const OWNER_DATA_EXCLUSIONS = EXCLUSIONS;
export type { OwnerDataQuery, OwnerDataRow };
