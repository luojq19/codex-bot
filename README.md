# Codex Bots

A small TypeScript prototype for a local chatbot that reuses the user's Codex CLI / ChatGPT subscription sign-in.

## What This Implements

- Authentication bridge through the official Codex CLI login flow.
- Model switching inside a simple terminal chatbot.
- Local config for selected model and Codex command.
- No copied OAuth refresh tokens and no local credential parsing.

This intentionally does not reimplement OpenAI's private OAuth client flow. The stable integration point here is the user's installed Codex CLI, which supports `codex login` with ChatGPT sign-in.

Sources:

- Codex CLI sign-in: https://help.openai.com/en/articles/11381614-codex-cli-and-sign-in-withgpt
- Codex with ChatGPT plan: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan

## Prerequisites

- Node.js 22+
- pnpm
- OpenAI Codex CLI installed and available as `codex`

Install Codex CLI separately:

```bash
npm i -g @openai/codex
```

## Development

```bash
pnpm install
pnpm dev auth login
pnpm dev chat
```

Inside chat:

```text
/model gpt-5.5
/models
/search status
/search off
/search on
/auth
/memory show
/memory add <text>
/memory search <query>
/thread status
/thread reset
/schedule
/schedule list
/schedule remove <id>
/schedule run-now <id>
/clear
/quit
```

## Scheduled Tasks

Start the local scheduler server:

```bash
pnpm dev start
```

This starts the local HTTP API server, scheduler, and Discord bot in one process. For module-level debugging, you can still run `pnpm dev server start` or `pnpm dev discord start`.

Create and manage tasks from the CLI:

```bash
pnpm dev tasks add --name digest --every 1h --prompt "Summarize what I should focus on next."
pnpm dev tasks add --name morning --cron "0 9 * * *" --timezone America/New_York --prompt "Prepare a morning briefing."
pnpm dev tasks list
pnpm dev tasks run-now <id>
pnpm dev runs list --limit 20
```

Run a skill directly without creating a scheduled task:

```bash
pnpm dev skills list
pnpm dev skills run paper-discovery --input "Find recent papers on AI research agents."
pnpm dev skills run literature-briefing --input "Track new AI agent papers from the last week."
pnpm dev skills run deep-research --input "Survey recent AI research agent papers."
```

Create a skill-based workflow task that writes a report into `workspace/` and posts the report to your default Discord channel:

```bash
pnpm dev tasks add \
  --kind workflow \
  --name daily-ai-literature \
  --cron "0 8 * * *" \
  --timezone America/New_York \
  --skill literature-briefing \
  --input "Prepare a daily briefing on frontier AI agents, reasoning models, and tool-use research."
```

Create tasks from chat:

```bash
pnpm dev chat
```

Then enter:

```text
/schedule
```

The chatbot will ask for the task name, trigger type, schedule, model, prompt, and final confirmation.

Workflow runs create isolated directories under:

```text
workspace/<task-name>/<run-id>/
```

Each workflow workspace includes `skill.md`, `input.md`, `prompt.md`, and `report.md`.
Composed research skills may also include upstream artifacts such as `paper_discovery.md`.

## Memory

The assistant keeps a simple file-first memory store under:

```text
~/.codex-bots/memory/
```

The long-term editable memory lives at:

```text
~/.codex-bots/memory/MEMORY.md
```

Daily chat notes are appended under:

```text
~/.codex-bots/memory/daily/YYYY-MM-DD.md
```

Before normal `/ask` or terminal chat responses, the assistant searches memory for relevant snippets and injects a compact recall section into the prompt. Skills and scheduled workflows remain separate from interactive chat memory.

Interactive chat uses a Codex app-server thread runtime by default. Thread state gives the current Discord or terminal conversation short-term continuity, while this memory layer remains the durable cross-session source of truth.

Manage memory from the CLI:

```bash
pnpm dev memory show
pnpm dev memory add "User prefers concise Chinese replies."
pnpm dev memory search "literature briefing"
pnpm dev memory daily
pnpm dev memory summarize --write
```

## Chat Threads

Interactive `/ask` conversations use Codex's experimental `app-server` thread APIs when available. The app persists conversation bindings in:

```text
~/.codex-bots/threads.json
```

The thread runtime is only used for normal chat. Skills and scheduled workflow runs still use isolated one-shot Codex execution so they do not pollute an interactive conversation thread.

Manage thread bindings:

```bash
pnpm dev threads list
pnpm dev threads status cli
pnpm dev threads reset cli
pnpm dev config set-chat-runtime thread
pnpm dev config set-chat-runtime exec
```

If the thread runtime fails, chat falls back to the existing `codex exec` path for that turn.

## Discord

Create a Discord application and bot, then put the credentials in `default.env` at the repo root:

```text
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...              # recommended for fast slash-command registration
DISCORD_DEFAULT_CHANNEL_ID=...    # optional default delivery target
DISCORD_CODEX_CONTROL_USER_IDS=...       # Discord user ids allowed to control Codex sessions
DISCORD_CODEX_CONTROL_CHANNEL_IDS=...    # optional channel ids allowed to use /codex
CODEX_CONTROL_WORKDIR=/work/jiaqi/codex_bots
CODEX_CONTROL_SANDBOX=workspace-write
CODEX_CONTROL_EXTRA_PATH=/nethome/jluo380/.nvm/versions/node/v24.15.0/bin
```

`default.env` is loaded automatically by the CLI and is ignored by git.
Codex session control stays disabled until `DISCORD_CODEX_CONTROL_USER_IDS` or
`DISCORD_CODEX_CONTROL_CHANNEL_IDS` is set.

Register slash commands:

```bash
pnpm dev discord register-commands
```

Start the Discord bot:

```bash
pnpm dev discord start
```

Normal assistant chat can use a mention in any channel where the bot can read and send messages:

```text
@J.A.R.V.I.S. 你是谁？
@J.A.R.V.I.S. 帮我看这张图
```

Mention chat requires the Discord Developer Portal `Message Content Intent`. Mention chat and `/ask`
share the same per-channel, per-user conversation thread and memory path.

Supported Discord commands:

```text
/ask question:<text> image1:<file> ... image20:<file>
/skill list
/skill run skill:<skill-name> input:<input>
/research topic:<topic>
/schedule ask question:<text> once:1m
/schedule skill skill:<skill-name> input:<input> every:1h
/schedule skill skill:<skill-name> input:<input> daily:08:00
/memory show
/memory add text:<text>
/memory search query:<query>
/memory daily date:<YYYY-MM-DD>
/memory summarize date:<YYYY-MM-DD>
/thread status
/thread reset
/codex sessions
/codex pick
/codex bind session:<session-id>
/codex current
/codex ask prompt:<text> image1:<file> ... image20:<file>
/codex new prompt:<text> image1:<file> ... image20:<file>
/codex history limit:<n>
/codex usage
/codex status
/codex cancel
/codex detach
/reports latest
/reports list
/tasks list
/tasks run-now id:<task-id>
```

`/research` is a shortcut for running the `literature-briefing` skill immediately. `literature-briefing` and `deep-research` first run `paper-discovery` in the same workspace, then consume the generated paper list. Scheduled tasks can also run skills, but skills are not tied to scheduling.
The `skill` argument in `/skill run` supports Discord autocomplete, so available skills appear as selectable suggestions.
`/schedule` schedules an action rather than a specific feature: use `/schedule ask` for a plain assistant question and `/schedule skill` for a skill run. The `skill` argument in `/schedule skill` also supports autocomplete. Use exactly one of `once`, `every`, or `daily`: `once` runs one time after the delay, `every` repeats after each interval, and `daily` runs every day at `HH:mm`.
`/ask`, `/codex ask`, and `/codex new` accept optional image attachments through `image1` to `image20`. Mention chat accepts normal Discord message attachments. `/ask` and mention chat keep image turns in the persistent Codex app-server thread, so follow-up questions share the same short-term conversation context. `/codex ask` and `/codex new` use Codex CLI's `--image` support because they intentionally control local Codex CLI sessions.

`/ask` talks to this bot's assistant runtime and memory. `/codex` is separate: it
controls local Codex CLI sessions from `~/.codex/session_index.jsonl` by running
`codex exec` and `codex exec resume`. Use `/codex pick` for a selectable recent
session list, or `/codex bind` with autocomplete. The chosen binding is stored in
`~/.codex-bots/codex-control-bindings.json`.

## Web Search

Web search is enabled by default through Codex CLI's native `--search` flag. This makes the Responses `web_search` tool available to Codex; Codex still decides whether a specific prompt needs to search.

Toggle it globally:

```bash
pnpm dev config set-web-search on
pnpm dev config set-web-search off
```

Toggle it inside chat:

```text
/search status
/search off
/search on
```

The local server exposes:

```text
GET    /health
GET    /tasks
POST   /tasks
DELETE /tasks/:id
POST   /tasks/:id/run
GET    /runs?taskId=&limit=
```

## Notes

- Interactive chat uses `codex --search app-server --listen stdio://` by default and stores Codex thread bindings locally.
- If `chatRuntime` is set to `exec` or app-server fails, the chatbot falls back to `codex --ask-for-approval never --search exec --sandbox read-only -m <model> <prompt>`.
- The exec fallback uses `--output-last-message` internally so only the final assistant response is shown.
- Conversation history is maintained by this app for exec fallback; app-server threads carry their own short-term context.
- Available subscription models can vary by account and Codex CLI version. Use `/model <id>` to try a custom model.
