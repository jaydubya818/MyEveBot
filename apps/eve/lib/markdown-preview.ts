/** Untrusted HTML is a static preview. Its own policy precedes all supplied bytes. */
export function markdownPreviewDocument(content:string):string {
  const policy="default-src 'none'; img-src data: blob:; media-src 'none'; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body>${content}</body></html>`;
}
