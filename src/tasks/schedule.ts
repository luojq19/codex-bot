import { CronExpressionParser } from "cron-parser";
import type { TaskSchedule } from "./types.js";

const DURATION_PATTERN = /^(\d+)(m|h|d)$/;

export function parseInterval(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error("Invalid interval. Use values like 10m, 1h, or 1d.");
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Interval amount must be a positive integer.");
  }

  switch (unit) {
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
      return amount * 24 * 60 * 60 * 1000;
    default:
      throw new Error("Unsupported interval unit.");
  }
}

export function formatSchedule(schedule: TaskSchedule): string {
  if (schedule.type === "once") {
    return `once at ${schedule.runAt}`;
  }
  if (schedule.type === "interval") {
    return `every ${formatDuration(schedule.everyMs)}`;
  }

  return `cron ${schedule.expression} (${schedule.timezone})`;
}

export function calculateNextRunAt(schedule: TaskSchedule, from = new Date()): string {
  if (schedule.type === "once") {
    return schedule.runAt;
  }
  if (schedule.type === "interval") {
    return new Date(from.getTime() + schedule.everyMs).toISOString();
  }

  const expression = CronExpressionParser.parse(schedule.expression, {
    currentDate: from,
    tz: schedule.timezone
  });
  return expression.next().toDate().toISOString();
}

export function validateSchedule(schedule: TaskSchedule): void {
  if (schedule.type === "once") {
    const runAt = new Date(schedule.runAt);
    if (Number.isNaN(runAt.getTime())) {
      throw new Error("Once schedule requires a valid runAt timestamp.");
    }
    return;
  }
  if (schedule.type === "interval") {
    if (!Number.isSafeInteger(schedule.everyMs) || schedule.everyMs <= 0) {
      throw new Error("Interval schedule requires a positive everyMs value.");
    }
    return;
  }

  if (!schedule.expression.trim()) {
    throw new Error("Cron schedule requires an expression.");
  }
  if (!schedule.timezone.trim()) {
    throw new Error("Cron schedule requires a timezone.");
  }
  calculateNextRunAt(schedule);
}

function formatDuration(ms: number): string {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (ms % day === 0) {
    return `${ms / day}d`;
  }
  if (ms % hour === 0) {
    return `${ms / hour}h`;
  }
  if (ms % minute === 0) {
    return `${ms / minute}m`;
  }

  return `${ms}ms`;
}
