import { createSign } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
type AppCredential = {
  appId: number;
  installationId: number;
  repository: string;
  keychainService: string;
  keychainAccount: string;
};
type CachedToken = { token: string; expiresAt: number };
const cachedTokens = new Map<string, CachedToken>();
const inFlight = new Map<string, Promise<string>>();

async function keyFromKeychain(service: string, account: string) {
  if (process.platform !== "darwin") throw new Error("Local GitHub App qualification requires macOS Keychain.");
  const { stdout } = await execFileAsync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], {
    encoding: "utf8", maxBuffer: 200_000,
  });
  if (!stdout.includes("-----BEGIN ") || !stdout.includes("PRIVATE KEY-----")) throw new Error("GitHub App private key is unavailable in Keychain.");
  return stdout.trim();
}

function appJwt(appId: number, key: string, now = Date.now()) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: Math.floor(now / 1000) - 60, exp: Math.floor(now / 1000) + 540, iss: String(appId) })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url");
  return `${unsigned}.${signature}`;
}

/** Mint a token restricted to one installation and one approved repository. Never persist token or key. */
export function githubAppTokenProvider(config: AppCredential, options: {
  readKey?: (service: string, account: string) => Promise<string>;
  request?: typeof fetch;
  clock?: () => number;
} = {}) {
  const { appId, installationId, repository } = config;
  if (!Number.isSafeInteger(appId) || appId < 1 || !Number.isSafeInteger(installationId) || installationId < 1 ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Exact GitHub App and repository identity are required.");
  const readKey = options.readKey ?? keyFromKeychain, request = options.request ?? fetch, clock = options.clock ?? Date.now;
  const cacheKey = `${appId}:${installationId}:${repository}`;
  return async () => {
    const cached = cachedTokens.get(cacheKey);
    if (cached && cached.expiresAt - clock() > 300_000) return cached.token;
    const pending = inFlight.get(cacheKey);
    if (pending) return pending;
    const mint = (async () => {
      const jwt = appJwt(appId, await readKey(config.keychainService, config.keychainAccount), clock());
      const response = await request(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${jwt}`, accept: "application/vnd.github+json", "content-type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
        body: JSON.stringify({ repositories: [repository.split("/")[1]], permissions: {
          contents: "write", pull_requests: "write", issues: "read", checks: "read", actions: "read", statuses: "read",
        } }),
      });
      if (!response.ok) throw new Error(`GitHub App installation token was denied (${response.status}).`);
      const body = await response.json() as { token?: string; expires_at?: string; repository_selection?: string };
      const expiresAt = Date.parse(body.expires_at ?? "");
      if (!body.token || !Number.isFinite(expiresAt) || expiresAt <= clock() + 300_000)
        throw new Error("GitHub App returned an unusable installation token.");
      // The grant is restricted again on every mint even if the App installation later grows.
      cachedTokens.set(cacheKey, { token: body.token, expiresAt });
      return body.token;
    })();
    inFlight.set(cacheKey, mint);
    try { return await mint; } finally { inFlight.delete(cacheKey); }
  };
}
