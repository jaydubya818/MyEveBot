export const DEFAULT_DAILY_MESSAGE_LIMIT = 25;
export const DEFAULT_DAILY_CALL_LIMIT = 5;
export const DEFAULT_QUIET_HOURS_START = 21;
export const DEFAULT_QUIET_HOURS_END = 8;
export const DEFAULT_PHONE_TIMEZONE = "America/Los_Angeles";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_WORDS = new Set(["START", "UNSTOP"]);

export type PhoneConsentCommand = "allow" | "block" | null;

/** Carrier opt-out commands are commands only when the whole message is the keyword. */
export function phoneConsentCommand(text: string): PhoneConsentCommand {
  const command = text.trim().toUpperCase();
  if (STOP_WORDS.has(command)) return "block";
  if (START_WORDS.has(command)) return "allow";
  return null;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function hourInTimezone(now: Date, timezone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? "0");
}

/** Equal start/end disables quiet hours; an overnight window wraps midnight. */
export function isPhoneQuietHour(
  now: Date,
  timezone: string,
  startHour: number,
  endHour: number,
): boolean {
  if (startHour === endHour) return false;
  const hour = hourInTimezone(now, timezone);
  return startHour < endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}

export function firstOutboundDisclosure(agentName: string, text: string): string {
  return `${agentName}: ${text.trim()}\n\nYou asked to receive messages. Reply STOP to opt out.`;
}

export function estimatedSmsSegments(text: string): number {
  const length = text.trim().length;
  return length === 0 ? 0 : Math.ceil(length / 160);
}
