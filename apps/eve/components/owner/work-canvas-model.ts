/** Product interaction fixtures only. Never a canonical execution state machine. */
export type JourneyId = "engineering" | "email" | "research" | "proactive";
export interface CanvasChoice {
  id: string;
  label: string;
  consequence: string;
}
export interface CanvasJourney {
  id: JourneyId;
  title: string;
  source: string;
  request: string;
  stages: string[];
  activity: string[];
  result: string;
  decision: string;
  artifact: { name: string; content: string };
  choices: CanvasChoice[];
  proof: { label: string; value: string }[];
}
const changes = {
  id: "changes",
  label: "Ask for changes",
  consequence:
    "Return this draft to Sofie with your instructions. Nothing is published.",
};
const privateChoice = {
  id: "private",
  label: "Keep private",
  consequence:
    "Keep this Result in your private workspace. No external action.",
};
export const canvasJourneys: Record<JourneyId, CanvasJourney> = {
  engineering: {
    id: "engineering",
    title: "Fix the checkout retry",
    source: "Your request",
    request:
      "Fix the checkout retry bug. Keep the change small, test it, and let me review it before publishing.",
    stages: [
      "Request received",
      "Sofie is investigating",
      "Software Engineer is implementing",
      "MyEve is verifying",
      "Ready for your review",
    ],
    activity: [
      "Reproduced the retry losing its original order reference.",
      "Updated the retry handler and added a regression test.",
      "Checked the change against the original request.",
    ],
    result:
      "Checkout retries now keep the original order reference, so a retry cannot create a second order. The regression test and checkout suite pass in this sample. The change is ready for your review; nothing has been published.",
    decision: "How would you like to publish this change?",
    artifact: {
      name: "Checkout fix · 2 files",
      content:
        "Sample patch summary\n\ncheckout/retry.ts — retain the order reference when retrying.\ncheckout/retry.test.ts — reject duplicate creation on retry.\n\nNo payment behavior or database schema changes.",
    },
    choices: [
      {
        id: "pr",
        label: "Open pull request",
        consequence:
          "Push codex/checkout-retry to example/storefront and open a draft pull request against main. No merge or deployment.",
      },
      {
        id: "branch",
        label: "Push branch only",
        consequence:
          "Push codex/checkout-retry to example/storefront. No pull request, merge or deployment.",
      },
      privateChoice,
      changes,
    ],
    proof: [
      {
        label: "Tests",
        value: "Sample: checkout suite 18 passed; regression 1 passed.",
      },
      { label: "Candidate", value: "sample-candidate-v1 · not a live Git SHA" },
      {
        label: "Evidence",
        value: "sample-checkout-test-report-v1; bound to this sample revision",
      },
      {
        label: "Producer",
        value: "Software Engineer / MyFactory (fixture only)",
      },
      {
        label: "Verification",
        value: "Sample verification passed. Live readiness is unavailable.",
      },
      { label: "Artifacts", value: "Checkout fix; sample test report" },
      {
        label: "Provenance",
        value:
          "Owner request → Goal → Task → Work → delegation → candidate → verification → Result. Sample owner A, Work engineering-v1.",
      },
    ],
  },
  email: {
    id: "email",
    title: "Reply to Morgan",
    source: "Email · Morgan · Today, 9:12 AM",
    request:
      "Can you send over the revised launch date? We are planning our announcement. — Morgan",
    stages: [
      "Email received",
      "Sofie is reading the conversation",
      "Sofie is drafting a reply",
      "MyEve is checking the draft",
      "Reply ready for review",
    ],
    activity: [
      "Matched the message to the launch conversation.",
      "Used your approved launch note: October 14.",
      "Checked the recipient and exact reply text.",
    ],
    result:
      "I drafted a reply confirming October 14. I have not sent it. Review the exact message below before deciding.",
    decision: "Send this reply to Morgan?",
    artifact: {
      name: "Reply draft · revision 1",
      content:
        "To: Morgan <morgan@example.invalid>\nSubject: Re: Launch date\n\nHi Morgan,\nOur revised launch date is October 14. I’ll let you know if anything changes.\nThanks!",
    },
    choices: [
      {
        id: "send",
        label: "Send reply",
        consequence:
          "Send exactly revision 1 to morgan@example.invalid in the existing launch-date email thread. No attachments or additional recipients.",
      },
      privateChoice,
      changes,
    ],
    proof: [
      {
        label: "Source",
        value: "Sample email launch-date-01; original message retained above.",
      },
      {
        label: "Verification",
        value:
          "Sample recipient and draft revision checked; no send performed.",
      },
      { label: "Artifacts", value: "Reply draft revision 1" },
      {
        label: "Provenance",
        value:
          "Email → Work email-v1 → reply draft. Incoming text cannot authorize a send.",
      },
    ],
  },
  research: {
    id: "research",
    title: "Compare three research tools",
    source: "Your request",
    request:
      "Compare three research tools for our team. Put the tradeoffs in a short note I can share with Morgan.",
    stages: [
      "Request received",
      "Sofie is researching",
      "Research specialist is comparing sources",
      "MyEve is checking the note",
      "Research ready for review",
    ],
    activity: [
      "Compared source coverage, export options and collaboration.",
      "Separated observed features from assumptions.",
      "Attached source notes and marked unresolved pricing.",
    ],
    result:
      "The comparison note is ready. Tool A fits our source-heavy workflow; Tool B is simpler for quick summaries. Pricing still needs a live check. The note is private until you choose to share it.",
    decision: "Share this research note?",
    artifact: {
      name: "Research comparison · revision 1",
      content:
        "Sample research note\n\nTool A — strongest source trail; more setup.\nTool B — quick summaries; fewer export options.\nTool C — collaborative editing; unclear pricing.\n\nRecommendation: evaluate Tool A on one real project.\nSources: sample product guides A, B and C. These are fictional tools; no live research or current pricing is claimed.",
    },
    choices: [
      {
        id: "share",
        label: "Create share link",
        consequence:
          "Create a read-only link to revision 1, valid for seven days. Anyone with the link can view it. No email is sent.",
      },
      privateChoice,
      changes,
    ],
    proof: [
      {
        label: "Sources",
        value: "Three fictional product guides; no live browsing claimed.",
      },
      {
        label: "Evidence",
        value: "Sample comparison notes; pricing explicitly unverified.",
      },
      {
        label: "Verification",
        value: "Sample source trace and artifact revision checked.",
      },
      { label: "Artifacts", value: "Research comparison revision 1" },
      {
        label: "Provenance",
        value:
          "Owner request → Work research-v1 → private artifact. Sharing is a separate bound decision.",
      },
    ],
  },
  proactive: {
    id: "proactive",
    title: "Resolve the launch-date conflict",
    source: "Daily review · Sofie noticed a conflict",
    request:
      "Your launch checklist says October 14, but the announcement draft says October 16. I prepared a private comparison so you can choose the date.",
    stages: [
      "Conflict noticed",
      "Sofie is comparing your notes",
      "Sofie is preparing the options",
      "MyEve is checking the sources",
      "Needs You",
    ],
    activity: [
      "Found conflicting dates in two private drafts.",
      "Kept both sources unchanged.",
      "Prepared a bounded choice; no message will be sent.",
    ],
    result:
      "Two launch dates are still in your drafts. I need your judgment before preparing the next revision. Neither source has been changed.",
    decision: "Which date should the next draft use?",
    artifact: {
      name: "Date comparison · 2 sources",
      content:
        "Launch checklist, revision 3: October 14.\nAnnouncement draft, revision 2: October 16.\n\nNo external messages or calendar entries have been changed.",
    },
    choices: [
      {
        id: "oct14",
        label: "Use October 14",
        consequence:
          "Prepare a new private announcement draft using October 14. Do not send it or change the calendar.",
      },
      {
        id: "oct16",
        label: "Use October 16",
        consequence:
          "Prepare a new private checklist draft using October 16. Do not send it or change the calendar.",
      },
      {
        id: "later",
        label: "Decide later",
        consequence:
          "Leave the conflict unresolved and keep both drafts unchanged.",
      },
      changes,
    ],
    proof: [
      {
        label: "Sources",
        value: "Sample checklist revision 3 and announcement revision 2.",
      },
      {
        label: "Verification",
        value: "Sample conflict confirmed; human judgment required.",
      },
      { label: "Artifacts", value: "Date comparison" },
      {
        label: "Provenance",
        value:
          "Daily review → Work proactive-v1 → necessary judgment. No permission inferred from proactivity.",
      },
    ],
  },
};
export interface CanvasSampleState {
  step: number;
  selected: string | null;
  confirmed: string | null;
  expired: boolean;
  failed: boolean;
  changes: string;
}
export const initialCanvasState: CanvasSampleState = {
  step: 0,
  selected: null,
  confirmed: null,
  expired: false,
  failed: false,
  changes: "",
};
export type CanvasSampleAction =
  | { type: "advance" }
  | { type: "select"; id: string }
  | { type: "confirm" }
  | { type: "expire" }
  | { type: "fail" }
  | { type: "retry" }
  | { type: "changes"; value: string }
  | { type: "reset" };
export function canConfirmSample(
  state: CanvasSampleState,
  journey: CanvasJourney,
) {
  return (
    state.step === 4 &&
    !state.expired &&
    !state.failed &&
    !state.confirmed &&
    journey.choices.some((c) => c.id === state.selected) &&
    (state.selected !== "changes" || Boolean(state.changes.trim()))
  );
}
export function reduceCanvasSample(
  state: CanvasSampleState,
  action: CanvasSampleAction,
  journey: CanvasJourney,
): CanvasSampleState {
  switch (action.type) {
    case "advance":
      return state.failed || state.step >= 4
        ? state
        : { ...state, step: state.step + 1 };
    case "select":
      return state.step !== 4 ||
        state.confirmed ||
        state.expired ||
        state.failed ||
        !journey.choices.some((c) => c.id === action.id)
        ? state
        : { ...state, selected: action.id };
    case "confirm":
      return canConfirmSample(state, journey)
        ? { ...state, confirmed: state.selected }
        : state;
    case "expire":
      return state.confirmed
        ? state
        : { ...state, expired: true, selected: null };
    case "fail":
      return state.confirmed
        ? state
        : { ...state, step: 3, failed: true, selected: null };
    case "retry":
      return {
        ...state,
        step: 3,
        failed: false,
        expired: false,
        selected: null,
        confirmed: null,
      };
    case "changes":
      return { ...state, changes: action.value.slice(0, 2000) };
    case "reset":
      return { ...initialCanvasState };
  }
}
