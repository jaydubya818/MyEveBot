import { expect, it } from 'vitest';
import { patchScope } from './result-ingestion.ts';

const allowed = ['src/app.ts'];
const valid = 'diff --git a/src/app.ts b/src/app.ts\nindex 1111111..2222222 100644\n';

it('does not hide an unrecognized quoted path behind an allowed change', () => {
  expect(patchScope(valid, allowed)).toEqual({ changed: allowed, violations: [] });
  const result = patchScope(valid + 'diff --git "a/private\\tfile" "b/private\\tfile"\n', allowed);
  expect(result.changed).toEqual(allowed);
  expect(result.violations).toContain('unsupported_header');
});

it.each(['new file mode 160000', 'deleted file mode 160000', 'old mode 160000', 'new mode 160000', 'index 1111111..2222222 160000'])
  ('rejects gitlink metadata even for an allowed path: %s', metadata => {
    expect(patchScope(valid + metadata + '\n', allowed).violations).toContain('gitlink');
  });

it('retains exact path, rename, symlink and empty-patch denials', () => {
  expect(patchScope(valid + 'diff --git a/private.ts b/private.ts\n', allowed).violations).toContain('path');
  expect(patchScope(valid + 'rename from old.ts\n', allowed).violations).toContain('rename');
  expect(patchScope(valid + 'new file mode 120000\n', allowed).violations).toContain('symlink');
  expect(patchScope('', allowed).violations).toContain('empty');
});
