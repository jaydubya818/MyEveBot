/** QA-20: after the first successful load, a later poll error is stale, not empty. */
export function taskRunsAreStale<T>(error: string | null, tasks: T[] | null): boolean {
  return error !== null && tasks !== null;
}

/** QA-20: do not hammer the API from a hidden tab. */
export function shouldPollTaskRuns(hidden: boolean): boolean {
  return hidden !== true;
}
