import { describe, expect, it } from "vitest";
import { chatWorkHeaders, changeChatWork, chatWorkOptions, chatWorkOptionLabel, type ChatWorkOption, type ChatWorkSelection } from "./chat-work-selection";
import { reconcileChatSession } from "./chat-session";

const selected: ChatWorkSelection = {
  workId: "a845335e-37c1-4b2b-a737-8123e86c9010", title: "Normalize line endings", intent: "observe",
};
const other: ChatWorkSelection = { ...selected, workId: "b845335e-37c1-4b2b-a737-8123e86c9010" };

describe("conversation Work selection", () => {
  it("uses observation by default, without creating any authority", () => {
    expect(chatWorkHeaders(selected)).toEqual({
      "x-myeve-engineering-work-id": selected.workId, "x-myeve-engineering-intent": "observe",
    });
    expect(chatWorkHeaders(undefined)).toEqual({});
  });
  it("permits an explicit continuation intent only for the same locked Work", () => {
    const changed = changeChatWork(selected, { ...selected, intent: "continue" }, true);
    expect(chatWorkHeaders(changed)["x-myeve-engineering-intent"]).toBe("continue");
  });
  it.each([
    [selected, other], [selected, undefined], [undefined, selected],
  ])("cannot rebind a started conversation or drop its binding", (previous, next) => {
    expect(() => changeChatWork(previous, next, true)).toThrow("new conversation");
  });
  it("allows selecting Work before the conversation starts", () => {
    expect(changeChatWork(undefined, selected, false)).toEqual(selected);
  });
  it.each([
    { ...selected, workId: "not-an-id" }, { ...selected, intent: "execute" },
    { ...selected, intent: undefined },
  ])("fails closed on damaged saved context", (invalid) => {
    expect(() => chatWorkHeaders(invalid as ChatWorkSelection)).toThrow("invalid");
  });
  it("retains the binding and lock through durable save, refresh and stream reconciliation", () => {
    const chat = { events: [], session: { sessionId: "session", streamIndex: 0 },
      workSelection: selected, workContextLocked: true };
    const restored = reconcileChatSession(JSON.parse(JSON.stringify(chat)));
    expect(chatWorkHeaders(restored.workSelection)).toEqual(chatWorkHeaders(selected));
    expect(() => changeChatWork(restored.workSelection, other, restored.workContextLocked)).toThrow();
  });
});

describe("canonical owner Work list", () => {
  it("uses the canonical title, lifecycle and control fields, not objective/state", () => {
    expect(chatWorkOptions([{ id: selected.workId, title: "Line endings", objective: "A long detailed objective",
      lifecycle: "active", control: "paused", version: 1, generation: 1 }]))
      .toEqual([{ id: selected.workId, title: "Line endings", lifecycle: "active", control: "paused" }]);
  });
  it("fails closed on an unavailable or incompatible response", () => {
    expect(() => chatWorkOptions(undefined)).toThrow();
    expect(() => chatWorkOptions([{ id: selected.workId, objective: "old shape", state: "PAUSED" }])).toThrow();
  });
});

it("labels canonical paused Work as Paused rather than active", () => {
  const work: ChatWorkOption = { id: selected.workId, title: "Line endings", lifecycle: "active", control: "paused" };
  expect(chatWorkOptionLabel(work)).toBe("Line endings · Paused");
});
