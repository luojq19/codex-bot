import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  Message,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction
} from "discord.js";
import { handleUserMessage, type ConversationMessage } from "../../assistant/router.js";
import type { AppConfig } from "../../config.js";
import {
  getCodexControlBinding,
  removeCodexControlBinding,
  saveCodexControlBinding
} from "../../codexControl/bindings.js";
import { isCodexControlAllowed, loadCodexControlConfig } from "../../codexControl/config.js";
import {
  cancelCodexControlRun,
  getCodexControlStatus,
  runCodexControlPrompt,
  type CodexControlRunResult
} from "../../codexControl/runner.js";
import {
  findCodexSession,
  formatCodexHistory,
  formatCodexSessions,
  formatCodexUsage,
  formatSessionChoiceName,
  listCodexSessions,
  loadLatestCodexUsage,
  readCodexHistory,
  type CodexSessionSummary
} from "../../codexControl/sessions.js";
import { getLatestReport, listReports } from "../../reports.js";
import { listSkills } from "../../skills.js";
import { runSkill } from "../../skillsRuntime.js";
import { formatRunList, formatTaskList } from "../../format.js";
import {
  appendLongTermMemory,
  formatMemorySearchResults,
  readDailyMemory,
  readLongTermMemory,
  searchMemory,
  summarizeDailyMemory
} from "../../memory/service.js";
import {
  getThreadBinding,
  removeThreadBinding,
  type ThreadBinding
} from "../../llm/threadStore.js";
import { formatSchedule } from "../../tasks/schedule.js";
import { createTask, getTask, listTasks, runTask } from "../../tasks/service.js";
import { buildCreateTaskInput } from "../../taskInputs.js";
import { addImageAttachmentOptions, downloadImageAttachments, downloadMessageImageAttachments } from "./attachments.js";
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
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
  });

  client.once(Events.ClientReady, () => {
    console.log(`Discord bot logged in as ${client.user?.tag ?? "unknown"}.`);
  });

  client.on("interactionCreate", (interaction) => {
    if (interaction.isAutocomplete()) {
      void handleAutocomplete(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      void handleSelectMenu(interaction, config);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    void handleInteraction(interaction, config);
  });

  client.on(Events.MessageCreate, (message) => {
    void handleMentionMessage(message, config);
  });

  await client.login(env.token);
  return client;
}

function buildCommands() {
  return [
    addImageAttachmentOptions(
      new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask the assistant a question")
        .addStringOption((option) =>
          option.setName("question").setDescription("Question to ask the assistant").setRequired(true)
        )
    ),
    new SlashCommandBuilder()
      .setName("reports")
      .setDescription("View generated workflow reports")
      .addSubcommand((subcommand) => subcommand.setName("latest").setDescription("Show the latest report"))
      .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List recent reports")),
    new SlashCommandBuilder()
      .setName("memory")
      .setDescription("Inspect and update assistant memory")
      .addSubcommand((subcommand) => subcommand.setName("show").setDescription("Show long-term memory"))
      .addSubcommand((subcommand) =>
        subcommand
          .setName("add")
          .setDescription("Add a long-term memory note")
          .addStringOption((option) => option.setName("text").setDescription("Memory text").setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("search")
          .setDescription("Search assistant memory")
          .addStringOption((option) => option.setName("query").setDescription("Search query").setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("daily")
          .setDescription("Show daily memory notes")
          .addStringOption((option) => option.setName("date").setDescription("YYYY-MM-DD, defaults to today"))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("summarize")
          .setDescription("Summarize daily notes")
          .addStringOption((option) => option.setName("date").setDescription("YYYY-MM-DD, defaults to today"))
      ),
    new SlashCommandBuilder()
      .setName("thread")
      .setDescription("Inspect or reset the persistent Codex thread for this chat")
      .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Show this chat's thread binding"))
      .addSubcommand((subcommand) => subcommand.setName("reset").setDescription("Start a fresh thread on the next ask")),
    new SlashCommandBuilder()
      .setName("codex")
      .setDescription("Control local Codex CLI sessions")
      .addSubcommand((subcommand) => subcommand.setName("sessions").setDescription("List recent Codex sessions"))
      .addSubcommand((subcommand) => subcommand.setName("pick").setDescription("Pick a Codex session from a menu"))
      .addSubcommand((subcommand) =>
        subcommand
          .setName("bind")
          .setDescription("Bind this chat to a Codex session")
          .addStringOption((option) =>
            option
              .setName("session")
              .setDescription("Codex session id")
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) => subcommand.setName("current").setDescription("Show the bound Codex session"))
      .addSubcommand((subcommand) => subcommand.setName("detach").setDescription("Remove the Codex session binding"))
      .addSubcommand((subcommand) =>
        addImageAttachmentOptions(
          subcommand
            .setName("ask")
            .setDescription("Send a prompt to the bound Codex session")
            .addStringOption((option) => option.setName("prompt").setDescription("Prompt for Codex").setRequired(true))
        )
      )
      .addSubcommand((subcommand) =>
        addImageAttachmentOptions(
          subcommand
            .setName("new")
            .setDescription("Start a new Codex session and bind it here")
            .addStringOption((option) => option.setName("prompt").setDescription("First prompt").setRequired(true))
        )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("history")
          .setDescription("Show recent messages from the bound Codex session")
          .addIntegerOption((option) =>
            option.setName("limit").setDescription("Messages to show, default 8").setMinValue(1).setMaxValue(20)
          )
      )
      .addSubcommand((subcommand) => subcommand.setName("usage").setDescription("Show latest Codex usage data"))
      .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Show active Codex run status"))
      .addSubcommand((subcommand) => subcommand.setName("cancel").setDescription("Cancel the active Codex run")),
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
  const focused = interaction.options.getFocused(true);

  if (interaction.commandName === "codex" && focused.name === "session") {
    const query = String(focused.value).toLowerCase();
    const sessions = await listCodexSessions(25);
    const choices = sessions
      .filter((session) => {
        const haystack = `${session.id} ${session.threadName} ${session.updatedAt}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 25)
      .map((session) => ({ name: formatSessionChoiceName(session), value: session.id }));
    await interaction.respond(choices);
    return;
  }

  if (
    (interaction.commandName !== "skill" && interaction.commandName !== "schedule") ||
    focused.name !== "skill"
  ) {
    await interaction.respond([]);
    return;
  }

  const query = String(focused.value).toLowerCase();
  const skills = await listSkills();
  const choices = skills
    .filter((skill) => skill.toLowerCase().includes(query))
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
    case "memory":
      await handleMemory(interaction, config);
      return;
    case "thread":
      await handleThread(interaction);
      return;
    case "codex":
      await handleCodex(interaction, config);
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
  const key = discordConversationKey(interaction);
  const history = conversationHistory.get(key) ?? [];

  await interaction.deferReply();
  let images;
  try {
    images = await downloadImageAttachments(interaction);
    const result = await handleUserMessage(config, {
      source: "discord",
      text: question,
      imagePaths: images.paths,
      history,
      conversationKey: key
    });
    conversationHistory.set(key, result.history.slice(-12));
    await replyInChunks(interaction, result.response);
  } catch (error) {
    await interaction.editReply(`Ask error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await images?.cleanup();
  }
}

async function handleMentionMessage(message: Message, config: AppConfig): Promise<void> {
  if (message.author.bot) {
    return;
  }

  const botUser = message.client.user;
  if (!botUser || !message.mentions.users.has(botUser.id)) {
    return;
  }
  if (!isSendableMessageChannel(message.channel)) {
    return;
  }

  const key = discordConversationKey({ channelId: message.channelId, user: { id: message.author.id } });
  const history = conversationHistory.get(key) ?? [];
  let images;
  let typingInterval: ReturnType<typeof setInterval> | undefined;

  try {
    images = await downloadMessageImageAttachments(message);
    const text = stripBotMention(message.content, botUser.id).trim() || defaultMentionPrompt(images.paths.length);
    if (!text) {
      await message.reply({
        content: "Mention me with a message or attach an image.",
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    await sendTyping(message.channel);
    typingInterval = setInterval(() => {
      void sendTyping(message.channel);
    }, 8_000);
    typingInterval.unref?.();

    const result = await handleUserMessage(config, {
      source: "discord",
      text,
      imagePaths: images.paths,
      history,
      conversationKey: key
    });
    conversationHistory.set(key, result.history.slice(-12));
    await replyToMessageInChunks(message, result.response);
  } catch (error) {
    await message
      .reply({
        content: `Ask error: ${error instanceof Error ? error.message : String(error)}`,
        allowedMentions: { repliedUser: false }
      })
      .catch(() => undefined);
  } finally {
    if (typingInterval) {
      clearInterval(typingInterval);
    }
    await images?.cleanup();
  }
}

async function handleThread(interaction: ChatInputCommandInteraction): Promise<void> {
  const key = discordConversationKey(interaction);
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  if (subcommand === "reset") {
    const removed = await removeThreadBinding(key);
    conversationHistory.delete(key);
    await interaction.editReply(removed ? `Thread reset: ${removed.threadId}` : "No thread binding found.");
    return;
  }

  const binding = await getThreadBinding(key);
  await interaction.editReply(binding ? formatThreadBinding(binding) : "No thread binding found yet.");
}

async function handleCodex(interaction: ChatInputCommandInteraction, config: AppConfig): Promise<void> {
  const access = checkCodexControlAccess(interaction, config);
  if (!access.allowed) {
    await interaction.reply({ content: access.reason, ephemeral: true });
    return;
  }

  const key = discordConversationKey(interaction);
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  try {
    switch (subcommand) {
      case "sessions": {
        const sessions = await listCodexSessions(10);
        await interaction.editReply(formatCodexSessions(sessions));
        return;
      }
      case "pick":
        await handleCodexPick(interaction);
        return;
      case "bind": {
        const requestedSession = interaction.options.getString("session", true).trim();
        const session = await findCodexSession(requestedSession);
        const sessionId = session?.id ?? requestedSession;
        await saveCodexControlBinding(key, sessionId);
        await interaction.editReply(formatCodexBoundSession(sessionId, session));
        return;
      }
      case "current": {
        const binding = await getCodexControlBinding(key);
        if (!binding) {
          await interaction.editReply("No Codex session is bound here. Use /codex pick or /codex bind.");
          return;
        }
        const session = await findCodexSession(binding.sessionId);
        await interaction.editReply(formatCodexBoundSession(binding.sessionId, session, binding.updatedAt));
        return;
      }
      case "detach": {
        const removed = await removeCodexControlBinding(key);
        await interaction.editReply(
          removed ? `Detached Codex session: ${removed.sessionId}` : "No Codex session binding found."
        );
        return;
      }
      case "ask": {
        const prompt = interaction.options.getString("prompt", true);
        const binding = await getRequiredCodexBinding(key);
        const images = await downloadImageAttachments(interaction);
        try {
          const result = await runCodexControlPrompt({
            appConfig: config,
            conversationKey: key,
            imagePaths: images.paths,
            prompt,
            sessionId: binding.sessionId
          });
          await replyInChunks(interaction, formatCodexRunResult(result), { ephemeral: true });
        } finally {
          await images.cleanup();
        }
        return;
      }
      case "new": {
        const prompt = interaction.options.getString("prompt", true);
        const images = await downloadImageAttachments(interaction);
        try {
          const result = await runCodexControlPrompt({
            appConfig: config,
            conversationKey: key,
            forceNew: true,
            imagePaths: images.paths,
            prompt
          });
          await replyInChunks(interaction, formatCodexRunResult(result), { ephemeral: true });
        } finally {
          await images.cleanup();
        }
        return;
      }
      case "history": {
        const binding = await getRequiredCodexBinding(key);
        const limit = interaction.options.getInteger("limit") ?? 8;
        await replyInChunks(interaction, formatCodexHistory(binding.sessionId, await readCodexHistory(binding.sessionId, limit)), {
          ephemeral: true
        });
        return;
      }
      case "usage":
        await interaction.editReply(formatCodexUsage(await loadLatestCodexUsage()));
        return;
      case "status":
        await interaction.editReply(getCodexControlStatus(key));
        return;
      case "cancel":
        await interaction.editReply(cancelCodexControlRun(key));
        return;
      default:
        await interaction.editReply("Unknown Codex command.");
    }
  } catch (error) {
    await interaction.editReply(`Codex control error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleCodexPick(interaction: ChatInputCommandInteraction): Promise<void> {
  const sessions = await listCodexSessions(25);
  if (sessions.length === 0) {
    await interaction.editReply("No Codex sessions found in ~/.codex/session_index.jsonl.");
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`codex-pick:${interaction.user.id}`)
    .setPlaceholder("Choose a Codex session")
    .addOptions(
      sessions.map((session) => ({
        label: formatSessionChoiceName(session),
        value: session.id,
        description: truncateDiscordOptionDescription(`${session.updatedAt} | ${session.id}`)
      }))
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  await interaction.editReply({
    content: "Pick the Codex session to bind to this Discord conversation.",
    components: [row]
  });
}

async function handleSelectMenu(interaction: StringSelectMenuInteraction, config: AppConfig): Promise<void> {
  if (!interaction.customId.startsWith("codex-pick:")) {
    return;
  }

  const ownerId = interaction.customId.slice("codex-pick:".length);
  if (ownerId !== interaction.user.id) {
    await interaction.reply({ content: "This picker belongs to another user.", ephemeral: true });
    return;
  }

  const access = checkCodexControlAccess(interaction, config);
  if (!access.allowed) {
    await interaction.reply({ content: access.reason, ephemeral: true });
    return;
  }

  const sessionId = interaction.values[0];
  const session = await findCodexSession(sessionId);
  await saveCodexControlBinding(discordConversationKey(interaction), session?.id ?? sessionId);
  await interaction.update({
    content: formatCodexBoundSession(session?.id ?? sessionId, session),
    components: []
  });
}

async function handleMemory(interaction: ChatInputCommandInteraction, config: AppConfig): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: subcommand === "add" });

  switch (subcommand) {
    case "show":
      await replyInChunks(interaction, await readLongTermMemory());
      return;
    case "add": {
      const text = interaction.options.getString("text", true);
      await appendLongTermMemory(text, {
        source: `discord:${interaction.channelId}:${interaction.user.id}`
      });
      await interaction.editReply("Memory added.");
      return;
    }
    case "search": {
      const query = interaction.options.getString("query", true);
      await replyInChunks(interaction, formatMemorySearchResults(await searchMemory(query)));
      return;
    }
    case "daily": {
      const date = interaction.options.getString("date") || undefined;
      await replyInChunks(interaction, await readDailyMemory(date));
      return;
    }
    case "summarize": {
      const date = interaction.options.getString("date") || undefined;
      await replyInChunks(interaction, await summarizeDailyMemory(config, { date }));
      return;
    }
    default:
      await interaction.editReply("Unknown memory command.");
  }
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

async function replyInChunks(
  interaction: ChatInputCommandInteraction,
  content: string,
  options: { ephemeral?: boolean } = {}
): Promise<void> {
  const chunks = chunkDiscordMessage(content);
  await interaction.editReply(chunks[0]);
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({ content: chunk, ephemeral: options.ephemeral });
  }
}

async function replyToMessageInChunks(message: Message, content: string): Promise<void> {
  if (!isSendableMessageChannel(message.channel)) {
    return;
  }

  const chunks = chunkDiscordMessage(content);
  await message.reply({ content: chunks[0], allowedMentions: { repliedUser: false } });
  for (const chunk of chunks.slice(1)) {
    await message.channel.send({ content: chunk, allowedMentions: { repliedUser: false } });
  }
}

async function sendTyping(channel: Message["channel"]): Promise<void> {
  if ("sendTyping" in channel && typeof channel.sendTyping === "function") {
    await channel.sendTyping().catch(() => undefined);
  }
}

type SendableMessageChannel = Message["channel"] & {
  send(options: { content: string; allowedMentions?: { repliedUser: boolean } }): Promise<unknown>;
};

function isSendableMessageChannel(channel: Message["channel"]): channel is SendableMessageChannel {
  return "send" in channel && typeof channel.send === "function";
}

function discordConversationKey(interaction: DiscordConversationInteraction): string {
  return `discord:${interaction.channelId}:${interaction.user.id}`;
}

type DiscordConversationInteraction = {
  channelId: string;
  user: { id: string };
};

type CodexControlAccess =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
    };

function checkCodexControlAccess(interaction: DiscordConversationInteraction, config: AppConfig): CodexControlAccess {
  try {
    const control = loadCodexControlConfig(config);
    return isCodexControlAllowed(control, {
      channelId: interaction.channelId,
      userId: interaction.user.id
    });
  } catch (error) {
    return {
      allowed: false,
      reason: `Codex control config error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function getRequiredCodexBinding(conversationKey: string) {
  const binding = await getCodexControlBinding(conversationKey);
  if (!binding) {
    throw new Error("No Codex session is bound here. Use /codex pick, /codex bind, or /codex new first.");
  }
  return binding;
}

function formatThreadBinding(binding: ThreadBinding): string {
  return [
    `Conversation: ${binding.conversationKey}`,
    `Thread: ${binding.threadId}`,
    `Model: ${binding.model}`,
    `Updated: ${binding.updatedAt}`
  ].join("\n");
}

function formatCodexBoundSession(
  sessionId: string,
  session?: CodexSessionSummary,
  bindingUpdatedAt?: string
): string {
  return [
    "Bound Codex session:",
    sessionId,
    session ? `Title: ${session.threadName}` : undefined,
    session?.updatedAt ? `Session updated: ${session.updatedAt}` : undefined,
    bindingUpdatedAt ? `Binding updated: ${bindingUpdatedAt}` : undefined,
    "",
    "Use /codex ask prompt:<text> to send a message to it."
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function formatCodexRunResult(result: CodexControlRunResult): string {
  const status = result.cancelled
    ? "Codex cancelled"
    : result.timedOut
      ? "Codex timed out"
      : result.exitCode
        ? `Codex finished with exit code ${result.exitCode}`
        : "Codex finished";
  return [
    `${status}:`,
    result.signal ? `Signal: ${result.signal}` : undefined,
    result.sessionId ? `Session: ${result.sessionId}` : undefined,
    result.resumed ? "Mode: resumed session" : "Mode: new session",
    "",
    result.output
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function truncateDiscordOptionDescription(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= 100 ? oneLine : `${oneLine.slice(0, 97).trimEnd()}...`;
}

function stripBotMention(content: string, botUserId: string): string {
  return content
    .replace(new RegExp(`<@!?${escapeRegExp(botUserId)}>`, "g"), "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function defaultMentionPrompt(imageCount: number): string {
  return imageCount ? "Please analyze the attached image(s)." : "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
