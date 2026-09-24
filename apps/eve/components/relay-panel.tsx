"use client";
import { useEffect, useState } from "react";
import { peerMessageDraft } from "../lib/relay/message-draft";
import { grantDurationOptions, grantExpiry } from "../lib/relay/grant-duration";
import { PeerPermissionsPanel } from "./peer-permissions-panel";

type Row = Record<string, any>;
const control =
  "rounded-md border border-kumo-line bg-transparent px-3 py-2 text-sm disabled:opacity-50";
const section = "space-y-3 rounded-xl border border-kumo-line p-5";
const expiry = () => new Date(Date.now() + 86400000).toISOString();
export function RelayPanel() {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [visibility, setVisibility] = useState("PRIVATE"),
    [audience, setAudience] = useState("");
  const [preview, setPreview] = useState<Row | null>(null),
    [tab, setTab] = useState("incoming"),
    [reply, setReply] = useState<Row | null>(null);
  async function refresh() {
    const r = await fetch("/api/relay", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function act(
    operation: string,
    input?: unknown,
    id?: string,
  ): Promise<any> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/relay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, input, id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await refresh();
      setNotice("Saved. Current Relay state is shown below.");
      return d.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  function form(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    ) as Record<string, string>;
  }
  const button = (label: string, onClick: () => void) => (
    <button type="button" className={control} disabled={busy} onClick={onClick}>
      {label}
    </button>
  );
  if (!data)
    return <div role="status">{error || "Loading Relay sharing…"}</div>;
  if (!data.enabled)
    return (
      <div className={section}>
        <h2 className="font-semibold">Relay sharing is disabled</h2>
        <p className="text-sm text-kumo-subtle">
          Your private Knowledge stays in MyEve. Federation requires an
          explicitly configured Relay connection and signing-key pin.
        </p>
        <PeerPermissionsPanel localAgentId="" />
      </div>
    );
  const connection = data.connection;
  const rows = (data.inbox ?? []).filter((r: Row) =>
    tab === "outgoing"
      ? r.direction === "outgoing"
      : tab === "waiting"
        ? [
            "needs_approval",
            "processing",
            "recovery_required",
            "accepted",
          ].includes(r.state)
        : tab === "incoming"
          ? r.direction === "incoming" && r.state === "incoming"
          : r.state === tab,
  );
  return (
    <div className="space-y-6">
      <p className="text-sm text-kumo-subtle">
        Share selected Knowledge and bounded work with other owners. MyEve
        retains private data and the final authority to execute.
      </p>
      {error && (
        <p role="alert" className="rounded-lg border p-3 text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {busy && <p role="status">Saving…</p>}
      <section className={section}>
        <h2 className="font-semibold">Relay connection</h2>
        <p className="break-all text-sm">{data.origin}</p>
        {connection && (
          <>
            <p className="break-all font-mono text-sm">{connection.address}</p>
            <p className="text-sm">
              {connection.status} · pinned signing key{" "}
              {connection.signing_key_id}
            </p>
            <div className="flex flex-wrap gap-2">
              {button("Rotate Agent credential", () => void act("rotate"))}
              {button(
                "Revoke Agent credential",
                () => void act("revoke-credential"),
              )}
              {button("Check external inbox", () => void act("poll"))}
            </div>
          </>
        )}
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            const f = form(e);
            void act("connect", f);
            e.currentTarget.reset();
          }}
        >
          <label>
            MyEve Agent
            <select name="localAgentId" className={`${control} ml-2`} required>
              {data.agents.map((a: Row) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <input
            className={control}
            name="email"
            type="email"
            placeholder="Relay owner email"
            aria-label="Relay owner email"
            autoComplete="username"
            required
          />
          <input
            className={control}
            name="password"
            type="password"
            placeholder="Relay owner password"
            aria-label="Relay owner password"
            autoComplete="current-password"
            required
          />
          <button className={control} disabled={busy}>
            {connection
              ? "Reconnect owner session"
              : "Connect and register Agent"}
          </button>
        </form>
      </section>
      {connection && (
        <>
          <PeerPermissionsPanel localAgentId={connection.local_agent_id} />
          <section className={section}>
            <h2 className="font-semibold">Publish selected Knowledge</h2>
            <p className="text-sm text-kumo-subtle">
              Everything starts PRIVATE. Only the exact records in your
              confirmed preview can be retrieved.
            </p>
            <div className="max-h-64 space-y-2 overflow-auto">
              {data.knowledge.length === 0 ? (
                <p>No Knowledge records yet.</p>
              ) : (
                data.knowledge.map((k: Row) => (
                  <label key={k.id} className="flex gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(k.id)}
                      onChange={(e) => {
                        setSelected(
                          e.target.checked
                            ? [...selected, k.id]
                            : selected.filter((id) => id !== k.id),
                        );
                        setPreview(null);
                      }}
                    />
                    <span>
                      <strong>{k.kind}</strong> — {k.statement}
                    </span>
                  </label>
                ))
              )}
            </div>
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                const f = form(e);
                const match = audience.match(/^relay:\/\/([^/]+)\/([^/]+)$/);
                void act("preview", {
                  name: f.name,
                  references: selected,
                  visibility,
                  audience: match
                    ? [{ ownerId: match[1], agentId: match[2] }]
                    : [],
                  expiresAt: expiry(),
                }).then(setPreview);
              }}
            >
              <input
                className={control}
                name="name"
                aria-label="Publication name"
                placeholder="Publication name"
                required
              />
              <label>
                Visibility{" "}
                <select
                  className={control}
                  value={visibility}
                  onChange={(e) => {
                    setVisibility(e.target.value);
                    setPreview(null);
                  }}
                >
                  {["PRIVATE", "SHARED", "UNLISTED", "PUBLIC"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <input
                className={control}
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value);
                  setPreview(null);
                }}
                aria-label="Allowed audience"
                placeholder="Allowed audience: relay://owner/agent"
              />
              <p className="text-xs text-kumo-subtle">
                This publication expires in 24 hours.
              </p>
              <button
                className={control}
                disabled={busy || selected.length === 0}
              >
                Preview exact publication
              </button>
            </form>
            {preview && (
              <div className="space-y-2 rounded-lg border border-kumo-line p-4">
                <p className="text-sm">
                  {preview.name} · Expires {preview.expiresAt}
                </p>
                <p className="text-sm">
                  Allowed audience:{" "}
                  {preview.visibility === "PUBLIC"
                    ? "PUBLIC visibility; Relay grant policy still applies"
                    : preview.audience
                        .map(
                          (a: Row) =>
                            `${a.ownerId}/${a.agentId ?? "all Agents"}`,
                        )
                        .join(", ") || "Private to this owner"}
                </p>
                <h3 className="font-semibold">
                  {preview.count} records will become {preview.visibility}
                </h3>
                {preview.records.map((r: Row) => (
                  <div key={r.reference} className="text-sm">
                    <strong>{r.recordType}</strong>
                    <p>{r.content}</p>
                    <p className="text-xs">
                      Reference: {r.reference} · Confidence: {r.confidence}
                    </p>
                    <p className="text-xs">
                      Provenance: {r.provenance} ·{" "}
                      {r.sourceReferences.join(", ")} · Updated {r.updatedAt}
                    </p>
                    <p className="break-all text-xs">Revision: {r.revision}</p>
                  </div>
                ))}
                <p className="text-sm">
                  Excluded: {preview.excluded.join(", ")}.
                </p>
                {button(
                  "Confirm this exact publication",
                  () =>
                    void act(
                      "confirm",
                      { previewHash: preview.previewHash },
                      preview.id,
                    ).then((r) => {
                      if (r) setPreview(null);
                    }),
                )}
              </div>
            )}
            <h3 className="font-medium">Publications</h3>
            {data.publications.length === 0 ? (
              <p className="text-sm">Nothing has been published.</p>
            ) : (
              data.publications.map((p: Row) => (
                <div
                  key={p.id}
                  className="space-y-1 border-t border-kumo-line pt-3"
                >
                  <p>
                    {p.name} · {p.visibility} · {p.status} · v{p.version}
                  </p>
                  <p className="break-all text-xs">{p.id}</p>
                  <p className="text-xs">
                    Audience:{" "}
                    {p.audience
                      .map(
                        (a: Row) => `${a.ownerId}/${a.agentId ?? "all Agents"}`,
                      )
                      .join(", ") || "No restricted audience"}
                  </p>
                  <div className="flex gap-2">
                    {button(
                      "Pause",
                      () => void act("publication-status", "PAUSED", p.id),
                    )}
                    {button(
                      "Revoke publication",
                      () => void act("publication-status", "REVOKED", p.id),
                    )}
                  </div>
                </div>
              ))
            )}
            <p className="text-sm text-kumo-subtle">
              Revocation prevents future retrieval. It cannot guarantee deletion
              of information already delivered to another trust domain.
            </p>
          </section>
          <section className={section}>
            <h2 className="font-semibold">Grant expiry settings</h2>
            <p className="text-sm text-kumo-subtle">Choose the default for new grants you issue. Existing grants and grants issued by another peer’s owner are unchanged. Never means until revoked; identity credentials, published Knowledge, and individual requests still have their own expiry.</p>
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { const f = form(e); void act("grant-duration", f.duration); }}>
              <select key={data.grantDuration} name="duration" aria-label="Default grant expiry" className={control} defaultValue={data.grantDuration}>
                {grantDurationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button className={control} disabled={busy}>Save expiry preference</button>
            </form>
            <h2 className="font-semibold">Independent capability grants</h2>
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                const f = form(e);
                void act("grant", {
                  grantorAgentId: connection.relay_agent_id,
                  granteeOwnerId: f.owner,
                  granteeAgentId: f.agent || undefined,
                  capability: f.capability,
                  resource: f.resource,
                  conditions: {
                    expiresAt: grantExpiry(f.duration),
                    rateLimit: { calls: 10, windowSeconds: 60 },
                    allowedTopics: [],
                    approvalRequired: false,
                    ...(f.capability === "work.request"
                      ? { budgetId: f.budget, maxCost: f.cost }
                      : {}),
                  },
                });
              }}
            >
              <input
                className={control}
                name="owner"
                placeholder="Grantee owner ID"
                aria-label="Grantee owner ID"
                required
              />
              <input
                className={control}
                name="agent"
                placeholder="Grantee Agent ID"
                aria-label="Grantee Agent ID"
                required
              />
              <select
                name="capability"
                className={control}
                aria-label="Capability"
              >
                {[
                  "knowledge.query",
                  "message.send",
                  "artifact.share",
                  "work.request",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input
                className={control}
                name="resource"
                placeholder="Publication or resource ID"
                aria-label="Resource ID"
                required
              />
              <input
                className={control}
                name="budget"
                placeholder="Receiving-owner Relay budget ID (work only)"
                aria-label="Relay work budget"
              />
              <input
                className={control}
                name="cost"
                placeholder="Work cost ceiling"
                aria-label="Work cost ceiling"
              />
              <label className="text-sm">Grant expiry
                <select key={data.grantDuration} name="duration" aria-label="Grant expiry" className={control} defaultValue={data.grantDuration}>
                  {grantDurationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <p className="text-sm text-kumo-subtle">Review the peer, capability, resource, and expiry before granting access. A never-expiring grant remains active until revoked.</p>
              <button className={control} disabled={busy}>
                Create grant
              </button>
            </form>
            {data.grants.map((g: Row) => (
              <div key={g.id} className="text-sm">
                <p>
                  {g.document.capability} → {g.document.granteeOwnerId}/
                  {g.document.granteeAgentId} · {g.status} · {g.document.conditions.expiresAt === null ? "Never expires — until revoked" : `Expires ${new Date(g.document.conditions.expiresAt).toLocaleString()}`}
                </p>
                {button(
                  "Revoke grant",
                  () => void act("revoke-grant", undefined, g.id),
                )}
              </div>
            ))}
          </section>
          <section className={section}>
            <h2 className="font-semibold">Replies to peer messages</h2>
            <p className="text-sm text-kumo-subtle">Allow your Agent to answer authorized peer messages using only the profile below and the incoming message. Private Knowledge, memory, chat history, and tools are excluded. Each message permits one model call, at most 600 output tokens and a conservative $0.25 estimated cost limit. Existing peer permissions and approvals still apply. Model authentication must be configured in the receiving service.</p>
            <form key={JSON.stringify(data.messageReplies)} className="grid gap-2" onSubmit={(e) => {
              const f = form(e); void act("message-replies", { enabled: f.enabled === "on", publicProfile: f.publicProfile });
            }}>
              <label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={data.messageReplies?.enabled ?? false} /> Answer authorized peer messages</label>
              <label className="text-sm">Information your Agent may share
                <textarea name="publicProfile" aria-label="Public reply profile" className={`${control} mt-2 min-h-32 w-full`} maxLength={4000} defaultValue={data.messageReplies?.publicProfile ?? ""} placeholder="Describe verified capabilities and limits. Include only information you intend every authorized messaging peer to receive." />
              </label>
              <button className={control} disabled={busy}>Save reply settings</button>
            </form>
          </section>
          <section className={section}>
            <h2 className="font-semibold">External work policy</h2>
            <p className="text-sm">
              Work can use only explicitly shared artifacts, with no
              private-data or consequential tools. Email, spending, deployment,
              and account actions are refused.
            </p>
            <form
              className="space-y-2"
              onSubmit={(e) => void act("policy", form(e))}
            >
              {[
                "research",
                "analysis",
                "summarization",
                "artifact_generation",
              ].map((c) => (
                <label key={c} className="flex items-center justify-between">
                  {c}
                  <select
                    name={c}
                    className={control}
                    defaultValue={connection.local_work_policy[c]}
                  >
                    <option value="approval">Require owner approval</option>
                    <option value="reject">Reject</option>
                    <option value="accept">Allow bounded work</option>
                  </select>
                </label>
              ))}
              <button className={control} disabled={busy}>
                Save local policy
              </button>
            </form>
          </section>
          <section className={section}>
            <h2 className="font-semibold">External inbox</h2>
            <div className="flex flex-wrap gap-2" role="tablist">
              {["incoming", "outgoing", "waiting", "completed", "denied"].map(
                (t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    className={control}
                    onClick={() => setTab(t)}
                  >
                    {t === "waiting" ? "Waiting / needs approval" : t}
                  </button>
                ),
              )}
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-kumo-subtle">
                No requests in this view.
              </p>
            ) : (
              rows.map((r: Row) => (
                <article
                  key={r.request_id}
                  className="space-y-2 border-t border-kumo-line pt-3"
                >
                  <p>
                    {r.capability} · {r.state} · {r.direction}
                  </p>
                  <p className="break-all text-xs">
                    {r.request_id} · Sender {r.sender_owner_id}/
                    {r.sender_agent_id}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {r.envelope?.payload?.body ??
                      r.envelope?.payload?.task ??
                      ""}
                  </p>
                  {r.local_run_id && (
                    <a className="underline" href="/manage/control">
                      Local MyEve Run: {r.local_run_id}
                    </a>
                  )}
                  {(r.result?.reply?.body ?? r.result?.result?.reply?.body) && <p className="whitespace-pre-wrap text-sm">Agent reply: {r.result?.reply?.body ?? r.result?.result?.reply?.body}</p>}
                  {(r.result?.replyStatus ?? r.result?.result?.replyStatus) === "unavailable" && <p className="text-sm text-kumo-subtle">Message received, but the receiving Agent could not generate an answer. Its owner should check model authentication and budget. No answer was fabricated.</p>}
                  {r.capability === "message.send" && !r.result?.reply && !r.result?.result?.reply && (r.result?.acknowledged === true || r.result?.result?.acknowledged === true) && (
                    <p className="text-sm text-kumo-subtle">Delivery acknowledged. This is a receipt, not an agent-written reply.</p>
                  )}
                  {r.result && (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                      {JSON.stringify(r.result, null, 2)}
                    </pre>
                  )}
                  <div className="flex gap-2">
                    {r.direction === "outgoing" &&
                      button(
                        "Refresh result",
                        () => void act("get", undefined, r.request_id),
                      )}
                    {r.state === "needs_approval" && (
                      <>
                        {button(
                          "Approve exact request",
                          () => void act("decide", true, r.request_id),
                        )}
                        {button(
                          "Deny request",
                          () => void act("decide", false, r.request_id),
                        )}
                      </>
                    )}
                    {r.capability === "message.send" &&
                      r.direction === "incoming" &&
                      button("Reply", () => setReply(r))}
                  </div>
                  {r.state === "recovery_required" && (
                    <p className="text-sm">
                      Execution is stopped. Inspect the local Run before any
                      manual recovery; MyEve will not rerun an uncertain action.
                    </p>
                  )}
                </article>
              ))
            )}
            <h3 className="font-medium">
              {reply ? "Draft reply to authenticated sender" : "Draft a message"}
            </h3>
            <form
              key={reply?.request_id ?? "new"}
              className="grid gap-2"
              onSubmit={(e) => {
                const f = form(e);
                let request;
                try { request = peerMessageDraft({
                  target: reply ? `relay://${reply.sender_owner_id}/${reply.sender_agent_id}` : f.target,
                  body: f.body,
                  conversationId: reply?.conversation_id ?? crypto.randomUUID(),
                  ...(reply ? { replyTo: reply.request_id } : {}),
                }, crypto.randomUUID()); }
                catch { setError("Enter a valid peer address and a non-empty message."); return; }
                void navigator.clipboard.writeText(`Propose this exact Relay request for Action approval: ${JSON.stringify(request)}`)
                  .then(() => setNotice("Request copied. Paste it into your Agent chat to review and approve the exact Action. Nothing was sent."))
                  .catch(() => setError("Clipboard access failed. Ask your Agent in chat to draft this message for the selected peer. The saved relationship supplies the messaging resource."));
              }}
            >
              <input
                name="target"
                readOnly={Boolean(reply)}
                defaultValue={
                  reply
                    ? `relay://${reply.sender_owner_id}/${reply.sender_agent_id}`
                    : ""
                }
                className={control}
                placeholder="Recipient Relay address"
                aria-label="Recipient Relay address"
                required
              />
              <p className="text-sm text-kumo-subtle">Messaging access comes from the saved peer relationship. Your Agent resolves it before requesting approval. No internal resource identifier is needed.</p>
              <textarea
                name="body"
                className={control}
                maxLength={16000}
                placeholder="Message"
                aria-label="Message"
                required
              />
              <button className={control} disabled={busy}>
                Copy request for Agent chat
              </button>
            </form>
          </section>
          <section className={section}>
            <h2 className="font-semibold">
              External activity and verified receipts
            </h2>
            <p className="text-sm">
              Signed Relay audit exports are verified against the pinned key.
              Local activity below is not a signed disclosure receipt.
            </p>
            <label className="block text-sm">
              Import Relay signed audit export
              <input
                className="block pt-2"
                type="file"
                accept="application/json"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void file
                      .text()
                      .then((text) => act("receipts", JSON.parse(text)))
                      .catch(() =>
                        setError("Choose a valid Relay JSON audit export."),
                      );
                }}
              />
            </label>
            {data.receipts.length === 0 ? (
              <p className="text-sm">No verified Relay receipts imported.</p>
            ) : (
              data.receipts.map((r: Row) => (
                <div key={r.id} className="border-t border-kumo-line pt-2">
                  <p className="text-sm">
                    Verified · {r.eventType} · {r.occurredAt}
                  </p>
                  <pre className="overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(r.details, null, 2)}
                  </pre>
                </div>
              ))
            )}
            <details>
              <summary>
                Local activity — pending signed receipt where applicable
              </summary>
              {data.activity.map((r: Row, i: number) => (
                <p key={i} className="break-all text-xs">
                  {r.created_at} · {r.kind} · {JSON.stringify(r.metadata)}
                </p>
              ))}
            </details>
          </section>
          <section className={section}>
            <h2 className="font-semibold">Source-owned artifacts</h2>
            <p className="text-sm">
              Retrieval requires both an expiring source signature and the
              recipient’s pinned key.
            </p>
            <form
              className="grid gap-2"
              onSubmit={(e) => void act("peer", form(e))}
            >
              <input
                className={control}
                name="address"
                placeholder="Trusted peer Relay address"
                aria-label="Trusted peer address"
                required
              />
              <input
                className={control}
                name="origin"
                placeholder="Peer HTTPS artifact origin"
                aria-label="Peer artifact origin"
                required
              />
              <textarea
                className={control}
                name="publicKey"
                placeholder="Peer Ed25519 public key"
                aria-label="Peer public key"
                required
              />
              <button className={control} disabled={busy}>
                Trust this artifact peer
              </button>
            </form>
            {data.artifacts.map((a: Row) => (
              <div key={a.id} className="space-y-2">
                <p className="text-sm">
                  {a.metadata.name} · {a.revoked ? "revoked" : a.expires_at}
                </p>
                <p className="break-all text-xs">{a.metadata.checksum}</p>
                {!a.revoked &&
                  a.metadata.sourceOwnerId === connection.relay_owner_id && (
                    <form
                      className="grid gap-2"
                      onSubmit={(e) => {
                        const f = form(e);
                        void act("artifact-share", f.target, a.id).then(
                          (payload) => {
                            if (payload)
                              return act("send", {
                                target: f.target,
                                resource: f.resource,
                                capability: "artifact.share",
                                idempotencyKey: crypto.randomUUID(),
                                expiresAt: expiry(),
                                payload,
                              });
                          },
                        );
                      }}
                    >
                      <select
                        className={control}
                        name="target"
                        aria-label="Artifact recipient"
                        required
                      >
                        {data.peers.map((p: Row) => (
                          <option key={p.address}>{p.address}</option>
                        ))}
                      </select>
                      <input
                        className={control}
                        name="resource"
                        aria-label="Artifact resource"
                        placeholder="Artifact resource granted by recipient"
                        required
                      />
                      <button
                        className={control}
                        disabled={busy || !data.peers.length}
                      >
                        Share with this recipient
                      </button>
                    </form>
                  )}
                {button(
                  "Revoke retrieval",
                  () => void act("artifact-revoke", undefined, a.id),
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
