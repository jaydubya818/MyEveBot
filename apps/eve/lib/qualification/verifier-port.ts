import { QDEV_LIMITS } from "../external-alpha/qualification-accounting.ts";
import { ProviderNotSent, type KnownOutcome, type UnknownOutcome } from "./gate.ts";
import { verdictSchema, type SignedVerdict } from "./verdict.ts";
import type { VerifierHandoff } from "./verifier-handoff.ts";
import { ArtifactStagingRefused, stageArtifact, type ArtifactSource } from "./artifact-staging.ts";
import type { VerifierPort } from "./wiring.ts";

/**
 * Transport to the independently administered verifier. This module only carries the digest-only handoff out and the signed,
 * artifact-bound verdict back in. It holds no protected specification and no verifier key; the verdict's signature is checked by
 * the journey against the disjoint verifier key set, so a transport (or a compromised endpoint) cannot mint a PASS.
 *
 * Contract (the verifier service implements it; it is part of the protected custody, not of this repository):
 *   POST {origin}/qdev/v1/artifact/file   one inventoried file (octet-stream)   -> 200 { received: true, path, sha256 }     (uncharged staging, before the handoff)
 *   POST {origin}/qdev/v1/artifact/commit { candidate, binding, pins, inventory }  -> 200 { staged: true, artifactSha256, inventoryDigest, files, bytes }
 *   POST {origin}/qdev/v1/handoff   body = VerifierHandoff                        -> 200 { accepted: true, handoffSha256 }
 *   POST {origin}/qdev/v1/evaluate  body = { candidate, reserveMicrousd }          -> 200 { state: "FINAL", handoffSha256, usage: { settledMicrousd, quiescent } }
 *   POST {origin}/qdev/v1/verdict   body = { candidate }                           -> 200 { verdict, signatureBase64 }   (pure read of a FINAL verdict)
 * `submit` is the CHARGED operation: it registers the handoff and then runs the single evaluation under the charged reserve as its hard cap.
 * It settles (`known: true`) only when the service reports FINAL with quiescent === true and settled usage within the reserve; anything else
 * is unsettled exposure and the gate fences. `fetchVerdict` is an uncharged read that cannot start an evaluation.
 * Authorization: `Bearer <credential>` from the runtime-supplied credential. Origin: https, or exact loopback for disposable endpoints.
 * Pre-send refusals are ProviderNotSent (nothing left the process). Once a request is sent, any failure is ambiguous: the gate
 * fences and nothing is resent. Redirects are refused.
 */
export type HttpVerifierConfig = {
  enabled?: boolean; origin: string; credential: () => string | undefined;
  fetch?: typeof fetch; timeoutMs?: number;
  /** Upper bound for the charged evaluation request (must exceed the service's evaluation deadline plus grace). */
  evaluationTimeoutMs?: number;
  /** Retained exact built bytes of the accepted candidate. Uploaded (uncharged, idempotent, bounded) BEFORE the handoff so the independent host evaluates the exact bytes;
   * a staging failure is a pre-handoff refusal (no evaluation can have started). The handoff itself stays digest-only. */
  staging?: (candidate: { commit: string; tree: string }) => ArtifactSource;
  stagingTimeoutMs?: number;
};
export class VerifierPortRefused extends Error { constructor(readonly code: string) { super(code); } }
const ORIGIN = /^(?:https:\/\/[a-z0-9.-]+(?::\d{1,5})?|http:\/\/127\.0\.0\.1:\d{1,5})$/;

export class HttpVerifierPort implements VerifierPort {
  constructor(private readonly c: HttpVerifierConfig) {
    if (typeof c.origin !== "string" || !ORIGIN.test(c.origin)) throw new VerifierPortRefused("QDEV_VERIFIER_ORIGIN");
  }
  private authorization(): string {
    const credential = this.c.credential();
    if (this.c.enabled !== true) throw new ProviderNotSent("verifier disabled");
    if (typeof credential !== "string" || credential.length < 16 || /[\r\n\s]/.test(credential)) throw new ProviderNotSent("verifier credential unavailable");
    return "Bearer " + credential;
  }
  private async call(path: string, body: unknown, authorization: string, timeoutMs = this.c.timeoutMs ?? 30_000): Promise<unknown> {
    const response = await (this.c.fetch ?? fetch)(this.c.origin + path, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (response.status !== 200) throw new Error("QDEV_VERIFIER_STATUS_" + response.status);
    return response.json();
  }

  async submit(handoff: VerifierHandoff, reserveMicrousd: number): Promise<KnownOutcome<unknown> | UnknownOutcome<unknown>> {
    if (handoff?.schema !== "myeve.qualification-verifier-handoff/v1" || !/^[a-f0-9]{64}$/.test(handoff.handoffSha256)) throw new ProviderNotSent("handoff malformed");
    if (!Number.isSafeInteger(reserveMicrousd) || reserveMicrousd < 1 || reserveMicrousd > QDEV_LIMITS.perWorkMicrousd) throw new ProviderNotSent("verifier reserve invalid");
    const candidate = { commit: handoff.candidateCommit, tree: handoff.candidateTree, buildArtifactSha256: handoff.buildArtifactSha256 };
    if (!/^[a-f0-9]{40}$/.test(candidate.commit) || !/^[a-f0-9]{40}$/.test(candidate.tree) || !/^[a-f0-9]{64}$/.test(candidate.buildArtifactSha256)) throw new ProviderNotSent("handoff candidate malformed");
    const authorization = this.authorization();
    if (this.c.staging) {
      // Uncharged precursor. Failing here leaves nothing registered at the verifier, so the pre-send contract holds: the evaluation cannot have started.
      try {
        await stageArtifact({ origin: this.c.origin, authorization, fetch: this.c.fetch, timeoutMs: this.c.stagingTimeoutMs, source: this.c.staging({ commit: candidate.commit, tree: candidate.tree }),
          candidate, binding: { projectSha256: handoff.projectSha256, sourceSha256: handoff.sourceSha256 } });
      } catch (error) { throw new ProviderNotSent("artifact staging failed: " + (error instanceof ArtifactStagingRefused ? error.code : "QDEV_ARTIFACT_TRANSPORT")); }
    }
    // From the first request on, the evaluation may run: every failure is ambiguous exposure and nothing is resent.
    let ack: any, final: any;
    try { ack = await this.call("/qdev/v1/handoff", handoff, authorization); }
    catch (error) { throw new Error("QDEV_VERIFIER_POST_SEND_AMBIGUOUS", { cause: error }); }
    // Acceptance must echo the exact handoff digest; anything else is unproven.
    if (!ack || typeof ack !== "object" || Object.keys(ack).sort().join(",") !== "accepted,handoffSha256" || ack.accepted !== true || ack.handoffSha256 !== handoff.handoffSha256) return { known: false };
    try { final = await this.call("/qdev/v1/evaluate", { candidate, reserveMicrousd }, authorization, this.c.evaluationTimeoutMs ?? 12 * 60_000); }
    catch (error) { throw new Error("QDEV_VERIFIER_POST_SEND_AMBIGUOUS", { cause: error }); }
    const usage = final?.usage;
    const settled = typeof final === "object" && final !== null && Object.keys(final).sort().join(",") === "handoffSha256,state,usage" && final.state === "FINAL"
      && final.handoffSha256 === handoff.handoffSha256 && typeof usage === "object" && usage !== null && Object.keys(usage).sort().join(",") === "quiescent,settledMicrousd"
      && usage.quiescent === true && Number.isSafeInteger(usage.settledMicrousd) && usage.settledMicrousd >= 0 && usage.settledMicrousd <= reserveMicrousd;
    if (!settled) return { known: false };
    return { known: true, value: { accepted: true, handoffSha256: handoff.handoffSha256, settledMicrousd: usage.settledMicrousd } };
  }

  async fetchVerdict(candidate: { commit: string; tree: string; buildArtifactSha256: string }): Promise<SignedVerdict> {
    if (!/^[a-f0-9]{40}$/.test(candidate?.commit) || !/^[a-f0-9]{40}$/.test(candidate?.tree) || !/^[a-f0-9]{64}$/.test(candidate?.buildArtifactSha256)) throw new VerifierPortRefused("QDEV_VERIFIER_CANDIDATE");
    const authorization = this.authorization();
    const body: any = await this.call("/qdev/v1/verdict", { candidate }, authorization);
    if (!body || typeof body !== "object" || Object.keys(body).sort().join(",") !== "signatureBase64,verdict" || typeof body.signatureBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.signatureBase64))
      throw new VerifierPortRefused("QDEV_VERIFIER_VERDICT_ENVELOPE");
    return { verdict: verdictSchema.parse(body.verdict), signatureBase64: body.signatureBase64 };
  }
}
