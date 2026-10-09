import { qualificationEnabled } from "../qualification/client.ts";
// Server-only deployment ingress credentials. These do not confer Relay authority.
// Call only after selecting a pinned Relay origin or locally trusted artifact peer.
export function ingressHeaders(origin: string): Record<string, string> {
  if (qualificationEnabled()) return {};
  const configured = process.env.MYEVE_RELAY_INGRESS_SECRETS;
  if (!configured) return {};
  try {
    const entries: unknown = JSON.parse(configured);
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error();
    const mapping = entries as Record<string, unknown>;
    if (Object.keys(mapping).length > 10) throw new Error();
    for (const [key, value] of Object.entries(mapping)) {
      const url = new URL(key);
      if (url.protocol !== "https:" || url.origin !== key || typeof value !== "string" || value.length < 16 || value.length > 4096 || /[^\x21-\x7e]/.test(value)) throw new Error();
    }
    if (!Object.hasOwn(mapping, origin)) return {};
    return { "x-vercel-protection-bypass": mapping[origin] as string };
  } catch {
    throw new Error("Federation ingress configuration is invalid.");
  }
}
