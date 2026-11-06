#!/usr/bin/env node
// Mac side of the private verified preview upload (lib/qualification/hosted-preview.ts).
// Uploads ONE verified release (manifest + files) and its signed PASS verdict to hosted MyEve over HTTPS, authenticated with the
// installation's poller credential (0600 file, Mac only). No Blob credential is used or needed here: hosted MyEve writes its own
// private Blob store after re-verifying every byte. Nothing is public.
//
// usage: node hosted-preview-upload.mjs --origin https://<hosted-myeve> --credential-file <0600 file> --release-dir <releases/<hex>> --verdict-file <signed verdict json>
import { createHash } from "node:crypto";
import { readFileSync, statSync, lstatSync } from "node:fs";
import { join } from "node:path";

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (!["--origin", "--credential-file", "--release-dir", "--verdict-file"].includes(key) || typeof value !== "string") throw new Error("USAGE");
    out[key.slice(2)] = value;
  }
  for (const k of ["origin", "credential-file", "release-dir", "verdict-file"]) if (!out[k]) throw new Error("USAGE");
  const origin = new URL(out.origin);
  if (origin.protocol !== "https:" || origin.origin !== out.origin) throw new Error("HTTPS_ORIGIN_REQUIRED");
  return out;
}

export function readCredential(path) {
  const st = lstatSync(path);
  if (!st.isFile() || (st.mode & 0o077) !== 0) throw new Error("CREDENTIAL_FILE_MUST_BE_0600");
  const credential = readFileSync(path, "utf8").trim();
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(credential)) throw new Error("CREDENTIAL_FORMAT");
  return credential;
}

/** Local pre-check: every manifest file exists, is a plain file and matches its length and sha256 (the server checks again). */
export function readRelease(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  if (manifest?.schema !== "myeve.qdev-static-release/v1" || !Array.isArray(manifest.files)) throw new Error("MANIFEST");
  const files = manifest.files.map(f => {
    const path = join(dir, f.path);
    if (!lstatSync(path).isFile() || statSync(path).size !== f.bytes) throw new Error("FILE:" + f.path);
    const bytes = readFileSync(path);
    if (createHash("sha256").update(bytes).digest("hex") !== f.sha256) throw new Error("FILE_SHA256:" + f.path);
    return { path: f.path, bytes };
  });
  return { manifest, files };
}

export async function upload({ origin, credential, release, verdict, fetcher = fetch }) {
  const headers = { authorization: `Bearer ${credential}` };
  const call = async (method, path, body, contentType) => {
    const response = await fetcher(new URL(path, origin), { method, redirect: "error", headers: { ...headers, "content-type": contentType }, body, signal: AbortSignal.timeout(60_000) });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
  const begun = await call("POST", "/api/factory-mailbox/v1/previews", JSON.stringify({ schema: "myeve.hosted-preview-upload/v1", verdict, manifest: release.manifest }), "application/json");
  const missing = new Set(begun.missing);
  for (const file of release.files) {
    if (!missing.has(file.path)) continue;
    await call("PUT", `/api/factory-mailbox/v1/previews/${begun.artifactSha256}/files/${file.path.split("/").map(encodeURIComponent).join("/")}`, file.bytes, "application/octet-stream");
  }
  return call("POST", `/api/factory-mailbox/v1/previews/${begun.artifactSha256}/complete`, "{}", "application/json");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await upload({ origin: args.origin, credential: readCredential(args["credential-file"]), release: readRelease(args["release-dir"]),
      verdict: JSON.parse(readFileSync(args["verdict-file"], "utf8")) });
    console.log(JSON.stringify({ status: result.state, artifactSha256: result.artifactSha256, link: `/api/previews/v1/${result.artifactSha256}` }));
  } catch (error) { console.error(String(error?.message ?? error).slice(0, 300)); process.exit(1); }
}
