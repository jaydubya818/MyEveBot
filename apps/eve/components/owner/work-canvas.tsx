"use client";
import { useEffect, useRef, useState } from "react";
import {
  canvasJourneys,
  initialCanvasState,
  reduceCanvasSample,
  canConfirmSample,
  type JourneyId,
} from "./work-canvas-model";
import "./owner.css";
import "./work-canvas.css";

/** Canonical Work Canvas interaction candidate. Fixture-only until canonical binding. */
export function WorkCanvas({ journeyId }: { journeyId: JourneyId }) {
  const journey = canvasJourneys[journeyId];
  const [state, setState] = useState(initialCanvasState);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [computer, setComputer] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const confirmation = useRef<HTMLElement>(null);
  const continuation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state.confirmed) confirmation.current?.focus();
  }, [state.confirmed]);
  useEffect(() => {
    if (messages.length) continuation.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  const dispatch = (action: Parameters<typeof reduceCanvasSample>[1]) =>
    setState((s) => reduceCanvasSample(s, action, journey));
  const choice = journey.choices.find((c) => c.id === state.selected);
  const confirmed = journey.choices.find((c) => c.id === state.confirmed);
  const ready = state.step === 4 && !state.failed;
  return (
    <div className="owner-shell canvas-shell">
      <a className="owner-skip" href="#canvas-main">
        Skip to Work
      </a>
      <aside className="canvas-sidebar" aria-label="Workspace">
        <a className="owner-brand" href="/today">
          MyEve
        </a>
        <nav aria-label="Primary">
          <a href="/today">Today</a>
          <a href="/work-canvas" aria-current="page">
            Work
          </a>
          <a href="/inbox">Inbox</a>
          <a href="/workspace">Files</a>
        </nav>
        <div className="canvas-sidebar-bottom">
          <span className="owner-muted">Your private instance</span>
          <a href="/manage">Advanced</a>
        </div>
      </aside>
      <div className="canvas-body">
        <header className="canvas-header">
          <div>
            <span className="owner-eyebrow">Work</span>
            <h1>{journey.title}</h1>
          </div>
          <span className="canvas-private">Private</span>
        </header>
        <details className="canvas-demo">
          <summary>Interaction preview · sample data only</summary>
          <p>
            No code runs, messages send or links publish. Refresh resets this
            sample.
          </p>
          <nav className="owner-actions" aria-label="Sample journeys">
            {Object.values(canvasJourneys).map((j) => (
              <a
                href={"/work-canvas?journey=" + j.id}
                aria-current={j.id === journeyId ? "page" : undefined}
                key={j.id}
              >
                {j.id === "engineering"
                  ? "Engineering"
                  : j.id === "email"
                    ? "Email"
                    : j.id === "research"
                      ? "Research"
                      : "Proactive"}
              </a>
            ))}
          </nav>
          <div className="owner-actions">
            <button
              disabled={state.step === 4 || state.failed}
              onClick={() => dispatch({ type: "advance" })}
            >
              Next sample step
            </button>
            <button
              onClick={() => {
                dispatch({ type: "reset" });
                setMessages([]);
                setDraft("");
              }}
            >
              Restart sample
            </button>
            <button
              disabled={Boolean(state.confirmed)}
              onClick={() => dispatch({ type: "fail" })}
            >
              Simulate verification failure
            </button>
            <button
              disabled={!ready || Boolean(state.confirmed)}
              onClick={() => dispatch({ type: "expire" })}
            >
              Expire sample decision
            </button>
          </div>
        </details>
        <main id="canvas-main" tabIndex={-1} className="canvas-stream">
          <section className="canvas-request" aria-label="Original request">
            <p className="owner-muted">{journey.source}</p>
            <p>{journey.request}</p>
          </section>
          <section className="canvas-sofie" aria-label="Sofie’s progress">
            <h2>Sofie</h2>
            <p className="canvas-status" role="status">
              {state.failed
                ? "Verification needs attention"
                : journey.stages[state.step]}
            </p>
            {state.step > 0 && (
              <ol className="canvas-activity" aria-label="Activity">
                {journey.activity
                  .slice(0, Math.min(state.step, 3))
                  .map((line) => (
                    <li key={line}>{line}</li>
                  ))}
              </ol>
            )}
            {journeyId === "engineering" && state.step >= 2 && (
              <>
                <button
                  className="canvas-text-button"
                  aria-expanded={computer}
                  onClick={() => setComputer((v) => !v)}
                >
                  Computer
                </button>
                {computer && (
                  <aside className="canvas-inline-panel">
                    <h3>Computer context</h3>
                    <p>
                      This sample has no live computer session. A connected
                      session will open here while your Work stays visible.
                    </p>
                    <a
                      href="/computer"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Computer workspace in a new tab
                    </a>
                  </aside>
                )}
              </>
            )}
          </section>
          {state.failed && (
            <section className="canvas-inline-panel" role="alert">
              <h2>The change is not verified</h2>
              <p>
                The sample regression check failed. There is no verified Result
                or publication decision.
              </p>
              <button onClick={() => dispatch({ type: "retry" })}>
                Retry sample verification
              </button>
            </section>
          )}
          {ready && (
            <section className="canvas-result" aria-label="Result">
              <div className="owner-row">
                <h2>
                  {journeyId === "engineering" ? "Verified Result" : "Result"}
                </h2>
                <span className="owner-muted">Sample · revision 1</span>
              </div>
              <p>{journey.result}</p>
              <details className="canvas-artifact">
                <summary>{journey.artifact.name}</summary>
                <pre>{journey.artifact.content}</pre>
              </details>
            </section>
          )}
          {ready && !confirmed && (
            <section className="canvas-decision" aria-label="Inline decision">
              <span className="owner-eyebrow">Needs You</span>
              <h2>{journey.decision}</h2>
              {state.expired ? (
                <div role="alert">
                  <p>
                    This sample decision expired. Review a fresh proposal before
                    choosing again.
                  </p>
                  <button onClick={() => dispatch({ type: "retry" })}>
                    Request fresh sample review
                  </button>
                </div>
              ) : (
                <>
                  <fieldset>
                    <legend className="sr-only">Choose one action</legend>
                    {journey.choices.map((c) => (
                      <label key={c.id} className="canvas-choice">
                        <input
                          type="radio"
                          name="decision"
                          value={c.id}
                          checked={state.selected === c.id}
                          onChange={() =>
                            dispatch({ type: "select", id: c.id })
                          }
                        />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </fieldset>
                  {choice && (
                    <div className="canvas-confirm">
                      <p>{choice.consequence}</p>
                      {choice.id === "changes" && (
                        <label>
                          What should change?
                          <textarea
                            value={state.changes}
                            maxLength={2000}
                            onChange={(e) =>
                              dispatch({
                                type: "changes",
                                value: e.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                      <p className="owner-muted">
                        Applies to this sample revision only. No external action
                        will execute.
                      </p>
                      <button
                        className="primary"
                        disabled={!canConfirmSample(state, journey)}
                        onClick={() => dispatch({ type: "confirm" })}
                      >
                        Confirm
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {confirmed && (
            <section
              className="canvas-confirmed"
              role="status"
              tabIndex={-1}
              ref={confirmation}
            >
              <h2>{confirmed.label} · sample confirmed</h2>
              <p>
                {confirmed.id === "changes"
                  ? `Requested changes: ${state.changes}`
                  : confirmed.consequence}
              </p>
              <p>
                No external action was performed.{" "}
                {confirmed.id === "changes"
                  ? "Sofie has your revision instructions in this sample."
                  : "You can continue with Sofie below."}
              </p>
            </section>
          )}
          {state.step > 0 && (
            <details className="canvas-proof">
              <summary>Proof of Work</summary>
              <p className="owner-muted">
                Sample evidence, not a live execution receipt.
              </p>
              <dl>
                {journey.proof.map((p) => (
                  <div key={p.label}>
                    <dt>{p.label}</dt>
                    <dd>
                      {p.label === "Verification" && !ready
                        ? "Not yet verified in this sample."
                        : p.label === "Tests" && !ready
                          ? "Sample checks not complete."
                          : p.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                <code>WAITING_FOR_CANONICAL_Q37</code>
              </p>
              <p>
                Canonical integration owns candidate custody, verification,
                exact-action authority and publication. This interface grants no
                permission.
              </p>
            </details>
          )}
          {messages.map((message, i) => (
            <section
              className="canvas-followup"
              key={i}
              aria-label="Continuation"
              ref={i === messages.length - 1 ? continuation : undefined}
            >
              <p className="canvas-request">
                <strong>You</strong>
                <br />
                {message}
              </p>
              <p>
                <strong>Sofie</strong>
                <br />
                I’ve captured that follow-up in this sample.{" "}
                {confirmed
                  ? "Your earlier decision stays attached to revision 1; any new action needs its own review."
                  : "It does not approve the pending action."}
              </p>
            </section>
          ))}
        </main>
        <form
          className="canvas-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            setMessages((m) => [...m, draft.trim()]);
            setDraft("");
            composer.current?.focus();
          }}
        >
          <label htmlFor="canvas-message">Continue with Sofie</label>
          <div>
            <textarea
              id="canvas-message"
              ref={composer}
              rows={2}
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add context, ask a question, or suggest a change…"
            />
            <button type="submit" className="primary" disabled={!draft.trim()}>
              Send
            </button>
          </div>
          <span className="owner-muted" role="status">
            {messages.length ? "Follow-up captured locally. " : ""}Sample
            conversation · not sent to an agent
          </span>
        </form>
      </div>
    </div>
  );
}
