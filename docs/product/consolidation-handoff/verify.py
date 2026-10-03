"""Read-only integrity checks for the frozen Product handoff; no execution or E2E."""
import csv
import hashlib
import json
import subprocess
from pathlib import Path

folder = Path(__file__).resolve().parent
root = folder.parents[2]
manifest = json.loads((folder / 'adoption-manifest.json').read_text())

def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

def rows(name):
    with (folder / name).open() as handle:
        return list(csv.DictReader(handle, delimiter='\t'))

def changes(start, end):
    return dict(line.split('\t')[::-1] for line in git('diff', '--no-renames', '--name-status', start, end).splitlines())

source = manifest['acceptedImplementationSha']
base = manifest['adoptionBaseCanonicalMain']
for ancestor in [base, manifest['acceptedFunctionalCheckpoint']]:
    subprocess.run(['git', 'merge-base', '--is-ancestor', ancestor, source], cwd=root, check=True)
inventory = rows('changed-paths.tsv')
implementation = [row for row in inventory if row['scope'] == 'accepted-implementation']
handoff = [row for row in inventory if row['scope'] == 'handoff-package']
assert len({row['path'] for row in inventory}) == len(inventory)
assert {row['path']: row['status'] for row in implementation} == changes(base, source)
assert {row['path']: row['status'] for row in rows('initial-baseline-changes.tsv')} == changes(manifest['startingCanonicalMain'], source)
assert {row['path']: row['status'] for row in rows('canonical-carry.tsv')} == changes(manifest['startingCanonicalMain'], base)
assert sorted(row['path'] for row in handoff) == sorted(manifest['handoffPaths'])
adoption_paths = [path for unit in manifest['units'] for path in unit['paths']]
assert sorted(adoption_paths) == sorted(row['path'] for row in implementation)
for row in implementation:
    assert row['git_blob_oid'] == git('rev-parse', source + ':' + row['path'])
    assert not row['path'].startswith(('apps/eve/lib/engineering/', 'apps/eve/lib/beta-integration/'))
    assert 'migrations' not in Path(row['path']).parts
for path in manifest['handoffPaths']:
    assert (root / path).is_file(), path
images = rows('visual-baselines.tsv')
assert len(images) == 32
actual = {str(path.relative_to(root)) for path in (root / 'output/playwright/agent-native/visual-baselines').glob('*/*.png')}
assert {row['path'] for row in images} == actual
for row in images:
    payload = (root / row['path']).read_bytes()
    assert hashlib.sha256(payload).hexdigest() == row['sha256']
    assert len(payload) == int(row['bytes'])
assert 'enabled:false' in (root / 'apps/eve/lib/routine-release.ts').read_text()
assert '50 passed' in (root / 'docs/verification/agent-native-work/visual-ia-full-playwright.log').read_text()
assert all(status == 'NOT_RUN' for status in manifest['cloudGates'].values())
head = git('rev-parse', 'HEAD')
if head != source:
    assert git('rev-parse', 'HEAD^') == source, 'Run this frozen-package verification at the handoff commit.'
    assert changes(source, head) == {path: 'A' for path in manifest['handoffPaths']}
    assert changes(base, head) == {row['path']: row['status'] for row in inventory}
else:
    # Before committing the package, reject unrelated tracked or untracked changes.
    assert not git('diff', '--name-only')
    assert set(git('diff', '--cached', '--name-only').splitlines()).issubset(manifest['handoffPaths'])
    assert set(git('ls-files', '--others', '--exclude-standard').splitlines()).issubset(manifest['handoffPaths'])
print(json.dumps({'status': 'PASS', 'implementationPaths': len(implementation), 'handoffPaths': len(handoff), 'visualBaselines': len(images), 'head': head, 'applicationTestsRerun': False}))
