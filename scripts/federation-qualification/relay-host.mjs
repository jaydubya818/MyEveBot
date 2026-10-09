// Qualification hosting shim: Agent delivery uses the unmodified REST handler.
// Owner HTTP hosting calls the same auth/registry services, without Next cookies.
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import {
  sign,
  verify,
  createHash,
  publicEncrypt,
  privateDecrypt,
} from "node:crypto";
const config = JSON.parse(
  readFileSync(process.env.QUALIFICATION_CONFIG, "utf8"),
);
Object.assign(process.env, config.environment);
const load = async (path) => {
  const m = await import(`${config.relayRoot}/${path}`);
  return m.default ?? m;
};
const { configureV2PlatformBindings } = await load(
  "lib/v2/platform-bindings.ts",
);
const { db, migrateDatabase } = await load("lib/db.ts");
const schema = await load("lib/db/schema.ts");
const auth = await load("lib/auth.ts");
const agents = await load("lib/agents.ts");
const registry = await load("lib/v2/federation/registry.ts");
const { operatorContext } = await load("lib/v2/dashboard.ts");
const { issueAgentPassport } = await load("lib/v2/passports.ts");
const { publishRelaySafetyPolicy } = await load("lib/v2/policy/index.ts");
const { createBudget } = await load("lib/v2/budgets.ts");
const { provisionFederationCapabilities } = await load(
  "lib/v2/federation/capabilities.ts",
);
const { capabilitySchema } = await load("lib/v2/federation/contracts.ts");
const { exportAuditBundle } = await load("lib/v2/evidence/audit.ts");
const { unseal } = await load("lib/v2/federation/transport.ts");
const { POST: rest } = await load("app/api/v2/federation/route.ts");
const signer = {
  keyId: "qualification-relay",
  sign: async (value) =>
    sign(null, Buffer.from(value), config.signPrivate).toString("base64url"),
  verify: async (value, sig) =>
    verify(
      null,
      Buffer.from(value),
      config.signPublic,
      Buffer.from(sig, "base64url"),
    ),
  publicKeyPem: async () => config.signPublic,
};
const keyWrapper = {
  keyId: "qualification-wrap",
  wrap: async (owner, key) =>
    publicEncrypt(
      {
        key: config.wrapPublic,
        oaepHash: "sha256",
        oaepLabel: createHash("sha256").update(owner).digest(),
      },
      key,
    ).toString("base64url"),
  unwrap: async (owner, key) =>
    privateDecrypt(
      {
        key: config.wrapPrivate,
        oaepHash: "sha256",
        oaepLabel: createHash("sha256").update(owner).digest(),
      },
      Buffer.from(key, "base64url"),
    ),
};
configureV2PlatformBindings({
  signer,
  keyResolver: { publicKeyForKeyId: async () => config.signPublic },
  federation: { issuer: config.issuer, keyWrapper },
});
await migrateDatabase();
const capabilities = capabilitySchema.options.map((name) => ({
  name,
  version: "1.0",
}));
let dropCompletionResponse = false;
async function admin(input) {
  switch (input.operation) {
    case "drop-completion-response":
      dropCompletionResponse = true;
      return { armed: true };
    case "bootstrap":
      await provisionFederationCapabilities(signer);
      await publishRelaySafetyPolicy(
        {
          name: "MyEve isolated qualification policy",
          rules: capabilities.map((capability, n) => ({
            id: `allow-${n}`,
            effect: "ALLOW",
            match: { capability },
            reasonCode: "QUALIFICATION_ALLOW",
          })),
        },
        signer,
      );
      return auth.createAccountOwner(input.owner);
    case "owner":
      return auth.createAccountOwner(input.owner);
    case "passport": {
      const operator = await operatorContext(input.accountId, input.userId);
      await issueAgentPassport(
        {
          accountId: input.accountId,
          ownerPrincipalId: operator.principalId,
          agentId: input.agentId,
          policy: {
            trustTier: "REGISTERED",
            capabilityEligibility: capabilities,
            policyReferences: [],
            budgetReferences: [],
            allowedEnvironments: {
              providerIds: [],
              minimumAssurance: "registered",
            },
            dataAccess: [],
            expiresAt: input.expiresAt,
          },
        },
        signer,
      );
      return { ok: true };
    }
    case "budget":
      return createBudget(input.input, signer);
    case "audit":
      return exportAuditBundle(input.accountId, signer);
    case "inspect": {
      const requests = await db().select().from(schema.federationRequests);
      const decrypted = [];
      for (const row of requests) {
        if (row.encryptedPayload)
          decrypted.push(
            await unseal(row.targetOwnerId, row.encryptedPayload, keyWrapper),
          );
        if (row.encryptedResult)
          decrypted.push(
            await unseal(row.callerOwnerId, row.encryptedResult, keyWrapper),
          );
      }
      return { requests, decrypted };
    }
  }
  throw Error("Unsupported qualification operation");
}
createServer(
  { key: readFileSync(config.tlsKey), cert: readFileSync(config.tlsCert) },
  async (incoming, outgoing) => {
    try {
      if (incoming.url === "/health") {
        outgoing.end("ready");
        return;
      }
      const request = new Request(`${config.issuer}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
        body: incoming.method === "GET" ? undefined : incoming,
        duplex: "half",
      });
      if (incoming.url === "/api/v2/federation") {
        const command = await request.clone().json();
        const response = await rest(request);
        if (
          dropCompletionResponse &&
          command.operation === "respond" &&
          command.input?.status === "COMPLETED" &&
          response.ok
        ) {
          dropCompletionResponse = false;
          outgoing.destroy();
          return;
        }
        outgoing.writeHead(
          response.status,
          Object.fromEntries(response.headers),
        );
        outgoing.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const input = await request.json();
      let result;
      if (
        incoming.url === "/qualification" &&
        incoming.headers.authorization === `Bearer ${config.control}`
      )
        result = await admin(input);
      else {
        if (request.headers.get("origin") !== config.issuer)
          throw Error("Origin denied");
        if (incoming.url === "/api/auth/login") {
          const user = await auth.authenticateDashboardUser(
            input.email,
            input.password,
          );
          if (!user) throw Error("Owner authentication denied");
          outgoing.setHeader(
            "set-cookie",
            `${auth.sessionCookieName()}=${await auth.createSession(user)}; HttpOnly; SameSite=Strict; Path=/`,
          );
          result = { user };
        } else {
          const cookie = incoming.headers.cookie
            ?.split(";")
            .map((v) => v.trim())
            .find((v) => v.startsWith(`${auth.sessionCookieName()}=`))
            ?.split("=")[1];
          const user = await auth.parseSession(cookie);
          if (!user) throw Error("Owner session denied");
          if (incoming.url === "/api/agents")
            result = await agents.createAgent(user.accountId, input);
          else if (/^\/api\/agents\/[^/]+\/credentials$/.test(incoming.url)) {
            const id = decodeURIComponent(incoming.url.split("/")[3]);
            result =
              incoming.method === "DELETE"
                ? { revoked: await agents.revokeCredential(user.accountId, id) }
                : {
                    credential: (
                      await agents.rotateCredential(user.accountId, id)
                    ).secret,
                  };
          } else if (incoming.url === "/api/v2/operator/federation") {
            const operator = await operatorContext(user.accountId, user.id);
            const actor = {
              accountId: user.accountId,
              principalId: operator.principalId,
            };
            const functions = {
              register: "registerFederationAgent",
              publish: "publishView",
              grant: "createFederationGrant",
              "revoke-grant": "revokeFederationGrant",
              availability: "setAvailability",
              "publication-status": "setPublicationStatus",
              relationship: "setRelationship",
            };
            const fn = registry[functions[input.operation]];
            if (!fn) throw Error("Unsupported owner operation");
            result = await (["register", "publish", "grant"].includes(
              input.operation,
            )
              ? fn(actor, input.input, signer)
              : ["revoke-grant"].includes(input.operation)
                ? fn(actor, input.id, signer)
                : fn(actor, input.id, input.input, signer));
          } else throw Error("Unknown owner route");
        }
      }
      outgoing.setHeader("content-type", "application/json");
      outgoing.end(JSON.stringify(result ?? { ok: true }));
    } catch (error) {
      console.error(error.message);
      outgoing
        .writeHead(400, { "content-type": "application/json" })
        .end(JSON.stringify({ error: error.message }));
    }
  },
).listen(config.port, "0.0.0.0", () =>
  console.log("Relay qualification host ready"),
);
