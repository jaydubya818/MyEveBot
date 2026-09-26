import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatWorkSelector } from "./chat-work-selector";

describe("Chat Work navigation", () => {
  it("opens the selected Work detail while its route is loading", () => {
    const markup = renderToStaticMarkup(<ChatWorkSelector
      selected={{ id: "a5dd7a30-62e6-4c53-946e-11d8dd350321", title: "Investigate issue", repository: "owner/repo" }}
      onSelect={() => {}}
    />);
    expect(markup).toContain('href="/work?id=a5dd7a30-62e6-4c53-946e-11d8dd350321"');
    expect(markup).toContain("Selected:");
    expect(markup).toContain("Investigate issue");
    expect(markup).toContain("Loading route status");
  });

  it("opens the Work list when no context is selected", () => {
    const markup = renderToStaticMarkup(<ChatWorkSelector selected={null} onSelect={() => {}} />);
    expect(markup).toContain('href="/work"');
    expect(markup).not.toContain("Selected:");
  });
});
