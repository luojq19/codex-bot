import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AppConfig } from "./config.js";
import { getConfigPath, saveConfig } from "./config.js";
import { CodexCli } from "./codexCli.js";
import { formatModels } from "./models.js";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function startChat(config: AppConfig): Promise<void> {
  const codex = new CodexCli(config);
  const status = await codex.status();

  if (!status.available) {
    console.error(status.message);
    console.error("Install Codex CLI with: npm i -g @openai/codex");
    process.exitCode = 1;
    return;
  }

  if (!status.loggedIn) {
    console.error(status.message);
    console.error("Run: pnpm dev auth login");
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input, output });
  const history: ChatMessage[] = [];

  console.log(`Codex chatbot ready. Model: ${config.model}`);
  console.log("Commands: /model <id>, /models, /auth, /clear, /help, /quit");

  while (true) {
    const line = (await rl.question("\nYou> ")).trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("/")) {
      const shouldContinue = await handleCommand(line, config, codex, history);
      if (!shouldContinue) {
        rl.close();
        return;
      }
      continue;
    }

    history.push({ role: "user", content: line });

    try {
      const response = await codex.complete(config.model, buildPrompt(history));
      history.push({ role: "assistant", content: response });
      console.log(`\nBot> ${response}`);
    } catch (error) {
      console.error(`\nCodex error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function handleCommand(
  line: string,
  config: AppConfig,
  codex: CodexCli,
  history: ChatMessage[]
): Promise<boolean> {
  const [command, ...args] = line.split(/\s+/);

  switch (command) {
    case "/model": {
      const model = args[0];
      if (!model) {
        console.log(`Current model: ${config.model}`);
        return true;
      }
      config.model = model;
      await saveConfig(config);
      console.log(`Model switched to ${config.model}`);
      return true;
    }
    case "/models":
      console.log(formatModels(config.model));
      console.log("You can also run /model <custom-model-id>.");
      return true;
    case "/auth": {
      const status = await codex.status();
      console.log(status.message);
      console.log(`Command: ${status.command}`);
      if (status.version) {
        console.log(`Version: ${status.version}`);
      }
      console.log(`Auth file path: ${status.authFilePath}`);
      return true;
    }
    case "/clear":
      history.length = 0;
      console.log("Conversation cleared.");
      return true;
    case "/help":
      console.log("Commands: /model <id>, /models, /auth, /clear, /help, /quit");
      console.log(`Config: ${getConfigPath()}`);
      return true;
    case "/quit":
    case "/exit":
      return false;
    default:
      console.log(`Unknown command: ${command}`);
      return true;
  }
}

function buildPrompt(history: ChatMessage[]): string {
  const transcript = history
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");

  return [
    "You are a concise, helpful chatbot.",
    "Answer the latest user message using the conversation history.",
    "Do not edit local files, run shell commands, or perform coding-agent actions.",
    "",
    "Conversation:",
    transcript,
    "",
    "Assistant:"
  ].join("\n");
}
