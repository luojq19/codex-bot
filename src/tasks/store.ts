import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { APP_DIR, RUNS_PATH, TASKS_PATH } from "./paths.js";
import type { ScheduledTask, TaskRunRecord } from "./types.js";

export async function readTasks(): Promise<ScheduledTask[]> {
  try {
    const raw = await readFile(TASKS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${TASKS_PATH} must contain an array.`);
    }
    return parsed as ScheduledTask[];
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeTasks(tasks: ScheduledTask[]): Promise<void> {
  await mkdir(dirname(TASKS_PATH), { recursive: true, mode: 0o700 });
  const tempPath = `${TASKS_PATH}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(tasks, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await rename(tempPath, TASKS_PATH);
}

export async function appendRun(record: TaskRunRecord): Promise<void> {
  await mkdir(APP_DIR, { recursive: true, mode: 0o700 });
  await appendFile(RUNS_PATH, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

export async function readRuns(options: { taskId?: string; limit?: number } = {}): Promise<TaskRunRecord[]> {
  try {
    const raw = await readFile(RUNS_PATH, "utf8");
    const rows = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TaskRunRecord);
    const filtered = options.taskId ? rows.filter((row) => row.taskId === options.taskId) : rows;
    const limit = options.limit ?? 20;
    return filtered.slice(Math.max(0, filtered.length - limit)).reverse();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
