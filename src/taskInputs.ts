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
