import { describe, expect, it } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { githubAppTokenProvider } from "./github-app.ts";

describe("repository-scoped GitHub App authentication", () => {
  it("mints one short-lived installation token for the exact repository and reuses it within its lifetime", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const requests: { url: string; body: unknown; authorization: string }[] = [];
    let now = Date.now();
    const request: typeof fetch = async (input, init) => {
      requests.push({url: String(input), body: JSON.parse(String(init?.body)), authorization: new Headers(init?.headers).get("authorization") ?? ""});
      return Response.json({token: "installation-fixture-token", expires_at: new Date(now + 3_600_000).toISOString()});
    };
    const provider = githubAppTokenProvider({appId: 123456789, installationId: 987654321,
      repository: "jaydubya818/myeve-golden-work-qual", keychainService: "test", keychainAccount: "test"},
      {readKey: async () => pem, request, clock: () => now});
    expect(await Promise.all([provider(), provider()])).toEqual(["installation-fixture-token", "installation-fixture-token"]);
    expect(await provider()).toBe("installation-fixture-token");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/app/installations/987654321/access_tokens");
    expect(requests[0].body).toEqual({repositories:["myeve-golden-work-qual"],permissions:{
      contents:"write",pull_requests:"write",issues:"read",checks:"read",actions:"read",statuses:"read",
    }});
    const [header,payload,signature] = requests[0].authorization.replace(/^Bearer /,"").split(".");
    expect([header,payload,signature]).toHaveLength(3);
    expect(JSON.parse(Buffer.from(payload,"base64url").toString())).toMatchObject({iss:"123456789"});
    expect(createVerify("RSA-SHA256").update(`${header}.${payload}`).verify(publicKey,Buffer.from(signature,"base64url"))).toBe(true);
    now += 3_400_000;
    await provider();
    expect(requests).toHaveLength(2);
  });

  it("fails closed when GitHub denies the scoped grant", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const provider = githubAppTokenProvider({appId: 123456788, installationId: 987654320,
      repository: "jaydubya818/myeve-golden-work-qual", keychainService: "test", keychainAccount: "test"},
      {readKey: async () => privateKey.export({format:"pem",type:"pkcs8"}).toString(), request: async () => new Response("denied", {status: 403})});
    await expect(provider()).rejects.toThrow(/denied \(403\)/);
  });
});
