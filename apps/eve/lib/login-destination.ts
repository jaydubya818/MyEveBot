export function safeLoginDestination(search: string, origin: string): string {
  const requested = new URLSearchParams(search).get("returnTo");
  if (!requested?.startsWith("/") || requested.startsWith("//")) return "/today";
  try {
    const destination = new URL(requested, origin);
    return destination.origin === origin ? destination.href : "/today";
  } catch {
    return "/today";
  }
}
