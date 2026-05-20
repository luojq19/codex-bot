#!/usr/bin/env node
import { getConfigPath, loadConfig, saveConfig } from "./config.js";
import { CodexCli } from "./codexCli.js";
import { startChat } from "./chatbot.js";
import { formatRunList, formatTask, formatTaskList } from "./format.js";
import { formatModels } from "./models.js";
import { startServer } from "./server/httpServer.js";
import { buildCreateTaskInput, type TaskDraft } from "./taskInputs.js";
import {
  createTask,
  getTask,
  listRuns,
  listTasks,
  removeTask,
  runTask,
  setTaskEnabled
} from "./tasks/service.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const [command, subcommand, ...args] = process.argv.slice(2);

  switch (command ?? "chat") {
    case "auth":
      await handleAuth(subcommand, config);
      return;
    case "chat":
      await startChat(config);
      return;
    case "models":
      console.log(formatModels(config.model));
      return;
    case "server":
      await handleServer(subcommand, args, config);
      return;
    case "tasks":
      await handleTasks(subcommand, args, config);
      return;
    case "runs":
      await handleRuns(subcommand, args);
      return;
    case "config":
      await handleConfig(subcommand, args, config);
      return;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

async function handleServer(
  subcommand: string | undefined,
  args: string[],
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  switch (subcommand) {
    case "start": {
      const flags = parseFlags(args);
      const port = parsePort(flags.port ?? "37371");
      await startServer(config, { port });
      return;
    }
    default:
      throw new Error("Usage: server start [--port 37371]");
  }
}

async function handleTasks(
  subcommand: string | undefined,
  args: string[],
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  switch (subcommand) {
    case "add": {
      const flags = parseFlags(args);
      const input = buildCreateTaskInput(
        {
          name: requireFlag(flags, "name"),
          prompt: requireFlag(flags, "prompt"),
          model: flags.model,
          every: flags.every,
          cron: flags.cron,
          timezone: flags.timezone
        },
        config
      );
      const task = await createTask(input);
      console.log(`Created task ${task.id}`);
      console.log(formatTask(task));
      return;
    }
    case "list":
      console.log(formatTaskList(await listTasks()));
      return;
    case "remove": {
      const id = requireArg(args, "tasks remove <id>");
      const task = await removeTask(id);
      console.log(`Removed task ${task.id}`);
      return;
    }
    case "enable": {
      const id = requireArg(args, "tasks enable <id>");
      const task = await setTaskEnabled(id, true);
      console.log(`Enabled task ${task.id}`);
      return;
    }
    case "disable": {
      const id = requireArg(args, "tasks disable <id>");
      const task = await setTaskEnabled(id, false);
      console.log(`Disabled task ${task.id}`);
      return;
    }
    case "run-now": {
      const id = requireArg(args, "tasks run-now <id>");
      const task = await getTask(id);
      const record = await runTask(task, config, { trigger: "manual" });
      console.log(formatRunList([record]));
      return;
    }
    default:
      throw new Error(
        "Usage: tasks add|list|remove|enable|disable|run-now. Try: tasks add --name demo --every 1h --prompt \"...\""
      );
  }
}

async function handleRuns(subcommand: string | undefined, args: string[]): Promise<void> {
  switch (subcommand ?? "list") {
    case "list": {
      const flags = parseFlags(args);
      const limit = flags.limit ? parsePort(flags.limit) : 20;
      console.log(formatRunList(await listRuns({ taskId: flags.task, limit })));
      return;
    }
    default:
      throw new Error("Usage: runs list [--task <id>] [--limit 20]");
  }
}

async function handleAuth(subcommand: string | undefined, config: Awaited<ReturnType<typeof loadConfig>>): Promise<void> {
  const codex = new CodexCli(config);

  switch (subcommand ?? "status") {
    case "login":
      await codex.login();
      console.log("Codex login finished.");
      return;
    case "status": {
      const status = await codex.status();
      console.log(status.message);
      console.log(`Command: ${status.command}`);
      if (status.version) {
        console.log(`Version: ${status.version}`);
      }
      console.log(`Logged in: ${status.loggedIn ? "yes" : "no"}`);
      if (status.loginStatus) {
        console.log(`Login status: ${status.loginStatus}`);
      }
      console.log(`Auth file present: ${status.authFilePresent ? "yes" : "no"}`);
      console.log(`Auth file path: ${status.authFilePath}`);
      return;
    }
    default:
      console.error(`Unknown auth command: ${subcommand}`);
      process.exitCode = 1;
  }
}

async function handleConfig(
  subcommand: string | undefined,
  args: string[],
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  switch (subcommand ?? "show") {
    case "show":
      console.log(JSON.stringify(config, null, 2));
      console.log(`Path: ${getConfigPath()}`);
      return;
    case "set-model": {
      const model = args[0];
      if (!model) {
        throw new Error("Usage: config set-model <model-id>");
      }
      config.model = model;
      await saveConfig(config);
      console.log(`Model set to ${model}`);
      return;
    }
    case "set-codex-command": {
      const codexCommand = args[0];
      if (!codexCommand) {
        throw new Error("Usage: config set-codex-command <command>");
      }
      config.codexCommand = codexCommand;
      await saveConfig(config);
      console.log(`Codex command set to ${codexCommand}`);
      return;
    }
    case "set-web-search": {
      const value = args[0];
      if (value !== "on" && value !== "off") {
        throw new Error("Usage: config set-web-search on|off");
      }
      config.webSearchEnabled = value === "on";
      await saveConfig(config);
      console.log(`Web search ${config.webSearchEnabled ? "enabled" : "disabled"}`);
      return;
    }
    default:
      console.error(`Unknown config command: ${subcommand}`);
      process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`codex-bots

Usage:
  codex-bots auth login
  codex-bots auth status
  codex-bots chat
  codex-bots server start [--port 37371]
  codex-bots tasks add --name <name> --prompt <prompt> (--every <duration> | --cron <expr>) [--model <model>] [--timezone <tz>]
  codex-bots tasks list
  codex-bots tasks remove <id>
  codex-bots tasks enable <id>
  codex-bots tasks disable <id>
  codex-bots tasks run-now <id>
  codex-bots runs list [--task <id>] [--limit 20]
  codex-bots models
  codex-bots config show
  codex-bots config set-model <model-id>
  codex-bots config set-codex-command <command>
  codex-bots config set-web-search on|off
`);
}

function parseFlags(args: string[]): Record<string, string | undefined> {
  const flags: Record<string, string | undefined> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = "true";
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return flags;
}

function requireFlag(flags: Record<string, string | undefined>, name: keyof TaskDraft): string {
  const value = flags[name];
  if (!value || value === "true") {
    throw new Error(`Missing required flag --${name}.`);
  }
  return value;
}

function requireArg(args: string[], usage: string): string {
  const value = args[0];
  if (!value) {
    throw new Error(`Usage: ${usage}`);
  }
  return value;
}

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port or limit: ${value}`);
  }
  return parsed;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
