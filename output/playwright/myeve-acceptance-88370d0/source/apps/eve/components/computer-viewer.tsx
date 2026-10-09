"use client";

import { Badge, Button, Input, Loader, Select } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CursorClickIcon,
  EyeIcon,
  PowerIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AGENT_NAME } from "@/lib/identity";
import { cn } from "@/lib/utils";

// Live view of the cloud desktop the agent drives, over VNC. Watching the
// screen while a computer task runs is the only way to see what the agent is
// actually doing out there, and taking the mouse is the escape hatch for the
// things it should not do itself - signing in, mainly.
//
// noVNC connects to whatever websocket /api/computer hands back — always a
// relay on our side (the /api/computer/ws route on deployments, a loopback
// sidecar in dev), because Orgo's websockify cuts foreign browser origins
// off with "Origin not allowed". The password rides along for VNC's in-band
// auth and is scoped to this one desktop.

interface ComputerInfo {
  name: string;
  status: string;
  liveViewUrl: string;
  specs: string | null;
  resolution: string | null;
}

type ComputerUseModel = string;

interface ComputerUseModelOption {
  id: ComputerUseModel;
  name: string;
  description: string;
}

interface ComputerState {
  enabled: boolean;
  keySource?: "env" | "app" | null;
  model?: ComputerUseModel;
  models?: ComputerUseModelOption[];
  provisioned?: boolean;
  computer?: ComputerInfo;
  connection?: { websocketUrl: string; password: string } | null;
  error?: string;
  profile?: BrowserProfileSummary;
  profiles?: BrowserProfileSummary[];
}

interface BrowserProfileSummary {
  id: string;
  agentId: string;
  agentName: string;
  status: "ready" | "takeover_required" | "reconnect_required" | "revoked";
  generation: number;
  lastUsedAt: string | null;
  lastAuthenticatedAt: string | null;
  sharedWith: { id: string; agentId: string; agentName: string }[];
}

interface ComputerModelState {
  model: ComputerUseModel;
  models: ComputerUseModelOption[];
}

interface ApiProblem { error?: string | { message?: string } }

function apiProblemMessage(body: ApiProblem | null, fallback: string): string {
  return typeof body?.error === "string"
    ? body.error
    : body?.error?.message ?? fallback;
}

/** The header button and manage tab key off this; tell them when it flips. */
function announceFeatureChange(): void {
  window.dispatchEvent(new Event("eve:features-changed"));
}

/** Statuses that settle on their own; the panel polls until they do. */
const TRANSITIONAL_STATUSES = new Set(["creating", "starting", "restarting", "stopping"]);

/**
 * A VM can report `running` a beat before its connection details exist; poll
 * a few times before concluding there is genuinely nothing to watch.
 */
const MAX_BLIND_POLLS = 5;

const POLL_INTERVAL_MS = 2_000;

/**
 * How many times a dropped VNC session re-fetches the state and reconnects
 * before parking on idle. A restart rotates the VNC password, so an open
 * panel's connection info goes stale the moment the desktop reboots; a
 * fresh read is usually all it takes to get the screen back.
 */
const MAX_RECONNECTS = 3;

type Phase = "loading" | "connecting" | "live" | "idle" | "waking" | "missing" | "off" | "error";

type Rfb = InstanceType<typeof import("@novnc/novnc").default>;

export function ComputerViewer({ className }: { className?: string }) {
  const [state, setState] = useState<ComputerState | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [shareAgentId, setShareAgentId] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<Rfb | null>(null);
  // Consecutive "running but nothing to connect to" reads; see MAX_BLIND_POLLS.
  const blindPollsRef = useRef(0);
  // Consecutive dropped VNC sessions; see MAX_RECONNECTS.
  const reconnectsRef = useRef(0);

  const load = useCallback(async (agentId = selectedAgentId): Promise<ComputerState | null> => {
    try {
      const response = await fetch(`/api/computer${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ""}`);
      const body = (await response.json()) as ComputerState & ApiProblem;
      if (!response.ok) {
        setState({ enabled: true, error: apiProblemMessage(body, "Could not reach the desktop.") });
        return null;
      }
      setState(body);
      if (body.profile?.agentId) setSelectedAgentId(body.profile.agentId);
      return body;
    } catch {
      setState({ enabled: true, error: "Could not reach the desktop." });
      return null;
    }
  }, [selectedAgentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A desktop in motion settles on its own: keep reading until it does. Also
  // give a freshly running desktop a few reads to hand over its connection
  // details before declaring there is nothing to watch.
  useEffect(() => {
    if (state === null || !state.enabled || state.error !== undefined) return;
    const status = state.computer?.status;
    const transitional = status !== undefined && TRANSITIONAL_STATUSES.has(status);
    if (transitional) blindPollsRef.current = 0;
    const blind =
      status === "running" &&
      (state.connection ?? null) === null &&
      blindPollsRef.current < MAX_BLIND_POLLS;
    if (!transitional && !blind) return;
    if (blind) blindPollsRef.current += 1;
    const timer = setTimeout(() => void load(), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [state, load]);

  // Connect once a running desktop hands back a websocket, and tear the
  // session down whenever it goes away.
  useEffect(() => {
    if (state === null) return;
    if (!state.enabled) {
      setPhase("off");
      return;
    }
    if (state.error !== undefined) {
      // A failed re-read mid-reconnect (a network blip, a transient API
      // error) is the same kind of hiccup as a dropped session: spend a
      // retry on it instead of stranding the panel on the error screen
      // while attempts remain. Errors outside a reconnect show right away.
      if (reconnectsRef.current > 0 && reconnectsRef.current < MAX_RECONNECTS) {
        reconnectsRef.current += 1;
        setPhase("connecting");
        const retry = setTimeout(() => void load(), 1_500);
        return () => clearTimeout(retry);
      }
      setPhase("error");
      return;
    }
    if (state.provisioned !== true) {
      setPhase("missing");
      return;
    }

    const status = state.computer?.status;
    const connection = state.connection;
    if (connection === null || connection === undefined) {
      const settling =
        (status !== undefined && TRANSITIONAL_STATUSES.has(status)) ||
        (status === "running" && blindPollsRef.current < MAX_BLIND_POLLS);
      setPhase(settling ? "waking" : "idle");
      return;
    }
    blindPollsRef.current = 0;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    setPhase("connecting");

    void (async () => {
      // noVNC touches the DOM on import, so it only loads in the browser.
      const { default: RFB } = await import("@novnc/novnc");
      const screen = screenRef.current;
      if (cancelled || screen === null) return;

      const rfb = new RFB(screen, connection.websocketUrl, {
        credentials: { password: connection.password },
      });
      rfb.viewOnly = true;
      rfb.scaleViewport = true;
      rfb.background = "transparent";
      rfb.addEventListener("connect", () => {
        if (cancelled) return;
        reconnectsRef.current = 0;
        setPhase("live");
      });
      rfb.addEventListener("disconnect", () => {
        if (cancelled) return;
        // The session dropped on its own. A restart rotates the VNC password,
        // so the connection info in hand may simply be stale: re-read the
        // state (which re-triggers this effect) before giving up on the
        // screen. Repeated failures park on idle rather than looping.
        if (reconnectsRef.current < MAX_RECONNECTS) {
          reconnectsRef.current += 1;
          setPhase("connecting");
          retryTimer = setTimeout(() => void load(), 1_500);
          return;
        }
        setPhase("idle");
      });
      rfbRef.current = rfb;
    })();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      const rfb = rfbRef.current;
      rfbRef.current = null;
      try {
        rfb?.disconnect();
      } catch {
        // noVNC throws when React cleanup races an already-closed socket.
      }
    };
  }, [state, load]);

  useEffect(() => {
    if (rfbRef.current !== null) rfbRef.current.viewOnly = !interactive;
  }, [interactive]);

  async function act(action: "start" | "stop" | "restart"): Promise<void> {
    setBusy(true);
    setInteractive(false);
    // A deliberate action gets a fresh reconnect budget.
    reconnectsRef.current = 0;
    try {
      const response = await fetch("/api/computer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, agentId: state?.profile?.agentId }),
      });
      const body = (await response.json()) as ComputerState & ApiProblem;
      setState(response.ok ? body : { enabled: true, error: apiProblemMessage(body, "Could not reach the desktop.") });
    } catch {
      setState({ enabled: true, error: "Could not reach the desktop." });
    } finally {
      setBusy(false);
    }
  }

  async function updateProfile(action: "ready" | "takeover_required" | "share" | "revoke_share" | "reset", agentId?: string): Promise<boolean> {
    const profile = state?.profile;
    if (!profile || profileBusy) return false;
    setProfileBusy(true);
    try {
      const response = await fetch("/api/computer-profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          profileId: profile.id,
          ...(agentId ? { agentId } : {}),
          ...(action === "reset" ? { confirmation: `RESET ${profile.id}` } : {}),
        }),
      });
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? "Browser profile could not be updated.");
      setConfirmReset(false);
      setShareAgentId("");
      if (action === "ready" || action === "reset") setInteractive(false);
      await load(profile.agentId);
      return true;
    } catch (error) {
      setState((current) => current === null ? null : { ...current, error: error instanceof Error ? error.message : "Browser profile could not be updated." });
      return false;
    } finally {
      setProfileBusy(false);
    }
  }

  async function beginTakeover(): Promise<void> {
    if (await updateProfile("takeover_required")) setInteractive(true);
  }

  async function changeModel(model: ComputerUseModel): Promise<void> {
    if (state === null || state.model === model || modelBusy) return;
    const previousModel = state.model;
    setModelBusy(true);
    setModelError(null);
    setState((current) => (current === null ? null : { ...current, model }));
    try {
      const response = await fetch("/api/computer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const body = (await response.json()) as ComputerModelState & ApiProblem;
      if (!response.ok) {
        throw new Error(apiProblemMessage(body, "Could not save the model."));
      }
      setState((current) =>
        current === null ? null : { ...current, model: body.model, models: body.models },
      );
    } catch (error) {
      setState((current) =>
        current === null || previousModel === undefined
          ? current
          : { ...current, model: previousModel },
      );
      setModelError(error instanceof Error ? error.message : "Could not save the model.");
    } finally {
      setModelBusy(false);
    }
  }

  const computer = state?.computer;
  const running = phase === "live" || phase === "connecting";
  const selectedModel = state?.models?.find((option) => option.id === state.model);
  const profile = state?.profile;
  const shareCandidates = (state?.profiles ?? []).filter((candidate) => candidate.agentId !== profile?.agentId && !profile?.sharedWith.some((grant) => grant.agentId === candidate.agentId));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {profile !== undefined && (state?.profiles?.length ?? 0) > 0 && (
        <div className="grid gap-3 rounded-2xl border border-kumo-hairline bg-kumo-tint p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="text-xs font-medium text-kumo-subtle">Persistent profile
            <select className="mt-1 block h-10 w-full rounded-xl border border-kumo-line bg-kumo-base px-3 text-sm text-kumo-default" value={profile.agentId} onChange={(event) => { setInteractive(false); setSelectedAgentId(event.target.value); void load(event.target.value); }}>
              {state?.profiles?.map((candidate) => <option key={candidate.id} value={candidate.agentId}>{candidate.agentName}</option>)}
            </select>
          </label>
          <div className="text-xs text-kumo-subtle sm:text-end"><p className="font-medium text-kumo-default">{profile.agentName}&rsquo;s private desktop</p><p>Generation {profile.generation} · {profile.sharedWith.length === 0 ? "not shared" : `shared with ${profile.sharedWith.length}`}</p></div>
        </div>
      )}
      {profile !== undefined && profile.status !== "ready" && (
        <div className="rounded-2xl border border-kumo-warning/30 bg-kumo-warning/5 p-4">
          <p className="text-sm font-semibold">{profile.status === "reconnect_required" ? "Account reconnection required" : "Owner takeover in progress"}</p>
          <p className="mt-1 text-xs leading-5 text-kumo-subtle">Use the live desktop to finish login, MFA, CAPTCHA, or the sensitive form. MyEve cannot operate this profile until you mark the login complete.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={phase === "live" ? "success" : "secondary"}>
          {phase === "live"
            ? "live"
            : phase === "connecting"
              ? "connecting"
              : (computer?.status ?? "no desktop")}
        </Badge>
        {computer !== undefined && (
          <span className="text-sm text-kumo-subtle">
            {computer.name}
            {computer.specs === null ? "" : ` · ${computer.specs}`}
            {computer.resolution === null ? "" : ` · ${computer.resolution}`}
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          {phase === "live" && (
            <Button
              variant={interactive || profile?.status !== "ready" ? "primary" : "secondary"}
              size="sm"
              disabled={profileBusy}
              onClick={() => profile?.status === "ready" ? void beginTakeover() : void updateProfile("ready")}
            >
              {profile?.status !== "ready" ? <CursorClickIcon /> : <EyeIcon />}
              {profile?.status !== "ready" ? "Login complete" : "Take control"}
            </Button>
          )}
          {phase === "idle" || phase === "missing" ? (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void act("start")}>
              {busy ? <Loader size={14} /> : <PowerIcon />}
              {phase === "missing" ? "Create desktop" : "Wake it up"}
            </Button>
          ) : null}
          {running && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act("stop")}>
              <PowerIcon />
              Stop
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              reconnectsRef.current = 0;
              void load();
            }}
          >
            <ArrowClockwiseIcon />
          </Button>
        </div>
      </div>

      {state?.enabled === true && state.model !== undefined && state.models !== undefined && (
        <Select<ComputerUseModel>
          label="Computer-use model"
          size="sm"
          className="max-w-sm"
          value={state.model}
          disabled={modelBusy}
          loading={modelBusy}
          renderValue={(value) =>
            state.models?.find((option) => option.id === value)?.name ?? value
          }
          description={
            selectedModel === undefined
              ? "Used by default for computer tasks."
              : `${selectedModel.description} Used by default for computer tasks.`
          }
          error={modelError ?? undefined}
          onValueChange={(value) => {
            if (value !== null) void changeModel(value);
          }}
        >
          {state.models.map((option) => (
            <Select.Option key={option.id} value={option.id}>
              {option.name}
            </Select.Option>
          ))}
        </Select>
      )}

      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-kumo-canvas ring ring-kumo-hairline">
        <div ref={screenRef} className="absolute inset-0" />
        {phase !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {phase === "loading" || phase === "connecting" ? (
              <Loader size={20} />
            ) : phase === "waking" ? (
              <>
                <Loader size={20} />
                <p className="max-w-sm text-sm text-kumo-subtle">
                  The desktop is starting up. Hang on.
                </p>
              </>
            ) : phase === "off" ? (
              <KeyForm onSaved={setState} />
            ) : (
              <p className="max-w-sm text-sm text-kumo-subtle">
                {phase === "missing"
                  ? `${AGENT_NAME} does not have a desktop yet. Create one to watch her work.`
                  : phase === "error"
                    ? (state?.error ?? "Something went wrong.")
                    : computer?.status === "running"
                      ? "The desktop says it is running, but there is nothing to watch. Waking it restarts the machine with its files intact."
                      : "The desktop is asleep. Its files and logins are intact - wake it to watch."}
              </p>
            )}
          </div>
        )}
      </div>

      {computer !== undefined && (
        <p className="text-xs text-kumo-subtle">
          {interactive
            ? "Your clicks and keys go straight to the desktop. Switch back to watching when you are done."
            : "Watching only - clicks and keys are ignored."}{" "}
          <a
            href={computer.liveViewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            Open in Orgo
            <ArrowSquareOutIcon />
          </a>
        </p>
      )}

      {profile !== undefined && (
        <div className="grid gap-4 rounded-2xl border border-kumo-hairline p-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">Share deliberately</p>
            <p className="mt-1 text-xs leading-5 text-kumo-subtle">Another Agent can use this signed-in profile only after an explicit grant. Revoke access at any time.</p>
            {profile.sharedWith.length > 0 && <ul className="mt-3 space-y-2">{profile.sharedWith.map((grant) => <li key={grant.id} className="flex items-center justify-between gap-3 rounded-xl bg-kumo-tint px-3 py-2 text-sm"><span>{grant.agentName}</span><button type="button" className="text-xs font-medium text-kumo-danger" disabled={profileBusy} onClick={() => void updateProfile("revoke_share", grant.agentId)}>Revoke</button></li>)}</ul>}
            {shareCandidates.length > 0 && <div className="mt-3 flex gap-2"><select aria-label="Agent to share with" className="h-9 min-w-0 flex-1 rounded-xl border border-kumo-line bg-kumo-base px-3 text-sm" value={shareAgentId} onChange={(event) => setShareAgentId(event.target.value)}><option value="">Choose an Agent</option>{shareCandidates.map((candidate) => <option key={candidate.id} value={candidate.agentId}>{candidate.agentName}</option>)}</select><Button size="sm" variant="secondary" disabled={!shareAgentId || profileBusy} onClick={() => void updateProfile("share", shareAgentId)}>Share</Button></div>}
          </div>
          <div className="lg:border-s lg:border-kumo-hairline lg:ps-4">
            <p className="text-sm font-semibold">Reset login state</p>
            <p className="mt-1 text-xs leading-5 text-kumo-subtle">Permanently deletes this desktop, its cookies, files, and account sessions. Sharing is revoked. The next use creates a clean profile.</p>
            {confirmReset ? <div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" disabled={profileBusy} onClick={() => void updateProfile("reset")}>Permanently reset</Button><Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button></div> : <Button className="mt-3" size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>Reset profile</Button>}
          </div>
        </div>
      )}

      {state?.enabled === true && state.keySource === "app" && (
        <RemoveKeyRow onRemoved={setState} />
      )}
    </div>
  );
}

/**
 * First-run setup: paste an Orgo key here instead of touching deployment env
 * vars. The server checks the key against Orgo before keeping it, and it is
 * never sent back to the browser afterwards.
 */
function KeyForm({ onSaved }: { onSaved: (state: ComputerState) => void }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (draft.trim().length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/computer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: draft.trim() }),
      });
      const body = (await response.json()) as ComputerState & ApiProblem;
      if (!response.ok) {
        setError(apiProblemMessage(body, "Could not save the key."));
        return;
      }
      onSaved(body);
      announceFeatureChange();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-sm text-kumo-subtle">
        Give {AGENT_NAME} a computer: paste an{" "}
        <a
          href="https://www.orgo.ai/start"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Orgo API key
        </a>{" "}
        and it is stored in this app - no deployment settings involved.
      </p>
      <div className="flex items-center gap-2">
        <Input
          size="sm"
          type="password"
          value={draft}
          placeholder="sk_live_..."
          aria-label="Orgo API key"
          className="flex-1"
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={saving || draft.trim().length === 0}
        >
          {saving ? <Loader size={14} /> : "Save"}
        </Button>
      </div>
      {error !== null && <p className="text-xs text-kumo-danger">{error}</p>}
    </form>
  );
}

/** Clearing the app-stored key turns the whole capability off; ask twice. */
function RemoveKeyRow({ onRemoved }: { onRemoved: (state: ComputerState) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch("/api/computer", { method: "DELETE" });
      const body = (await response.json()) as ComputerState;
      if (response.ok) {
        onRemoved(body);
        announceFeatureChange();
      }
    } catch {
      // The row stays; the next click can retry.
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <p className="text-xs text-kumo-subtle">
      The Orgo API key is stored in this app.{" "}
      {confirming ? (
        <>
          Removing it disables {AGENT_NAME}&rsquo;s computer.{" "}
          <button
            type="button"
            className="text-kumo-danger underline"
            disabled={busy}
            onClick={() => void remove()}
          >
            Remove it
          </button>{" "}
          <button type="button" className="underline" onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </>
      ) : (
        <button type="button" className="underline" onClick={() => setConfirming(true)}>
          Remove key
        </button>
      )}
    </p>
  );
}
