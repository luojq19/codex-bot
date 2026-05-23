import { cwd } from "node:process";
import type { AppConfig } from "../config.js";

export type CodexControlConfig = {
  codexCommand: string;
  workdir: string;
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  timeoutMs: number;
  extraPath?: string;
  webSearchEnabled: boolean;
  allowedUserIds: Set<string>;
  allowedChannelIds: Set<string>;
};

export function loadCodexControlConfig(config: AppConfig): CodexControlConfig {
  return {
    codexCommand: process.env.CODEX_CONTROL_BIN?.trim() || process.env.CODEX_BIN?.trim() || config.codexCommand,
    workdir: process.env.CODEX_CONTROL_WORKDIR?.trim() || cwd(),
    sandbox: parseSandbox(process.env.CODEX_CONTROL_SANDBOX?.trim() || "workspace-write"),
    timeoutMs: parseTimeout(process.env.CODEX_CONTROL_TIMEOUT_SEC),
    extraPath: process.env.CODEX_CONTROL_EXTRA_PATH?.trim() || process.env.CODEX_EXTRA_PATH?.trim() || undefined,
    webSearchEnabled: parseBoolean(process.env.CODEX_CONTROL_WEB_SEARCH, config.webSearchEnabled),
    allowedUserIds: parseIdSet(process.env.DISCORD_CODEX_CONTROL_USER_IDS),
    allowedChannelIds: parseIdSet(process.env.DISCORD_CODEX_CONTROL_CHANNEL_IDS)
  };
}

export function isCodexControlAllowed(
  config: CodexControlConfig,
  input: { userId: string; channelId: string }
): { allowed: true } | { allowed: false; reason: string } {
  const hasUserAllowlist = config.allowedUserIds.size > 0;
  const hasChannelAllowlist = config.allowedChannelIds.size > 0;

  if (!hasUserAllowlist && !hasChannelAllowlist) {
    return {
      allowed: false,
      reason: "Codex control is disabled. Set DISCORD_CODEX_CONTROL_USER_IDS and optionally DISCORD_CODEX_CONTROL_CHANNEL_IDS."
    };
  }
  if (hasUserAllowlist && !config.allowedUserIds.has(input.userId)) {
    return { allowed: false, reason: "You are not allowed to use Codex control." };
  }
  if (hasChannelAllowlist && !config.allowedChannelIds.has(input.channelId)) {
    return { allowed: false, reason: "This channel is not allowed to use Codex control." };
  }
  return { allowed: true };
}

function parseIdSet(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(/[,\s;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function parseSandbox(value: string): CodexControlConfig["sandbox"] {
  if (value === "read-only" || value === "workspace-write" || value === "danger-full-access") {
    return value;
  }
  throw new Error("CODEX_CONTROL_SANDBOX must be read-only, workspace-write, or danger-full-access.");
}

function parseTimeout(value: string | undefined): number {
  const parsed = Number(value ?? "3600");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("CODEX_CONTROL_TIMEOUT_SEC must be a positive number.");
  }
  return Math.floor(parsed * 1000);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
