import type {FactoryCodingSessionAdapter} from "@/lib/engineering/coding-sessions";
type View = Awaited<ReturnType<FactoryCodingSessionAdapter["observe"]>>;
const labels: Record<string,string> = {
 PREPARED:"Prepared", RUNNING_REPORTED:"Coding in progress", RECONCILIATION_REQUIRED:"Reconciliation required",
 INTERRUPTING:"Interruption requested", COMPLETED_UNVERIFIED:"Session complete · verification incomplete",
 INDEPENDENT_CHECKS_PASSED:"Independent checks passed", VERIFICATION_FAILED:"Verification failed",
 FAILED:"Session failed", CANCELLED:"Session interrupted", HISTORICAL:"Earlier session",
};
/** Read-only saved state. Refresh/reconnect never invokes an execution command. */
export function CodingSessions({view}:{view?:View}) {
 if (!view) return <section className="owner-card" aria-label="Coding sessions"><h2>Coding sessions</h2><p>Session details are unavailable. Refresh Work to try again.</p></section>;
 return <section className="owner-card" aria-label="Coding sessions"><h2>Coding sessions</h2>
  {!view.sessions.length ? <p>No Factory coding sessions recorded for this Work.</p> : <ul className="owner-list">{view.sessions.map(s=><li key={s.id}>
   <h3>{labels[s.state]??s.state}</h3><p>Assigned agent: {s.assignedAgentId}</p>
   <p>{s.repository} · Attempt {s.attemptNumber}</p><p>Recorded session outcome: {s.recordedStatus ?? "Unconfirmed"}</p><p>Base commit: <code>{s.baseSha}</code></p>
   <p>{s.worktree&&<>Worktree: <code>{s.worktree}</code>. </>}{s.associationLimit}</p><p>{s.independentlyVerified?"The retained candidate passed independent checks.":"Session completion does not establish verified success."}</p>
  </li>)}</ul>}
  <p>{view.progress}</p><p>{view.nextStep}</p>
  {view.accounting?.blocker&&<p role="status">Accounting: {view.accounting.blocker}</p>}
  <p>{view.artifacts.length} integrity-checked artifact{view.artifacts.length===1?"":"s"} retained. Publication requires separate authorization.</p>
  {view.result&&<p>Candidate: <code>{view.result.candidate}</code></p>}
  <details><summary>Capability limits</summary><ul>{Object.entries(view.capabilities).filter(([,c])=>!c.supported).map(([name,c])=><li key={name}>{name}: Deferred. {c.reason}</li>)}</ul></details>
 </section>;
}
