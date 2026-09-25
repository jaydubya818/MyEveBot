// Bridges ask_sofie calls from the voice model into the real eve agent over the
// existing web channel. One eve session per voice conversation (Sofie keeps
// context across dispatches); one turn in flight at a time.
import type { UserContent } from "ai";
import { Client, type ClientSession, type SendTurnOptions, type HandleMessageStreamEvent } from "eve/client";

import { toUserContent, type VoiceAttachment } from "./attachments";
import { dispatchOutcome, type DispatchOutcome } from "./bridge";

export interface DispatchResult extends DispatchOutcome {
  events: HandleMessageStreamEvent[];
  busy?: boolean;
}

/** Fixed session operations used by voice and injectable in tests. */
export interface DispatchSession {
  readonly state: ClientSession["state"];
  send(message: string | UserContent, options?: SendTurnOptions): Promise<AsyncIterable<HandleMessageStreamEvent>>;
  respond(responses: ReadonlyArray<{ requestId: string; optionId?: string; text?: string }>): Promise<AsyncIterable<HandleMessageStreamEvent>>;
  cancel(): Promise<unknown>;
}

const BUSY_RESULT: DispatchResult = {
  reply: null,
  parked: null,
  failure: null,
  authorization: null,
  events: [],
  busy: true,
};

export class SofieDispatcher {
  private session: DispatchSession | undefined;
  private readonly client = new Client({ host: "" });
  private inFlight = false;
  private cancelRequested = false;

  constructor(sessionId?: string, session?: DispatchSession) {
    this.session = session ?? (sessionId ? this.client.sessions.attach(sessionId) : undefined);
  }

  get busy(): boolean {
    return this.inFlight;
  }

  get sessionId(): string | undefined {
    return this.session?.state.sessionId;
  }

  dispatch(
    request: string,
    clientContext: NonNullable<SendTurnOptions["clientContext"]>,
    attachments: readonly VoiceAttachment[] = [],
    onToolStarted?: (toolName: string) => void,
  ): Promise<DispatchResult> {
    // A plain string when nothing is attached keeps the common case identical
    // to what it was before attachments existed.
    const message = attachments.length === 0 ? request : toUserContent(request, attachments);
    return this.run({ message, clientContext }, onToolStarted);
  }

  answer(
    responses: ReadonlyArray<{ requestId: string; optionId?: string; text?: string }>,
    onToolStarted?: (toolName: string) => void,
  ): Promise<DispatchResult> {
    return this.run({ inputResponses: responses }, onToolStarted);
  }

  /**
   * Stop the running turn — the spoken equivalent of the chat stop button.
   * Cancellation is cooperative: the in-flight `run` settles on its own stream
   * with `turn.cancelled`, so this only asks.
   */
  async cancel(): Promise<boolean> {
    if (!this.inFlight) return false;
    try {
      // Session creation is asynchronous in Eve's fixed-ID client. Retain a
      // Stop request made before the first create response reaches the browser.
      if (!this.session) {
        this.cancelRequested = true;
        return true;
      }
      await this.session?.cancel();
      return true;
    } catch {
      return false;
    }
  }

  private async run(
    payload: { message?: string | UserContent; clientContext?: NonNullable<SendTurnOptions["clientContext"]>; inputResponses?: ReadonlyArray<{ requestId: string; optionId?: string; text?: string }> },
    onToolStarted?: (toolName: string) => void,
  ): Promise<DispatchResult> {
    if (this.inFlight) return BUSY_RESULT;
    this.inFlight = true;
    this.cancelRequested = false;
    const events: HandleMessageStreamEvent[] = [];
    try {
      let response: AsyncIterable<HandleMessageStreamEvent>;
      if (payload.inputResponses) {
        if (!this.session) throw new Error("There is no voice session awaiting input.");
        response = await this.session.respond(payload.inputResponses);
      } else if (this.session) {
        response = await this.session.send(payload.message!, { clientContext: payload.clientContext });
      } else {
        const created = await this.client.sessions.create({ message: payload.message!, clientContext: payload.clientContext });
        this.session = created.session;
        response = created.response;
        if (this.cancelRequested) await this.session.cancel();
      }
      for await (const event of response) {
        events.push(event);
        if (event.type === "actions.requested") {
          for (const action of event.data.actions) {
            if (action.kind === "tool-call") onToolStarted?.(action.toolName);
            else if (action.kind === "subagent-call") onToolStarted?.(action.subagentName);
          }
        }
      }
      return { ...dispatchOutcome(events), events };
    } catch (error) {
      return {
        reply: null,
        parked: null,
        failure: error instanceof Error ? error.message : String(error),
        authorization: null,
        events,
      };
    } finally {
      this.inFlight = false;
    }
  }
}
