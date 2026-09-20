import { z } from "zod";

export function relayOrigin(): string {
  if (process.env.MYEVE_RELAY_ENABLED !== "true")
    throw new Error("Relay sharing is disabled for this deployment.");
  const url = new URL(process.env.MYEVE_RELAY_ORIGIN ?? "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("A trusted HTTPS Relay origin is required.");
  return url.origin;
}
export async function boundedJson(
  response: Response,
  limit = 256 * 1024,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Relay returned no response.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.length;
    if (length > limit) {
      await reader.cancel();
      throw new Error("Relay response is too large.");
    }
    chunks.push(next.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export class RelayClient {
  private origin: string;
  constructor(
    private credential: string,
    private ownerSession?: string,
  ) {
    this.origin = relayOrigin();
  }
  async request(
    path: string,
    body: unknown,
    owner = false,
    method = "POST",
  ): Promise<any> {
    if (!path.startsWith("/api/") || path.includes("?") || path.includes("#"))
      throw new Error("Invalid Relay path.");
    if (owner && !this.ownerSession)
      throw new Error("Reconnect the Relay owner session.");
    const response = await fetch(`${this.origin}${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "content-type": "application/json",
        origin: this.origin,
        ...(owner
          ? { cookie: this.ownerSession! }
          : { authorization: `Bearer ${this.credential}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await boundedJson(response);
    if (!response.ok)
      throw new Error(`Relay refused the operation (${response.status}).`);
    return result;
  }
  command(command: unknown) {
    return this.request("/api/v2/federation", command);
  }
  owner(command: unknown) {
    return this.request("/api/v2/operator/federation", command, true);
  }
}
export async function connectRelayOwner(email: string, password: string) {
  const origin = relayOrigin();
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error("Relay owner sign-in failed.");
  const body = z
    .object({
      user: z.object({ accountId: z.string(), id: z.string() }).passthrough(),
    })
    .parse(await boundedJson(response));
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie || /[\r\n]/.test(cookie))
    throw new Error("Relay did not establish an owner session.");
  return { ownerSession: cookie, relayOwnerId: body.user.accountId };
}
