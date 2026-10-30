import { ProviderNotSent, type KnownOutcome, type UnknownOutcome } from "./gate.ts";
import { verdictSchema, type SignedVerdict } from "./verdict.ts";
import type { VerifierHandoff } from "./verifier-handoff.ts";
import type { VerifierPort } from "./wiring.ts";

/**
 * Transport to the independently administered verifier. This module only carries the digest-only handoff out and the signed,
 * artifact-bound verdict back in. It holds no protected specification and no verifier key; the verdict's signature is checked by
 * the journey against the disjoint verifier key set, so a transport (or a compromised endpoint) cannot mint a PASS.
 *
 * Contract (the verifier service implements it; it is part of the protected custody, not of this repository):
 *   POST {origin}/qdev/v1/handoff  body = VerifierHandoff          -> 200 { accepted: true, handoffSha256 }
 *   POST {origin}/qdev/v1/verdict  body = { candidate }            -> 200 { verdict, signatureBase64 }
 * Authorization: `Bearer <credential>` from the runtime-supplied credential. Origin: https, or exact loopback for disposable endpoints.
 * Pre-send refusals are ProviderNotSent (nothing left the process). Once a request is sent, any failure is ambiguous: the gate
 * fences and nothing is resent. Redirects are refused.
 */
export type HttpVerifierConfig = {
  enabled?: boolean; origin: string; credential: () => string | undefined;
  fetch?: typeof fetch; timeoutMs?: number;
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
  private async call(path: string, body: unknown, authorization: string): Promise<unknown> {
    const response = await (this.c.fetch ?? fetch)(this.c.origin + path, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(this.c.timeoutMs ?? 30_000),
      headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (response.status !== 200) throw new Error("QDEV_VERIFIER_STATUS_" + response.status);
    return response.json();
  }

  async submit(handoff: VerifierHandoff): Promise<KnownOutcome<unknown> | UnknownOutcome<unknown>> {
    if (handoff?.schema !== "myeve.qualification-verifier-handoff/v1" || !/^[a-f0-9]{64}$/.test(handoff.handoffSha256)) throw new ProviderNotSent("handoff malformed");
    const authorization = this.authorization();
    let body: any;
    try { body = await this.call("/qdev/v1/handoff", handoff, authorization); }
    catch (error) { throw new Error("QDEV_VERIFIER_POST_SEND_AMBIGUOUS", { cause: error }); }
    // Acceptance must echo the exact handoff digest; anything else is unproven.
    if (!body || typeof body !== "object" || Object.keys(body).sort().join(",") !== "accepted,handoffSha256" || body.accepted !== true || body.handoffSha256 !== handoff.handoffSha256) return { known: false };
    return { known: true, value: { accepted: true, handoffSha256: handoff.handoffSha256 } };
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
