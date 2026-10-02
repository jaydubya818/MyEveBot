import { z } from "zod";
import { digest } from "./contract.ts";
import { assertFactoryCandidateIdentity } from "./github.ts";
import type { Candidate } from "./execution.ts";
import { WorkError } from "./types.ts";

const hash = z.string().regex(/^[a-f0-9]{40}$/);
export const ownerAction = z.enum(["open_pr", "push_branch", "keep_private", "reject"]);
export type OwnerAction = z.infer<typeof ownerAction>;
export const publicationBinding = z.object({
 owner: z.string().min(1), workId: z.uuid(), resultId: z.uuid(), resultHash: z.string(),
 version: z.number().int().positive(), generation: z.number().int().positive(),
 candidate: hash, verifiedTree: hash, repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
 baseRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine(s => !s.includes("..") && !/^[a-f0-9]{40}$/.test(s)),
 expectedBaseSha: hash, branch: z.string().regex(/^codex\/factory\/wo-[a-f0-9-]{36}$/),
 receiptId: z.uuid(), profileHash: z.string(), allowedPaths: z.array(z.string()).min(1),
 title: z.string().min(1).max(200), body: z.string().max(20000),
 publicationReady: z.literal(true), ownerAcceptance: z.literal("NOT_RUN"),
}).strict();
export type PublicationBinding = z.infer<typeof publicationBinding>;
export function deny(message: string): never { throw new WorkError("publication_denied", message, 409); }
/** Recompute all immutable objects; a mutable host checkout is never an input. */
export function assertPublicationCustody(binding: PublicationBinding, candidate: Candidate, sourceFiles: Record<string,string>) {
 publicationBinding.parse(binding);
 assertFactoryCandidateIdentity({workId:binding.workId,repository:binding.repository,baseSha:binding.expectedBaseSha,
  profile:{allowedPaths:binding.allowedPaths}}, {sha:binding.expectedBaseSha,files:sourceFiles},candidate);
 if(candidate.sha!==binding.candidate || candidate.tree!==binding.verifiedTree ||
    candidate.id!==binding.receiptId || candidate.factoryProvenance?.receiptId!==binding.receiptId ||
    binding.branch!==`codex/factory/wo-${candidate.factoryProvenance?.workOrderId}` ||
    JSON.stringify([...candidate.changedPaths].sort())!==JSON.stringify([...binding.allowedPaths].sort()))
  deny("Candidate, verified tree, one-file scope or custody binding changed.");
}
export const decisionInput = z.object({workId:z.uuid(),bindingHash:z.string().regex(/^[a-f0-9]{64}$/),
 previousId:z.uuid().nullable(),action:ownerAction,confirmed:z.literal(true)}).strict();
export const bindingHash = (binding: PublicationBinding) => digest(binding);
