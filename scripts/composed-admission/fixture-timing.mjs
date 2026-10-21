const phases = new Set(['BACKEND_START', 'KEYGEN', 'PREPARE_FUNCTIONS', 'ENABLE_FIXTURES', 'ENABLE_ACCOUNTING', 'ENABLE_NATIVE', 'SET_ENVIRONMENT']);
export function failedFixturePhase(error) {
  // MC's existing redacted command diagnostic is the only phase observation.
  // Never infer a phase or timeout from elapsed time or arbitrary error wording.
  const prefix = 'Disposable fixture command failed: ';
  if (typeof error?.message !== 'string' || !error.message.startsWith(prefix)) return 'UNKNOWN';
  try {
    const diagnostic = JSON.parse(error.message.slice(prefix.length).split('; backend: ')[0]);
    return phases.has(diagnostic.stage) ? diagnostic.stage : 'UNKNOWN';
  } catch { return 'UNKNOWN'; }
}
export async function measureFixturePreparation(report, start, clock = () => performance.now()) {
  const began = clock();
  const timing = {status: 'RUNNING', scope: 'startFixtureDatabase-total', elapsedMs: 0,
    phaseTimings: 'NOT_COLLECTED', failedPhase: null};
  report.fixturePreparation = timing;
  try {
    const fixture = await start();
    timing.status = 'PASS';
    return fixture;
  } catch (error) {
    timing.status = 'FAIL';
    timing.failedPhase = failedFixturePhase(error);
    throw error;
  } finally { timing.elapsedMs = Math.round(clock() - began); }
}
