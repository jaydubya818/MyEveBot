/** Run every owned cleanup even after failure; a functional PASS cannot hide teardown uncertainty. */
export async function finishQualification(report, actions) {
  report.fixtureCleanup = [];
  for (const [name, cleanup] of actions) {
    try {
      await cleanup();
      report.fixtureCleanup.push({ name, status: 'CONFIRMED' });
    } catch {
      report.fixtureCleanup.push({ name, status: 'UNCONFIRMED' });
      report.status = 'FAIL';
    }
  }
  return report.fixtureCleanup.every(result => result.status === 'CONFIRMED');
}
export async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(label + ' timeout')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
