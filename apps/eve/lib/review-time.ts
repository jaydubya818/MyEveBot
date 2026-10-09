import { CronExpressionParser } from "cron-parser";

import type { ReviewKind } from "./review-types.ts";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface ReviewPeriod {
  key: string;
  timezone: string;
  start: Date;
  end: Date;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
    return timezone.includes("/") || timezone === "UTC";
  } catch {
    return false;
  }
}

export function isValidLocalTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

function timeParts(value: string): { hour: number; minute: number } {
  const match = TIME_PATTERN.exec(value);
  if (match === null) throw new Error("Time must use 24-hour HH:MM format.");
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function localParts(at: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function dateKey(at: Date, timezone: string): string {
  const { year, month, day } = localParts(at, timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function occurrence(
  cron: string,
  timezone: string,
  currentDate: Date,
  direction: "next" | "previous",
): Date {
  const interval = CronExpressionParser.parse(cron, { tz: timezone, currentDate });
  return direction === "next" ? interval.next().toDate() : interval.prev().toDate();
}

function periodBoundary(cron: string, timezone: string, at: Date): Date {
  return occurrence(cron, timezone, new Date(at.getTime() + 1_000), "previous");
}

function isoWeekKey(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

export function reviewPeriod(kind: ReviewKind, timezone: string, at = new Date()): ReviewPeriod {
  if (!isValidTimezone(timezone)) throw new Error("A valid IANA timezone is required.");
  const cron = kind === "daily" ? "0 0 * * *" : "0 0 * * 1";
  const start = periodBoundary(cron, timezone, at);
  const end = occurrence(cron, timezone, new Date(start.getTime() + 1_000), "next");
  const localDate = dateKey(start, timezone);
  return {
    key: kind === "daily" ? localDate : isoWeekKey(localDate),
    timezone,
    start,
    end,
  };
}

export function nextScheduledReviewAt(
  kind: ReviewKind,
  timezone: string,
  localTime: string,
  weeklyDay: number,
  after = new Date(),
): Date {
  if (!isValidTimezone(timezone)) throw new Error("A valid IANA timezone is required.");
  const { hour, minute } = timeParts(localTime);
  if (!Number.isInteger(weeklyDay) || weeklyDay < 0 || weeklyDay > 6) {
    throw new Error("Weekly review day must be between 0 and 6.");
  }
  const cron = kind === "daily"
    ? `${minute} ${hour} * * *`
    : `${minute} ${hour} * * ${weeklyDay}`;
  return occurrence(cron, timezone, after, "next");
}

export function mostRecentScheduledReviewAt(
  kind: ReviewKind,
  timezone: string,
  localTime: string,
  weeklyDay: number,
  at = new Date(),
): Date {
  if (!isValidTimezone(timezone)) throw new Error("A valid IANA timezone is required.");
  const { hour, minute } = timeParts(localTime);
  if (!Number.isInteger(weeklyDay) || weeklyDay < 0 || weeklyDay > 6) {
    throw new Error("Weekly review day must be between 0 and 6.");
  }
  const cron = kind === "daily"
    ? `${minute} ${hour} * * *`
    : `${minute} ${hour} * * ${weeklyDay}`;
  return occurrence(cron, timezone, new Date(at.getTime() + 1_000), "previous");
}

export function quietHoursEnd(
  at: Date,
  timezone: string,
  startTime: string,
  endTime: string,
): Date | null {
  const start = timeParts(startTime);
  const end = timeParts(endTime);
  const local = localParts(at, timezone);
  const minute = local.hour * 60 + local.minute;
  const startMinute = start.hour * 60 + start.minute;
  const endMinute = end.hour * 60 + end.minute;
  if (startMinute === endMinute) return null;
  const quiet = startMinute < endMinute
    ? minute >= startMinute && minute < endMinute
    : minute >= startMinute || minute < endMinute;
  if (!quiet) return null;
  return occurrence(`${end.minute} ${end.hour} * * *`, timezone, at, "next");
}

export function deliveryDeduplicationKey(input: {
  ownerId: string;
  kind: ReviewKind;
  periodKey: string;
  channel: string;
}): string {
  return `${input.ownerId}:${input.kind}:${input.periodKey}:${input.channel}`;
}
