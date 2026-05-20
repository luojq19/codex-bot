import type { AppConfig } from "./config.js";
import { parseInterval } from "./tasks/schedule.js";
import type { CreateTaskInput, TaskSchedule } from "./tasks/types.js";

export type TaskDraft = {
  name: string;
  prompt: string;
  model?: string;
  every?: string;
  cron?: string;
  timezone?: string;
};

export function buildCreateTaskInput(draft: TaskDraft, config: AppConfig): CreateTaskInput {
  const schedule = buildSchedule(draft);
  return {
    name: draft.name,
    prompt: draft.prompt,
    model: draft.model?.trim() || config.model,
    schedule,
    enabled: true
  };
}

export function defaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function buildSchedule(draft: TaskDraft): TaskSchedule {
  const every = draft.every?.trim();
  const cron = draft.cron?.trim();

  if (every && cron) {
    throw new Error("Use either --every or --cron, not both.");
  }
  if (!every && !cron) {
    throw new Error("Provide either --every <duration> or --cron <expression>.");
  }
  if (every) {
    return {
      type: "interval",
      everyMs: parseInterval(every)
    };
  }

  return {
    type: "cron",
    expression: cron ?? "",
    timezone: draft.timezone?.trim() || defaultTimezone()
  };
}
