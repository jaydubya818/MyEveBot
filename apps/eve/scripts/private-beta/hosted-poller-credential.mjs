#!/usr/bin/env node
// Creates ONE per-installation mailbox poller credential on the Mac (0600, exclusive create) and prints only its hash and the enrollment SQL.
// The credential never leaves the Mac; hosted MyEve stores only the sha256 (factory_mailbox_pollers). Running the SQL against the hosted
// database is a protected owner step and is not done here.
//
// usage: node hosted-poller-credential.mjs --installation <id> --owner <ownerId> --out <path>
import { createHash, randomBytes } from "node:crypto";
import { openSync, writeSync, closeSync, constants } from "node:fs";

export const credentialSha256 = credential => createHash("sha256").update("myeve.factory-mailbox.poller/v1\n" + credential).digest("hex");
const sqlText = value => "'" + String(value).replace(/'/g, "''") + "'";

export function enrollmentSql(installationId, ownerId, hash) {
  if (!/^[A-Za-z0-9._:@|-]{1,160}$/.test(installationId) || !/^[A-Za-z0-9._:@|-]{1,160}$/.test(ownerId) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("INPUT");
  return `INSERT INTO factory_mailbox_pollers(installation_id, owner_id, credential_sha256) VALUES (${sqlText(installationId)}, ${sqlText(ownerId)}, ${sqlText(hash)});`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => (i % 2 ? pairs : [...pairs, [all[i].replace(/^--/, ""), all[i + 1]]]), []));
  if (!args.installation || !args.owner || !args.out) { console.error("usage: --installation <id> --owner <ownerId> --out <path>"); process.exit(2); }
  const credential = randomBytes(32).toString("base64url");
  const fd = openSync(args.out, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { writeSync(fd, credential + "\n"); } finally { closeSync(fd); }
  const hash = credentialSha256(credential);
  console.log(JSON.stringify({ credentialFile: args.out, credentialSha256: hash, enrollmentSql: enrollmentSql(args.installation, args.owner, hash) }));
}
