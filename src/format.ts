import { formatSchedule } from "./tasks/schedule.js";
import type { ScheduledTask, TaskRunRecord } from "./tasks/types.js";

export function formatTask(task: ScheduledTask): string {
  return [
    `${task.enabled ? "on " : "off"} ${task.id}`,
    `  name: ${task.name}`,
    `  kind: ${task.kind ?? "prompt"}`,
    `  model: ${task.model}`,
    `  schedule: ${formatSchedule(task.schedule)}`,
    task.workflow ? `  skill: ${task.workflow.skill}` : undefined,
    task.delivery?.discordChannelId ? `  discord: ${task.delivery.discordChannelId}` : undefined,
    `  next: ${task.nextRunAt}`,
    `  prompt: ${task.prompt}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatTaskList(tasks: ScheduledTask[]): string {
  if (tasks.length === 0) {
    return "No scheduled tasks.";
  }
  return tasks.map(formatTask).join("\n\n");
}

export function formatRun(run: TaskRunRecord): string {
  const detail = run.status === "success" ? run.output : run.error;
  return [
    `${run.status} ${run.runId}`,
    `  task: ${run.taskId}`,
    `  trigger: ${run.trigger}`,
    `  started: ${run.startedAt}`,
    `  finished: ${run.finishedAt}`,
    detail ? `  ${run.status === "success" ? "output" : "error"}: ${detail}` : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatRunList(runs: TaskRunRecord[]): string {
  if (runs.length === 0) {
    return "No run history.";
  }
  return runs.map(formatRun).join("\n\n");
}
