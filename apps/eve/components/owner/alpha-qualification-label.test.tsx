import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DestinationGate } from "./destination-gate";
import { ALPHA_QUALIFICATION_LABEL, AlphaQualificationLabel, AlphaQualificationNotice } from "./alpha-qualification-label";

describe("alpha qualification label", () => {
  it("shows inside an external-alpha installation", () => {
    const html = renderToStaticMarkup(<DestinationGate hrefs={["/chat"]}><AlphaQualificationNotice /></DestinationGate>);
    expect(html).toContain(ALPHA_QUALIFICATION_LABEL);
    expect(html).toContain('role="note"');
  });
  it("is absent outside an installation (null gate)", () => {
    const html = renderToStaticMarkup(<DestinationGate hrefs={null}><AlphaQualificationNotice /></DestinationGate>);
    expect(html).not.toContain(ALPHA_QUALIFICATION_LABEL);
    expect(html).toBe("");
  });
  it("is absent without any gate provider", () => {
    expect(renderToStaticMarkup(<AlphaQualificationNotice />)).toBe("");
  });
  it("presentational component honours visible=false", () => {
    expect(renderToStaticMarkup(<AlphaQualificationLabel visible={false} />)).toBe("");
  });
});
