import assert from 'node:assert/strict';

/** Disposable fixtures only. The documented option leaves compile/runtime errors visible. */
export function disableFixtureDevIndicator(source) {
  const boundary='const nextConfig: NextConfig = {';
  assert.equal(source.split(boundary).length,2,'Exactly one Next.js fixture config is required');
  assert.equal(/\bdevIndicators\s*:/.test(source),false,'Existing indicator policy must be reviewed');
  return source.replace(boundary,boundary+'\n  devIndicators: false, // Fixture chrome only; errors remain visible.');
}
