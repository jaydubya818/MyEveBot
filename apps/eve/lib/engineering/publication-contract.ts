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

// Host-observed post-publication evidence is additive. It never grants execution,
// merge, deployment or owner-acceptance authority and never rewrites a Proof.
export const publicationReadbackSchema = z.object({
 binding: publicationBinding, observedAt: z.iso.datetime(),
 branchCount:z.literal(1), prCount:z.literal(1), candidate:hash, tree:hash,
 baseRef:z.string(), baseSha:hash, prNumber:z.number().int().positive(), prUrl:z.string().url(),
 draft:z.literal(true), merged:z.literal(false), files:z.array(z.string()),
 ci:z.object({status:z.enum(['PASS','FAIL','PENDING']),workflow:z.string(),candidate:hash,runId:z.string(),url:z.string().url(),checks:z.array(z.object({name:z.string(),candidate:hash,result:z.enum(['PASS','FAIL','PENDING'])}))}).strict(),
 review:z.object({status:z.enum(['PASS','FAIL','PENDING']),candidate:hash,reviewer:z.string(),mode:z.literal('INDEPENDENT_READ_ONLY'),reportHash:z.string().regex(/^[a-f0-9]{64}$/),summary:z.string().max(4000),testsPassed:z.number().int().nonnegative(),findings:z.array(z.string().max(2000)),limitations:z.array(z.string().max(2000))}).strict(),
 ownerAcceptance:z.literal('NOT_RUN'),merge:z.literal('NOT_RUN'),deployment:z.literal('NOT_RUN'),
}).strict().superRefine((r,c)=>{
 const b=r.binding;
 if(r.candidate!==b.candidate||r.tree!==b.verifiedTree||r.baseRef!==b.baseRef||r.baseSha!==b.expectedBaseSha||
    r.ci.candidate!==b.candidate||r.review.candidate!==b.candidate||r.ci.checks.some(x=>x.candidate!==b.candidate)||
    r.prUrl!==`https://github.com/${b.repository}/pull/${r.prNumber}`||
    JSON.stringify([...r.files].sort())!==JSON.stringify([...b.allowedPaths].sort())||
    (r.ci.status==='PASS'&&(!r.ci.checks.length||r.ci.checks.some(x=>x.result!=='PASS')))||
    (r.review.status==='PASS'&&r.review.findings.length>0))c.addIssue({code:'custom',message:'Readback does not match exact publication or its evidence'});
});
export type PublicationReadback=z.infer<typeof publicationReadbackSchema>;
export function currentPublicationReadback(remote:unknown, expected:Pick<PublicationBinding,'owner'|'workId'|'resultId'|'resultHash'|'version'|'generation'|'candidate'>):PublicationReadback|null {
 const rows=(remote as {readbacks?:unknown[]}|null)?.readbacks;
 const parsed=publicationReadbackSchema.safeParse(Array.isArray(rows)?rows.at(-1):null);
 if(!parsed.success||(['owner','workId','resultId','resultHash','version','generation','candidate'] as const).some(key=>parsed.data.binding[key]!==expected[key]))return null;
 return parsed.data;
}
