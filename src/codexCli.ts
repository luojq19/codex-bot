import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "./config.js";
import { runCommand, runInteractive } from "./process.js";

export type CodexStatus = {
  available: boolean;
  command: string;
  version?: string;
  loggedIn: boolean;
  loginStatus?: string;
  authFilePresent: boolean;
  authFilePath: string;
  message: string;
};

export class CodexCli {
  constructor(private readonly config: AppConfig) {}

  async status(): Promise<CodexStatus> {
    const versionResult = await runCommand(this.config.codexCommand, ["--version"]).catch((error: unknown) => {
      return {
        code: 127,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error)
      };
    });

    const authFilePath = join(homedir(), ".codex", "auth.json");
    const authFilePresent = await fileExists(authFilePath);
    const available = versionResult.code === 0;
    const loginResult = available
      ? await runCommand(this.config.codexCommand, ["login", "status"]).catch((error: unknown) => {
          return {
            code: 1,
            stdout: "",
            stderr: error instanceof Error ? error.message : String(error)
          };
        })
      : undefined;
    const loginStatus = loginResult ? cleanCodexOutput(loginResult.stdout || loginResult.stderr) : undefined;
    const loggedIn = loginResult?.code === 0;

    return {
      available,
      command: this.config.codexCommand,
      version: versionResult.stdout.trim() || undefined,
      loggedIn,
      loginStatus,
      authFilePresent,
      authFilePath,
      message: available
        ? loggedIn
          ? `Codex CLI is installed and authenticated${loginStatus ? `: ${loginStatus}` : "."}`
          : `Codex CLI is installed, but login is not ready${loginStatus ? `: ${loginStatus}` : ". Run auth login."}`
        : `Codex CLI command failed: ${versionResult.stderr.trim() || "command not found"}`
    };
  }

  async login(): Promise<void> {
    const code = await runInteractive(this.config.codexCommand, ["login"]);
    if (code !== 0) {
      throw new Error(`Codex login exited with code ${code ?? "unknown"}.`);
    }
  }

  async complete(model: string, prompt: string): Promise<string> {
    const outputDir = await mkdtemp(join(tmpdir(), "codex-bots-"));
    const outputPath = join(outputDir, "last-message.txt");
    const args = buildExecArgs(this.config, model);

    try {
      const result = await runCommand(this.config.codexCommand, [...args, "--output-last-message", outputPath, prompt]);

      if (result.code !== 0) {
        const stderr = cleanCodexOutput(result.stderr);
        throw new Error(stderr || `Codex exec exited with code ${result.code ?? "unknown"}.`);
      }

      const lastMessage = await readFile(outputPath, "utf8").catch(() => "");
      return cleanCodexOutput(lastMessage || result.stdout);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }
}

function buildExecArgs(config: AppConfig, model: string): string[] {
  const args = config.execArgsTemplate.map((arg) => arg.replaceAll("{model}", model));
  if (!config.webSearchEnabled || args.includes("--search")) {
    return args;
  }

  const execIndex = args.indexOf("exec");
  if (execIndex < 0) {
    return ["--search", ...args];
  }

  return [...args.slice(0, execIndex), "--search", ...args.slice(execIndex)];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function cleanCodexOutput(output: string): string {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("WARNING:"))
    .join("\n");
}
