/** Linear may reserialize Markdown while preserving the issue's text. */
export function normalizedForemanDescription(value: string | null): string {
  if (!value) return "";
  return value.replace(/\r\n?/g, "\n")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "")
    .replace(/\s+/g, " ").trim();
}

/** Only known Linear Markdown serialization changes are candidates for the saved action hash. */
export function foremanDescriptionVariants(value: string | null): string[] {
  if (value === null) return [];
  const markdown = value.replace(/\r\n?/g, "\n");
  const listMarkers = [
    markdown,
    markdown.replace(/^\* /gm, "- "),
    markdown.replace(/^- /gm, "* "),
  ];
  const variants = new Set<string>();
  for (const candidate of listMarkers) {
    const listSpacing = candidate.replace(/(:)\n\n(?=[-*] )/g, "$1\n");
    for (const spaced of [candidate, listSpacing]) {
      variants.add(spaced);
      variants.add(spaced.replace(/(^#{1,6} [^\n]+)\n\n(?=\S)/gm, "$1\n"));
    }
  }
  return [...variants];
}
