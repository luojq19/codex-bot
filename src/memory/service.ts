import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AppConfig } from "../config.js";
import { CodexCli } from "../codexCli.js";
import { chunkMarkdown, rankMemoryChunks, type MemoryChunk, type MemorySearchResult } from "./search.js";

export const MEMORY_DIR = join(homedir(), ".codex-bots", "memory");
export const LONG_TERM_MEMORY_PATH = join(MEMORY_DIR, "MEMORY.md");
export const DAILY_MEMORY_DIR = join(MEMORY_DIR, "daily");

const DEFAULT_MEMORY = `# Memory

## User Profile

- Add stable user facts here.

## Preferences

- Add durable working preferences here.

## Projects

- Add long-running project notes here.

## Manual Notes

`;

export type AppendMemoryOptions = {
  source?: string;
};

export type AppendDailyTurnInput = {
  source: string;
  conversationKey?: string;
  userText: string;
  assistantText: string;
};

export async function ensureMemoryStore(): Promise<void> {
  await mkdir(DAILY_MEMORY_DIR, { recursive: true, mode: 0o700 });
  try {
    await readFile(LONG_TERM_MEMORY_PATH, "utf8");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
    await mkdir(dirname(LONG_TERM_MEMORY_PATH), { recursive: true, mode: 0o700 });
    await writeFile(LONG_TERM_MEMORY_PATH, DEFAULT_MEMORY, {
      encoding: "utf8",
      mode: 0o600
    });
  }
}

export async function readLongTermMemory(): Promise<string> {
  await ensureMemoryStore();
  return readFile(LONG_TERM_MEMORY_PATH, "utf8");
}

export async function appendLongTermMemory(text: string, options: AppendMemoryOptions = {}): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Memory text is required.");
  }

  await ensureMemoryStore();
  const source = options.source ? ` (${options.source})` : "";
  const entry = [`### ${new Date().toISOString()}${source}`, "", trimmed, ""].join("\n");
  await appendFile(LONG_TERM_MEMORY_PATH, `${entry}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

export async function appendDailyTurn(input: AppendDailyTurnInput): Promise<void> {
  await ensureMemoryStore();
  const date = localDate();
  const path = dailyMemoryPath(date);
  await ensureDailyFile(path, date);

  const heading = `## ${localTime()} ${input.source}${input.conversationKey ? ` ${input.conversationKey}` : ""}`;
  const entry = [
    heading,
    "",
    "User:",
    truncateForDaily(input.userText),
    "",
    "Assistant:",
    truncateForDaily(input.assistantText),
    ""
  ].join("\n");

  await appendFile(path, `${entry}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

export async function readDailyMemory(date = localDate()): Promise<string> {
  await ensureMemoryStore();
  const path = dailyMemoryPath(date);
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return `# ${date}\n\nNo daily memory notes found.`;
    }
    throw error;
  }
}

export async function searchMemory(
  query: string,
  options: { limit?: number; dailyLimit?: number } = {}
): Promise<MemorySearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Memory search query is required.");
  }

  await ensureMemoryStore();
  const chunks: MemoryChunk[] = [];
  const longTerm = await readFile(LONG_TERM_MEMORY_PATH, "utf8");
  chunks.push(...chunkMarkdown("MEMORY.md", longTerm));

  for (const file of await listDailyMemoryFiles(options.dailyLimit ?? 90)) {
    const content = await readFile(join(DAILY_MEMORY_DIR, file), "utf8");
    chunks.push(...chunkMarkdown(`daily/${file}`, content));
  }

  return rankMemoryChunks(trimmed, chunks, {
    limit: options.limit ?? 5
  });
}

export async function buildMemoryRecallContext(query: string, options: { limit?: number } = {}): Promise<string> {
  const results = await searchMemory(query, { limit: options.limit ?? 5 });
  if (results.length === 0) {
    return "";
  }

  return [
    "Relevant memory (may be incomplete or stale):",
    ...results.map((result) => `- ${result.source}#L${result.line} (${result.title}): ${result.snippet}`)
  ].join("\n");
}

export async function summarizeDailyMemory(
  config: AppConfig,
  options: { date?: string; write?: boolean } = {}
): Promise<string> {
  const date = options.date ?? localDate();
  const daily = await readDailyMemory(date);
  if (daily.includes("No daily memory notes found.")) {
    return daily;
  }

  const codex = new CodexCli(config);
  const summary = await codex.complete(
    config.model,
    [
      "Summarize these assistant memory notes into concise durable project/user memory.",
      "Keep stable facts, decisions, preferences, and open questions. Omit trivial chatter.",
      "Return Markdown bullets only.",
      "",
      daily
    ].join("\n"),
    { webSearchEnabled: false }
  );

  if (options.write) {
    await appendLongTermMemory(`Daily memory summary for ${date}:\n\n${summary}`, {
      source: "daily-summary"
    });
  }

  return summary;
}

export function formatMemorySearchResults(results: MemorySearchResult[]): string {
  if (results.length === 0) {
    return "No memory matches found.";
  }

  return results
    .map(
      (result, index) =>
        `${index + 1}. ${result.source}:${result.line} ${result.title}\nScore: ${result.score}\n${result.snippet}`
    )
    .join("\n\n");
}

function dailyMemoryPath(date: string): string {
  validateDate(date);
  return join(DAILY_MEMORY_DIR, `${date}.md`);
}

async function ensureDailyFile(path: string, date: string): Promise<void> {
  try {
    await readFile(path, "utf8");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
    await writeFile(path, `# ${date}\n\n`, {
      encoding: "utf8",
      mode: 0o600
    });
  }
}

async function listDailyMemoryFiles(limit: number): Promise<string[]> {
  try {
    const files = await readdir(DAILY_MEMORY_DIR);
    return files
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date: ${date}. Use YYYY-MM-DD.`);
  }
}

function localDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localTime(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function truncateForDaily(value: string): string {
  const normalized = value.trim();
  const limit = 3000;
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trim()}\n...[truncated]`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
