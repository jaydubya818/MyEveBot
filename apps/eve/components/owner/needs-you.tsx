"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ApprovalRequestView } from "@/lib/approvals";
import type { AttentionView, InboxPage } from "@/lib/universal-inbox/contracts";
import type { EngineeringWorkerProjection } from "@/lib/engineering/worker-projection";
import { ownerRequest } from "./data";
import { DecisionCard } from "./decisions";
import { pendingApprovals } from "./projection";
import { Empty, date } from "./primitives";
import { ProductShell, ResourceState } from "./product-shell";
import { useProductResource } from "./resource";

type RecordedDecision = { itemId: string; prompt: string; answer: string; status: string; at: string; approvalId: string | null };
type DecisionPage = InboxPage & { decisions: RecordedDecision[] };

export function NeedsYou({ workId, allowedCapabilities }: { workId?: string; allowedCapabilities: string[] | null }) {
  const [history, setHistory] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const inbox = useProductResource<DecisionPage>(`/api/beta/inbox?view=${history ? "decision_history" : "needs_you"}&limit=20${workId ? `&workId=${encodeURIComponent(workId)}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, 10000);
  const approvals = useProductResource<{ approvals: ApprovalRequestView[] }>("/api/approvals", 10000);
  const active = new Set(pendingApprovals(approvals.data?.approvals ?? []).map(item => item.id));
  const boundApprovals = new Set([...(inbox.data?.items.flatMap(item => item.action?.approval ? [item.action.approval.id] : []) ?? []), ...(inbox.data?.decisions.flatMap(item => item.approvalId ? [item.approvalId] : []) ?? [])]);
  const choiceItems = inbox.data?.items.filter(item => item.kind !== "APPROVAL") ?? [];
  const permitted = (item: ApprovalRequestView) => allowedCapabilities === null || Boolean(item.capabilityId && allowedCapabilities.includes(item.capabilityId) && !["publish", "deploy", "send", "transfer"].includes(item.actionClass));
  const approvalRows = (approvals.data?.approvals ?? []).filter(item => (!workId || boundApprovals.has(item.id)) && (history ? !active.has(item.id) : active.has(item.id) && permitted(item)));
  function refresh() { inbox.refresh(); approvals.refresh(); }
  function saved() { setNotice("Your decision is saved. Sofie will check the current Work before continuing."); refresh(); }
  return <ProductShell title="Needs You" description="Decisions that need your judgment.">
    {workId && <p><Link href="/needs-you">All decisions</Link></p>}
    <div className="owner-actions" role="group" aria-label="Decision history">
      <button aria-pressed={!history} onClick={() => { setHistory(false); setCursor(null); setNotice(""); }}>Needs You</button>
      <button aria-pressed={history} onClick={() => { setHistory(true); setCursor(null); setNotice(""); }}>History</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    <ResourceState {...inbox}/><ResourceState {...approvals}/>
    {choiceItems.map(item => <AttentionDecisionCard key={`${item.id}:${item.revision}`} item={item} history={history} recorded={inbox.data?.decisions?.find(decision => decision.itemId === item.id)} onDecision={saved} onRefresh={refresh}/>)}
    {approvalRows.map(item => <DecisionCard key={`${item.id}:${item.status}`} item={item} preview={false} onDecision={saved}/>)}
    {!inbox.loading && !approvals.loading && !inbox.error && !approvals.error && !choiceItems.length && !approvalRows.length && <Empty title={history ? "No past decisions" : "You’re all caught up"}>{history ? "Resolved decisions stay here for reference." : "Sofie will bring decisions here when she needs you."}</Empty>}
    <nav className="owner-actions" aria-label="Decision pages">
      {cursor && <button onClick={() => setCursor(null)}>Newest decisions</button>}
      {inbox.data?.nextCursor && <button onClick={() => setCursor(inbox.data!.nextCursor)}>More decisions</button>}
    </nav>
  </ProductShell>;
}

/** Inbox choices and exact-action approvals retain their existing distinct
 * write contracts. This component never creates execution authority. */
function AttentionDecisionCard({ item, history, recorded, onDecision, onRefresh }: {
  item: AttentionView; history: boolean; recorded?: RecordedDecision; onDecision: () => void; onRefresh: () => void;
}) {
  const work = useProductResource<{ canonical?: { projection: EngineeringWorkerProjection } }>(item.workId ? `/api/beta/work?workId=${encodeURIComponent(item.workId)}` : null, 10000);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const locked = useRef(false);
  const keys = useRef(new Map<string, string>());
  const projection = work.data?.canonical?.projection;
  const stale = Boolean(item.workId && (!projection || item.workVersion !== null && item.workVersion !== projection.workVersion || item.workGeneration !== null && item.workGeneration !== projection.workGeneration));
  const eligible = !history && item.needsYou && item.availableActions.includes("respond") && item.action && !stale && !error;
  const historyStatus = recorded?.status === "PENDING" ? "Answer saved — awaiting follow-through"
    : recorded?.status === "STALE" ? "Work changed — answer retained"
    : recorded?.status === "CANCELLED" ? "Cancelled — answer retained"
    : item.status === "SUPERSEDED" ? "Replaced by a newer decision"
    : item.status === "DISMISSED" ? "Dismissed"
    : !recorded && item.action?.expiresAt && Date.parse(item.action.expiresAt) <= Date.now() ? "Expired"
    : item.status === "RESOLVED" || recorded?.status === "DELIVERED" ? "Resolved" : "Answer retained";
  async function decide(value: string) {
    if (!eligible || locked.current || !value.trim()) return;
    locked.current = true; setBusy(true); setError("");
    const key = keys.current.get(value) ?? crypto.randomUUID(); keys.current.set(value, key);
    let accepted = false;
    try {
      await ownerRequest("/api/beta/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "decision", response: { itemId: item.id, actionId: item.action!.id, actionBinding: item.actionBinding, expectedRevision: item.revision, idempotencyKey: key, answer: value.trim() } }) });
      accepted = true;
      onDecision();
    } catch { setError("The decision was not confirmed. Refresh the current decision before trying again."); }
    finally { if (!accepted) { locked.current = false; setBusy(false); } }
  }
  return <article className="owner-card" data-decision-id={item.id}>
    <h2>{recorded?.prompt ?? item.action?.prompt ?? item.title}</h2>
    {projection && <p><Link href={`/work?kind=work&id=${encodeURIComponent(projection.workId)}`}>{projection.title}</Link></p>}
    <p>{item.source.system === "work" && item.correlationId.startsWith("work-choice:") ? history ? "Your choice is retained with this Work." : "Sofie needs your choice before continuing this Work." : item.summary}</p>
    {item.action?.approval && <section><h3>If you allow this action</h3><ul>{item.action.approval.effects.map(effect => <li key={effect}>{effect}</li>)}</ul><p>Declining withholds permission for this action.</p></section>}
    {!history && <p className="owner-muted">{item.action?.id.startsWith('private-result:') ? 'Acceptance completes this Work only after its exact verification and accounting are checked again. Nothing is published.' : 'Your answer applies to this request. It does not confirm that the Work has been completed.'}</p>}
    {item.workId && <><ResourceState {...work}/>{projection && <p><Link href={`/work?kind=work&id=${encodeURIComponent(item.workId)}`}>View Result and Proof →</Link></p>}</>}
    {history && <><p>Your answer: <strong>{recorded?.answer ?? "No answer recorded"}</strong></p><p className="owner-muted">{historyStatus}<time className="block" dateTime={recorded?.at ?? item.resolvedAt ?? item.updatedAt}>{date(recorded?.at ?? item.resolvedAt ?? item.updatedAt)}</time></p></>}
    {!history && stale && !work.loading && !work.error && <p role="status">This Work has changed. Reopen the current decision before answering.</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={() => { setError(""); onRefresh(); work.refresh(); }}>Refresh decision</button></div>}
    {eligible && (item.action!.options.length ? <div className="owner-actions">{item.action!.options.map(option => <button key={option} disabled={busy} onClick={() => void decide(option)}>{option === "approved" ? "Allow this action" : option === "denied" ? "Decline" : option}</button>)}</div> : <form onSubmit={event => { event.preventDefault(); void decide(answer); }} className="owner-form"><label>Your answer<textarea value={answer} onChange={event => setAnswer(event.target.value)} maxLength={4000} required disabled={busy}/></label><button disabled={busy || !answer.trim()}>Save answer</button></form>)}
  </article>;
}
