"use client";

import { Button, Input, InputArea, Loader } from "@cloudflare/kumo";
import { CopyIcon, PauseIcon, PlayIcon, PlusIcon, RobotIcon, TrayIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AgentView } from "@/lib/agents";
import type { ResolvedCapability } from "@/lib/capability-registry";
import { cn } from "@/lib/utils";

const RISK = { low: 0, medium: 1, high: 2, critical: 3 } as const;
type FormState = {
  name: string; role: string; description: string; instructions: string; preferredModel: string;
  reasoningPreference: string; riskCeiling: "low" | "medium" | "high"; notificationPolicy: string;
  capabilityIds: string[]; maxSteps: number; maxRuntimeSeconds: number; maxEstimatedCostUsd: number; maxRetries: number;
};
const EMPTY: FormState = { name: "", role: "", description: "", instructions: "", preferredModel: "", reasoningPreference: "default", riskCeiling: "low", notificationPolicy: "activity", capabilityIds: [], maxSteps: 20, maxRuntimeSeconds: 900, maxEstimatedCostUsd: 2, maxRetries: 1 };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init); const body = await response.json().catch(() => null) as { error?: string | { message?: string } } | null;
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : typeof body?.error === "object" ? body.error.message : "Request failed.");
  return body as T;
}

function formFrom(agent: AgentView): FormState {
  return { name: agent.name, role: agent.role, description: agent.description, instructions: agent.instructions, preferredModel: agent.preferredModel ?? "", reasoningPreference: agent.reasoningPreference, riskCeiling: agent.riskCeiling, notificationPolicy: agent.notificationPolicy, capabilityIds: agent.capabilities.filter((item) => item.enabled).map((item) => item.id), ...agent.limits };
}

function Status({ agent }: { agent: AgentView }) {
  return <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", agent.status === "active" ? "border-kumo-success/25 bg-kumo-success/10 text-kumo-success" : "border-kumo-hairline bg-kumo-tint text-kumo-subtle")}>{agent.status}</span>;
}

export function AgentsPanel({ onStartChat }: { onStartChat: (agent: AgentView) => void }) {
  const [agents, setAgents] = useState<AgentView[] | null>(null);
  const [registry, setRegistry] = useState<ResolvedCapability[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false); const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [agentBody, capabilityBody] = await Promise.all([request<{ agents: AgentView[] }>("/api/agents"), request<{ registry: ResolvedCapability[] }>("/api/capabilities")]);
      setAgents(agentBody.agents); setRegistry(capabilityBody.registry);
      setSelectedId((current) => {
        const requested = new URLSearchParams(window.location.search).get("agent");
        if (requested && agentBody.agents.some((agent) => agent.id === requested)) return requested;
        return current && agentBody.agents.some((agent) => agent.id === current) ? current : agentBody.agents[0]?.id ?? null;
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Agents could not be loaded."); setAgents([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const selected = agents?.find((agent) => agent.id === selectedId) ?? null;
  const assignable = useMemo(() => registry.filter((capability) =>
    capability.kind !== "tool" &&
    !["channel", "specialist", "database", "model"].includes(capability.kind) &&
    capability.id !== "notification.review-delivery"
  ), [registry]);

  function edit(agent: AgentView) { setForm(formFrom(agent)); setEditing(true); setCreating(false); setError(null); }
  async function save() {
    setBusy(true); setError(null);
    const payload = { ...form, preferredModel: form.preferredModel || null, limits: { maxSteps: form.maxSteps, maxRuntimeSeconds: form.maxRuntimeSeconds, maxEstimatedCostUsd: form.maxEstimatedCostUsd, maxRetries: form.maxRetries } };
    try {
      const body = creating
        ? await request<{ agent: AgentView }>("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await request<{ agent: AgentView }>(`/api/agents/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      await load(); setSelectedId(body.agent.id); setEditing(false); setCreating(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Agent could not be saved."); } finally { setBusy(false); }
  }
  async function action(action: string) {
    if (!selected) return; setBusy(true); setError(null);
    try { const body = await request<{ agent: AgentView }>(`/api/agents/${selected.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); await load(); setSelectedId(body.agent.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Agent action failed."); } finally { setBusy(false); }
  }
  if (agents === null) return <div className="grid min-h-80 place-items-center"><Loader aria-label="Loading Agents" /></div>;
  return <section>
    <header className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[.14em] text-kumo-subtle">Execution resources</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">My Agents</h1><p className="mt-1 text-sm text-kumo-subtle">Specialized help for your goals, governed by explicit capabilities.</p></div><Button variant="primary" icon={PlusIcon} onClick={() => { setForm(EMPTY); setCreating(true); setEditing(true); }}>Create Agent</Button></header>
    {error && <p role="alert" className="mb-4 rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-3 text-sm text-kumo-danger">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <nav aria-label="Agents" className="space-y-2">{agents.map((agent) => <button key={agent.id} type="button" onClick={() => { setSelectedId(agent.id); setEditing(false); setCreating(false); }} className={cn("w-full rounded-2xl border p-3 text-left", selectedId === agent.id ? "border-kumo-brand/40 bg-kumo-brand/5" : "border-kumo-hairline hover:bg-kumo-tint", agent.status === "archived" && "opacity-60")}><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-kumo-tint"><RobotIcon className="size-5" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 font-medium"><span className="truncate">{agent.name}</span>{agent.isPrimary && <span className="text-[10px] uppercase tracking-wide text-kumo-brand">Primary</span>}</span><span className="mt-0.5 block truncate text-xs text-kumo-subtle">{agent.role}</span></span><Status agent={agent} /></div></button>)}</nav>
      <div className="min-w-0 rounded-2xl border border-kumo-hairline p-4 sm:p-6">
        {editing ? <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}><div><h2 className="text-lg font-semibold">{creating ? "Create Agent" : `Edit ${selected?.name}`}</h2><p className="text-xs text-kumo-subtle">Role describes purpose. Only checked capabilities grant access.</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Name<Input aria-label="Agent name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="grid gap-1 text-sm font-medium">Role<Input aria-label="Agent role" required value={form.role} placeholder="Researcher" onChange={(e) => setForm({ ...form, role: e.target.value })} /></label></div>
          <label className="grid gap-1 text-sm font-medium">Description<InputArea aria-label="Agent description" value={form.description} minRows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-medium">Instructions<InputArea aria-label="Agent instructions" required value={form.instructions} minRows={5} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm font-medium">Preferred model<Input aria-label="Preferred model" value={form.preferredModel} placeholder="Provider default" onChange={(e) => setForm({ ...form, preferredModel: e.target.value })} /></label><label className="grid gap-1 text-sm font-medium">Reasoning<select aria-label="Reasoning preference" className="h-9 rounded-lg border border-kumo-line bg-kumo-base px-3" value={form.reasoningPreference} onChange={(e) => setForm({ ...form, reasoningPreference: e.target.value })}>{["default","none","minimal","low","medium","high","xhigh"].map((v) => <option key={v}>{v}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">Risk ceiling<select aria-label="Risk ceiling" className="h-9 rounded-lg border border-kumo-line bg-kumo-base px-3" value={form.riskCeiling} onChange={(e) => setForm({ ...form, riskCeiling: e.target.value as FormState["riskCeiling"], capabilityIds: form.capabilityIds.filter((id) => { const cap = registry.find((item) => item.id === id); return cap && RISK[cap.risk.level] <= RISK[e.target.value as FormState["riskCeiling"]]; }) })}>{["low","medium","high"].map((v) => <option key={v}>{v}</option>)}</select></label></div>
          <fieldset><legend className="text-sm font-medium">Capabilities</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{assignable.map((capability) => { const blocked = RISK[capability.risk.level] > RISK[form.riskCeiling]; const checked = form.capabilityIds.includes(capability.id); return <label key={capability.id} className={cn("flex gap-2 rounded-xl border border-kumo-hairline p-3 text-sm", blocked && "opacity-50")}><input type="checkbox" checked={checked} disabled={blocked} onChange={(e) => setForm({ ...form, capabilityIds: e.target.checked ? [...form.capabilityIds, capability.id] : form.capabilityIds.filter((id) => id !== capability.id) })} /><span><span className="font-medium">{capability.name}</span><span className="block text-[11px] text-kumo-subtle">{capability.risk.level} risk · {capability.availability.status}{capability.availability.reason ? ` · ${capability.availability.reason}` : ""}</span></span></label>; })}</div></fieldset>
          <div className="grid gap-3 sm:grid-cols-4"><label className="grid gap-1 text-xs">Max steps<Input aria-label="Maximum steps" type="number" value={form.maxSteps} onChange={(e) => setForm({ ...form, maxSteps: Number(e.target.value) })} /></label><label className="grid gap-1 text-xs">Runtime seconds<Input aria-label="Maximum runtime seconds" type="number" value={form.maxRuntimeSeconds} onChange={(e) => setForm({ ...form, maxRuntimeSeconds: Number(e.target.value) })} /></label><label className="grid gap-1 text-xs">Cost limit ($)<Input aria-label="Maximum estimated cost" type="number" step="0.01" value={form.maxEstimatedCostUsd} onChange={(e) => setForm({ ...form, maxEstimatedCostUsd: Number(e.target.value) })} /></label><label className="grid gap-1 text-xs">Retries<Input aria-label="Maximum retries" type="number" value={form.maxRetries} onChange={(e) => setForm({ ...form, maxRetries: Number(e.target.value) })} /></label></div>
          <label className="grid gap-1 text-sm font-medium">Notifications<select aria-label="Notification preference" className="h-9 rounded-lg border border-kumo-line bg-kumo-base px-3" value={form.notificationPolicy} onChange={(e) => setForm({ ...form, notificationPolicy: e.target.value })}>{["silent","activity","digest","push_on_block"].map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => { setEditing(false); setCreating(false); }}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? "Saving…" : "Save Agent"}</Button></div></form>
        : selected ? <article><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="text-2xl font-semibold">{selected.name}</h2><Status agent={selected} />{selected.isPrimary && <span className="rounded-full bg-kumo-brand/10 px-2 py-1 text-[11px] text-kumo-brand">Primary Agent</span>}</div><p className="mt-1 font-medium text-kumo-subtle">{selected.role}</p><p className="mt-3 max-w-2xl text-sm leading-6 text-kumo-subtle">{selected.description || "No description yet."}</p></div><Button variant="primary" disabled={selected.status !== "active"} onClick={() => onStartChat(selected)}>Open Agent</Button></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><section className="rounded-xl bg-kumo-tint p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-kumo-subtle">Instructions</h3><p className="mt-2 whitespace-pre-wrap text-sm">{selected.instructions}</p></section><section className="rounded-xl bg-kumo-tint p-4 text-sm"><h3 className="text-xs font-semibold uppercase tracking-wide text-kumo-subtle">Configuration</h3><dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1"><dt>Model</dt><dd className="text-kumo-subtle">{selected.preferredModel ?? "Runtime fallback"}</dd><dt>Reasoning</dt><dd className="capitalize text-kumo-subtle">{selected.reasoningPreference}</dd><dt>Risk</dt><dd className="capitalize text-kumo-subtle">{selected.riskCeiling}</dd><dt>Notifications</dt><dd className="text-kumo-subtle">{selected.notificationPolicy.replaceAll("_", " ")}</dd><dt>Limits</dt><dd className="text-kumo-subtle">{selected.limits.maxSteps} steps · {selected.limits.maxRuntimeSeconds}s · ${selected.limits.maxEstimatedCostUsd}</dd></dl></section></div>
          <section className="mt-4"><h3 className="text-sm font-semibold">Capabilities</h3>{selected.isPrimary ? <p className="mt-2 text-sm text-kumo-subtle">Primary Agent uses the deployment’s configured capabilities.</p> : selected.capabilities.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">{selected.capabilities.map((capability) => <li key={capability.id} className="rounded-xl border border-kumo-hairline p-3 text-sm"><div className="flex justify-between"><span className="font-medium">{capability.name}</span><span className={capability.availability === "available" ? "text-kumo-success" : "text-kumo-warning"}>{capability.availability}</span></div>{capability.availabilityReason && <p className="mt-1 text-xs text-kumo-subtle">{capability.availabilityReason}</p>}</li>)}</ul> : <p className="mt-2 text-sm text-kumo-subtle">No capabilities assigned. This Agent can still reason and write conversational responses.</p>}</section>
          <p className="mt-5 text-xs text-kumo-subtle">Created {new Date(selected.createdAt).toLocaleString()} · Updated {new Date(selected.updatedAt).toLocaleString()}</p>
          <div className="mt-5 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => edit(selected)}>Edit</Button>{!selected.isPrimary && selected.status === "active" && <Button size="sm" variant="secondary" icon={PauseIcon} disabled={busy} onClick={() => void action("pause")}>Pause</Button>}{!selected.isPrimary && selected.status === "paused" && <Button size="sm" variant="secondary" icon={PlayIcon} disabled={busy} onClick={() => void action("resume")}>Resume</Button>}{!selected.isPrimary && <Button size="sm" variant="secondary" icon={CopyIcon} disabled={busy} onClick={() => void action("duplicate")}>Duplicate</Button>}{!selected.isPrimary && selected.status !== "archived" && <Button size="sm" variant="secondary" icon={TrayIcon} disabled={busy} onClick={() => void action("archive")}>Archive</Button>}</div>
        </article> : <p className="text-sm text-kumo-subtle">Create an Agent to add specialized execution capacity.</p>}
      </div>
    </div>
  </section>;
}
