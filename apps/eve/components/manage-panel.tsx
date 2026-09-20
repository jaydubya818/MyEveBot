"use client";
import { RoutinesPanel } from "@/components/routines-panel";

import { RelayPanel } from "./relay-panel";
import { Badge, Button, DropdownMenu, Input, Loader } from "@cloudflare/kumo";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  BellIcon,
  CalendarDotsIcon,
  ChatCircleDotsIcon,
  BrainIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  CopyIcon,
  ControlIcon,
  DatabaseIcon,
  HashIcon,
  LightningIcon,
  ListChecksIcon,
  MagicWandIcon,
  PaletteIcon,
  PhoneIcon,
  PlugsIcon,
  PlusIcon,
  PulseIcon,
  ReceiptIcon,
  UsersThreeIcon,
  TrashIcon,
  WarningCircleIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { CapabilityId, CapabilityStatus } from "@/lib/capabilities";
import { AppearancePanel } from "@/components/appearance-panel";
import { ApprovalCenterPanel } from "@/components/approval-center-panel";
import { ControlCenterPanel } from "@/components/control-center-panel";
import { AgentsPanel } from "@/components/agents-panel";
import { ActivationPanel } from "@/components/activation-panel";
import { FinancePanel } from "@/components/finance-panel";
import { IMessagePanel } from "@/components/imessage-panel";
import { PhonePanel } from "@/components/phone-panel";
import { OwnerDataPanel } from "@/components/owner-data-panel";
import { SkillsManager } from "@/components/skills-manager";
import { SystemHealthPanel } from "@/components/system-health-panel";
import { TaskRunsPanel } from "@/components/task-runs-panel";
import { ReviewDeliverySettings } from "@/components/review-delivery-settings";
import { SlackPanel } from "@/components/slack-panel";
import { AGENT_NAME } from "@/lib/identity";
import { cn } from "@/lib/utils";
import type { AgentActivityView } from "@/lib/agents";
import type { AgentView } from "@/lib/agents";
import type { RoleDefinition } from "@/lib/role-catalog";
import type { SolutionPack } from "@/lib/solution-packs";

// Management surface for everything Sofie does or knows on her own: scheduled
// reminders, event-trigger webhooks, long-term memory, connected apps, and
// saved skills. Reminders/webhooks/memory stay read + delete (creation is
// conversational); connections can be added/removed here because that's an
// OAuth flow, and skills are editable since they're plain markdown.
// Rendered by the /manage page.

interface ReminderItem {
  id: number;
  prompt: string;
  cron: string | null;
  timezone: string;
  nextFireAt: string;
  lastFiredAt: string | null;
}

interface WebhookItem {
  id: string;
  name: string;
  prompt: string;
  url: string;
  fireCount: number;
  lastFiredAt: string | null;
}

interface RunItem {
  id: number;
  kind: "reminder" | "webhook";
  automationId: string;
  firedAt: string;
  status: "ok" | "error";
  error: string | null;
  threadId: string | null;
}

interface MemoryItem {
  id: string;
  content: string;
  scope: { type: "owner" | "agent" | "goal" | "project" | "task"; id: string };
  permanent: boolean;
  confidence: number;
  sourceType: string;
  sourceId: string | null;
  updatedAt: string | null;
  lastConfirmedAt: string | null;
}

interface ConnectionItem {
  toolkit: string;
  accounts: {
    id: string;
    status: string;
    alias: string | null;
    label: string | null;
  }[];
}

function AgentActivity() {
  const [events, setEvents] = useState<AgentActivityView[] | null>(null);
  useEffect(() => {
    void fetch("/api/agents/activity", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body: { activity?: AgentActivityView[] } | null) => setEvents(body?.activity ?? []))
      .catch(() => setEvents([]));
  }, []);
  if (!events?.length) return null;
  return <section className="mb-6"><h3 className="text-sm font-semibold">Agent lifecycle</h3><ol className="mt-2 divide-y divide-kumo-hairline rounded-xl border border-kumo-hairline px-3">{events.slice(0, 10).map((event) => <li key={event.id} className="py-3"><p className="text-sm">{event.summary}</p><p className="mt-1 text-[11px] text-kumo-subtle">{event.agentName} · {event.actorType} · {new Date(event.createdAt).toLocaleString()}</p></li>)}</ol></section>;
}

function formatWhen(iso: string | null): string {
  if (iso === null) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Two-step destructive button: first click arms it, second click fires. */
function DeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [arming, setArming] = useState(false);

  useEffect(() => {
    if (!arming) return;
    const timer = setTimeout(() => setArming(false), 3000);
    return () => clearTimeout(timer);
  }, [arming]);

  if (arming) {
    return (
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          setArming(false);
          onDelete();
        }}
      >
        Confirm
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      shape="square"
      icon={TrashIcon}
      aria-label={label}
      title={label}
      onClick={() => setArming(true)}
    />
  );
}

function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      shape="square"
      icon={copied ? CheckIcon : CopyIcon}
      aria-label="Copy webhook URL"
      title="Copy webhook URL"
      onClick={() => {
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    />
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-kumo-subtle">{children}</p>;
}

function LoadingRow() {
  return (
    <div className="flex justify-center py-8">
      <Loader size={18} />
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-4 text-sm">
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-kumo-danger" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

/** Recent fires for one automation, with links to the delivered threads. */
function RunHistory({
  runs,
  onOpenThread,
}: {
  runs: RunItem[];
  onOpenThread: (threadId: string) => void;
}) {
  if (runs.length === 0) {
    return <p className="pb-2 ps-6 text-xs text-kumo-subtle">No runs recorded yet.</p>;
  }
  return (
    <ul className="mb-2 flex flex-col gap-1 ps-6">
      {runs.slice(0, 5).map((run) => (
        <li key={run.id} className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              run.status === "ok" ? "bg-kumo-success" : "bg-kumo-danger",
            )}
            aria-hidden
          />
          <span className="text-kumo-subtle">{formatWhen(run.firedAt)}</span>
          {run.status === "error" && (
            <span className="truncate text-kumo-danger" title={run.error ?? undefined}>
              {run.error ?? "failed"}
            </span>
          )}
          {run.threadId !== null && (
            <button
              type="button"
              className="flex items-center gap-1 text-kumo-interact hover:underline"
              onClick={() => onOpenThread(run.threadId!)}
            >
              Open thread
              <ArrowSquareOutIcon className="size-3" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ExpandCaret({ expanded, onToggle, label }: { expanded: boolean; onToggle: () => void; label: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      shape="square"
      icon={expanded ? CaretDownIcon : CaretRightIcon}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      onClick={onToggle}
    />
  );
}

// --- Connections tab ---

/**
 * Composio-hosted brand logo for a toolkit, on a small white tile so dark
 * marks (GitHub, Notion) stay visible in dark mode. Falls back to the plug
 * icon if the CDN has no logo for the slug.
 */
function ToolkitLogo({ toolkit }: { toolkit: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <PlugsIcon className="size-4 shrink-0 text-kumo-subtle" aria-hidden />;
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-[3px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny external SVG, not worth the image pipeline */}
      <img
        src={`https://logos.composio.dev/api/${toolkit}`}
        alt=""
        className="size-full object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function ConnectionsTab() {
  const [connections, setConnections] = useState<ConnectionItem[] | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [pendingToolkit, setPendingToolkit] = useState<string | null>(null);

  function load() {
    void fetch("/api/connections")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { connections?: ConnectionItem[]; checked?: string[] } | null) => {
        if (body === null) {
          setFailed(true);
          setConnections([]);
          return;
        }
        const connected = new Set((body.connections ?? []).map((entry) => entry.toolkit));
        setConnections(body.connections ?? []);
        setAvailable((body.checked ?? []).filter((toolkit) => !connected.has(toolkit)));
      })
      .catch(() => {
        setFailed(true);
        setConnections([]);
      });
  }

  useEffect(load, []);

  function connect(toolkit: string) {
    setPendingToolkit(toolkit);
    void fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<{ url: string }>;
      })
      .then(({ url }) => {
        window.open(url, "_blank", "noopener");
      })
      .catch((error: unknown) => {
        alert(error instanceof Error ? error.message : "Connect failed");
      })
      .finally(() => setPendingToolkit(null));
  }

  function disconnect(toolkit: string, accountId: string) {
    setConnections(
      (prev) =>
        prev?.map((entry) =>
          entry.toolkit === toolkit
            ? { ...entry, accounts: entry.accounts.filter((account) => account.id !== accountId) }
            : entry,
        ) ?? null,
    );
    void fetch("/api/connections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit, accountId }),
    });
  }

  if (connections === null) return <LoadingRow />;

  return (
    <div className="flex flex-col gap-3">
      {failed && (
        <EmptyNote>Couldn&rsquo;t reach Composio. Check COMPOSIO_API_KEY and retry.</EmptyNote>
      )}
      {!failed && connections.length === 0 && (
        <EmptyNote>No connected apps yet. Connect one below or ask {AGENT_NAME} in chat.</EmptyNote>
      )}
      {connections.filter((entry) => entry.accounts.length > 0).length > 0 && (
        <ul className="flex flex-col">
          {connections
            .filter((entry) => entry.accounts.length > 0)
            .map((entry) => (
              <li
                key={entry.toolkit}
                className="border-b border-kumo-hairline py-2.5 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <ToolkitLogo toolkit={entry.toolkit} />
                  <span className="text-sm font-medium capitalize">{entry.toolkit}</span>
                </div>
                <ul className="mt-1 flex flex-col gap-1">
                  {entry.accounts.map((account) => (
                    <li key={account.id} className="flex items-center gap-2 ps-6">
                      <span className="min-w-0 flex-1 truncate text-xs text-kumo-subtle">
                        {account.alias ?? account.label ?? account.id}
                      </span>
                      <Badge variant={account.status === "active" ? "success" : "secondary"}>
                        {account.status}
                      </Badge>
                      <DeleteButton
                        label={`Disconnect ${entry.toolkit}`}
                        onDelete={() => disconnect(entry.toolkit, account.id)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ul>
      )}
      {!failed && available.length > 0 && (
        <div className="pt-1">
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={
                <Button variant="secondary" size="sm" disabled={pendingToolkit !== null}>
                  <PlusIcon className="size-3.5" aria-hidden />
                  {pendingToolkit !== null ? "Opening…" : "Connect an app"}
                  <CaretDownIcon className="size-3 text-kumo-subtle" aria-hidden />
                </Button>
              }
            />
            <DropdownMenu.Content align="start">
              {available.map((toolkit) => (
                <DropdownMenu.Item key={toolkit} onClick={() => connect(toolkit)}>
                  <span className="flex items-center gap-2 capitalize">
                    <ToolkitLogo toolkit={toolkit} />
                    {toolkit}
                  </span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>
      )}
      {!failed && (
        <p className="text-xs text-kumo-subtle">
          Other apps can be connected by asking {AGENT_NAME} in chat — this list covers the common
          ones.
        </p>
      )}
    </div>
  );
}

interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion?: string;
  latestVersion?: string;
  updateUrl?: string;
}

type ManageSection = "routines" | "relay" | Exclude<CapabilityId, "computer"> | "system" | "activity" | "control" | "approvals" | "review-delivery" | "agents" | "getting-started" | "slack" | "imessage" | "data";

interface SectionDefinition {
  id: ManageSection;
  label: string;
  description: string;
  icon: Icon;
}

const SECTION_GROUPS: { label: string; sections: SectionDefinition[] }[] = [
  {
    label: "General",
    sections: [
      {
        id: "getting-started" as const,
        label: "Getting started",
        description: "Setup and first useful job",
        icon: CheckIcon,
      },
      {
        id: "review-delivery" as const,
        label: "Briefs & reviews",
        description: "Scheduled proactive delivery",
        icon: CalendarDotsIcon,
      },
      {
        id: "system" as const,
        label: "System",
        description: "Setup and service health",
        icon: PulseIcon,
      },
      {
        id: "appearance" as const,
        label: "Appearance",
        description: "Identity and theme",
        icon: PaletteIcon,
      },
      {
        id: "data" as const,
        label: "Your data",
        description: "Export, verify, and retention",
        icon: DatabaseIcon,
      },
      {
        id: "agents" as const,
        label: "Agents",
        description: "Role catalog and persistent Agents",
        icon: UsersThreeIcon,
      },
    ],
  },
  {
    label: "Automations",
    sections: [
      {
        id: "reminders" as const,
        label: "Reminders",
        description: "Scheduled follow-ups",
        icon: BellIcon,
      },
      {
        id: "triggers" as const,
        label: "Triggers",
        description: "Event-driven work",
        icon: LightningIcon,
      },
    ],
  },
  {
    label: "Channels",
    sections: [
      {
        id: "slack" as const,
        label: "Slack",
        description: "Workspace messaging and reactions",
        icon: HashIcon,
      },
      {
        id: "imessage" as const,
        label: "iMessage",
        description: "Pairing and shared-number delivery",
        icon: ChatCircleDotsIcon,
      },
      {
        id: "phone" as const,
        label: "Phone",
        description: "Text, calls, consent, and spend controls",
        icon: PhoneIcon,
      },
    ],
  },
  {
    label: "Knowledge & tools",
    sections: [
      {
        id: "memory" as const,
        label: "Memory",
        description: `What ${AGENT_NAME} remembers`,
        icon: BrainIcon,
      },
      {
        id: "connections" as const,
        label: "Connections",
        description: "Apps and accounts",
        icon: PlugsIcon,
      },
      {
        id: "skills" as const,
        label: "Skills",
        description: "Reusable procedures",
        icon: MagicWandIcon,
      },
    ],
  },
  {
    label: "Operations",
    sections: [
      { id: "routines", label: "Routines", description: "Readiness and reviewed capabilities", icon: ControlIcon },
      { id: "relay", label: "Relay", description: "Owner-controlled external sharing", icon: PlugsIcon },
      {
        id: "control" as const,
        label: "Control Center",
        description: "Live work and safe controls",
        icon: ControlIcon,
      },
      {
        id: "approvals" as const,
        label: "Approvals",
        description: "Exact-action owner decisions",
        icon: ShieldCheckIcon,
      },
      {
        id: "activity" as const,
        label: "Activity",
        description: "Audited tasks and evidence",
        icon: ListChecksIcon,
      },
      {
        id: "finance" as const,
        label: "Finance",
        description: "Recorded receipts",
        icon: ReceiptIcon,
      },
    ],
  },
];

const ALL_SECTIONS = SECTION_GROUPS.flatMap((group) => group.sections);

function isManageSection(value: string | undefined): value is ManageSection {
  return ALL_SECTIONS.some((section) => section.id === value);
}

function sectionFromPath(pathname: string): ManageSection | null {
  const segment = pathname.split("/").filter(Boolean)[1];
  return isManageSection(segment) ? segment : null;
}

function SectionStatus({ capability }: { capability: CapabilityStatus | undefined }) {
  if (capability?.state === "setup_required") {
    return <Badge variant="secondary">Setup</Badge>;
  }
  if (capability?.state === "ready") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-kumo-subtle">
        <span className="size-1.5 rounded-full bg-kumo-success" aria-hidden />
        Ready
      </span>
    );
  }
  return null;
}

function SetupRequired({ capability }: { capability: CapabilityStatus }) {
  return (
    <div className="rounded-2xl border border-kumo-hairline bg-kumo-tint p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-kumo-recessed">
          <WarningCircleIcon className="size-5 text-kumo-subtle" aria-hidden />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Setup required</h3>
          <p className="mt-1 text-sm text-kumo-subtle">{capability.reason}</p>
          {capability.setupHint && (
            <p className="mt-3 rounded-lg bg-kumo-recessed px-3 py-2 font-mono text-xs text-kumo-subtle">
              {capability.setupHint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionShell({
  title,
  description,
  capability,
  allowSetupRequiredContent = false,
  children,
}: {
  title: string;
  description: string;
  capability: CapabilityStatus | undefined;
  allowSetupRequiredContent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-kumo-hairline pb-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-kumo-subtle">{description}</p>
        </div>
        <SectionStatus capability={capability} />
      </div>
      {capability?.state === "setup_required" && !allowSetupRequiredContent ? (
        <SetupRequired capability={capability} />
      ) : (
        children
      )}
    </div>
  );
}

export function ManagePanel({
  onOpenThread,
  onStartAgentChat,
  onUseRole,
  onUseSolutionPack,
  onStartPrompt,
}: {
  /** Jump to a thread (e.g. one a reminder delivered). */
  onOpenThread: (threadId: string) => void;
  onStartAgentChat: (agent: AgentView) => void;
  onUseRole: (role: RoleDefinition) => void;
  onUseSolutionPack: (pack: SolutionPack) => void;
  onStartPrompt: (title: string, prompt: string) => void;
}) {
  const [selectedSection, setSelectedSection] = useState<ManageSection | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityStatus[] | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[] | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookItem[] | null>(null);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [memories, setMemories] = useState<MemoryItem[] | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<string | null>(null);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSection(sectionFromPath(window.location.pathname));
    function onPopState() {
      setSelectedSection(sectionFromPath(window.location.pathname));
      document.querySelector("main")?.scrollTo({ top: 0 });
    }
    window.addEventListener("popstate", onPopState);

    void fetch("/api/capabilities")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { capabilities?: CapabilityStatus[] } | null) => {
        if (body?.capabilities === undefined) {
          setCapabilityError(true);
          return;
        }
        setCapabilities(body.capabilities);
      })
      .catch(() => setCapabilityError(true));

    void fetch("/api/update-check")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: UpdateInfo | null) => setUpdate(body))
      .catch(() => undefined);

    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (capabilities === null) return;
    const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
    const automationsReady =
      byId.get("reminders")?.state === "ready" || byId.get("triggers")?.state === "ready";
    if (automationsReady) {
      void fetch("/api/automations")
        .then(async (response) => {
          if (!response.ok) throw new Error("Automations could not be loaded.");
          return response.json() as Promise<{
            reminders?: ReminderItem[];
            webhooks?: WebhookItem[];
            runs?: RunItem[];
          }>;
        })
        .then((body) => {
          setReminders(body.reminders ?? []);
          setWebhooks(body.webhooks ?? []);
          setRuns(body.runs ?? []);
        })
        .catch(() => setAutomationError("Automations could not be loaded. Check the database and retry."));
    }

    if (byId.get("memory")?.state === "ready") {
      void fetch("/api/memories")
        .then(async (response) => {
          if (!response.ok) throw new Error("Memory could not be loaded.");
          return response.json() as Promise<{ memories?: MemoryItem[] }>;
        })
        .then((body) => setMemories(body.memories ?? []))
        .catch(() => setMemoryError("Memory could not be loaded. Check Supermemory and retry."));
    }
  }, [capabilities]);

  function cancelReminder(id: number) {
    setReminders((prev) => prev?.filter((reminder) => reminder.id !== id) ?? null);
    void fetch("/api/automations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "reminder", id }),
    });
  }

  function deleteWebhook(id: string) {
    setWebhooks((prev) => prev?.filter((hook) => hook.id !== id) ?? null);
    void fetch("/api/automations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "webhook", id }),
    });
  }

  function forgetMemory(id: string) {
    setMemories((prev) => prev?.filter((memory) => memory.id !== id) ?? null);
    void fetch("/api/memories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  function runsFor(kind: "reminder" | "webhook", automationId: string | number): RunItem[] {
    const id = String(automationId);
    return runs.filter((run) => run.kind === kind && run.automationId === id);
  }

  const capabilityById = new Map(capabilities?.map((capability) => [capability.id, capability]));
  const capabilityFor = (id: ManageSection) =>
    id === "routines" || id === "relay" || id === "system" || id === "activity" || id === "control" || id === "approvals" || id === "agents" || id === "getting-started" || id === "slack" || id === "imessage" || id === "data"
      ? undefined
      : id === "review-delivery"
        ? capabilityById.get("goals")
        : capabilityById.get(id);
  const isVisible = (id: ManageSection) =>
    id === "routines" || id === "relay" || id === "system" || id === "activity" || id === "control" || id === "approvals" || id === "agents" || id === "getting-started" || id === "slack" || id === "imessage" || id === "data" || capabilityFor(id)?.state !== "excluded";
  const visibleSections = ALL_SECTIONS.filter((section) => isVisible(section.id));
  const activeSection =
    selectedSection !== null && isVisible(selectedSection)
      ? selectedSection
      : (visibleSections[0]?.id ?? "system");

  useEffect(() => {
    if (capabilities !== null && selectedSection !== null && !isVisible(selectedSection)) {
      setSelectedSection(null);
      window.history.replaceState(null, "", "/manage");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibility is derived from capabilities
  }, [capabilities, selectedSection]);

  function selectSection(section: ManageSection | null) {
    setSelectedSection(section);
    const path = section === null ? "/manage" : `/manage/${section}`;
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    requestAnimationFrame(() => document.querySelector("main")?.scrollTo({ top: 0 }));
  }

  function countFor(section: ManageSection): number | null {
    if (section === "reminders") return reminders?.length ?? null;
    if (section === "triggers") return webhooks?.length ?? null;
    if (section === "memory") return memories?.length ?? null;
    return null;
  }

  const activeMeta = ALL_SECTIONS.find((section) => section.id === activeSection)!;
  const activeCapability = capabilityFor(activeSection);
  const focusedWorkspace = activeSection === "skills";

  let sectionContent: React.ReactNode;
  if (activeSection === "getting-started") {
    sectionContent = <ActivationPanel capabilities={capabilities ?? []} onNavigate={selectSection} onStartPrompt={onStartPrompt} />;
  } else if (activeSection === "system") {
    sectionContent = <SystemHealthPanel />;
  } else if (activeSection === "review-delivery") {
    sectionContent = <ReviewDeliverySettings />;
  } else if (activeSection === "slack") {
    sectionContent = <SlackPanel />;
  } else if (activeSection === "imessage") {
    sectionContent = <IMessagePanel />;
  } else if (activeSection === "phone") {
    sectionContent = <PhonePanel />;
  } else if (activeSection === "control") {
    sectionContent = <ControlCenterPanel onOpenThread={onOpenThread} />;
  } else if (activeSection === "routines") {
    sectionContent = <RoutinesPanel />;
  } else if (activeSection === "relay") {
    sectionContent = <RelayPanel />;
  } else if (activeSection === "approvals") {
    sectionContent = <ApprovalCenterPanel />;
  } else if (activeSection === "activity") {
    sectionContent = <><AgentActivity /><TaskRunsPanel onOpenThread={onOpenThread} /></>;
  } else if (activeSection === "appearance") {
    sectionContent = <AppearancePanel />;
  } else if (activeSection === "data") {
    sectionContent = <OwnerDataPanel />;
  } else if (activeSection === "agents") {
    sectionContent = <AgentsPanel embedded onStartChat={onStartAgentChat} onUseRole={onUseRole} onUseSolutionPack={onUseSolutionPack} />;
  } else if (activeSection === "reminders") {
    sectionContent = automationError ? (
      <ErrorNote>{automationError}</ErrorNote>
    ) : reminders === null ? (
      <LoadingRow />
    ) : reminders.length === 0 ? (
      <EmptyNote>No reminders. Try &ldquo;remind me to stretch at 6pm&rdquo; in chat.</EmptyNote>
    ) : (
      <ul className="flex flex-col">
        {reminders.map((reminder) => {
          const history = runsFor("reminder", reminder.id);
          const expanded = expandedRuns === `reminder:${reminder.id}`;
          return (
            <li key={reminder.id} className="border-b border-kumo-hairline py-2 last:border-b-0">
              <div className="flex items-center gap-2">
                <ExpandCaret
                  expanded={expanded}
                  label={`${expanded ? "Hide" : "Show"} run history`}
                  onToggle={() => setExpandedRuns(expanded ? null : `reminder:${reminder.id}`)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm" title={reminder.prompt}>{reminder.prompt}</p>
                  <p className="mt-0.5 text-xs text-kumo-subtle">
                    Next: {formatWhen(reminder.nextFireAt)}
                    {reminder.cron !== null && ` · ${reminder.cron} (${reminder.timezone})`}
                    {history.length > 0 && ` · ran ${history.length}×`}
                  </p>
                </div>
                <Badge variant="secondary">{reminder.cron === null ? "one-off" : "recurring"}</Badge>
                <DeleteButton label={`Cancel reminder ${reminder.id}`} onDelete={() => cancelReminder(reminder.id)} />
              </div>
              {expanded && <RunHistory runs={history} onOpenThread={onOpenThread} />}
            </li>
          );
        })}
      </ul>
    );
  } else if (activeSection === "triggers") {
    sectionContent = automationError ? (
      <ErrorNote>{automationError}</ErrorNote>
    ) : webhooks === null ? (
      <LoadingRow />
    ) : webhooks.length === 0 ? (
      <EmptyNote>No event triggers. Ask {AGENT_NAME} to &ldquo;create a webhook for deploy alerts&rdquo;.</EmptyNote>
    ) : (
      <ul className="flex flex-col">
        {webhooks.map((hook) => {
          const history = runsFor("webhook", hook.id);
          const expanded = expandedRuns === `webhook:${hook.id}`;
          return (
            <li key={hook.id} className="border-b border-kumo-hairline py-2 last:border-b-0">
              <div className="flex items-center gap-2">
                <ExpandCaret
                  expanded={expanded}
                  label={`${expanded ? "Hide" : "Show"} run history`}
                  onToggle={() => setExpandedRuns(expanded ? null : `webhook:${hook.id}`)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{hook.name}</p>
                  <p className="mt-0.5 truncate text-xs text-kumo-subtle" title={hook.prompt}>{hook.prompt}</p>
                  <p className="mt-0.5 text-xs text-kumo-subtle">
                    Fired {hook.fireCount} {hook.fireCount === 1 ? "time" : "times"} · last {formatWhen(hook.lastFiredAt)}
                  </p>
                </div>
                <CopyUrlButton url={hook.url} />
                <DeleteButton label={`Delete trigger ${hook.name}`} onDelete={() => deleteWebhook(hook.id)} />
              </div>
              {expanded && <RunHistory runs={history} onOpenThread={onOpenThread} />}
            </li>
          );
        })}
      </ul>
    );
  } else if (activeSection === "memory") {
    sectionContent = memoryError ? (
      <ErrorNote>{memoryError}</ErrorNote>
    ) : memories === null ? (
      <LoadingRow />
    ) : memories.length === 0 ? (
      <EmptyNote>No saved memories yet.</EmptyNote>
    ) : (
      <ul className="flex flex-col">
        {memories.map((memory) => (
          <li key={memory.id} className="flex items-start gap-3 border-b border-kumo-hairline py-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm break-words">{memory.content}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kumo-subtle">
                <span className="capitalize">{memory.scope.type} scope</span>
                <span aria-hidden>·</span>
                <span>Source: {memory.sourceType.replaceAll("_", " ")}</span>
                <span aria-hidden>·</span>
                <span>{Math.round(memory.confidence * 100)}% confidence</span>
                <span aria-hidden>·</span>
                <span>Updated {formatWhen(memory.updatedAt)}</span>
                {memory.lastConfirmedAt && <><span aria-hidden>·</span><span>Confirmed {formatWhen(memory.lastConfirmedAt)}</span></>}
              </div>
            </div>
            {memory.permanent && <Badge variant="secondary">permanent</Badge>}
            <DeleteButton label="Forget memory" onDelete={() => forgetMemory(memory.id)} />
          </li>
        ))}
      </ul>
    );
  } else if (activeSection === "connections") {
    sectionContent = <ConnectionsTab />;
  } else if (activeSection === "skills") {
    sectionContent = <SkillsManager />;
  } else {
    sectionContent = <FinancePanel />;
  }

  return (
    <div className="pb-10">
      {update?.updateAvailable === true && update.updateUrl !== undefined && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-kumo-hairline bg-kumo-tint px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">A newer version of this agent is available</p>
            <p className="mt-0.5 text-xs text-kumo-subtle">
              Updating takes a few minutes and keeps your chats, memories, connections, skills,
              and settings.
              {update.currentVersion !== undefined && update.latestVersion !== undefined && (
                <span className="ms-1 font-mono">
                  {update.currentVersion} &rarr; {update.latestVersion}
                </span>
              )}
            </p>
          </div>
          <a
            href={update.updateUrl}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-kumo-interact hover:underline"
          >
            Update
            <ArrowSquareOutIcon className="size-3.5" />
          </a>
        </div>
      )}
      {capabilityError && (
        <div className="mb-4">
          <ErrorNote>System status could not be loaded. Refresh before changing settings.</ErrorNote>
        </div>
      )}

      <div
        className={cn(
          "grid items-start gap-6",
          focusedWorkspace ? "lg:grid-cols-1" : "lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8",
        )}
      >
        <nav
          aria-label="Manage sections"
          className={cn(
            "min-w-0",
            selectedSection !== null && "hidden lg:block",
            focusedWorkspace && "lg:hidden",
          )}
        >
          {SECTION_GROUPS.map((group) => {
            const groupSections = group.sections.filter((section) => isVisible(section.id));
            if (groupSections.length === 0) return null;
            return (
              <div key={group.label} className="mb-5 last:mb-0">
                <p className="mb-1.5 px-2 text-[11px] font-semibold tracking-wide text-kumo-subtle uppercase">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-1">
                  {groupSections.map((section) => {
                    const Icon = section.icon;
                    const count = countFor(section.id);
                    const selected = activeSection === section.id;
                    const capability = capabilityFor(section.id);
                    return (
                      <li key={section.id}>
                        <button
                          type="button"
                          aria-current={selected ? "page" : undefined}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors",
                            selected ? "bg-kumo-recessed" : "hover:bg-kumo-tint",
                          )}
                          onClick={() => selectSection(section.id)}
                        >
                          <span className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg border border-kumo-hairline",
                            selected ? "bg-kumo-canvas text-kumo-default" : "text-kumo-subtle",
                          )}>
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{section.label}</span>
                            <span className="block truncate text-xs text-kumo-subtle">{section.description}</span>
                          </span>
                          {capability?.state === "setup_required" ? (
                            <span className="size-2 rounded-full bg-kumo-warning" title="Setup required">
                              <span className="sr-only">Setup required</span>
                            </span>
                          ) : count !== null ? (
                            <span className="text-xs tabular-nums text-kumo-subtle">{count}</span>
                          ) : (
                            <CaretRightIcon className="size-3.5 text-kumo-subtle lg:hidden" aria-hidden />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <section className={cn("min-w-0", selectedSection === null && "hidden lg:block")}>
          <button
            type="button"
            className={cn(
              "mb-4 items-center gap-1.5 text-sm text-kumo-subtle hover:text-kumo-default",
              focusedWorkspace ? "flex" : "flex lg:hidden",
            )}
            onClick={() => selectSection(null)}
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            All settings
          </button>
          <div className="min-h-64 rounded-2xl border border-kumo-hairline bg-kumo-canvas p-4 sm:p-6">
            {capabilities === null && !capabilityError ? (
              <LoadingRow />
            ) : (
              <SectionShell
                title={activeMeta.label}
                description={activeMeta.description}
                capability={activeCapability}
                allowSetupRequiredContent={activeSection === "skills"}
              >
                {sectionContent}
              </SectionShell>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
