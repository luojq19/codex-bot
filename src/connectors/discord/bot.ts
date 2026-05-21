import {
  AutocompleteInteraction,
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
import { listSkills } from "../../skills.js";
import { runSkill } from "../../skillsRuntime.js";
import { formatRunList, formatTaskList } from "../../format.js";
import { formatSchedule } from "../../tasks/schedule.js";
import { createTask, getTask, listTasks, runTask } from "../../tasks/service.js";
import { buildCreateTaskInput } from "../../taskInputs.js";
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

export async function startDiscordBot(config: AppConfig): Promise<Client> {
  const env = loadDiscordEnv();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", () => {
    console.log(`Discord bot logged in as ${client.user?.tag ?? "unknown"}.`);
  });

  client.on("interactionCreate", (interaction) => {
    if (interaction.isAutocomplete()) {
      void handleAutocomplete(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    void handleInteraction(interaction, config);
  });

  await client.login(env.token);
  return client;
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
      ),
    new SlashCommandBuilder()
      .setName("skill")
      .setDescription("Run reusable assistant skills")
      .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List available skills"))
      .addSubcommand((subcommand) =>
        subcommand
          .setName("run")
          .setDescription("Run a skill immediately")
          .addStringOption((option) =>
            option.setName("skill").setDescription("Skill name").setRequired(true).setAutocomplete(true)
          )
          .addStringOption((option) => option.setName("input").setDescription("Skill input").setRequired(true))
      ),
    new SlashCommandBuilder()
      .setName("research")
      .setDescription("Run the literature briefing skill immediately")
      .addStringOption((option) => option.setName("topic").setDescription("Research topic").setRequired(true)),
    new SlashCommandBuilder()
      .setName("schedule")
      .setDescription("Schedule an assistant action")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("ask")
          .setDescription("Schedule an assistant question")
          .addStringOption((option) =>
            option.setName("question").setDescription("Question to ask the assistant").setRequired(true)
          )
          .addStringOption((option) => option.setName("once").setDescription("Run once after a delay, e.g. 1m"))
          .addStringOption((option) =>
            option.setName("every").setDescription("Repeat at an interval, e.g. 1m, 1h, 1d")
          )
          .addStringOption((option) => option.setName("daily").setDescription("Repeat every day at HH:mm, e.g. 08:00"))
          .addStringOption((option) => option.setName("name").setDescription("Task name"))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("skill")
          .setDescription("Schedule a skill run")
          .addStringOption((option) =>
            option.setName("skill").setDescription("Skill name").setRequired(true).setAutocomplete(true)
          )
          .addStringOption((option) => option.setName("input").setDescription("Skill input").setRequired(true))
          .addStringOption((option) => option.setName("once").setDescription("Run once after a delay, e.g. 1m"))
          .addStringOption((option) =>
            option.setName("every").setDescription("Repeat at an interval, e.g. 1m, 1h, 1d")
          )
          .addStringOption((option) => option.setName("daily").setDescription("Repeat every day at HH:mm, e.g. 08:00"))
          .addStringOption((option) => option.setName("name").setDescription("Task name"))
      )
  ];
}

async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (interaction.commandName !== "skill" && interaction.commandName !== "schedule") {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const skills = await listSkills();
  const choices = skills
    .filter((skill) => skill.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((skill) => ({ name: skill, value: skill }));

  await interaction.respond(choices);
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
    case "skill":
      await handleSkill(interaction, config);
      return;
    case "research":
      await handleResearch(interaction, config);
      return;
    case "schedule":
      await handleSchedule(interaction, config);
      return;
    default:
      await interaction.reply({ content: "Unknown command.", ephemeral: true });
  }
}

async function handleSchedule(interaction: ChatInputCommandInteraction, config: AppConfig): Promise<void> {
  await interaction.deferReply();
  const action = interaction.options.getSubcommand();
  const once = interaction.options.getString("once") || undefined;
  const every = interaction.options.getString("every") || undefined;
  const daily = interaction.options.getString("daily") || undefined;
  const name = interaction.options.getString("name") || `${action}-scheduled`;

  try {
    const taskInput =
      action === "skill"
        ? buildScheduleSkillInput(interaction, config, { name, once, every, daily })
        : buildScheduleAskInput(interaction, config, { name, once, every, daily });
    const task = await createTask(taskInput);
    await interaction.editReply(
      [
        `Scheduled task created: ${task.id}`,
        `Action: ${action}`,
        `Schedule: ${formatSchedule(task.schedule)}`,
        `Next run: ${task.nextRunAt}`
      ].join("\n")
    );
  } catch (error) {
    await interaction.editReply(`Schedule error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildScheduleAskInput(
  interaction: ChatInputCommandInteraction,
  config: AppConfig,
  schedule: { name: string; once?: string; every?: string; daily?: string }
) {
  const question = interaction.options.getString("question", true);
  return buildCreateTaskInput(
    {
      kind: "prompt",
      name: schedule.name,
      prompt: question,
      once: schedule.once,
      every: schedule.every,
      daily: schedule.daily,
      discordChannelId: interaction.channelId
    },
    config
  );
}

function buildScheduleSkillInput(
  interaction: ChatInputCommandInteraction,
  config: AppConfig,
  schedule: { name: string; once?: string; every?: string; daily?: string }
) {
  const skill = interaction.options.getString("skill", true);
  const input = interaction.options.getString("input", true);
  return buildCreateTaskInput(
    {
      kind: "workflow",
      name: schedule.name,
      prompt: input,
      skill,
      workflowInput: input,
      once: schedule.once,
      every: schedule.every,
      daily: schedule.daily,
      discordChannelId: interaction.channelId
    },
    config
  );
}

async function handleSkill(interaction: ChatInputCommandInteraction, config: AppConfig): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply();

  if (subcommand === "list") {
    const skills = await listSkills();
    await interaction.editReply(skills.length ? skills.join("\n") : "No skills found.");
    return;
  }

  const skill = interaction.options.getString("skill", true);
  const input = interaction.options.getString("input", true);
  const result = await runSkill(config, {
    skill,
    input,
    name: skill
  });
  await replyInChunks(interaction, formatSkillResultMessage(result));
}

async function handleResearch(interaction: ChatInputCommandInteraction, config: AppConfig): Promise<void> {
  const topic = interaction.options.getString("topic", true);
  await interaction.deferReply();
  const result = await runSkill(config, {
    skill: "literature-briefing",
    input: topic,
    name: "literature-briefing"
  });
  await replyInChunks(interaction, formatSkillResultMessage(result));
}

function formatSkillResultMessage(result: Awaited<ReturnType<typeof runSkill>>): string {
  return [
    `# Skill: ${result.skill}`,
    result.output,
    `Workspace: ${result.workspaceDir}`
  ].join("\n");
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
