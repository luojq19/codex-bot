#!/usr/bin/env node
import { getConfigPath, loadConfig, saveConfig } from "./config.js";
import { CodexCli } from "./codexCli.js";
import { startChat } from "./chatbot.js";
import { formatModels } from "./models.js";

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
  codex-bots models
  codex-bots config show
  codex-bots config set-model <model-id>
  codex-bots config set-codex-command <command>
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
