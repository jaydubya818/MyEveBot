"use client";

import { useEffect, useRef, useState } from "react";

type Policy = { capability: string; resource: string; policy: string; recordTypes: string[]; topics: string[] };
type Relationship = { id: string; localAgentId: string; peer: string; displayName: string; revision: number;
  expiresAt: string | null; revokedAt: string | null; status: string;
  policies: (Policy & { effective: string; relayStatus: string; relayExpiresAt: string | null; reason: string })[] };
type Model = { relationships: Relationship[]; discoveryStatus: string; peers: { address?: string; name?: string }[] };
type Draft = { permissionId?: string; localAgentId: string; peer: string; displayName: string; policies: Policy[];
  expiresAt: string | null; expectedRevision: number; mutationId: string; revoke: boolean };
const control = "w-full min-w-0 rounded-md border border-kumo-line bg-transparent px-3 py-2 text-sm disabled:opacity-50";
const capabilities = ["message.send", "message.receive", "knowledge.query", "work.request", "artifact.share", "artifact.receive"];
const capabilityNames: Record<string, string> = { "message.send": "Outbound messages", "message.receive": "Incoming messages", "knowledge.query": "Published Knowledge", "work.request": "Bounded work", "artifact.share": "Share artifacts", "artifact.receive": "Receive artifacts" };
const words = (value: string) => value.toLowerCase().replaceAll("_", " ");
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Until revoked";
const split = (value: string) => value.split(",").map(part => part.trim()).filter(Boolean);

export function PeerPermissionsPanel({ localAgentId }: { localAgentId: string }) {
  const [model, setModel] = useState<Model>();
  const [selected, setSelected] = useState<Relationship>();
  const [editing, setEditing] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [expiry, setExpiry] = useState("7");
  const [review, setReview] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  async function refresh() {
    const response = await fetch("/api/relay/peer-permissions", { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "Unable to load permissions.");
    setModel(value);
  }
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, []);
  useEffect(() => { if (editing || review) heading.current?.focus(); }, [editing, review]);
  function edit(row?: Relationship) {
    setSelected(row); setReview(undefined); setError(""); setNotice(""); setEditing(true);
    setPolicies(row ? row.policies.map(({ capability, resource, policy, recordTypes, topics }) => ({ capability, resource, policy, recordTypes, topics })) : []);
    setExpiry(row ? "keep" : "7");
  }
  function update(index: number, change: Partial<Policy>) {
    setPolicies(current => current.map((policy, i) => i === index ? { ...policy, ...change } : policy));
  }
  async function save() {
    if (!review) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/relay/peer-permissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(review) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save permissions.");
      setReview(undefined); setEditing(false);
      setNotice(review.revoke ? "Peer permission revoked. New actions are blocked." : "MyEve policy saved. Relay authority is checked independently.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save. Your selections are retained."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border border-kumo-line p-5" aria-labelledby="peer-permissions-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="peer-permissions-title" className="font-semibold">Peer permissions</h2>
      <button type="button" className="rounded-md border px-3 py-2 text-sm" disabled={busy} onClick={() => edit()}>Add relationship</button>
    </div>
    <p className="text-sm text-kumo-subtle">Choose an exact peer and resource for each capability. Private Knowledge is never shared. Every consequential outbound action still needs exact approval.</p>
    {error && <p role="alert" className="rounded-md border p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!model && !error && <p role="status">Loading peer permissions…</p>}
    {model && !model.relationships.length && !editing && <p className="text-sm">No peer relationships yet. Discovery alone grants no access.</p>}
    {model?.discoveryStatus === "UNAVAILABLE" && <p className="text-sm">Relay discovery is unavailable. Saved policies remain visible; access is not assumed.</p>}
    {!editing && model?.relationships.map(row => <article key={row.id} className="space-y-3 rounded-lg border border-kumo-line p-4">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{row.displayName}</h3><span className="text-sm">{words(row.status)}</span></div>
      <p className="break-all text-sm">{row.peer}</p>
      <p className="text-sm">MyEve expiration: {date(row.expiresAt)} · Revision {row.revision}</p>
      {row.policies.map(policy => <div key={`${policy.capability}:${policy.resource}`} className="space-y-1 border-t border-kumo-line pt-2 text-sm">
        <p>{capabilityNames[policy.capability] ?? policy.capability} · <span className="break-all">{policy.resource}</span></p>
        <p>MyEve: {words(policy.policy)} · Relay: {words(policy.relayStatus)} · Effective: {words(policy.effective)}</p>
        {policy.relayExpiresAt && <p>Relay expires: {date(policy.relayExpiresAt)}</p>}
        <p className="text-kumo-subtle">{words(policy.reason)}</p>
      </div>)}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => edit(row)}>{row.revokedAt ? "Review and restore" : "Edit permissions"}</button>
        {!row.revokedAt && <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => {
          edit(row); setReview({ permissionId: row.id, localAgentId: row.localAgentId, peer: row.peer, displayName: row.displayName,
            policies: row.policies.map(({ capability, resource, policy, recordTypes, topics }) => ({ capability, resource, policy, recordTypes, topics })),
            expiresAt: row.expiresAt, expectedRevision: row.revision, mutationId: crypto.randomUUID(), revoke: true });
        }}>Revoke</button>}
      </div>
    </article>)}
    {editing && <div className="space-y-4 border-t border-kumo-line pt-4">
      <h3 ref={heading} tabIndex={-1} className="font-medium">{review ? "Review peer permission change" : selected ? "Edit peer relationship" : "New peer relationship"}</h3>
      {review ? <div className="space-y-3 text-sm">
        <p>{review.revoke ? "Revoke" : selected?.revokedAt ? "Restore" : "Save"} {review.displayName}</p>
        <p className="break-all">{review.peer}</p><p>Local Agent: {review.localAgentId}</p>
        <p>MyEve expiration: {date(review.expiresAt)}</p>
        {review.policies.map(p => <p key={`${p.capability}:${p.resource}`} className="break-all">{capabilityNames[p.capability] ?? p.capability}: {words(p.policy)} · {p.resource}{p.recordTypes.length ? ` · Record types: ${p.recordTypes.join(", ")}` : ""}{p.topics.length ? ` · Topics: ${p.topics.join(", ")}` : ""}</p>)}
        <p>Saving does not create or renew Relay grants, approve a pending Action, or publish private Knowledge.</p>
        {review.expiresAt === null && !review.revoke && <p>This MyEve policy will remain until you revoke it. Relay authority may expire sooner.</p>}
        <div className="flex gap-3"><button type="button" className="rounded-md border px-3 py-2" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : review.revoke ? "Confirm revocation" : "Confirm policy"}</button>
          <button type="button" disabled={busy} onClick={() => setReview(undefined)}>Back</button></div>
      </div> : <form key={selected?.id ?? "new"} className="space-y-4" onSubmit={event => {
        event.preventDefault(); setError("");
        const fields = new FormData(event.currentTarget);
        const expiresAt = expiry === "keep" ? selected?.expiresAt ?? null : expiry === "never" ? null : expiry === "custom"
          ? new Date(String(fields.get("customExpiry"))).toISOString() : new Date(Date.now() + Number(expiry) * 86400000).toISOString();
        setReview({ permissionId: selected?.id, localAgentId: selected?.localAgentId ?? localAgentId, peer: String(fields.get("peer")), displayName: String(fields.get("displayName")),
          policies, expiresAt, expectedRevision: selected?.revision ?? 0, mutationId: crypto.randomUUID(), revoke: false });
      }}>
        <label className="block text-sm">Display name<input className={control} name="displayName" defaultValue={selected?.displayName} required maxLength={100}/></label>
        <label className="block text-sm">Exact Relay peer address<input className={control} name="peer" list="discovered-relay-peers" defaultValue={selected?.peer} readOnly={Boolean(selected)} required type="url"/></label>
        <datalist id="discovered-relay-peers">{model?.peers.filter(p => typeof p.address === "string").map(p => <option key={p.address} value={p.address}>{p.name ?? p.address}</option>)}</datalist>
        {policies.map((policy, i) => <fieldset key={i} className="space-y-3 rounded-lg border border-kumo-line p-3">
          <legend className="px-1 text-sm">Capability {i + 1}</legend>
          <label className="block text-sm">Capability<select className={control} value={policy.capability} onChange={e => update(i, { capability: e.target.value, policy: "DENY", recordTypes: [], topics: [] })}>{capabilities.map(c => <option key={c} value={c}>{capabilityNames[c]}</option>)}</select></label>
          <label className="block text-sm">Exact resource<input className={control} value={policy.resource} required onChange={e => update(i, { resource: e.target.value })}/></label>
          <label className="block text-sm">MyEve policy<select className={control} value={policy.policy} onChange={e => update(i, { policy: e.target.value })}><option value="DENY">Deny</option><option value="REQUIRE_APPROVAL">Require exact approval</option>{["knowledge.query", "message.receive"].includes(policy.capability) && <option value="ALLOW">Allow scoped access</option>}</select></label>
          {policy.capability === "knowledge.query" && <>
            <label className="block text-sm">Published record types (comma separated)<input className={control} defaultValue={policy.recordTypes.join(", ")} required={policy.policy !== "DENY"} onBlur={e => update(i, { recordTypes: split(e.target.value) })}/></label>
            <label className="block text-sm">Topics (optional, comma separated)<input className={control} defaultValue={policy.topics.join(", ")} onBlur={e => update(i, { topics: split(e.target.value) })}/></label>
          </>}
          <button type="button" className="text-sm underline" onClick={() => setPolicies(current => current.filter((_, index) => index !== i))}>Remove capability {i + 1}</button>
        </fieldset>)}
        <button type="button" className="rounded-md border px-3 py-2 text-sm" disabled={policies.length >= 50} onClick={() => setPolicies(current => [...current, { capability: "message.send", resource: "", policy: "DENY", recordTypes: [], topics: [] }])}>Add scoped capability</button>
        <label className="block text-sm">MyEve expiration<select className={control} value={expiry} onChange={e => setExpiry(e.target.value)}>{selected && <option value="keep">Keep current: {date(selected.expiresAt)}</option>}<option value="0.0416666667">1 hour</option><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="custom">Custom date and time</option><option value="never">Until revoked</option></select></label>
        {expiry === "custom" && <label className="block text-sm">Expiration in your local time<input className={control} type="datetime-local" name="customExpiry" required/></label>}
        <div className="flex gap-3"><button className="rounded-md border px-3 py-2 text-sm">Review changes</button><button type="button" className="text-sm" onClick={() => setEditing(false)}>Cancel</button></div>
      </form>}
    </div>}
  </section>;
}
