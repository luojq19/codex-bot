import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import { CodexCli } from "../codexCli.js";
import { calculateNextRunAt, validateSchedule } from "./schedule.js";
import { appendRun, readRuns, readTasks, writeTasks } from "./store.js";
import type { CreateTaskInput, RunTaskOptions, ScheduledTask, TaskRunRecord } from "./types.js";

export async function createTask(input: CreateTaskInput): Promise<ScheduledTask> {
  validateTaskInput(input);

  const tasks = await readTasks();
  const now = new Date();
  const isoNow = now.toISOString();
  const task: ScheduledTask = {
    id: randomUUID(),
    name: input.name.trim(),
    prompt: input.prompt.trim(),
    model: input.model.trim(),
    enabled: input.enabled ?? true,
    schedule: input.schedule,
    nextRunAt: calculateNextRunAt(input.schedule, now),
    createdAt: isoNow,
    updatedAt: isoNow
  };

  tasks.push(task);
  await writeTasks(tasks);
  return task;
}

export async function listTasks(): Promise<ScheduledTask[]> {
  return readTasks();
}

export async function getTask(id: string): Promise<ScheduledTask> {
  const task = (await readTasks()).find((candidate) => candidate.id === id);
  if (!task) {
    throw new Error(`Task not found: ${id}`);
  }
  return task;
}

export async function removeTask(id: string): Promise<ScheduledTask> {
  const tasks = await readTasks();
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    throw new Error(`Task not found: ${id}`);
  }
  await writeTasks(tasks.filter((candidate) => candidate.id !== id));
  return task;
}

export async function setTaskEnabled(id: string, enabled: boolean): Promise<ScheduledTask> {
  const tasks = await readTasks();
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) {
    throw new Error(`Task not found: ${id}`);
  }

  const now = new Date();
  const task: ScheduledTask = {
    ...tasks[index],
    enabled,
    nextRunAt: enabled ? calculateNextRunAt(tasks[index].schedule, now) : tasks[index].nextRunAt,
    updatedAt: now.toISOString()
  };
  tasks[index] = task;
  await writeTasks(tasks);
  return task;
}

export async function updateTaskNextRun(task: ScheduledTask, from = new Date()): Promise<ScheduledTask> {
  const tasks = await readTasks();
  const index = tasks.findIndex((candidate) => candidate.id === task.id);
  if (index < 0) {
    throw new Error(`Task not found: ${task.id}`);
  }

  const updated: ScheduledTask = {
    ...tasks[index],
    nextRunAt: calculateNextRunAt(tasks[index].schedule, from),
    updatedAt: new Date().toISOString()
  };
  tasks[index] = updated;
  await writeTasks(tasks);
  return updated;
}

export async function runTask(task: ScheduledTask, config: AppConfig, options: RunTaskOptions): Promise<TaskRunRecord> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const codex = new CodexCli(config);
  const status = await codex.status();

  if (!status.loggedIn) {
    const record: TaskRunRecord = {
      runId,
      taskId: task.id,
      trigger: options.trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      error: `${status.message} Run: codex-bots auth login`
    };
    await appendRun(record);
    return record;
  }

  try {
    const output = await codex.complete(task.model, task.prompt);
    const record: TaskRunRecord = {
      runId,
      taskId: task.id,
      trigger: options.trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "success",
      output
    };
    await appendRun(record);
    return record;
  } catch (error) {
    const record: TaskRunRecord = {
      runId,
      taskId: task.id,
      trigger: options.trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    };
    await appendRun(record);
    return record;
  }
}

export async function listRuns(options: { taskId?: string; limit?: number } = {}): Promise<TaskRunRecord[]> {
  return readRuns(options);
}

export async function appendQueuedRun(taskId: string, trigger: "schedule" | "manual"): Promise<TaskRunRecord> {
  const now = new Date().toISOString();
  const record: TaskRunRecord = {
    runId: randomUUID(),
    taskId,
    trigger,
    startedAt: now,
    finishedAt: now,
    status: "queued"
  };
  await appendRun(record);
  return record;
}

function validateTaskInput(input: CreateTaskInput): void {
  if (!input.name.trim()) {
    throw new Error("Task name is required.");
  }
  if (!input.prompt.trim()) {
    throw new Error("Task prompt is required.");
  }
  if (!input.model.trim()) {
    throw new Error("Task model is required.");
  }
  validateSchedule(input.schedule);
}
