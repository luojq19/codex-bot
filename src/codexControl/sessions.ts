import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type CodexSessionSummary = {
  id: string;
  threadName: string;
  updatedAt: string;
};

export type CodexHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type CodexUsageSummary = {
  timestamp: string;
  planType?: string;
  primary?: string;
  secondary?: string;
  rateLimitReached?: string;
  lastTurn?: string;
  sessionTotal?: string;
};

export async function listCodexSessions(limit = 10): Promise<CodexSessionSummary[]> {
  const path = join(homedir(), ".codex", "session_index.jsonl");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }

  const sessions = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const id = typeof parsed.id === "string" ? parsed.id : "";
        if (!id) {
          return [];
        }
        return [
          {
            id,
            threadName: typeof parsed.thread_name === "string" ? parsed.thread_name : "(untitled)",
            updatedAt: typeof parsed.updated_at === "string" ? parsed.updated_at : ""
          }
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return sessions.slice(0, limit);
}

export async function findCodexSession(id: string): Promise<CodexSessionSummary | undefined> {
  const sessions = await listCodexSessions(100);
  return sessions.find((session) => session.id === id || session.id.startsWith(id));
}

export async function readCodexHistory(sessionId: string, limit = 8): Promise<CodexHistoryMessage[]> {
  const path = await findSessionFile(sessionId);
  if (!path) {
    return [];
  }

  const raw = await readFile(path, "utf8");
  const primary: CodexHistoryMessage[] = [];
  const fallback: CodexHistoryMessage[] = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (record.type === "response_item" && isObject(record.payload)) {
      const payload = record.payload;
      const role = readRole(payload.role);
      if (payload.type === "message" && role) {
        const text = cleanHistoryText(extractContentText(payload.content));
        if (text && !shouldSkipHistoryMessage(role, text)) {
          primary.push({ role, text });
        }
      }
    }

    if (record.type === "event_msg" && isObject(record.payload)) {
      const payload = record.payload;
      if (payload.type === "user_message" && typeof payload.message === "string") {
        const text = cleanHistoryText(payload.message);
        if (text && !shouldSkipHistoryMessage("user", text)) {
          fallback.push({ role: "user", text });
        }
      }
      if (payload.type === "agent_message" && typeof payload.message === "string") {
        const text = cleanHistoryText(payload.message);
        if (text) {
          fallback.push({ role: "assistant", text });
        }
      }
    }
  }

  return (primary.length ? primary : fallback).slice(-limit);
}

export async function loadLatestCodexUsage(): Promise<CodexUsageSummary | undefined> {
  let latest: { timestamp: string; payload: Record<string, unknown> } | undefined;
  const files = await recentSessionFiles(40);

  for (const file of files) {
    const raw = await readFile(file, "utf8").catch(() => "");
    for (const line of raw.split("\n")) {
      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const payload = isObject(record.payload) ? record.payload : undefined;
      if (record.type !== "event_msg" || payload?.type !== "token_count") {
        continue;
      }
      const timestamp = typeof record.timestamp === "string" ? record.timestamp : "";
      if (!latest || timestamp > latest.timestamp) {
        latest = { timestamp, payload };
      }
    }
  }

  if (!latest) {
    return undefined;
  }

  const rateLimits = isObject(latest.payload.rate_limits) ? latest.payload.rate_limits : {};
  const info = isObject(latest.payload.info) ? latest.payload.info : {};
  const total = isObject(info.total_token_usage) ? info.total_token_usage : undefined;
  const last = isObject(info.last_token_usage) ? info.last_token_usage : undefined;

  return {
    timestamp: latest.timestamp,
    planType: readString(rateLimits.plan_type),
    primary: formatRateLimit("primary", isObject(rateLimits.primary) ? rateLimits.primary : undefined),
    secondary: formatRateLimit("secondary", isObject(rateLimits.secondary) ? rateLimits.secondary : undefined),
    rateLimitReached: readString(rateLimits.rate_limit_reached_type),
    lastTurn: formatTokenUsage(last),
    sessionTotal: formatTokenUsage(total)
  };
}

export function formatCodexSessions(sessions: CodexSessionSummary[]): string {
  if (sessions.length === 0) {
    return "No Codex sessions found in ~/.codex/session_index.jsonl.";
  }
  return sessions
    .map((session) => [`${session.updatedAt}`, session.threadName, `/codex bind session:${session.id}`].join("\n"))
    .join("\n\n");
}

export function formatCodexHistory(sessionId: string, messages: CodexHistoryMessage[]): string {
  if (messages.length === 0) {
    return `No user/Codex messages found for ${sessionId}.`;
  }
  return [
    `History for ${sessionId}`,
    `Showing ${messages.length} message(s).`,
    ...messages.map((message) => {
      const role = message.role === "user" ? "You" : "Codex";
      return `\n${role}:\n${truncateText(message.text, 1400)}`;
    })
  ].join("\n");
}

export function formatCodexUsage(usage: CodexUsageSummary | undefined): string {
  if (!usage) {
    return "No Codex usage/rate-limit data found in local session logs yet.";
  }
  return [
    "Codex usage",
    `latest: ${usage.timestamp}`,
    usage.planType ? `plan: ${usage.planType}` : undefined,
    usage.primary,
    usage.secondary,
    usage.rateLimitReached ? `rate limit reached: ${usage.rateLimitReached}` : undefined,
    usage.lastTurn ? `last turn tokens: ${usage.lastTurn}` : undefined,
    usage.sessionTotal ? `session tokens: ${usage.sessionTotal}` : undefined,
    "source: latest local Codex token_count event"
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function formatSessionChoiceName(session: CodexSessionSummary): string {
  const label = `${compactDate(session.updatedAt)} | ${session.threadName} | ${session.id.slice(0, 8)}`.replace(
    /\s+/g,
    " "
  );
  return label.length <= 100 ? label : `${label.slice(0, 97).trimEnd()}...`;
}

async function findSessionFile(sessionId: string): Promise<string | undefined> {
  const roots = [join(homedir(), ".codex", "sessions"), join(homedir(), ".codex", "archived_sessions")];
  const matches: string[] = [];
  for (const root of roots) {
    matches.push(...(await findMatchingFiles(root, sessionId)));
  }
  const stats = await Promise.all(
    matches.map(async (path) => ({
      path,
      mtimeMs: (await stat(path)).mtimeMs
    }))
  );
  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return stats[0]?.path;
}

async function recentSessionFiles(limit: number): Promise<string[]> {
  const roots = [join(homedir(), ".codex", "sessions"), join(homedir(), ".codex", "archived_sessions")];
  const files: string[] = [];
  for (const root of roots) {
    files.push(...(await findJsonlFiles(root)));
  }
  const stats = await Promise.all(
    files.map(async (path) => ({
      path,
      mtimeMs: (await stat(path)).mtimeMs
    }))
  );
  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return stats.slice(0, limit).map((entry) => entry.path);
}

async function findMatchingFiles(root: string, sessionId: string): Promise<string[]> {
  const files = await findJsonlFiles(root);
  return files.filter((file) => file.includes(sessionId));
}

async function findJsonlFiles(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findJsonlFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push(path);
    }
  }
  return results;
}

function extractContentText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .flatMap((item) => {
      if (typeof item === "string") {
        return [item];
      }
      if (isObject(item) && typeof item.text === "string") {
        return [item.text];
      }
      return [];
    })
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function shouldSkipHistoryMessage(role: CodexHistoryMessage["role"], text: string): boolean {
  if (role !== "user") {
    return false;
  }
  const stripped = text.trimStart();
  return [
    "# AGENTS.md instructions",
    "<environment_context>",
    "<permissions instructions>",
    "<collaboration_mode>",
    "<skills_instructions>",
    "<plugins_instructions>",
    "<developer",
    "<system"
  ].some((prefix) => stripped.startsWith(prefix));
}

function cleanHistoryText(text: string): string {
  const marker = "## My request for Codex:";
  return text.includes(marker) ? text.split(marker, 2)[1].trim() : text.trim();
}

function readRole(value: unknown): CodexHistoryMessage["role"] | undefined {
  return value === "user" || value === "assistant" ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function formatRateLimit(name: string, data: Record<string, unknown> | undefined): string | undefined {
  if (!data) {
    return undefined;
  }
  const parts = [`${name}: ${data.used_percent ?? "?"}% used`];
  if (data.window_minutes) {
    parts.push(`${data.window_minutes}min window`);
  }
  if (data.resets_at) {
    parts.push(`resets ${formatUnixTime(data.resets_at)}`);
  }
  return parts.join(", ");
}

function formatTokenUsage(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) {
    return undefined;
  }
  return `${formatInt(data.total_tokens)} total (input ${formatInt(data.input_tokens)}, output ${formatInt(
    data.output_tokens
  )}, reasoning ${formatInt(data.reasoning_output_tokens)})`;
}

function formatUnixTime(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return String(value);
  }
  return new Date(seconds * 1000).toLocaleString();
}

function formatInt(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed).toLocaleString() : "?";
}

function compactDate(value: string): string {
  if (!value) {
    return "";
  }
  return value.replace("T", " ").replace(/\.\d+Z$/, "Z").slice(0, 16);
}

function truncateText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 16).trimEnd()}\n... truncated ...`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
