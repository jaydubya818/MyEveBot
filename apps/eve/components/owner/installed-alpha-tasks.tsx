"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AlphaTasksView } from "@/lib/myapps/alpha-tasks";
import type { Task } from "../../../../packages/myapps/src/alpha-tasks/contracts";
import { ProductShell, ResourceState } from "./product-shell";
import { Card, Empty } from "./primitives";

const messages: Record<string, string> = {
  APP_OPERATION_FENCED:
    "This operation was stopped. Its changes were not saved. Refresh to see the recorded outcome.",
  APP_UNAVAILABLE:
    "This app is unavailable. Refresh its records before trying again.",
  APP_CAPABILITY_DENIED:
    "App access is currently restricted. Your saved tasks are preserved.",
  APP_OPERATION_UNKNOWN:
    "An earlier operation needs recovery. Further changes are blocked and your saved tasks are preserved.",
  APP_CLEANUP_UNKNOWN:
    "We could not confirm that the app stopped. Further changes are blocked pending recovery.",
  APP_PREVIEW_EXPIRED:
    "This preview expired. Preview the release again before installing.",
  INSTALLATION_STALE:
    "The app or its permissions changed. Refresh and preview the release again.",
  APP_VERSION_CONFLICT:
    "The installed release changed. Refresh before making another change.",
  APP_BASE_MISMATCH:
    "This release no longer matches the installed version. Refresh to see available releases.",
  APP_CANDIDATE_REJECTED:
    "The app could not complete this operation. Your saved tasks were not changed.",
};
async function command(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/myapps/alpha", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok) throw new AppRequestError(value.error, response.status);
  return value;
}
class AppRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(
      status === 401
        ? "Sign in to view your installed apps."
        : (messages[code] ??
            "The request could not be confirmed. Refresh the app records."),
    );
  }
}
export function InstalledAlphaTasks() {
  const [apps, setApps] = useState<AlphaTasksView[]>([]),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(null);
    command({ operation: "catalog" }, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setApps(value.apps);
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "Could not load apps.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [revision]);
  return (
    <ProductShell
      title="Installed apps"
      description="Preview releases, approve installation, and manage your private tasks."
    >
      <div className="owner-actions">
        <Link href="/apps">All apps</Link>
        <Link href="/needs-you">Pending decisions</Link>
        <button onClick={refresh} disabled={loading}>
          Refresh apps
        </button>
      </div>
      <ResourceState loading={loading} error={error} refresh={refresh} />
      {!loading && !error && apps.length === 0 && (
        <Empty title="No task apps ready yet">
          A verified release from your Work will appear here when it is ready
          for preview.
        </Empty>
      )}
      {!error && (
        <div className="owner-stack">
          {apps.map((app) => (
            <TaskApp
              key={app.appId}
              app={app}
              refresh={refresh}
              loading={loading}
            />
          ))}
        </div>
      )}
      <p>
        <Link href="/api/myapps/ui">Other installed apps</Link>
      </p>
    </ProductShell>
  );
}
interface Approval {
  id: string;
  actionId: string;
  binding: string;
  revision: number;
}
function TaskApp({
  app,
  refresh,
  loading,
}: {
  app: AlphaTasksView;
  refresh: () => void;
  loading: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [status, setStatus] = useState<string | null>(null);
  const [title, setTitle] = useState(""),
    [priority, setPriority] = useState("Medium");
  const [preview, setPreview] = useState<{
    version: number;
    previewId: string;
    expiresAt: string;
  } | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const pending = useRef<{
    body: Record<string, unknown>;
    success: (value: any) => void;
  } | null>(null);
  const inFlight = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setPreview(null);
    setApproval(null);
  }, [app.revision]);
  async function run(
    body: Record<string, unknown>,
    success: (value: any) => void,
    retryable = false,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setStatus(null);
    if (retryable) pending.current = { body, success };
    try {
      const value = await command(body);
      if (!mounted.current) return;
      if (value.status === "UNKNOWN" || value.status === "RUNNING") {
        setError(messages.APP_OPERATION_UNKNOWN);
        refresh();
        return;
      }
      pending.current = null;
      if (value.status === "DENIED") {
        setError(messages.APP_CANDIDATE_REJECTED);
        refresh();
        return;
      }
      success(value);
      refresh();
    } catch (failure) {
      if (!mounted.current) return;
      if (
        failure instanceof AppRequestError &&
        failure.code !== "APP_UNAVAILABLE"
      )
        pending.current = null;
      setError(
        failure instanceof AppRequestError
          ? failure.message
          : "The response was interrupted. Refresh or retry the same request to confirm its outcome.",
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const blocked = busy || loading || pending.current !== null;
  const canRun = app.enabled && !app.recoveryRequired && !blocked;
  function operate(
    operation: "create" | "update",
    input: unknown,
    success: () => void,
  ) {
    void run(
      {
        operation,
        appId: app.appId,
        version: app.installedVersion,
        digest: app.installedDigest,
        input,
        requestKey: crypto.randomUUID(),
      },
      () => {
        success();
        setStatus(operation === "create" ? "Task added." : "Task saved.");
      },
      true,
    );
  }
  function create(event: FormEvent) {
    event.preventDefault();
    operate("create", { title: title.trim(), priority }, () => setTitle(""));
  }
  function decide(answer: "Install privately" | "Decline") {
    if (!approval) return;
    void run(
      {
        operation: "decideInstall",
        appId: app.appId,
        approvalId: approval.id,
        approvalAction: approval.actionId,
        approvalBinding: approval.binding,
        approvalRevision: approval.revision,
        answer,
      },
      (value) => {
        setStatus(
          value.outcome === "INSTALLED"
            ? "Release installed. Your saved tasks are ready."
            : "Installation declined.",
        );
        setPreview(null);
        setApproval(null);
      },
      true,
    );
  }
  return (
    <div className="owner-alpha-tasks">
      <Card title="Alpha Tasks">
        <p>
          {app.installedVersion === null
            ? "Ready for first installation"
            : `Release ${app.installedVersion} · ${app.enabled ? "Enabled" : "Paused"}`}
        </p>
        {busy && <p role="status">Working…</p>}
        {status && <p role="status">{status}</p>}
        {error && (
          <div role="alert">
            <p>{error}</p>
            {pending.current && (
              <button
                disabled={busy}
                onClick={() => {
                  const saved = pending.current;
                  if (saved) void run(saved.body, saved.success, true);
                }}
              >
                Retry same request
              </button>
            )}
          </div>
        )}
        {app.recoveryRequired && (
          <div className="owner-notice" role="alert">
            An operation needs recovery. Changes and installations are blocked.
            Your saved tasks remain below.{" "}
            <Link href="/feedback">Report this problem</Link>
          </div>
        )}
        {app.installedVersion !== null && (
          <button
            disabled={blocked || (app.recoveryRequired && !app.enabled)}
            onClick={() =>
              void run(
                {
                  operation: "setEnabled",
                  appId: app.appId,
                  revision: app.revision,
                  enabled: !app.enabled,
                },
                () =>
                  setStatus(
                    app.enabled
                      ? "App paused. Your tasks are preserved."
                      : "App enabled.",
                  ),
              )
            }
          >
            {app.enabled ? "Pause app" : "Enable app"}
          </button>
        )}
        <h3>Releases</h3>
        <p className="owner-muted">
          Installation and rollback keep your existing tasks. Every release
          requires a fresh preview and your approval.
        </p>
        <div className="owner-stack">
          {app.releases.map((release) => {
            const available =
              release.version !== app.installedVersion &&
              release.baseVersion === app.installedVersion;
            return (
              <div key={release.version} className="owner-actions">
                <span>
                  Release {release.version}
                  {release.version === app.installedVersion
                    ? " · Installed"
                    : ""}
                </span>
                {available && (
                  <button
                    disabled={blocked || app.recoveryRequired}
                    onClick={() => {
                      setApproval(null);
                      void run(
                        {
                          operation: "preview",
                          appId: app.appId,
                          version: release.version,
                        },
                        (value) => {
                          setPreview({ version: release.version, ...value });
                          setStatus(
                            "Preview completed using empty temporary data. Your saved tasks were not changed.",
                          );
                        },
                      );
                    }}
                  >
                    Preview release {release.version}
                  </button>
                )}
                {release.installedBefore &&
                  release.version !== app.installedVersion && (
                    <button
                      disabled={blocked || app.recoveryRequired}
                      onClick={() =>
                        void run(
                          {
                            operation: "rollbackCandidate",
                            appId: app.appId,
                            version: release.version,
                          },
                          () => {
                            setPreview(null);
                            setApproval(null);
                            setStatus(
                              "Rollback release prepared. Preview the new release to continue.",
                            );
                          },
                        )
                      }
                    >
                      Prepare rollback to release {release.version}
                    </button>
                  )}
              </div>
            );
          })}
        </div>
        {preview && (
          <div className="owner-notice">
            <h3>Release {preview.version} preview</h3>
            <p>
              Private task storage. No network access. Approval expires at{" "}
              {new Date(preview.expiresAt).toLocaleTimeString()}.
            </p>
            {!approval ? (
              <button
                disabled={blocked || app.recoveryRequired}
                onClick={() =>
                  void run(
                    {
                      operation: "requestInstall",
                      appId: app.appId,
                      previewId: preview.previewId,
                    },
                    (value) => setApproval(value),
                  )
                }
              >
                Review installation
              </button>
            ) : (
              <>
                <p>Install release {preview.version} for this app?</p>
                <div className="owner-actions">
                  <button
                    disabled={blocked || app.recoveryRequired}
                    onClick={() => decide("Install privately")}
                  >
                    Install release {preview.version} privately
                  </button>
                  <button disabled={blocked} onClick={() => decide("Decline")}>
                    Decline release
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {app.installedVersion !== null && (
          <>
            <h3>Your tasks</h3>
            {!app.enabled && <p>Enable the app to make changes.</p>}
            <form className="owner-stack" onSubmit={create}>
              <label>
                New task
                <input
                  required
                  maxLength={1000}
                  value={title}
                  disabled={!canRun}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                Priority
                <select
                  aria-label="Priority"
                  value={priority}
                  disabled={!canRun}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  {["Low", "Medium", "High"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <div>
                <button disabled={!canRun || !title.trim()}>Add task</button>
              </div>
            </form>
            {app.tasks.length === 0 ? (
              <Empty title="No tasks yet">Add your first task above.</Empty>
            ) : (
              <div className="owner-stack owner-task-list">
                {app.tasks.map((task) => (
                  <TaskEditor
                    key={task.id}
                    task={task}
                    disabled={!canRun}
                    save={(patch) =>
                      operate("update", { id: task.id, patch }, () => {})
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
function TaskEditor({
  task,
  disabled,
  save,
}: {
  task: Task;
  disabled: boolean;
  save: (patch: Omit<Task, "id">) => void;
}) {
  const [title, setTitle] = useState(task.title),
    [done, setDone] = useState(task.done),
    [priority, setPriority] = useState(task.priority ?? "Medium");
  useEffect(() => {
    setTitle(task.title);
    setDone(task.done);
    setPriority(task.priority ?? "Medium");
  }, [task.title, task.done, task.priority]);
  const changed =
    title !== task.title ||
    done !== task.done ||
    priority !== (task.priority ?? "Medium");
  return (
    <form
      className="owner-card owner-stack"
      onSubmit={(event) => {
        event.preventDefault();
        save({ title: title.trim(), done, priority });
      }}
    >
      <label>
        Task {task.id}
        <input
          required
          maxLength={1000}
          disabled={disabled}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="owner-task-completion">
        <input
          type="checkbox"
          disabled={disabled}
          checked={done}
          onChange={(event) => setDone(event.target.checked)}
        />{" "}
        Completed
      </label>
      <label>
        Task {task.id} priority
        <select
          aria-label={`Task ${task.id} priority`}
          disabled={disabled}
          value={priority}
          onChange={(event) =>
            setPriority((event.target.value as Task["priority"]) ?? "Medium")
          }
        >
          {["Low", "Medium", "High"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <div>
        <button disabled={disabled || !changed || !title.trim()}>
          Save task {task.id}
        </button>
      </div>
    </form>
  );
}
