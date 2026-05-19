import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_MODEL } from "./models.js";

export type AppConfig = {
  codexCommand: string;
  model: string;
  execArgsTemplate: string[];
};

const CONFIG_PATH = join(homedir(), ".codex-bots", "config.json");

const DEFAULT_EXEC_ARGS_TEMPLATE = [
  "--ask-for-approval",
  "never",
  "exec",
  "--sandbox",
  "read-only",
  "--skip-git-repo-check",
  "--color",
  "never",
  "-m",
  "{model}"
];

const DEFAULT_CONFIG: AppConfig = {
  codexCommand: "codex",
  model: DEFAULT_MODEL,
  execArgsTemplate: DEFAULT_EXEC_ARGS_TEMPLATE
};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return normalizeConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function normalizeConfig(config: AppConfig): AppConfig {
  if (!Array.isArray(config.execArgsTemplate) || hasLegacyExecArgs(config.execArgsTemplate)) {
    return { ...config, execArgsTemplate: DEFAULT_EXEC_ARGS_TEMPLATE };
  }

  return config;
}

function hasLegacyExecArgs(args: string[]): boolean {
  const execIndex = args.indexOf("exec");
  const approvalIndex = args.indexOf("--ask-for-approval");
  return args.includes("-a") || (approvalIndex > execIndex && execIndex >= 0);
}
