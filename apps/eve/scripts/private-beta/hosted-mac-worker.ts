#!/usr/bin/env -S node --import tsx
// MAC SIDE ONLY. Hosted private-beta build/preview worker (lib/qualification/hosted-mac-worker.ts), outbound HTTPS only, no listener.
// Builds the candidates hosted MyEve is waiting for in the pinned container (Docker on the Mac, never on Vercel), signs the build claim with
// the Mac-only issuer key, stages the exact bytes to the Mac's own loopback verifier, uploads to hosted MyEve with the installation's poller
// credential, and after a PASS uploads the private preview. The Factory mailbox poller itself is MyFactory's scripts/mailbox-poller.mjs.
//
// usage: node --import tsx scripts/private-beta/hosted-mac-worker.ts <config.json> [--once]
// config (non-secret): { hostedOrigin, installationId, ownerId, pollerCredentialFile, verifier: { origin, credentialFile }, factoryRepositoryPath,
//   factoryResultKeys: [{ factoryId, keyId, publicKey, activeFrom, notAfter, revokedAt?, retiredAt? }] (PUBLIC Factory result keys pinned on this Mac),
//   claimsDir (0700; durable single-use job claims), build: { lockSha256, packageSha256, image, nodeVersion, buildProfileDigest, issuerKeyId, issuerKeyFile }, intervalMs? }
// Every *File is a 0600 file on this Mac. A job runs only if it carries a stage-3 Result signed by one of the pinned Factory result keys for this
// installation's owner and ownerScope, and its single-use claim was never taken before (lib/qualification/hosted-mac-job.ts).
import { spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ed25519Signer } from "../../lib/qualification/custody-assembly.ts";
import { macWorker } from "../../lib/qualification/hosted-mac-worker.ts";
import { fileMacJobClaims } from "../../lib/qualification/hosted-mac-job.ts";
import type { MacBuildRequest } from "../../lib/qualification/hosted-mac-build.ts";
import { attestStaticBuild, createBoundedDockerRunner, exportStaticBuild } from "../../lib/qualification/static-build-export.ts";
import { StaticArtifactCandidate } from "../../../../packages/myapps/src/static-artifact.ts";

const hex = (n: number) => z.string().regex(new RegExp(`^[a-f0-9]{${n}}$`));
const configSchema = z.object({
  hostedOrigin: z.string().url().refine(v => new URL(v).protocol === "https:" && new URL(v).origin === v, "https origin"),
  installationId: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/), ownerId: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
  factoryResultKeys: z.array(z.object({ factoryId: z.string().min(1).max(160), keyId: z.string().min(1).max(160), publicKey: z.string().min(1).max(4096),
    activeFrom: z.string().datetime({ offset: true }), notAfter: z.string().datetime({ offset: true }), revokedAt: z.string().datetime({ offset: true }).optional(),
    retiredAt: z.string().datetime({ offset: true }).optional() }).strict()).min(1).max(8),
  claimsDir: z.string().startsWith("/"),
  pollerCredentialFile: z.string().startsWith("/"),
  verifier: z.object({ origin: z.string().regex(/^http:\/\/127\.0\.0\.1:\d{1,5}$/), credentialFile: z.string().startsWith("/") }).strict(),
  factoryRepositoryPath: z.string().startsWith("/"),
  build: z.object({ lockSha256: hex(64), packageSha256: hex(64), image: z.string().regex(/^sha256:[a-f0-9]{64}$/), nodeVersion: z.string().regex(/^v24\.\d+\.\d+$/),
    buildProfileDigest: hex(64), issuerKeyId: z.string().min(1).max(255), issuerKeyFile: z.string().startsWith("/") }).strict(),
  intervalMs: z.number().int().min(2000).max(600_000).optional(),
}).strict();

function secretFile(path: string): string {
  const st = lstatSync(path);
  if (!st.isFile() || (st.mode & 0o077) !== 0) throw new Error("SECRET_FILE_MUST_BE_0600: " + path);
  return readFileSync(path, "utf8").trim();
}
function git(repo: string, args: string[], input?: Buffer): Buffer {
  const r = spawnSync("git", ["-C", repo, ...args], { input, maxBuffer: 256 * 1024 * 1024, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", LC_ALL: "C" } as unknown as NodeJS.ProcessEnv });
  if (r.status !== 0) throw new Error("GIT_" + args[0].toUpperCase());
  return r.stdout;
}

async function main() {
  const [path, flag] = process.argv.slice(2);
  const config = configSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const sign = ed25519Signer(secretFile(config.build.issuerKeyFile));
  const worker = macWorker({
    hosted: { origin: config.hostedOrigin, credential: secretFile(config.pollerCredentialFile) },
    verifier: { origin: config.verifier.origin, credential: secretFile(config.verifier.credentialFile) },
    trust: { installationId: config.installationId, ownerId: config.ownerId, resultKeys: config.factoryResultKeys,
      lockSha256: config.build.lockSha256, buildProfileDigest: config.build.buildProfileDigest },
    claims: fileMacJobClaims(config.claimsDir),
    async build(request: MacBuildRequest) {
      // Reached only after verifyMacBuildJob + the durable claim (macWorker). The Mac builds only with its OWN pins and refuses a binding for other pins.
      const c = request.candidate, b = request.binding;
      if (b.lockSha256 !== config.build.lockSha256 || b.buildProfileDigest !== config.build.buildProfileDigest) throw new Error("MAC_BUILD_PINS");
      if (git(config.factoryRepositoryPath, ["rev-parse", "--verify", `${c.commit}^{tree}`]).toString("utf8").trim() !== c.tree) throw new Error("MAC_BUILD_CANDIDATE_TREE");
      const dir = mkdtempSync(join(tmpdir(), "hosted-mac-build-"));
      try {
        const archive = git(config.factoryRepositoryPath, ["archive", "--format=tar", c.commit]);
        const tar = spawnSync("tar", ["-x", "-f", "-", "-C", dir], { input: archive });
        if (tar.status !== 0) throw new Error("MAC_BUILD_EXTRACT");
        const exported = await exportStaticBuild({ sourceDir: dir, pins: c, profileLockSha256: config.build.lockSha256, profilePackageSha256: config.build.packageSha256,
          image: config.build.image, nodeVersion: config.build.nodeVersion, docker: createBoundedDockerRunner() });
        const artifact = await StaticArtifactCandidate.retain(exported.inventory, exported.pins, exported.load);
        const builtAt = new Date(Math.min(Date.now(), Date.parse(b.deadline))).toISOString();
        const claim = await attestStaticBuild({ binding: b, artifact, keyId: config.build.issuerKeyId, builtAt, sign });
        // Bytes are read now (the temporary source directory is removed below).
        const bytes = new Map<string, Uint8Array>();
        for (const f of artifact.files) bytes.set(f.path, await exported.load(f.path));
        return { inventory: exported.inventory, lockSha256: exported.pins.lockSha256, claim, load: async p => { const v = bytes.get(p); if (!v) throw new Error("missing"); return v; } };
      } finally { rmSync(dir, { recursive: true, force: true }); }
    },
  });
  for (;;) {
    try { for (const step of await worker.once()) console.log(JSON.stringify({ at: new Date().toISOString(), ...step })); }
    catch (error) { console.error(JSON.stringify({ at: new Date().toISOString(), error: String((error as Error)?.message ?? error).slice(0, 300) })); }
    if (flag === "--once") return;
    await new Promise(r => setTimeout(r, config.intervalMs ?? 15_000));
  }
}
await main();
