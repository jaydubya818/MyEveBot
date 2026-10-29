import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

// Read-only reproduction from the actual serving source, without replacing any
// release files or sending a message to a tester/provider. The original tester
// transcript is the behavioral evidence for booking and verbosity; these checks
// reproduce the missing provider instructions and visible interface defects.
const app = resolve(import.meta.dirname, '../..'), root = resolve(app, '../..');
const output = resolve(process.argv[2] ?? 'output/playwright/beta-chat-reproduction');
await mkdir(output, { recursive: true });
const servingSource = '5895b129b61c22b1bd276c8ddcdedfd0048228da';
const original = file => execFileSync('git', ['show', `${servingSource}:apps/eve/${file}`], { cwd: root, encoding: 'utf8' });
const context = original('lib/external-alpha/context.ts'), chat = original('app/chat.tsx');
assert.ok(!context.includes("I can't book flights, make purchases, or charge cards in this beta."));
assert.ok(!context.includes('on every follow-up; do not merely acknowledge them'));
assert.ok(!chat.includes('BetaChatUsage'));
assert.ok(chat.includes('{agentId && !ownerConflict && ('));
const oldIntegrated = original('components/owner/integrated.tsx');
const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {IntegratedExperience} from './components/owner/integrated';import {DestinationGate} from './components/owner/destination-gate';createRoot(document.getElementById('root')).render(<DestinationGate hrefs={['/today','/chat','/work']}><IntegratedExperience view="today"/></DestinationGate>);`, resolveDir: app, loader: 'tsx' }, bundle: true, write: false, outdir: 'out', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, logLevel: 'silent', plugins: [{ name: 'serving-today-source', setup(plugin) {
  plugin.onLoad({ filter: /components\/owner\/integrated\.tsx$/ }, () => ({ contents: oldIntegrated, loader: 'tsx', resolveDir: resolve(app, 'components/owner') }));
} }] });
const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text;
const css = bundle.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '';
const server = createServer((req, res) => { res.setHeader('content-type', req.url === '/app.js' ? 'application/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html'); res.end(req.url === '/app.js' ? js : req.url === '/app.css' ? css : '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Serving Today reproduction</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); });
await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const reads = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname; reads.push(path);
    if(path === '/api/beta/work') return route.abort('failed');
    const body = path === '/api/work-inbox' ? { works: [], counts: {}, nextOffset: null, offset: 0 } : path === '/api/beta/goals' ? { goals: [], nextCursor: null } : path === '/api/beta/results' ? { results: [] } : { items: [], nextCursor: null };
    return route.fulfill({ json: body });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.getByText('Work: The connection could not be confirmed.', { exact: false })).toBeVisible();
  assert.ok(reads.includes('/api/work-inbox') && reads.includes('/api/beta/work'));
  await page.screenshot({ path: resolve(output, 'today-before.png'), fullPage: true });
  const receipt = { status: 'REPRODUCED', servingSource, today: 'Actual old Today component displays the reported warning while the canonical Work inbox succeeds.', missingBookingAndPreferenceRules: true, missingDailyTrialAndTurnDisplay: true, unexplainedChipCondition: 'Any agentId, including primary Sofie', modelBehaviorEvidence: 'Confirmed tester transcript; no new paid model call.' };
  await writeFile(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally { await browser?.close(); await new Promise(yes => server.close(yes)); }
