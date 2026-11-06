import { StaticArtifactCandidate } from "../../../../packages/myapps/src/static-artifact.ts";
import { stageArtifact } from "./artifact-staging.ts";
import { bareSha256 } from "./delivery-observer.ts";
import { candidateKey, type MacBuildRequest } from "./hosted-mac-build.ts";

/**
 * MAC SIDE ONLY (run by scripts/private-beta/hosted-mac-worker.ts on the owner's Mac; never imported by a hosted route).
 *
 * One pass of the hosted build/preview duty, outbound HTTPS only (no listener):
 *  - for each build hosted is waiting for: build it with the Mac's pinned container and Mac-only issuer key (`build`), stage the exact bytes to
 *    the Mac's own loopback verifier, then upload inventory + claim + bytes to hosted (which re-verifies everything);
 *  - for each VERIFIED build without a private preview: read the FINAL verdict from the local verifier (a pure read; it never starts an
 *    evaluation) and, only for a PASS, upload the release manifest (bytes are already in the private store) as the private preview.
 * The verifier evaluation itself is driven by hosted MyEve through the mailbox (target verifier); this worker never evaluates or signs a verdict.
 */
export type MacBuildOutput = { inventory: unknown; lockSha256: string; claim: string; load(path: string): Promise<Uint8Array> };
export type MacWorkerDeps = {
  hosted: { origin: string; credential: string; fetch?: typeof fetch };
  verifier: { origin: string; credential: string; fetch?: typeof fetch };
  build(request: MacBuildRequest): Promise<MacBuildOutput>;
};
type Built = { artifact: StaticArtifactCandidate; output: MacBuildOutput; request: MacBuildRequest };
export type MacWorkerStep = { candidate: string; step: "BUILT_AND_STAGED" | "WAITING_FOR_VERDICT" | "VERDICT_NOT_PASS" | "PREVIEW_READY" };

export function macWorker(deps: MacWorkerDeps) {
  const built = new Map<string, Built>();
  const hostedCall = async (method: string, path: string, body?: BodyInit, contentType = "application/json") => {
    const url = new URL(path, deps.hosted.origin);
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1") throw new Error("HOSTED_ORIGIN_MUST_BE_HTTPS");
    const response = await (deps.hosted.fetch ?? fetch)(url, { method, redirect: "error", signal: AbortSignal.timeout(60_000),
      headers: { authorization: `Bearer ${deps.hosted.credential}`, "cache-control": "no-store", ...(body !== undefined ? { "content-type": contentType } : {}) }, body });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
  const build = async (request: MacBuildRequest): Promise<Built> => {
    const key = candidateKey(request.candidate), cached = built.get(key);
    if (cached) return cached;
    if (request.binding.candidateCommit !== request.candidate.commit || request.binding.candidateTree !== request.candidate.tree) throw new Error("MAC_BUILD_REQUEST_BINDING");
    const output = await deps.build(request);
    const pins = { sourceCommit: request.candidate.commit, sourceTree: request.candidate.tree, lockSha256: output.lockSha256 };
    const artifact = await StaticArtifactCandidate.retain(output.inventory, pins, output.load);
    // The exact bytes reach the Mac's own verifier directly (loopback), before hosted can hand off the evaluation.
    await stageArtifact({ origin: deps.verifier.origin, authorization: `Bearer ${deps.verifier.credential}`, fetch: deps.verifier.fetch,
      source: { inventory: output.inventory, pins, artifact },
      candidate: { ...request.candidate, buildArtifactSha256: bareSha256(artifact.artifactDigest) },
      binding: { projectSha256: request.projectSha256, sourceSha256: request.sourceSha256 } });
    const value = { artifact, output, request };
    built.set(key, value);
    return value;
  };
  return {
    async once(): Promise<MacWorkerStep[]> {
      const steps: MacWorkerStep[] = [];
      const { builds } = await hostedCall("GET", "/api/factory-mailbox/v1/builds") as { builds: Array<{ request: MacBuildRequest; state: string; artifactSha256: string | null; previewReady: boolean }> };
      for (const item of builds) {
        const key = candidateKey(item.request.candidate);
        if (item.state !== "VERIFIED") {
          const b = await build(item.request);
          const begun = await hostedCall("POST", "/api/factory-mailbox/v1/builds", JSON.stringify({ schema: "myeve.hosted-mac-build-upload/v1", candidate: item.request.candidate,
            inventory: b.output.inventory, lockSha256: b.output.lockSha256, claim: b.output.claim })) as { missing: string[] };
          for (const path of begun.missing)
            await hostedCall("PUT", `/api/factory-mailbox/v1/builds/${key}/files/${path.split("/").map(encodeURIComponent).join("/")}`, Buffer.from(await b.output.load(path)), "application/octet-stream");
          await hostedCall("POST", `/api/factory-mailbox/v1/builds/${key}/complete`, "{}");
          steps.push({ candidate: key, step: "BUILT_AND_STAGED" });
          continue;
        }
        if (item.previewReady) continue;
        const b = await build(item.request), buildArtifactSha256 = bareSha256(b.artifact.artifactDigest);
        if (buildArtifactSha256 !== item.artifactSha256) throw new Error("MAC_BUILD_NOT_REPRODUCED");
        const response = await (deps.verifier.fetch ?? fetch)(deps.verifier.origin + "/qdev/v1/verdict", { method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
          headers: { authorization: `Bearer ${deps.verifier.credential}`, "content-type": "application/json" },
          body: JSON.stringify({ candidate: { ...item.request.candidate, buildArtifactSha256 } }) });
        if (response.status !== 200) { steps.push({ candidate: key, step: "WAITING_FOR_VERDICT" }); continue; }
        const verdict = await response.json() as { verdict?: { outcome?: string } };
        if (verdict?.verdict?.outcome !== "PASS") { steps.push({ candidate: key, step: "VERDICT_NOT_PASS" }); continue; }
        const a = b.artifact, manifest = { schema: "myeve.qdev-static-release/v1", artifactDigest: a.artifactDigest, inventoryDigest: a.inventoryDigest,
          source: { ...a.source }, files: a.files.map(f => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 })) };
        const begun = await hostedCall("POST", "/api/factory-mailbox/v1/previews", JSON.stringify({ schema: "myeve.hosted-preview-upload/v1", verdict, manifest })) as { artifactSha256: string; missing: string[] };
        for (const path of begun.missing)
          await hostedCall("PUT", `/api/factory-mailbox/v1/previews/${begun.artifactSha256}/files/${path.split("/").map(encodeURIComponent).join("/")}`, Buffer.from(await b.output.load(path)), "application/octet-stream");
        await hostedCall("POST", `/api/factory-mailbox/v1/previews/${begun.artifactSha256}/complete`, "{}");
        steps.push({ candidate: key, step: "PREVIEW_READY" });
      }
      return steps;
    },
  };
}
