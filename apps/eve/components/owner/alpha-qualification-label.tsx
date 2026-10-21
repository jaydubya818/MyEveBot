"use client";
import { useExternalLinksAllowed } from "./destination-gate";

export const ALPHA_QUALIFICATION_LABEL = "Not yet qualified for non-owners";

/** Presentational label. Cosmetic only: it grants and denies nothing. */
export function AlphaQualificationLabel({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      role="note"
      aria-label={ALPHA_QUALIFICATION_LABEL}
      data-testid="alpha-qualification-label"
      className="pointer-events-none fixed bottom-2 end-2 z-50 rounded-md border border-kumo-hairline bg-kumo-elevated px-3 py-1.5 text-xs font-medium text-kumo-subtle shadow-sm"
    >
      {ALPHA_QUALIFICATION_LABEL}
    </div>
  );
}

/** Shown only inside an external-alpha installation, using the existing
 * server-computed destination gate (null hrefs means "not an installation"). */
export function AlphaQualificationNotice() {
  return <AlphaQualificationLabel visible={!useExternalLinksAllowed()} />;
}
