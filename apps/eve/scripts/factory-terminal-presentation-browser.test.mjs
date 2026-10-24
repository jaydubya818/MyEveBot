import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// Explicitly opted in: this is a local, read-only presentation fixture, not an
// authenticated installed Golden Journey or permission to dispatch Work.
test('Factory terminal UI preserves decline, UNKNOWN and HOLD across browser reconnect', {
  skip: process.env.MYEVE_TERMINAL_BROWSER !== '1', timeout: 60_000,
}, async () => {
  const { chromium } = await import('@playwright/test');
  const { build } = await import('esbuild');
  const { factoryTerminalActivity } = await import('../lib/engineering/factory-preparation-terminal.ts');
  const require = createRequire(import.meta.url);
  const axePath = require.resolve('axe-core/axe.min.js');
  const directory = await mkdtemp(join(tmpdir(), 'factory-terminal-browser-'));
  const now = Date.now();
  const receipts = ['DEFINITELY_NOT_ADMITTED', 'ADMISSION_UNCERTAIN'].map(outcome => ({
    accounting: 'HOLD', receipt: {
      schema: 'factory-capability-preparation-terminal/v1', ownerId: 'fixture-owner',
      organizationId: 'fixture-org', installationId: 'fixture-installation', agentId: 'fixture-agent',
      clientId: 'fixture-client', backendId: 'fixture-backend', incarnation: 'fixture-incarnation',
      enrollmentVersion: 1, missionId: 'fixture-mission', factoryId: 'fixture-factory',
      factoryVersion: 'a'.repeat(64), sourceDigest: 'b'.repeat(64), configurationDigest: 'c'.repeat(64),
      requestId: 'fixture-request', workId: 'fixture-work', generation: 1,
      nativeRequestDigest: 'd'.repeat(64), planId: 'fixture-plan', planDigest: 'e'.repeat(64),
      receiverSequence: 3, receiverHeadDigest: 'f'.repeat(64), outcome,
      reasonCode: outcome === 'ADMISSION_UNCERTAIN' ? 'RESTORE_OR_COMMIT_AMBIGUITY' : 'NATIVE_REVALIDATION_FAILED',
      nativeOutcomeDigest: '1'.repeat(64), issuedAt: now, expiresAt: now + 30_000,
    },
  }));
  const persisted = JSON.stringify(receipts);
  const file = join(directory, 'receipts.json');
  await writeFile(file, persisted);
  let readbacks = 0, renderWork, firstRenderError;
  const server = createServer(async (request, response) => {
    try {
      if (!/^\/(declined|uncertain|generic|historical|limited|unresolved)$/.test(request.url ?? '')) { response.writeHead(404); response.end(); return; }
      const saved = JSON.parse(await readFile(file, 'utf8'));
      const terminal = saved[request.url === '/declined' ? 0 : 1];
      const historical=['/historical','/limited','/unresolved'].includes(request.url);
      const activity = historical?{status:'Working',activity:'Current Work is active.',nextStep:'Review current Work.'}:request.url === '/generic'
        ? { status: 'Needs reconciliation', activity: 'The current draft needs reconciliation.', nextStep: 'Review the current draft.' }
        : factoryTerminalActivity(terminal);
      const projection = {
        workId: 'fixture-work', workVersion: historical?2:1, workGeneration: historical?2:1, criteriaVersion: 1,
        title: 'Retained Factory request', objective: 'Review the retained terminal receipt.',
        lifecycle: 'active', control: request.headers['x-fixture-control'] ?? 'agent', attention: null, pendingDecisions: [],
        status: activity.status, activity: activity.activity, nextStep: activity.nextStep,
        verification: { status: 'NOT_RUN', candidateSha: null, evidenceCount: 0 },
        runTruth: { activeRun: null, latestRun: null, runHistory: [], writerSession: { recordedId: null, productive: false } },
        candidateHistory: [], completionStatus: 'NOT_CONFIRMED',
        completionBudget: { ceilingUsd: 0, heldUsd: null, remainingUsd: null },
        readiness: { ready: false, reasons: [activity.activity] },
        nativeRuntime:historical?{inflight:true}:undefined,
        factoryUnresolvedPreparations:request.url==='/unresolved'?[{requestId:'unresolved-request',generation:1,state:'UNRESOLVED',accounting:'UNRESOLVED'}]:[],
        factoryReservationHolds:historical&&request.url!=='/unresolved'?[{requestId:terminal.receipt.requestId,generation:1,state:terminal.receipt.outcome,accounting:'HOLD'}]:[],
        factoryReservationHistoryIncomplete:request.url==='/limited',
        factoryPreparation: historical||request.url === '/generic' ? null : { requestId: 'fixture-request', state: terminal.receipt.outcome, blocker: activity.activity },
      };
      readbacks++;
      const markup = renderWork(projection);
      response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" });
      response.end(`<!doctype html><html lang="en"><head><title>Factory terminal readback</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1>Retained Work</h1>${markup}</main></body></html>`);
    } catch (error) {
      firstRenderError ??= error;
      if (!response.headersSent) { response.writeHead(500); response.end(String(error)); }
      else if (!response.writableEnded) response.destroy();
    }
  });
  let browser;
  try {
    // The renderer, hooks, JSX runtimes and hoisted Next Link share app React.
    const bundle = await build({ stdin: { contents: `
      import {createElement} from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import {WorkSummary} from './components/owner/work-summary.tsx';
      import {WorkControls} from './components/owner/work-controls.tsx';
      export const renderWork = work => renderToStaticMarkup(createElement(WorkSummary,{work}))
        + renderToStaticMarkup(createElement(WorkControls,{work,onRefresh(){}}));`,
      resolveDir: join(import.meta.dirname, '..'), loader: 'tsx' },
      bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
      alias: { react: dirname(require.resolve('react/package.json')),
        'react-dom': dirname(require.resolve('react-dom/package.json')) },
      define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
    const renderer = join(directory, 'renderer.cjs');
    await writeFile(renderer, bundle.outputFiles[0].contents);
    ({ renderWork } = require(renderer));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ headless: true,
      ...(process.env.MYEVE_BROWSER_EXECUTABLE ? { executablePath: process.env.MYEVE_BROWSER_EXECUTABLE } : {}),
    });
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      for (const [path, expected] of [['declined', 'Not admitted'], ['uncertain', 'Outcome unconfirmed']]) {
        // A new context, then reload, reads the unchanged receipt from disk.
        const context = await browser.newContext({ viewport, extraHTTPHeaders: { 'x-fixture-control': viewport.width === 390 ? 'paused' : 'agent' } });
        const page = await context.newPage();
        const external = [];
        page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:')) external.push(request.url()); });
        await page.goto(`http://127.0.0.1:${server.address().port}/${path}`);
        for (let read = 0; read < 2; read++) {
          assert.equal(await page.locator('.owner-status').innerText(), expected);
          assert.equal(await page.getByText('Queued', { exact: true }).count(), 0);
          await page.getByText('View proof', { exact: true }).click();
          await page.getByText('Technical details', { exact: true }).click();
          assert.match(await page.locator('main').innerText(), /reservation stays held/);
          assert.equal(await page.getByRole('button', { name: /retry|dispatch|release|start|resume|pause/i }).count(), 0);
          assert.doesNotMatch(await page.locator('main').innerText(), /ask Sofie to continue|Verified candidate ready for review/);
          await page.addScriptTag({ path: axePath });
          const violations = await page.evaluate(async () => (await window.axe.run(document)).violations);
          assert.deepEqual(violations.map(value => ({ id: value.id, impact: value.impact })), []);
          if (read === 0) await page.reload();
        }
        assert.deepEqual(external, []);
        await context.close();
      }
    }
    for(const viewport of [{width:1280,height:800},{width:390,height:844}])for(const path of ['historical','limited','unresolved']){
      const context=await browser.newContext({viewport}),page=await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/${path}`);
      for(let read=0;read<2;read++){
        assert.equal(await page.locator('.owner-status').innerText(),'Working');
        assert.equal(await page.getByRole('button',{name:'Pause Work',exact:true}).count(),1);
        if(path==='unresolved'){
          assert.match(await page.getByRole('region',{name:'Work actions'}).innerText(),/Earlier Factory requests have unresolved admission or reservation evidence/);
          assert.doesNotMatch(await page.getByRole('region',{name:'Work actions'}).innerText(),/still hold their reservations|terminal receipt/);
        }else assert.match(await page.getByRole('region',{name:'Work actions'}).innerText(),/Earlier Factory requests still hold their reservations/);
        if(path==='limited')assert.match(await page.getByRole('region',{name:'Work actions'}).innerText(),/Some earlier reservation records need reconciliation/);
        await page.addScriptTag({path:axePath});assert.deepEqual((await page.evaluate(async()=>await window.axe.run(document))).violations,[]);
        if(read===0)await page.reload();
      }
      await context.close();
    }
    const generic = await browser.newPage();
    await generic.goto(`http://127.0.0.1:${server.address().port}/generic`);
    assert.equal(await generic.locator('.owner-status').innerText(), 'Outcome unconfirmed');
    assert.doesNotMatch(await generic.getByRole('region', { name: 'Work actions' }).innerText(), /terminal receipt|reservation remains held|retry this preparation/);
    await generic.close();
    assert.ifError(firstRenderError);
    assert.equal(readbacks, 21);
    assert.equal(await readFile(file, 'utf8'), persisted);
  } catch (error) {
    throw firstRenderError ?? error;
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
