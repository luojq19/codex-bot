import {
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import { handleUserMessage, type ConversationMessage } from "../../assistant/router.js";
import type { AppConfig } from "../../config.js";
import { getLatestReport, listReports } from "../../reports.js";
import { formatRunList, formatTaskList } from "../../format.js";
import { getTask, listTasks, runTask } from "../../tasks/service.js";
import { chunkDiscordMessage } from "./delivery.js";
import { loadDiscordEnv } from "./config.js";

const conversationHistory = new Map<string, ConversationMessage[]>();

export async function registerDiscordCommands(): Promise<void> {
  const env = loadDiscordEnv();
  const rest = new REST({ version: "10" }).setToken(env.token);
  const commands = buildCommands().map((command) => command.toJSON());

  if (env.guildId) {
    await rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), { body: commands });
    console.log(`Registered Discord commands for guild ${env.guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(env.clientId), { body: commands });
  console.log("Registered global Discord commands.");
}

export async function startDiscordBot(config: AppConfig): Promise<void> {
  const env = loadDiscordEnv();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", () => {
    console.log(`Discord bot logged in as ${client.user?.tag ?? "unknown"}.`);
  });

  client.on("interactionCreate", (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    void handleInteraction(interaction, config);
  });

  await client.login(env.token);
}

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName("ask")
      .setDescription("Ask the assistant a question")
      .addStringOption((option) =>
        option.setName("question").setDescription("Question to ask the assistant").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("reports")
      .setDescription("View generated workflow reports")
      .addSubcommand((subcommand) => subcommand.setName("latest").setDescription("Show the latest report"))
      .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List recent reports")),
    new SlashCommandBuilder()
      .setName("tasks")
      .setDescription("Inspect or run scheduled tasks")
      .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List scheduled tasks"))
      .addSubcommand((subcommand) =>
        subcommand
          .setName("run-now")
          .setDescription("Run a task immediately")
          .addStringOption((option) => option.setName("id").setDescription("Task id").setRequired(true))
      )
  ];
}

async function handleInteraction(interaction: ChatInputCommandInteraction, config: AppConfig): Promise<void> {
  switch (interaction.commandName) {
    case "ask":
      await handleAsk(interaction, config);
      return;
    case "reports":
      await handleReports(interaction);
      return;
    case "tasks":
      await handleTasks(interaction, config);
      return;
    default:
      await interaction.reply({ content: "Unknown command.", ephemeral: true });
  }
}

async function handleAsk(interaction: ChatInputCommandInteraction, config: AppConfig): Promise<void> {
  const question = interaction.options.getString("question", true);
  const key = `${interaction.channelId}:${interaction.user.id}`;
  const history = conversationHistory.get(key) ?? [];

  await interaction.deferReply();
  const result = await handleUserMessage(config, {
    source: "discord",
    text: question,
    history
  });
  conversationHistory.set(key, result.history.slice(-12));
  await replyInChunks(interaction, result.response);
}

async function handleReports(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply();

  if (subcommand === "latest") {
    const report = await getLatestReport();
    if (!report) {
      await interaction.editReply("No reports found yet.");
      return;
    }
    await replyInChunks(interaction, `# ${report.summary.title}\n${report.content}`);
    return;
  }

  const reports = await listReports(10);
  if (reports.length === 0) {
    await interaction.editReply("No reports found yet.");
    return;
  }
  await interaction.editReply(
    reports.map((report) => `- ${report.title}\n  ${report.id}\n  ${report.mtime}`).join("\n")
  );
}

async function handleTasks(interaction: ChatInputCommandInteraction, config: AppConfig): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply();

  if (subcommand === "list") {
    await replyInChunks(interaction, formatTaskList(await listTasks()));
    return;
  }

  const id = interaction.options.getString("id", true);
  const task = await getTask(id);
  const record = await runTask(task, config, { trigger: "manual" });
  await replyInChunks(interaction, formatRunList([record]));
}

async function replyInChunks(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  const chunks = chunkDiscordMessage(content);
  await interaction.editReply(chunks[0]);
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp(chunk);
  }
}
