"use client";

import { useEffect, useState } from "react";
import { ownerReviewLink } from "@/lib/missioncontrol/owner-review-link";
import { enterpriseInput, enterpriseResult, hasConsistentEnterpriseResult, proposeResponse, readResponse, submitResponse } from "@/lib/missioncontrol/contracts";

/** Only structured tool evidence is presented here; assistant narrative is never a status source. */
export function EnterpriseMissionCard({ input, output, onRefresh }: { input: unknown; output: unknown; onRefresh?: (message: string) => void }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const parsed = enterpriseInput.safeParse(input);
  if (!parsed.success || !output || typeof output !== "object") return null;
  const receipt = (output as { receipt?: { response?: unknown; observedAt?: number; projectId?: string } }).receipt;
  if (!receipt) return null;
  const request = parsed.data;
  const ownerLink = (identity: { proposalId: string; digest: string } | { missionId: string }) => {
    const href = ownerReviewLink(process.env.NEXT_PUBLIC_MISSIONCONTROL_OWNER_URL, receipt.projectId, identity);
    return href ? <a className="inline-flex min-h-11 items-center rounded-md border border-kumo-hairline px-3 underline" href={href} target="_blank" rel="noopener noreferrer">Review in MissionControl with owner login</a>
      : <p>Open Missions in MissionControl with your owner login to review this decision.</p>;
  };
  const shell = "my-2 space-y-3 rounded-xl border border-kumo-hairline bg-kumo-base p-4 text-sm";
  const refresh = (message: string) => onRefresh && <button type="button" className="min-h-11 rounded-md border border-kumo-hairline px-3 focus-visible:outline-2" onClick={() => onRefresh(message)}>Refresh from MissionControl</button>;
  if (request.operation === "enterprise.propose") {
    const proposal = proposeResponse.safeParse(receipt.response);
    if (!proposal.success) return null;
    const p = proposal.data;
    return <section aria-label="Enterprise Mission proposal" className={shell}>
      <h3 className="font-semibold">{p.proposal.title}</h3><p>{p.proposal.objective}</p>
      <h4 className="font-medium">Plan summary</h4><ul className="list-disc space-y-1 ps-5">{p.proposal.workstreams.map(s => <li key={s}>{s}</li>)}</ul>
      <p><strong>Stop condition:</strong> {p.proposal.stopCondition}</p>
      <p><strong>Needs You:</strong> {p.needsYou}</p>
      {ownerLink({ proposalId: p.proposalId, digest: p.digest })}
      <p>Draft budget: $0. Creating a draft does not authorize execution.</p>
      <details><summary>Proposal identity</summary><p className="break-all">{p.proposalId}</p><p className="break-all">{p.digest}</p></details>
      {refresh(`Inspect enterprise proposal ${p.proposalId}. If the exact digest ${p.digest} is owner-authorized, submit it once and read its Mission status. Otherwise show the outstanding owner decision.`)}
    </section>;
  }
  if (request.operation === "enterprise.submit") {
    const submitted = submitResponse.safeParse(receipt.response);
    if (!submitted.success) return null;
    return <section aria-label="Enterprise Mission created" className={shell}><h3 className="font-semibold">Mission draft created</h3><p className="break-all">Mission {submitted.data.missionId}</p><p>Plan approval and execution remain separate decisions.</p>
      {refresh(`Read enterprise Mission ${submitted.data.missionId} for proposal ${request.proposalId}; show its current Plan, WorkOrders and Needs You decisions.`)}</section>;
  }
  if (request.operation === "enterprise.read") {
    const status = readResponse.safeParse(receipt.response);
    if (!status.success || status.data.mission.id !== request.missionId) return null;
    const s = status.data;
    return <section aria-label="Enterprise Mission status" className={shell}>
      <h3 className="font-semibold">{s.mission.title}</h3><p>Observed status: {s.mission.state}</p>
      <p>{s.plan ? `Plan revision ${s.plan.revision}: ${s.plan.status}` : "A Plan has not been prepared yet."}</p>
      {s.needsYou && <p><strong>Needs You:</strong> {s.needsYou}</p>}
      {s.workOrders.length === 0 && <p>No WorkOrders have been created yet.</p>}
      <ul className="space-y-2">{s.workOrders.map(w => <li key={w.id}><strong>{w.title}</strong>: {w.state}{w.blockingIssue && <p>{w.blockingIssue}</p>}</li>)}</ul>
      {s.blockers.map(b => <p key={b}>{b}</p>)}{s.truncated && <p>Some work is omitted from this bounded view.</p>}
      <p>Recorded observation. Refresh to check current status.</p>
      {refresh(`Read current enterprise status for Mission ${request.missionId}, proposal ${request.proposalId}. If completed, use enterprise.result with the exact current approved Plan digest and show Result/Proof.`)}
    </section>;
  }
  if (request.operation === "enterprise.result") {
    const result = enterpriseResult.safeParse(receipt.response);
    if (!result.success || result.data.missionId !== request.missionId || result.data.plan.planDigest !== request.expectedPlanDigest
      || !hasConsistentEnterpriseResult(result.data) || result.data.observedAt > now
      || (receipt.projectId !== undefined && receipt.projectId !== result.data.projectId)) return null;
    const r = result.data, expired = now >= r.freshUntil;
    return <section aria-label="Enterprise Result and Proof" className={shell}>
      <h3 className="font-semibold">Result / Proof</h3><p className="break-all">Mission {r.missionId}</p>
      <p role="status">{expired ? "This observation has expired. Refresh before making a decision." : r.status === "AVAILABLE" ? "Recorded Quality Gate: PASS. Current verification is required." : "Result is not available. No enterprise PASS is established."}</p>
      <p>Saved conversation observations are not current verified proof. Open MissionControl to verify the Result and owner acceptance before deciding.</p>
      <p>Plan revision {r.plan.planRevision}. Recorded owner acceptance: {r.ownerAcceptance}.</p>
      <p>Observed {new Date(r.observedAt).toLocaleString()}. Valid until {new Date(r.freshUntil).toLocaleString()}.</p>
      {r.reasons.map(reason => <p key={reason}>{reason}</p>)}
      <details><summary>Exact verification evidence ({r.workOrders.length} WorkOrders)</summary><ul className="space-y-3">{r.workOrders.map(w => <li key={w.workOrderId} className="break-all"><p>WorkOrder: {w.workOrderId}</p><p>Candidate: {w.candidate}</p><p>Independent verifier: {w.verificationAttemptId}</p><p>Evidence: {w.evidenceSetDigest}</p><p>Proof: {w.proofDigest}</p></li>)}</ul></details>
      {ownerLink({ missionId: r.missionId })}
      <p>Isolated deterministic execution. Production authority: none.</p>
      {refresh(`Re-read enterprise.result for exact Mission ${request.missionId} and Plan digest ${request.expectedPlanDigest}. Present only fresh canonical Result/Proof evidence.`)}
    </section>;
  }
  return null;
}
