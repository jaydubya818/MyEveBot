import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digest, profileSchema } from "./contract.ts";
import { invalidateEvidence, latestCandidate, nowIso, queueRun, readiness, type Execution } from "./execution.ts";
import { workBranch, type EngineeringGitHub, type RepositorySnapshot } from "./github.ts";
import type { Executor, ProtectedVerifier } from "./executor.ts";
import type { ExecutionStore } from "./execution-store.ts";
import { WorkError } from "./types.ts";

const feedbackSchema=z.object({scope:z.literal("within-existing-criteria"),criterionId:z.string().uuid(),instruction:z.string().min(1).max(2000),
  check:profileSchema.shape.checks.element.omit({id:true,criterionIds:true})}).strict();
export function boundedReview(state:Execution,review:NonNullable<Execution["truth"]>["reviews"][number]) {
  if (!state.contract.profile.reviewerLogins.includes(review.author)) throw new WorkError("review_authority","Review requires an authorized reviewer decision.");
  let value:unknown;try {value=JSON.parse(review.body);}catch{throw new WorkError("review_ambiguity","Review is not an explicit in-scope verification request. Human judgment is required.");}
  const input=feedbackSchema.parse(value);
  if(!state.contract.criteria.some(c=>c.id===input.criterionId) || !state.contract.profile.allowedPaths.includes(input.check.program))
    throw new WorkError("review_scope","Review would change the admitted criteria or source boundary.");
  return {instruction:input.instruction,check:{...input.check,id:`review-${review.id}`,criterionIds:[input.criterionId]}};
}

/** Repeated ticks resume persisted phases. The UI and model are never the worker clock. */
export class EngineeringWorker {
  constructor(readonly store:ExecutionStore,readonly github:EngineeringGitHub,readonly executor:Executor,readonly verifier:ProtectedVerifier,
    readonly profileCurrent:()=>string, readonly authorityCurrent:()=>Promise<boolean>) {}
  async tick(id:string) {
    const claim=await this.store.claim(id);if(!claim)return;
    const state=claim.state;let leaseError:unknown;
    const heartbeat=setInterval(()=>{void this.store.renew(id,claim.token).catch(e=>{leaseError=e;});},10000);
    try {
      const save=async(kind:string)=>{if(leaseError)throw leaseError;const work=await this.store.workStore.get(id);await this.store.save(work,state,kind,claim.token);};
      let work=await this.store.workStore.get(id);
      if(!await this.authorityCurrent())throw new WorkError("agent_authority","The coordinating Agent is no longer active in this owner scope.");
      if (work.generation!==state.generation || work.control!=="agent" || work.lifecycle!=="active") {
        for(const run of state.runs.filter(r=>r.status==="queued"||r.status==="running")) {
          await this.executor.requestStop(run);
          await this.retainInterruptedCandidate(state,run);
          run.status="stopped";run.endedAt=nowIso();
        }
        invalidateEvidence(state);state.generation=work.generation;state.approval=null;
        if(work.control!=="agent"||work.lifecycle!=="active")state.phase="stopped";
        else {
          if(work.criteriaVersion!==state.contract.criteriaVersion||state.contract.profileHash!==this.profileCurrent())throw new Error("The current criteria or profile requires a new contract.");
          const truth=await this.github.observe(state.contract,workBranch(id));
          if(!truth.authority||truth.baseSha!==state.contract.baseSha)throw new Error("Repository authority or base changed during human takeover.");
          state.truth=truth;state.blockers=[];
          queueRun(state,work,"Human gave back Work; preserve and reverify the reconciled branch",truth.head??latestCandidate(state)?.sha??state.contract.baseSha);
          state.interventions.push({id:randomUUID(),kind:"judgment",reason:"Human gave back control",at:nowIso()});
        }
        await save("writer_fenced");
        for(const run of state.runs.filter(r=>r.status==="stopped"&&!r.resourceReleasedAt)){await this.executor.cleanup(run);run.resourceReleasedAt=nowIso();}
        await save("fenced_resources_released");return;
      }
      if (state.contract.profileHash!==this.profileCurrent() || work.criteriaVersion!==state.contract.criteriaVersion || Date.now()>=Date.parse(state.contract.deadline))
        throw new WorkError("authority_changed","The criteria, profile, policy or deadline no longer matches this contract.");
      if(state.phase==="stopped"||state.phase==="needs_you"||state.phase==="approval")return;
      if(state.phase==="queued") {
        const truth=await this.github.observe(state.contract,workBranch(id));state.truth=truth;
        if(!truth.authority || truth.baseSha!==state.contract.baseSha)throw new Error("Repository authority or base changed before execution.");
        queueRun(state,work,"Implement admitted issue",truth.head??state.contract.baseSha);await save("run_queued");return;
      }
      const run=state.runs.at(-1);
      if(state.phase==="executing") {
        if(!run)throw new Error("Durable Run is missing.");
        const snapshot=run.inputSnapshot??await this.snapshot(state,run.parentSha);
        if(run.status==="queued") {
          run.inputSnapshot=snapshot;run.status="running";await save("attempt_started");
          await this.executor.start(state.contract,run,snapshot);return;
        }
        const observed=await this.executor.observe(run);
        if(observed==="running")return;
        if(observed==="lost"||observed==="failed")throw new WorkError("executor_lost","Executor stopped without a qualified candidate. Work remains durable; select a fresh instance of the same executor.");
        const candidate=await this.executor.collectCandidate(state.contract,run,snapshot);
        await this.executor.collectUsage(run);
        invalidateEvidence(state);state.candidates.push(candidate);run.status="candidate";run.candidate=candidate.sha;run.endedAt=nowIso();state.phase="verifying";
        // Candidate custody precedes destruction of every replaceable executor resource.
        await save("candidate_retained");await this.executor.cleanup(run);run.resourceReleasedAt=nowIso();await save("executor_resources_released");return;
      }
      const candidate=latestCandidate(state);
      if(state.phase==="verifying") {
        if(!candidate)throw new Error("Candidate custody is missing.");
        if(run)await this.executor.cleanup(run); // Recover a crash between custody commit and cleanup.
        const contract={...state.contract,profile:{...state.contract.profile,checks:[...state.contract.profile.checks,...state.reviewChecks.map(r=>r.check)]}};
        const evidence=await this.verifier.verify(contract,candidate);state.evidence.push(...evidence);
        if(evidence.some(e=>e.result!=="PASS")) {
          queueRun(state,work,`Protected verification failed: ${JSON.stringify(evidence.filter(e=>e.result!=="PASS").map(e=>({check:e.check,artifact:e.artifact})))}`,candidate.sha);
          await save("verification_continuation");return;
        }
        for(const review of state.reviewChecks) if(evidence.some(e=>e.check===review.check.id&&e.result==="PASS")&&!state.addressedReviews.includes(review.reviewId))state.addressedReviews.push(review.reviewId);
        state.phase=state.approval?.boundedUpdates&&state.approval.generation===work.generation?"publishing":"approval";
        await save("verification_recorded");return;
      }
      if(state.phase==="publishing") {
        if(!candidate||!state.approval||state.approval.generation!==work.generation||(!state.approval.boundedUpdates&&state.approval.candidate!==candidate.sha))throw new Error("Exact publication approval is missing.");
        const truth=await this.github.observe(state.contract,workBranch(id));state.truth=truth;
        const pending=state.effects.find(e=>["UNKNOWN","PREPARED"].includes(e.status));
        if(pending) {
          if(truth.authority&&truth.head===pending.candidate&&truth.pr?.draft&&truth.pr.open) {
            pending.status="CONFIRMED";pending.pr=truth.pr.number;pending.url=truth.pr.url;state.phase="observing";state.blockers=[];await save("publication_reconciled");return;
          }
          state.phase="needs_you";state.blockers=["EXTERNAL STATE UNKNOWN: publication could not be confirmed. No write was retried."];await save("external_state_unknown");return;
        }
        if(!truth.authority||truth.baseSha!==state.contract.baseSha || (truth.head??state.contract.baseSha)!==candidate.parentSha)throw new Error("Branch or base changed before publication; human reconciliation required.");
        const evidenceContract={...state,truth:{...truth,head:candidate.sha,pr:{number:0,url:"",draft:true,open:true}},effects:[...state.effects,{id:"preflight",candidate:candidate.sha,expectedHead:truth.head,status:"CONFIRMED" as const,createdAt:nowIso()}],phase:"observing" as const};
        // Independently require every current protected check; CI/PR are established only after publication.
        const checkReasons=readiness(work,evidenceContract).reasons.filter(r=>r.startsWith("Protected verification")||r.includes("criteria changed"));
        if(checkReasons.length)throw new Error(checkReasons.join(" "));
        const effect={id:randomUUID(),candidate:candidate.sha,expectedHead:truth.head,status:"UNKNOWN" as const,createdAt:nowIso()};
        state.effects.push(effect);await save("publication_prepared");
        // Re-read local fence after the durable effect record and before the first external write.
        const current=await this.store.workStore.get(id);if(current.generation!==work.generation||current.control!=="agent"||!await this.authorityCurrent())throw new Error("Publication writer was fenced.");
        const pr=await this.github.publish(state.contract,candidate,workBranch(id),truth.head);
        Object.assign(effect,{status:"CONFIRMED",pr:pr.number,url:pr.url});state.phase="observing";await save("publication_confirmed");return;
      }
      if(state.phase==="observing"||state.phase==="ready") {
        const previousPhase=state.phase,previousTruth=digest({...state.truth,observedAt:null});
        const truth=await this.github.observe(state.contract,workBranch(id));state.truth=truth;
        if(!truth.authority||truth.head!==candidate?.sha||truth.baseSha!==state.contract.baseSha)throw new Error("GitHub head, base or authority changed. Take over or reconcile before continuing.");
        const latestChecks=state.contract.profile.requiredCI.map(name=>truth.checks.filter(c=>c.name===name&&c.sha===candidate.sha).sort((a,b)=>b.attempt-a.attempt||Number(b.id)-Number(a.id))[0]).filter(Boolean);
        const failed=latestChecks.find(c=>c.result==="FAIL"&&!state.handledEvents.includes(`ci:${c.id}:${c.attempt}`));
        if(failed) {
          state.handledEvents.push(`ci:${failed.id}:${failed.attempt}`);queueRun(state,work,`CI ${failed.name} failed at ${failed.sha}: ${failed.details}`,candidate.sha);
          await save("ci_continuation");return;
        }
        const review=truth.reviews.find(r=>r.state==="CHANGES_REQUESTED"&&!state.addressedReviews.includes(r.id)&&!state.handledEvents.includes(`review:${r.id}`));
        if(review) {
          const feedback=boundedReview(state,review);state.reviewChecks.push({reviewId:review.id,check:feedback.check});
          state.handledEvents.push(`review:${review.id}`);queueRun(state,work,`Authorized review ${review.id}: ${feedback.instruction}. Required behavior: ${JSON.stringify(feedback.check)}`,candidate.sha);
          await save("review_continuation");return;
        }
        const decision=readiness(work,state);state.phase=decision.ready?"ready":"observing";
        if(decision.ready&&!state.results.some(r=>r.candidate===candidate.sha)) {
          state.results.push({id:randomUUID(),version:state.results.length+1,createdAt:nowIso(),candidate:candidate.sha,
            summary:"Current protected verification and GitHub checks pass; draft PR is ready for human review.",objective:work.objective,criteria:work.criteria,
            changes:candidate.changedPaths,why:work.objective,verification:structuredClone(state.evidence.filter(e=>e.candidate===candidate.sha)),github:structuredClone(truth),runs:structuredClone(state.runs),
            limitations:["Internal dogfood only", "Bounded UTF-8 Node CLI repositories", "Model costs are conservative reservations; infrastructure cost excluded"],risks:[],interventions:structuredClone(state.interventions),
            reservedUsd:state.reservedUsd,costCoverage:"Conservative broker reservations; infrastructure excluded",elapsedSeconds:Math.ceil((Date.now()-Date.parse(state.runs[0].startedAt))/1000)});
        }
        if(previousPhase===state.phase&&previousTruth===digest({...truth,observedAt:null}))
          await this.store.refreshObservation(work,state,claim.token);
        else await save(decision.ready?"ready_reconciled":"github_observed");
      }
    } catch(error) {
      // Errors never manufacture success or silently replay a consequential write.
      const work=await this.store.workStore.get(id);state.phase=state.effects.some(e=>e.status==="UNKNOWN")?"publishing":"needs_you";state.blockers=[error instanceof Error?error.message:"Execution needs reconciliation."];
      for(const run of state.runs.filter(r=>r.status==="running")) {
        try {await this.executor.requestStop(run);await this.retainInterruptedCandidate(state,run);run.status="failed";run.endedAt=nowIso();}
        catch {state.blockers.push(`Resource stop is unconfirmed: ${run.resource}`);}
      }
      try {
        await this.store.save(work,state,"needs_human_review",claim.token);
        for(const run of state.runs.filter(r=>r.status==="failed"&&!r.resourceReleasedAt)){await this.executor.cleanup(run);run.resourceReleasedAt=nowIso();}
        await this.store.save(work,state,"failed_resources_released",claim.token);
      } catch { /* Newer control/worker state wins; deterministic resource names remain in the manifest for reconciliation. */ }
    } finally {clearInterval(heartbeat);await this.store.release(id,claim.token);}
  }
  private async snapshot(state:Execution,sha:string):Promise<RepositorySnapshot> {
    const candidate=state.candidates.find(c=>c.sha===sha);
    return candidate?{sha:candidate.sha,files:candidate.files}:this.github.snapshot(sha);
  }
  private async retainInterruptedCandidate(state:Execution,run:Execution["runs"][number]) {
    if(!run.inputSnapshot||run.candidate)return;
    try {
      const candidate=await this.executor.collectCandidate(state.contract,run,run.inputSnapshot);
      invalidateEvidence(state);state.candidates.push(candidate);run.candidate=candidate.sha;
    } catch(error) {
      // No returned candidate is claimed. Invalid/no-change output cannot become authoritative evidence.
      state.blockers.push(`Interrupted attempt has no admissible candidate: ${error instanceof Error?error.message:"unavailable"}`);
    }
  }
  async continue(id:string,revision:number) {
    const work=await this.store.workStore.get(id),state=await this.store.get(id);
    if(!await this.authorityCurrent())throw new Error("Current coordinating Agent authority is required.");
    if(!state||state.revision!==revision||work.control!=="agent"||state.effects.some(e=>["PREPARED","UNKNOWN"].includes(e.status)))throw new Error("Current agent control and reconciled external effects are required.");
    if(state.contract.profileHash!==this.profileCurrent()||work.criteriaVersion!==state.contract.criteriaVersion)throw new Error("Contract authority changed; continuation denied.");
    const truth=await this.github.observe(state.contract,workBranch(id));
    for(const run of state.runs.filter(r=>["running","queued"].includes(r.status))) {await this.executor.requestStop(run);run.status="stopped";run.endedAt=nowIso();}
    invalidateEvidence(state);state.generation=work.generation;state.truth=truth;state.blockers=[];state.approval=null;
    queueRun(state,work,"Human gave back Work or selected a fresh instance; preserve the reconciled branch",truth.head??latestCandidate(state)?.sha??state.contract.baseSha);
    state.interventions.push({id:randomUUID(),kind:"judgment",reason:"Explicit human continuation / same-executor replacement",at:nowIso()});
    return this.store.save(work,state,"human_continuation");
  }
}
