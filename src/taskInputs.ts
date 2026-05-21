import type { AppConfig } from "./config.js";
import { parseInterval } from "./tasks/schedule.js";
import type { CreateTaskInput, TaskSchedule } from "./tasks/types.js";

export type TaskDraft = {
  name: string;
  prompt: string;
  model?: string;
  every?: string;
  once?: string;
  daily?: string;
  cron?: string;
  timezone?: string;
  kind?: "prompt" | "workflow";
  skill?: string;
  workflowInput?: string;
  discordChannelId?: string;
};

export function buildCreateTaskInput(draft: TaskDraft, config: AppConfig): CreateTaskInput {
  const schedule = buildSchedule(draft);
  const kind = draft.kind ?? "prompt";
  const prompt = draft.prompt || draft.workflowInput || "";
  return {
    kind,
    name: draft.name,
    prompt,
    model: draft.model?.trim() || config.model,
    schedule,
    workflow:
      kind === "workflow"
        ? {
            skill: draft.skill?.trim() || "literature-briefing",
            input: draft.workflowInput?.trim() || draft.prompt
          }
        : undefined,
    delivery: (draft.discordChannelId || process.env.DISCORD_DEFAULT_CHANNEL_ID)
      ? {
          discordChannelId: draft.discordChannelId || process.env.DISCORD_DEFAULT_CHANNEL_ID
        }
      : undefined,
    enabled: true
  };
}

export function defaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function buildSchedule(draft: TaskDraft): TaskSchedule {
  const every = draft.every?.trim();
  const once = draft.once?.trim();
  const daily = draft.daily?.trim();
  const cron = draft.cron?.trim();
  const scheduleKinds = [every, once, daily, cron].filter(Boolean);

  if (scheduleKinds.length > 1) {
    throw new Error("Use only one of --once, --every, --daily, or --cron.");
  }
  if (scheduleKinds.length === 0) {
    throw new Error("Provide one of --once <duration>, --every <duration>, --daily <HH:mm>, or --cron <expression>.");
  }
  if (once) {
    return {
      type: "once",
      runAt: new Date(Date.now() + parseInterval(once)).toISOString()
    };
  }
  if (every) {
    return {
      type: "interval",
      everyMs: parseInterval(every)
    };
  }
  if (daily) {
    return {
      type: "cron",
      expression: dailyToCron(daily),
      timezone: draft.timezone?.trim() || defaultTimezone()
    };
  }

  return {
    type: "cron",
    expression: cron ?? "",
    timezone: draft.timezone?.trim() || defaultTimezone()
  };
}

function dailyToCron(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Daily time must use HH:mm, e.g. 08:00.");
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("Daily time must be a valid 24-hour time.");
  }
  return `${minute} ${hour} * * *`;
}
