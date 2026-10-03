/** Parse the single final summary emitted by Node TAP or spec reporters.
 * Signed artifact bytes are verified by the caller before this display check.
 * Counts never replace independent candidate verification. */
export function nodeTestSummary(log:string):{passed:number;total:number}|null {
 const totals=[...log.matchAll(/^(?:#|ℹ) tests ([0-9]+)\r?$/gm)];
 const passes=[...log.matchAll(/^(?:#|ℹ) pass ([0-9]+)\r?$/gm)];
 if(totals.length!==1||passes.length!==1||totals[0][0][0]!==passes[0][0][0])return null;
 const total=Number(totals[0][1]),passed=Number(passes[0][1]);
 return Number.isSafeInteger(total)&&total>0&&Number.isSafeInteger(passed)&&passed===total?{passed,total}:null;
}
