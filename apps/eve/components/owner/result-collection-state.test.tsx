import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultCollectionState } from "./result-collection-state";

describe("Result collection readback", () => {
  it("does not claim there are no saved Results when their read failed", () => {
    const html = renderToStaticMarkup(<ResultCollectionState confirmed={false} />);
    expect(html).toContain("Their saved state is unknown");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("No retained Results");
    expect(html).not.toContain("Verified outputs and their evidence will appear here");
  });

  it("shows the empty state only after a successful read found no Results", () => {
    const html = renderToStaticMarkup(<ResultCollectionState confirmed />);
    expect(html).toContain("No retained Results");
    expect(html).not.toContain("saved state is unknown");
  });
});
