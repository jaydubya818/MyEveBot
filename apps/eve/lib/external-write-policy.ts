/** No runtime switch or owner/model text can enable an unqualified provider. */
export class UnqualifiedExternalWrite extends Error {
  readonly code = "external_write_blocked";
  readonly surface:string;
  constructor(surface: string) {
    super("This write path has not yet been qualified for autonomous execution.");
    this.surface=surface;
  }
}
export function blockExternalWrite(surface: string): void {
  throw new UnqualifiedExternalWrite(surface);
}
/** Read transports stay available; all legacy provider mutation methods fail closed. */
export function requireReadOnlyTransport(surface: string, method = "GET"): void {
  if (!["GET", "HEAD"].includes(method.toUpperCase())) blockExternalWrite(surface);
}
