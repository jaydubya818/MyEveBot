/**
 * Pure next-state helper for polled owner reads (QA-21).
 * A transient error keeps last-good data for the same path and marks it stale.
 */
export function nextProductResourceOnError<T>(
  previous: { path: string | null; data: T | null },
  path: string,
  message: string,
): {
  path: string;
  data: T | null;
  loading: false;
  error: string;
  stale: boolean;
} {
  const keep = previous.path === path ? previous.data : null;
  return {
    path,
    data: keep,
    loading: false,
    error: message,
    stale: keep !== null,
  };
}
