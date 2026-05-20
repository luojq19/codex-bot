import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AppConfig } from "./config.js";
import { getConfigPath, saveConfig } from "./config.js";
import { CodexCli } from "./codexCli.js";
import { formatRunList, formatTask, formatTaskList } from "./format.js";
import { formatModels } from "./models.js";
import { buildCreateTaskInput, defaultTimezone, type TaskDraft } from "./taskInputs.js";
import { createTask, getTask, listTasks, removeTask, runTask } from "./tasks/service.js";

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
  console.log("Commands: /model <id>, /models, /auth, /schedule, /clear, /help, /quit");

  while (true) {
    const line = (await rl.question("\nYou> ")).trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("/")) {
      try {
        const shouldContinue = await handleCommand(line, config, codex, history, rl);
        if (!shouldContinue) {
          rl.close();
          return;
        }
      } catch (error) {
        console.error(`Command error: ${error instanceof Error ? error.message : String(error)}`);
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
  history: ChatMessage[],
  rl: ReturnType<typeof createInterface>
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
    case "/schedule":
      await handleScheduleCommand(args, config, rl);
      return true;
    case "/help":
      console.log("Commands: /model <id>, /models, /auth, /clear, /schedule, /help, /quit");
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

async function handleScheduleCommand(
  args: string[],
  config: AppConfig,
  rl: ReturnType<typeof createInterface>
): Promise<void> {
  const [subcommand, id] = args;

  switch (subcommand) {
    case undefined:
      await runScheduleWizard(config, rl);
      return;
    case "list":
      console.log(formatTaskList(await listTasks()));
      return;
    case "remove": {
      if (!id) {
        console.log("Usage: /schedule remove <id>");
        return;
      }
      const task = await removeTask(id);
      console.log(`Removed task ${task.id}`);
      return;
    }
    case "run-now": {
      if (!id) {
        console.log("Usage: /schedule run-now <id>");
        return;
      }
      const task = await getTask(id);
      const record = await runTask(task, config, { trigger: "manual" });
      console.log(formatRunList([record]));
      return;
    }
    default:
      console.log("Usage: /schedule, /schedule list, /schedule remove <id>, /schedule run-now <id>");
  }
}

async function runScheduleWizard(config: AppConfig, rl: ReturnType<typeof createInterface>): Promise<void> {
  console.log("Schedule wizard started. Type /cancel at any prompt to stop.");

  const draft: TaskDraft = {
    name: await askRequired(rl, "Task name"),
    prompt: "",
    model: undefined
  };
  if (draft.name === "/cancel") {
    console.log("Schedule creation cancelled.");
    return;
  }

  const type = await askChoice(rl, "Trigger type (interval/cron)", ["interval", "cron"]);
  if (type === "/cancel") {
    console.log("Schedule creation cancelled.");
    return;
  }

  if (type === "interval") {
    const every = await askValid(rl, "Interval, e.g. 10m, 1h, 1d", (value) => {
      buildCreateTaskInput({ ...draft, prompt: "placeholder", every: value }, config);
    });
    if (every === "/cancel") {
      console.log("Schedule creation cancelled.");
      return;
    }
    draft.every = every;
  } else {
    const cron = await askValid(rl, "Cron expression, e.g. 0 9 * * *", (value) => {
      buildCreateTaskInput({ ...draft, prompt: "placeholder", cron: value, timezone: defaultTimezone() }, config);
    });
    if (cron === "/cancel") {
      console.log("Schedule creation cancelled.");
      return;
    }
    draft.cron = cron;

    const timezone = await askOptional(rl, `Timezone [${defaultTimezone()}]`);
    if (timezone === "/cancel") {
      console.log("Schedule creation cancelled.");
      return;
    }
    draft.timezone = timezone || defaultTimezone();
  }

  const model = await askOptional(rl, `Model [${config.model}]`);
  if (model === "/cancel") {
    console.log("Schedule creation cancelled.");
    return;
  }
  draft.model = model || config.model;

  const prompt = await askRequired(rl, "Prompt to run");
  if (prompt === "/cancel") {
    console.log("Schedule creation cancelled.");
    return;
  }
  draft.prompt = prompt;

  const input = buildCreateTaskInput(draft, config);
  console.log("\nTask preview:");
  console.log(`  name: ${input.name}`);
  console.log(`  model: ${input.model}`);
  console.log(`  prompt: ${input.prompt}`);
  console.log(
    input.schedule.type === "interval"
      ? `  schedule: every ${draft.every}`
      : `  schedule: cron ${input.schedule.expression} (${input.schedule.timezone})`
  );

  const confirmation = await askChoice(rl, "Save this task? (yes/no)", ["yes", "no"]);
  if (confirmation === "yes") {
    const task = await createTask(input);
    console.log(`Created task ${task.id}`);
    console.log(formatTask(task));
  } else {
    console.log("Schedule creation cancelled.");
  }
}

async function askRequired(rl: ReturnType<typeof createInterface>, label: string): Promise<string> {
  while (true) {
    const value = (await rl.question(`${label}> `)).trim();
    if (value === "/cancel") {
      return value;
    }
    if (value) {
      return value;
    }
    console.log("Value is required.");
  }
}

async function askOptional(rl: ReturnType<typeof createInterface>, label: string): Promise<string> {
  return (await rl.question(`${label}> `)).trim();
}

async function askChoice(
  rl: ReturnType<typeof createInterface>,
  label: string,
  choices: string[]
): Promise<string> {
  while (true) {
    const value = (await rl.question(`${label}> `)).trim().toLowerCase();
    if (value === "/cancel") {
      return value;
    }
    if (choices.includes(value)) {
      return value;
    }
    console.log(`Choose one of: ${choices.join(", ")}`);
  }
}

async function askValid(
  rl: ReturnType<typeof createInterface>,
  label: string,
  validate: (value: string) => void
): Promise<string> {
  while (true) {
    const value = (await rl.question(`${label}> `)).trim();
    if (value === "/cancel") {
      return value;
    }
    try {
      validate(value);
      return value;
    } catch (error) {
      console.log(error instanceof Error ? error.message : String(error));
    }
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
