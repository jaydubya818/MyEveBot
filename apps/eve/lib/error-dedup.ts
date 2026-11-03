/**
 * Extracted error deduplication helper (QA-17).
 *
 * Strips per-endpoint label prefixes (e.g. "Goals: ") from API errors so
 * repeated "could not confirm this request" messages collapse to a single
 * entry. Used by the integrated view's error section.
 *
 * Exported for independent testing.
 */
export function deduplicateApiErrors(errors: readonly string[]): string[] {
  return [...new Set(errors.map((e) => e.replace(/^[^:]+: /, "")))];
}
