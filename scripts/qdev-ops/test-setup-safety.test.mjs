import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const harness = join(dirname(fileURLToPath(import.meta.url)), 'test-qdev-ops.sh');
for (const failAt of [1, 2]) {
  test(`fixture setup exits before cleanup or service commands when mktemp call ${failAt} fails`, () => {
    const root = mkdtempSync(join(tmpdir(), 'qdev-setup-'));
    try {
      const bin = join(root, 'bin'); mkdirSync(bin);
      writeFileSync(join(bin, 'mktemp'), `#!/usr/bin/env python3
import os,sys,subprocess
p=os.environ['FIXTURE_COUNTER']
n=int(open(p).read())+1 if os.path.exists(p) else 1
open(p,'w').write(str(n))
if n==int(os.environ['FIXTURE_FAIL_AT']): sys.exit(1)
sys.exit(subprocess.run(['/usr/bin/mktemp',*sys.argv[1:]]).returncode)
`, {mode: 0o700});
      for (const name of ['rm', 'neonctl']) writeFileSync(join(bin, name), `#!/usr/bin/env python3
import os
open(os.environ['FIXTURE_FORBIDDEN'],'a').write('${name}\\n')
`, {mode: 0o700});
      const forbidden = join(root, 'forbidden'), counter = join(root, 'counter');
      const result = spawnSync('bash', [harness], {cwd: root, encoding: 'utf8', timeout: 20_000,
        env: {PATH: `${bin}:${process.env.PATH}`, TMPDIR: root, QDEV_OPS_TEST_STORE_PARENT: root,
          FIXTURE_COUNTER: counter, FIXTURE_FAIL_AT: String(failAt), FIXTURE_FORBIDDEN: forbidden}});
      assert.equal(result.error, undefined);
      assert.equal(result.status, 2, result.stderr);
      assert.equal(readFileSync(counter, 'utf8'), String(failAt));
      assert.equal(existsSync(forbidden), false, 'No cleanup glob or service command is reachable after fixture setup failure');
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
}
