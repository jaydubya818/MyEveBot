"use client";
import { createContext, useContext, type ReactNode } from "react";
import { productDestinations } from "./destinations";

/** Navigation gating for an external-alpha installation. The server computes the
 * allowed hrefs from the same allowlist the proxy enforces (a null value means
 * "not an installation": everything stays as it was). Hiding a link is cosmetic;
 * the proxy returns 404 for every denied route regardless. */
const Gate = createContext<readonly string[] | null>(null);
const FeedbackEnabled=createContext(false);

export function DestinationGate({ hrefs, children,feedbackEnabled=false }: { hrefs: readonly string[] | null; children: ReactNode;feedbackEnabled?:boolean }) {
  return <FeedbackEnabled.Provider value={feedbackEnabled}><Gate.Provider value={hrefs}>{children}</Gate.Provider></FeedbackEnabled.Provider>;
}
export function useBetaFeedbackEnabled(){return useContext(FeedbackEnabled);}
export function hrefAllowed(hrefs: readonly string[] | null, href: string): boolean {
  return hrefs === null || hrefs.includes(href);
}
export function useDestinationAllowed(): (href: string) => boolean {
  const hrefs = useContext(Gate);
  return (href) => hrefAllowed(hrefs, href);
}
export function useVisibleDestinations() {
  const hrefs = useContext(Gate);
  const feedback=useContext(FeedbackEnabled);
  const alphaDestinations = new Set(["/today", "/chat", "/work", "/needs-you", "/workspace", "/results", "/settings", "/privacy", "/search",'/feedback']);
  return productDestinations.filter((item) => (item.href!=='/feedback'||feedback)&&hrefAllowed(hrefs, item.href) && (hrefs === null || alphaDestinations.has(item.href)));
}
/** True outside an installation. External links are not part of the alpha. */
export function useExternalLinksAllowed(): boolean {
  return useContext(Gate) === null;
}
