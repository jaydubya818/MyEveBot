"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { GoalDetailView, GoalSummaryView } from "@/lib/goal-types";
import { exampleGoal } from "./preview";
import { workPrompt } from "./projection";
import { ownerRequest } from "./data";
import { Card } from "./primitives";

export function NewWork({
  preview,
  onCreated,
  onDiscuss,
}: {
  preview: boolean;
  onCreated: (goal: GoalDetailView) => void;
  onDiscuss: (text: string) => void;
}) {
  const [title, setTitle] = useState(""),
    [criteria, setCriteria] = useState(""),
    [context, setContext] = useState("");
  const [saved, setSaved] = useState<GoalSummaryView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const attempt = useRef({ signature: "", key: "" });
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !title.trim()) return;
    const parsedCriteria = criteria
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (parsedCriteria.length > 20) {
      setError(
        "Keep this work focused on at most 20 acceptance criteria. Your draft has not been submitted.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    const payload = {
      title: title.trim(),
      description: context.trim() || title.trim(),
      successCriteria: parsedCriteria,
      status: "draft",
      planningMode: "simple",
    };
    const signature = JSON.stringify(payload);
    if (attempt.current.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    try {
      const goal = preview
        ? {
            ...exampleGoal(`preview-${attempt.current.key}`, title.trim()),
            ...payload,
            status: "draft" as const,
            planningMode: "simple" as const,
            plans: [],
            progress: 0,
            taskCount: 0,
            completedTaskCount: 0,
            linkedRunIds: [],
          }
        : (
            await ownerRequest<{ goal: GoalDetailView }>("/api/goals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...payload,
                idempotencyKey: attempt.current.key,
              }),
            })
          ).goal;
      setSaved(goal);
      onCreated(goal);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Work could not be saved. Your draft is still here.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="owner-grid">
      <section className="owner-card">
        {saved ? (
          <>
            <h2>Work saved. Let’s shape the plan.</h2>
            <p>{saved.title}</p>
            <p className="owner-muted">
              This is a draft objective. Saving it has not started an execution
              or granted permission for external actions.
            </p>
            <button
              className="primary"
              onClick={() =>
                onDiscuss(
                  workPrompt(
                    saved,
                    "Help me turn this draft outcome into a clear objective, acceptance criteria, and a practical plan. Link our conversation to this saved goal using the existing goal tools.",
                  ),
                )
              }
            >
              Plan this with Sofie
            </button>
            <p>
              <Link
                href={
                  preview
                    ? `/beta-preview?view=work&id=${encodeURIComponent(saved.id)}`
                    : `/work?id=${encodeURIComponent(saved.id)}`
                }
              >
                View saved work →
              </Link>
            </p>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <h2>What should be different when it’s done?</h2>
            <p className="owner-muted">
              A short, concrete assignment is enough. Sofie can help clarify the
              rest.
            </p>
            <label>
              Desired outcome
              <input
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Prepare a one-page design partner welcome guide"
              />
            </label>
            <label>
              What would make it a good result?
              <textarea
                maxLength={4000}
                value={criteria}
                onChange={(event) => setCriteria(event.target.value)}
                placeholder="One criterion per line. You can also leave this for Sofie to help define."
              />
            </label>
            <label>
              Context and boundaries
              <textarea
                maxLength={8000}
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Who is this for? What matters? What should require your review?"
              />
            </label>
            {error && (
              <p role="alert" className="owner-notice">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={busy || !title.trim()}
              type="submit"
            >
              {busy
                ? "Saving…"
                : preview
                  ? "Save sample work"
                  : "Save work & plan next"}
            </button>
          </form>
        )}
      </section>
      <Card title="Start small">
        <p className="owner-muted">
          Useful first assignments include preparing a meeting brief, comparing
          a few options, or drafting a document from sources you trust.
        </p>
        <p className="owner-muted">
          You don’t need to configure workers or queues. Review the outcome and
          plan, and keep consequential decisions explicit.
        </p>
      </Card>
    </div>
  );
}
