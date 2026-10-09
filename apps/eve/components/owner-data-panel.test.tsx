import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { OwnerDataBackupErrorState } from "./owner-data-panel";

describe("Owner Data backup recovery", () => {
  it("keeps Data Center navigation and retry available when inventory loading fails", () => {
    const markup = renderToStaticMarkup(
      <OwnerDataBackupErrorState
        message="Your data inventory could not be loaded."
        onNavigate={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Owner Data Center"');
    expect(markup).toContain("What MyEve Knows");
    expect(markup).toContain("Backup &amp; recovery");
    expect(markup).toContain("Unable to load backup data");
    expect(markup).toContain("Retry");
  });
});
