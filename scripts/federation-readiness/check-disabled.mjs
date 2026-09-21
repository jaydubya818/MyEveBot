// Local negative probes only. Run from apps/eve with node --import tsx.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleOwnerRequest } from '../../apps/eve/lib/relay/owner-api.ts';
import { GET as artifactGet } from '../../apps/eve/app/api/relay/artifacts/[id]/route.ts';
import { relayOrigin } from '../../apps/eve/lib/relay/client.ts';

const original = process.env.MYEVE_RELAY_ENABLED;
const results = [];
try {
  for (const value of [undefined, '', 'false', 'TRUE', '1']) {
    if (value === undefined) delete process.env.MYEVE_RELAY_ENABLED;
    else process.env.MYEVE_RELAY_ENABLED = value;
    const get = await handleOwnerRequest(new Request('https://myeve.invalid/api/relay'));
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), { enabled: false });
    const post = await handleOwnerRequest(new Request('https://myeve.invalid/api/relay', { method: 'POST', body: '{invalid' }));
    assert.equal(post.status, 404);
    const artifact = await artifactGet(new Request('https://myeve.invalid/api/relay/artifacts/none'), { params: Promise.resolve({ id: 'none' }) });
    assert.equal(artifact.status, 404);
    assert.throws(() => relayOrigin(), /disabled/);
    const worker = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../../apps/eve/scripts/relay-worker.ts', import.meta.url)), '--once'], {
      env: { PATH: process.env.PATH, ...(value === undefined ? {} : { MYEVE_RELAY_ENABLED: value }) },
      encoding: 'utf8', timeout: 15000,
    });
    assert.ifError(worker.error);
    assert.notEqual(worker.status, 0);
    assert.match(worker.stderr, /Relay is disabled/);
    results.push({ flag: value ?? '(unset)', ownerGet: 'disabled', ownerPost: 404, artifactGet: 404, client: 'denied', worker: 'refused' });
  }
  console.log(JSON.stringify({ scope: 'local merged source; no deployed configuration attestation', results }, null, 2));
} finally {
  if (original === undefined) delete process.env.MYEVE_RELAY_ENABLED;
  else process.env.MYEVE_RELAY_ENABLED = original;
}
