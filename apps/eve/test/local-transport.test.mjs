import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const transport = fileURLToPath(new URL('./browser/local-transport.cjs', import.meta.url));
const configured = 'postgresql://fixture@localhost:55473/blocker_fixes';
const probe = `
  const assert = require('node:assert/strict');
  const Module = require('node:module');
  const load = Module._load;
  let connections = 0;
  Module._load = function (name, ...args) {
    if (name === 'pg') return { Pool: class {
      async connect() {
        connections++;
        return { query: async () => ({ fields: [], rows: [], command: 'SELECT', rowCount: 0 }), release() {} };
      }
    } };
    return load.call(this, name, ...args);
  };
  require(process.argv[1]);
  (async () => {
    const request = () => fetch('http://localhost/sql', {
      method: 'POST', headers: { 'Neon-Connection-String': process.argv[2] },
      body: JSON.stringify({ query: 'SELECT 1', params: [] }),
    });
    if (process.argv[3] === 'allow') {
      assert.equal((await request()).status, 200);
      assert.equal(connections, 1);
    } else {
      await assert.rejects(request, /Non-isolated database denied/);
      assert.equal(connections, 0);
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
`;

for (const [name, connection, allowed] of [
  ['unchanged local database', configured, true],
  ['Neon application metadata', `${configured}?application_name=pkg%3Anpm%2Fneon`, true],
  ['another host', configured.replace('localhost', 'example.invalid'), false],
  ['another port', configured.replace('55473', '55474'), false],
  ['another database', configured.replace('blocker_fixes', 'postgres'), false],
  ['another owner credential', configured.replace('fixture@', 'other@'), false],
  ['connection options', `${configured}?options=unsafe`, false],
]) {
  test(`local transport ${allowed ? 'accepts' : 'rejects'} ${name}`, () => {
    const result = spawnSync(process.execPath, ['-e', probe, transport, connection, allowed ? 'allow' : 'deny'], {
      encoding: 'utf8', env: { PATH: process.env.PATH, MYEVE_TEST_DATABASE_URL: configured }, timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
  });
}
