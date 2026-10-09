import { z } from "zod";

export const grantDurationSchema = z.enum(["1d", "7d", "30d", "never"]);
export const grantDurationOptions = [
  { value: "1d", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Never — until revoked" },
] as const;

export function grantExpiry(duration: unknown, now = Date.now()): string | null {
  const selected = grantDurationSchema.parse(duration);
  return selected === "never" ? null : new Date(now + Number(selected.slice(0, -1)) * 86400000).toISOString();
}
