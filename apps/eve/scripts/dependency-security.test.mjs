import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
const require = createRequire(import.meta.url);

test('IPv4-mapped proxy trust cannot make an arbitrary client trusted', () => {
  const proxyaddr = require('proxy-addr');
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/8')('198.51.100.1'), false);
  assert.equal(proxyaddr.compile('10.0.0.0/8')('10.1.2.3'), true);
  assert.equal(proxyaddr.compile('10.0.0.0/8')('198.51.100.1'), false);
});

test('public telemetry imports retain local redaction and stay network-off in test mode', async t => {
  let connections = 0;
  t.mock.method(net.Socket.prototype, 'connect', () => {
    connections += 1;
    throw new Error('Telemetry contract must not open a network connection');
  });
  const values = { NODE_ENV: 'test', RAINDROP_WRITE_KEY: 'synthetic-unused-key',
    RAINDROP_WORKSHOP: '1', RAINDROP_LOCAL_DEBUGGER: 'http://127.0.0.1:5899' };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, values);
    const client = await import('../agent/lib/raindrop-client.ts');
    const spans = await import('../agent/lib/raindrop-span-exporter.ts');
    const telemetry = await import('../agent/instrumentation/telemetry.ts');
    assert.equal(typeof client.RaindropTurnClient, 'function');
    assert.equal(typeof spans.RaindropSpanExporter, 'function');
    assert.equal(client.redactRaindropText('Contact fixture@example.invalid'), 'Contact <REDACTED EMAIL>');
    assert.equal(telemetry.raindrop, null);
    assert.equal(telemetry.raindropTraceExporter, null);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(connections, 0);
    const lock = JSON.parse(await readFile(new URL('../../../package-lock.json', import.meta.url), 'utf8'));
    for (const name of ['raindrop-ai', 'langsmith', '@langchain/core'])
      assert.equal(Object.keys(lock.packages).some(path => path.endsWith('node_modules/' + name)), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('removing the generator preserves the exact licensed stylesheet', async () => {
  const css = await readFile(new URL('../app/vendor/shadcn/tailwind.css', import.meta.url));
  assert.equal(createHash('sha256').update(css).digest('hex'), 'bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a');
  const license = await readFile(new URL('../app/vendor/shadcn/LICENSE.md', import.meta.url), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright/);
});

const root = new URL('../../../', import.meta.url);

test('sprintf mitigation rejects amplification before invoking argument callbacks', async () => {
  const { sprintf } = require('../../../patches/sprintf-js-1.1.3.js');
  let invoked = false;
  for (const format of ['%999999999999s', '%.999999999999s', '%.101f', '%.101e', '%.101g', '%.0g']) {
    assert.throws(() => sprintf(format, () => { invoked = true; return 1; }), /limit exceeded/);
  }
  assert.equal(invoked, false);
  assert.throws(() => sprintf('x'.repeat(1048577)), /format limit/);
  assert.throws(() => sprintf('%600000s%600000s', 'a', 'b'), /output limit/);
  assert.equal(sprintf('%+06d %.2f %s %%', 12, 1.25, 'ok'), '+00012 1.25 ok %');
  assert.equal(sprintf('%(name)s', { name: 'owner' }), 'owner');
});

test('installed node and browser sprintf entries match the reviewed patch', async () => {
  const manifest = JSON.parse(await readFile(new URL('patches/sprintf-js-1.1.3.json', root), 'utf8'));
  for (const file of manifest.files) {
    const bytes = await readFile(new URL(`node_modules/sprintf-js/${file.path}`, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.patchedSha256);
    const { sprintf } = require(`../../../node_modules/sprintf-js/${file.path}`);
    assert.throws(() => sprintf('%99999999999s', 'x'), /limit exceeded/);
    assert.equal(sprintf('%04d', 12), '0012');
  }
});

test('the actual just-bash printf consumer retains formatting and bounds malicious width', async () => {
  const { Bash } = await import('just-bash');
  const bash = new Bash();
  const zeroGeneral = await bash.exec("printf '%.0g' 1");
  assert.equal(zeroGeneral.exitCode, 0); // Shell printf normalizes zero general precision independently.
  assert.equal(zeroGeneral.stdout, '1');
  const normal = await bash.exec("printf '%04d %s' 12 ok");
  assert.equal(normal.exitCode, 0);
  assert.equal(normal.stdout, '0012 ok');
  for (const command of ["printf '%99999999999s' x", "printf '%.101f' 1"]) {
    const hostile = await bash.exec(command);
    assert.notEqual(hostile.exitCode, 0);
    assert.ok(hostile.stdout.length + hostile.stderr.length < 4096);
  }
});

test('all installed legacy UUID copies reject writes past the supplied output buffer', async () => {
  const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
  const copies = Object.entries(lock.packages).filter(([key, value]) => key.endsWith('node_modules/uuid') && value.version === '11.1.1');
  assert.ok(copies.length > 0);
  for (const [key] of copies) {
    const { v3, v5 } = require(new URL(`${key}/dist/cjs/index.js`, root).pathname);
    for (const generate of [v3, v5]) {
      assert.throws(() => generate('bounded', generate.DNS, new Uint8Array(15)), /bounds|length/i);
      assert.match(generate('bounded', generate.DNS), /^[0-9a-f-]{36}$/);
    }
  }
});

test('all affected OpenTelemetry copies bound untrusted inbound baggage', async () => {
  const { ROOT_CONTEXT, propagation, defaultTextMapGetter } = require('@opentelemetry/api');
  const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
  const copies = Object.entries(lock.packages).filter(([key]) => key.endsWith('node_modules/@opentelemetry/core'));
  assert.ok(copies.length > 0);
  for (const [key] of copies) {
    const { W3CBaggagePropagator } = require(new URL(`${key}/build/src/index.js`, root).pathname);
    const parser = new W3CBaggagePropagator();
    const header = Array.from({ length: 300 }, (_, i) => `key${i}=value`).join(',');
    const extracted = parser.extract(ROOT_CONTEXT, { baggage: header }, defaultTextMapGetter);
    assert.ok(propagation.getBaggage(extracted).getAllEntries().length <= 180);
    const oversized = parser.extract(ROOT_CONTEXT, { baggage: `key=${'x'.repeat(9000)}` }, defaultTextMapGetter);
    assert.equal(propagation.getBaggage(oversized), undefined);
    const normal = parser.extract(ROOT_CONTEXT, { baggage: 'owner=synthetic' }, defaultTextMapGetter);
    assert.equal(propagation.getBaggage(normal).getEntry('owner').value, 'synthetic');
  }
});

test('patch application is idempotent and rejects missing, drifted, or replaced identities', async () => {
  const { mkdtemp, mkdir, cp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const fixture = await mkdtemp(join(tmpdir(), 'myeve-security-patch-test-'));
  try {
    await mkdir(join(fixture, 'scripts/security'), { recursive: true });
    await cp(new URL('scripts/security/apply-dependency-patches.mjs', root), join(fixture, 'scripts/security/apply-dependency-patches.mjs'));
    await cp(new URL('patches', root), join(fixture, 'patches'), { recursive: true });
    await cp(new URL('node_modules/sprintf-js', root), join(fixture, 'node_modules/sprintf-js'), { recursive: true });
    await writeFile(join(fixture, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/sprintf-js': { version: '1.1.3' } } }));
    const run = (...args) => spawnSync(process.execPath, ['scripts/security/apply-dependency-patches.mjs', ...args], { cwd: fixture, encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(run('--check').status, 0);
    await writeFile(join(fixture, 'node_modules/sprintf-js/src/sprintf.js'), '// changed');
    assert.match(run().stderr, /Unexpected dependency bytes/);
    await rm(join(fixture, 'node_modules/sprintf-js/src/sprintf.js'));
    assert.notEqual(run('--check').status, 0);
    await writeFile(join(fixture, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/sprintf-js': { version: '1.1.4' } } }));
    assert.match(run().stderr, /identity changed/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test('Queue, telemetry CLI and shell resolve the exact reviewed matcher with equivalent CJS and ESM matching', async () => {
  const esm = await import('minimatch');
  const cases = [
    ['app/api/work/route.ts','app/api/**',true],
    ['app/api/work/route.ts','app/private/**',false],
    ['src/owner.test.ts','**/*.test.{ts,tsx}',true],
    ['src/owner.ts','**/*.test.{ts,tsx}',false],
    ['.git/config','**',false],
    ['src/a.ts','src/*.ts',true],
    ['src/a.js','src/*.ts',false],
  ];
  const lock=JSON.parse(await readFile(new URL('package-lock.json',root),'utf8'));
  for (const [parent,version] of [['@vercel/queue','0.7.0'],['braintrust','3.32.0'],['just-bash','3.4.2']]) {
    assert.equal(lock.packages['node_modules/'+parent].version,version,'Parent changes require renewed scoped compatibility review');
    const consumer = createRequire(require.resolve(parent));
    assert.equal(consumer('minimatch/package.json').version,'11.0.1',parent);
    const cjs = consumer('minimatch');
    for (const [path,pattern,expected] of cases) {
      assert.equal(cjs.minimatch(path,pattern),expected,`${parent}: ${path} ${pattern}`);
      assert.equal(esm.minimatch(path,pattern),expected,`ESM: ${path} ${pattern}`);
    }
  }
});

test('globparts amplification stays bounded when level-two optimization is explicitly enabled', async () => {
  const {spawnSync} = await import('node:child_process');
  const program = `import assert from 'node:assert/strict';import {Minimatch} from 'minimatch';
    const bounded=new Minimatch(Array(8).fill('**/../a/b').join('/'),{optimizationLevel:2,braceExpandMax:64});
    assert.equal(bounded.set.length,64);
    const small=new Minimatch('{entry,*}/{0..9}',{optimizationLevel:2});assert.equal(small.set.length,10);
    const large=new Minimatch('{entry,*}/{0..999}',{optimizationLevel:2});assert.equal(large.set.length,2000);
    assert.equal(large.match('entry/5'),true);assert.equal(large.match('other/999'),true);assert.equal(large.match('.hidden/5'),false);
    console.log('bounded');`;
  const result = spawnSync(process.execPath,['--max-old-space-size=128','--input-type=module','-e',program],{
    cwd:new URL('../../../',import.meta.url),encoding:'utf8',timeout:5000,killSignal:'SIGKILL',maxBuffer:16384,
    env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C'},
  });
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout.trim(),'bounded');
});

test('the actual shell keeps glob expansion, dotfile exclusion and no-match behavior', async () => {
  const {Bash}=await import('just-bash');const bash=new Bash();
  const setup=await bash.exec('mkdir -p src && touch src/a.ts src/b.js src/.hidden.ts');assert.equal(setup.exitCode,0);
  const types=await bash.exec('ls src/*.ts');assert.equal(types.exitCode,0);assert.match(types.stdout,/a\.ts/);assert.doesNotMatch(types.stdout,/b\.js|hidden/);
  const missing=await bash.exec('ls src/*.missing');assert.notEqual(missing.exitCode,0);assert.ok(missing.stdout.length+missing.stderr.length<4096);
});

test('ESM, CJS and browser Bash consumers preserve quoted glob behavior across directory boundaries', async () => {
  const variants=[['ESM',(await import('just-bash')).Bash],['CJS',require('just-bash').Bash],['browser',(await import('just-bash/browser')).Bash]];
  const cases=[
    ["ls 'src/*.ts'",'src/a.ts\n'],
    ["ls 'src/*.{ts,js}'",'src/a.ts\nsrc/b.js\n'],
    ["ls 'src/!(*.js)'",'src/a.ts\nsrc/sub\n'],
    ["ls 'src/**/*.ts'",'src/a.ts\nsrc/sub/nested.ts\n'],
    ["ls 'src2/*.ts'",'src2/out.ts\n'],
  ];
  for(const [name,Bash] of variants){
    const bash=new Bash();assert.equal((await bash.exec('mkdir -p src/sub src2 && touch src/a.ts src/b.js src/.hidden.ts src/sub/nested.ts src2/out.ts')).exitCode,0,name);
    for(const [command,expected]of cases){const r=await bash.exec(command);assert.equal(r.exitCode,0,`${name}: ${command}: ${r.stderr}`);assert.equal(r.stdout,expected,`${name}: ${command}`);}
    for(const command of ["ls 'src/.*.ts'","ls 'src/*.missing'"]){const r=await bash.exec(command);assert.notEqual(r.exitCode,0,name);assert.equal(r.stdout,'',name);assert.ok(r.stderr.length<4096);}
  }
});

test('the real Queue SDK keeps region, message, idempotency and retention with an offline transport', async t => {
  let connections=0;const requests=[],regions=[];
  t.mock.method(net.Socket.prototype,'connect',()=>{connections++;throw Error('offline Queue smoke cannot connect');});
  t.mock.method(globalThis,'fetch',async (url,init)=>{
    assert.equal(new URL(url).origin,'https://queue-fixture.invalid');
    requests.push({url:String(url),method:init.method,headers:new Headers(init.headers),body:JSON.parse(Buffer.from(init.body).toString())});
    return Response.json({messageId:'synthetic-message-1'},{status:201});
  });
  const {QueueClient}=await import('@vercel/queue');
  const queue=new QueueClient({region:'iad1',token:'synthetic-token-only',deploymentId:'dpl_synthetic',resolveBaseUrl:region=>{regions.push(region);return new URL('https://queue-fixture.invalid');}});
  const message={schemaVersion:1,commandId:'synthetic-command',tick:0};
  assert.deepEqual(await queue.send('synthetic-contract',message,{idempotencyKey:'synthetic-command:dpl_synthetic:0',retentionSeconds:60,delaySeconds:2}),{messageId:'synthetic-message-1'});
  assert.deepEqual(regions,['iad1']);assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');assert.deepEqual(requests[0].body,message);
  assert.equal(requests[0].headers.get('vqs-idempotency-key'),'synthetic-command:dpl_synthetic:0');assert.equal(requests[0].headers.get('vqs-retention-seconds'),'60');assert.equal(requests[0].headers.get('vqs-delay-seconds'),'2');assert.equal(requests[0].headers.get('vqs-deployment-id'),'dpl_synthetic');assert.equal(connections,0);
});

test('the real Braintrust SDK and exporter construct and shut down with network denied', async () => {
  const {spawnSync}=await import('node:child_process');
  const program=`import assert from 'node:assert/strict';import net from 'node:net';
    let connections=0,fetches=0;net.Socket.prototype.connect=function(){connections++;throw Error('network denied');};
    globalThis.fetch=async()=>{fetches++;throw Error('network denied');};
    const sdk=await import('braintrust');const {BraintrustExporter}=await import('@braintrust/otel');
    assert.equal(typeof sdk.initLogger,'function');
    const exporter=new BraintrustExporter({apiKey:'synthetic-never-send',apiUrl:'https://telemetry-fixture.invalid',parent:'project_name:synthetic',filterAISpans:true});
    await exporter.forceFlush();await exporter.shutdown();assert.equal(connections,0);assert.equal(fetches,0);console.log('offline-sdk-exporter');`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:new URL('../../../',import.meta.url),encoding:'utf8',timeout:10000,killSignal:'SIGKILL',maxBuffer:16384,env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C',NODE_ENV:'test'}});
  assert.equal(r.error,undefined,r.error?.message);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'offline-sdk-exporter');
});
