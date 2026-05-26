import { spawn, type ChildProcessByStdio } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { Readable } from "node:stream";
import type { AppConfig } from "../config.js";
import { saveCodexControlBinding } from "./bindings.js";
import { loadCodexControlConfig, type CodexControlConfig } from "./config.js";

export type CodexControlRunInput = {
  appConfig: AppConfig;
  conversationKey: string;
  prompt: string;
  imagePaths?: string[];
  sessionId?: string;
  forceNew?: boolean;
};

export type CodexControlRunResult = {
  output: string;
  sessionId?: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  resumed: boolean;
  timedOut: boolean;
  cancelled: boolean;
};

type ActiveRun = {
  proc: CodexControlProcess;
  startedAt: number;
  prompt: string;
  sessionId?: string;
  cancelled: boolean;
};

type ProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

type CodexControlProcess = ChildProcessByStdio<null, Readable, Readable>;

const activeRuns = new Map<string, ActiveRun>();

export function getCodexControlStatus(conversationKey: string): string {
  const active = activeRuns.get(conversationKey);
  if (!active) {
    return "Codex control is idle for this Discord conversation.";
  }

  const elapsed = Math.floor((Date.now() - active.startedAt) / 1000);
  return [
    `Codex is running for ${elapsed}s.`,
    active.sessionId ? `Session: ${active.sessionId}` : "Session: new",
    `Prompt: ${truncateSingleLine(active.prompt, 240)}`,
    "Use /codex cancel to terminate it."
  ].join("\n");
}

export function cancelCodexControlRun(conversationKey: string): string {
  const active = activeRuns.get(conversationKey);
  if (!active) {
    return "Codex control is idle for this Discord conversation.";
  }

  active.cancelled = true;
  active.proc.kill("SIGTERM");
  return "Sent terminate signal to the current Codex subprocess.";
}

export async function runCodexControlPrompt(input: CodexControlRunInput): Promise<CodexControlRunResult> {
  if (activeRuns.has(input.conversationKey)) {
    throw new Error("Codex is already running for this Discord conversation. Use /codex status or /codex cancel.");
  }

  const control = loadCodexControlConfig(input.appConfig);
  const outputDir = await mkdtemp(join(tmpdir(), "codex-control-"));
  const outputPath = join(outputDir, "last-message.txt");
  const args = buildCodexArgs(control, {
    forceNew: input.forceNew,
    imagePaths: input.imagePaths,
    outputPath,
    prompt: input.prompt,
    sessionId: input.sessionId
  });

  const proc = spawn(control.codexCommand, args, {
    cwd: control.workdir,
    env: buildEnv(control),
    stdio: ["ignore", "pipe", "pipe"]
  });

  const active: ActiveRun = {
    proc,
    startedAt: Date.now(),
    prompt: input.prompt,
    sessionId: input.sessionId,
    cancelled: false
  };
  activeRuns.set(input.conversationKey, active);

  try {
    const result = await collectProcess(proc, control.timeoutMs, active);
    const lastMessage = await readFile(outputPath, "utf8").catch(() => "");
    const output = cleanCodexOutput(lastMessage || tailText(`${result.stdout}\n${result.stderr}`, 12000));
    const newSessionId = extractThreadId(result.stdout);
    const effectiveSessionId = newSessionId || input.sessionId;

    if (effectiveSessionId) {
      await saveCodexControlBinding(input.conversationKey, effectiveSessionId);
    }

    return {
      output: output || "(no output)",
      sessionId: effectiveSessionId,
      exitCode: result.code,
      signal: result.signal,
      resumed: Boolean(input.sessionId && !input.forceNew),
      timedOut: result.timedOut,
      cancelled: active.cancelled
    };
  } finally {
    if (activeRuns.get(input.conversationKey) === active) {
      activeRuns.delete(input.conversationKey);
    }
    await rm(outputDir, { recursive: true, force: true });
  }
}

function buildCodexArgs(
  control: CodexControlConfig,
  input: {
    forceNew?: boolean;
    imagePaths?: string[];
    outputPath: string;
    prompt: string;
    sessionId?: string;
  }
): string[] {
  const args = [
    ...(control.webSearchEnabled ? ["--search"] : []),
    "--ask-for-approval",
    "never",
    "exec"
  ];

  if (input.sessionId && !input.forceNew) {
    return [
      ...args,
      "resume",
      "--skip-git-repo-check",
      "--json",
      ...(input.imagePaths ?? []).flatMap((path) => ["--image", path]),
      "--output-last-message",
      input.outputPath,
      input.sessionId,
      input.prompt
    ];
  }

  return [
    ...args,
    "--cd",
    control.workdir,
    "--sandbox",
    control.sandbox,
    "--skip-git-repo-check",
    "--color",
    "never",
    "--json",
    ...(input.imagePaths ?? []).flatMap((path) => ["--image", path]),
    "--output-last-message",
    input.outputPath,
    input.prompt
  ];
}

function buildEnv(control: CodexControlConfig): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (control.extraPath) {
    env.PATH = `${control.extraPath}${delimiter}${env.PATH ?? ""}`;
  }
  env.CODEX_HOME ??= join(homedir(), ".codex");
  return env;
}

async function collectProcess(
  proc: CodexControlProcess,
  timeoutMs: number,
  active: ActiveRun
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        proc.kill("SIGKILL");
      }, 20_000);
    }, timeoutMs);

    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");

    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    proc.on("error", (error) => {
      clearTimeout(timeout);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      reject(error);
    });
    proc.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      resolve({
        code,
        signal,
        stdout,
        stderr,
        timedOut: timedOut && !active.cancelled
      });
    });
  });
}

function extractThreadId(stdout: string): string | undefined {
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("{")) {
      continue;
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.type === "thread.started" && typeof event.thread_id === "string") {
      return event.thread_id;
    }
  }
  return undefined;
}

function cleanCodexOutput(output: string): string {
  return output
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("WARNING:"))
    .join("\n")
    .trim();
}

function tailText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `... truncated ...\n${text.slice(-maxChars)}`;
}

function truncateSingleLine(text: string, maxChars: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length <= maxChars ? singleLine : `${singleLine.slice(0, maxChars - 3)}...`;
}
