#!/usr/bin/env node
// Pricing-window guard for the pinned Factory source. Read-only: it parses the two pinned price constants out of the
// Factory checkout and FAILS when either window is expired or ends within --warn-days (default 3). It never edits a
// price, never extends a window and has no "allow expired" mode: renewal is a reviewed, owner-approved change
// (docs/ops/PRICING-RENEWAL.md).
//   node scripts/unified-beta/pricing-window-check.mjs [--root DIR] [--warn-days N] [--now ISO]
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PRICE_FILES = Object.freeze([
  'apps/cloud-control/src/production-model-provider.mjs',
  'apps/cloud-control/src/cloud-harness-plan.mjs',
]);

/** Extract {revision, validUntil} pairs from a price constant. Fails closed when the shape is not recognised. */
export function extractWindow(file, text) {
  const revision = /revision:\s*'([^']+)'/.exec(text)?.[1];
  const validUntil = /validUntil:\s*'(\d{4}-\d{2}-\d{2}T[\d:.]+Z)'/.exec(text)?.[1];
  if (!revision || !validUntil || !Number.isFinite(Date.parse(validUntil))) {
    throw new Error(`PRICE_WINDOW_UNPARSEABLE:${file}`);
  }
  return {file, revision, validUntil};
}

/** Pure evaluation. status: EXPIRED | EXPIRING | OK. */
export function evaluate(windows, {now = Date.now(), warnDays = 3} = {}) {
  if (!Number.isFinite(now) || !Number.isFinite(warnDays) || warnDays < 0) throw new Error('PRICE_WINDOW_ARGUMENTS');
  const rows = windows.map(w => {
    const end = Date.parse(w.validUntil);
    const msLeft = end - now;
    const status = msLeft <= 0 ? 'EXPIRED' : msLeft <= warnDays * 86400000 ? 'EXPIRING' : 'OK';
    return {...w, status, daysLeft: Math.floor(msLeft / 86400000)};
  });
  return {ok: rows.every(r => r.status === 'OK'), rows};
}

export function readWindows(root, read = p => readFileSync(p, 'utf8')) {
  return PRICE_FILES.map(file => extractWindow(file, read(join(root, file))));
}

function parseArgs(argv) {
  const out = {root: process.env.MYFACTORY_SOURCE_ROOT ?? '.qualification/myfactory', warnDays: 3, now: Date.now()};
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--root') out.root = value;
    else if (flag === '--warn-days') out.warnDays = Number(value);
    else if (flag === '--now') out.now = Date.parse(value);
    else throw new Error(`PRICE_WINDOW_ARGUMENTS:${flag}`);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = evaluate(readWindows(args.root), args);
    for (const r of result.rows) console.log(`${r.status}\t${r.revision}\tvalidUntil=${r.validUntil}\tdaysLeft=${r.daysLeft}\t${r.file}`);
    if (!result.ok) {
      console.error('PRICING WINDOW NOT HEALTHY: follow docs/ops/PRICING-RENEWAL.md (owner approval required; never extend or backdate).');
      process.exit(1);
    }
  } catch (error) {
    console.error(String(error?.message ?? error));
    process.exit(2);
  }
}
