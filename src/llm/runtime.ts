import type { AppConfig } from "../config.js";
import { CodexExecRuntime } from "./execRuntime.js";
import { CodexThreadRuntime } from "./threadRuntime.js";

let threadRuntime: CodexThreadRuntime | undefined;
let threadRuntimeKey: string | undefined;

export function createExecRuntime(config: AppConfig): CodexExecRuntime {
  return new CodexExecRuntime(config);
}

export function getThreadRuntime(config: AppConfig): CodexThreadRuntime {
  const key = `${config.codexCommand}|search:${config.webSearchEnabled ? "on" : "off"}`;
  if (!threadRuntime || threadRuntimeKey !== key) {
    threadRuntime = new CodexThreadRuntime(config);
    threadRuntimeKey = key;
  }
  return threadRuntime;
}
