import { describe, it, expect } from "vitest";
import {
  canvasJourneys,
  initialCanvasState,
  reduceCanvasSample,
  canConfirmSample,
} from "./work-canvas-model";
const j = canvasJourneys.engineering;
describe("Work Canvas sample decision integrity", () => {
  it("cannot confirm a candidate before verification", () => {
    const state = reduceCanvasSample(
      { ...initialCanvasState, step: 3 },
      { type: "select", id: "pr" },
      j,
    );
    expect(state.selected).toBeNull();
    expect(canConfirmSample({ ...state, selected: "pr" }, j)).toBe(false);
  });
  it("requires a bounded choice and a separate confirmation", () => {
    const ready = { ...initialCanvasState, step: 4 };
    expect(
      reduceCanvasSample(ready, { type: "select", id: "deploy" }, j),
    ).toEqual(ready);
    const selected = reduceCanvasSample(ready, { type: "select", id: "pr" }, j);
    expect(selected.confirmed).toBeNull();
    const done = reduceCanvasSample(selected, { type: "confirm" }, j);
    expect(done.confirmed).toBe("pr");
    expect(
      reduceCanvasSample(done, { type: "select", id: "branch" }, j),
    ).toEqual(done);
    expect(reduceCanvasSample(done, { type: "confirm" }, j)).toEqual(done);
  });
  it("invalidates stale decisions and failed verification", () => {
    for (const type of ["expire", "fail"] as const) {
      const stale = reduceCanvasSample(
        { ...initialCanvasState, step: 4, selected: "pr" },
        { type },
        j,
      );
      expect(stale.selected).toBeNull();
      expect(canConfirmSample(stale, j)).toBe(false);
      expect(
        reduceCanvasSample(stale, { type: "confirm" }, j).confirmed,
      ).toBeNull();
    }
  });
  it("requires change instructions and never carries authority into a new revision", () => {
    const state = { ...initialCanvasState, step: 4, selected: "changes" };
    expect(canConfirmSample(state, j)).toBe(false);
    const updated = reduceCanvasSample(
      state,
      { type: "changes", value: "Cover timeout retries" },
      j,
    );
    expect(canConfirmSample(updated, j)).toBe(true);
    expect(
      reduceCanvasSample(updated, { type: "retry" }, j).selected,
    ).toBeNull();
  });
  it("does not accept choices from another journey", () => {
    expect(
      canConfirmSample({ ...initialCanvasState, step: 4, selected: "send" }, j),
    ).toBe(false);
    expect(
      canConfirmSample(
        { ...initialCanvasState, step: 4, selected: "pr" },
        canvasJourneys.email,
      ),
    ).toBe(false);
  });
});
