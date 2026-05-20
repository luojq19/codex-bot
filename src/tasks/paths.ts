import { homedir } from "node:os";
import { join } from "node:path";

export const APP_DIR = join(homedir(), ".codex-bots");
export const TASKS_PATH = join(APP_DIR, "tasks.json");
export const RUNS_PATH = join(APP_DIR, "runs.jsonl");
