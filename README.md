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
pnpm dev skills run literature-briefing --input "Track new AI agent papers from the last week."
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

Manage memory from the CLI:

```bash
pnpm dev memory show
pnpm dev memory add "User prefers concise Chinese replies."
pnpm dev memory search "literature briefing"
pnpm dev memory daily
pnpm dev memory summarize --write
```

## Discord

Create a Discord application and bot, then put the credentials in `default.env` at the repo root:

```text
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...              # recommended for fast slash-command registration
DISCORD_DEFAULT_CHANNEL_ID=...    # optional default delivery target
```

`default.env` is loaded automatically by the CLI and is ignored by git.

Register slash commands:

```bash
pnpm dev discord register-commands
```

Start the Discord bot:

```bash
pnpm dev discord start
```

Supported Discord commands:

```text
/ask question:<text>
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
/reports latest
/reports list
/tasks list
/tasks run-now id:<task-id>
```

`/research` is a shortcut for running the `literature-briefing` skill immediately. Scheduled tasks can also run skills, but skills are not tied to scheduling.
The `skill` argument in `/skill run` supports Discord autocomplete, so available skills appear as selectable suggestions.
`/schedule` schedules an action rather than a specific feature: use `/schedule ask` for a plain assistant question and `/schedule skill` for a skill run. The `skill` argument in `/schedule skill` also supports autocomplete. Use exactly one of `once`, `every`, or `daily`: `once` runs one time after the delay, `every` repeats after each interval, and `daily` runs every day at `HH:mm`.

The first MVP uses slash commands and bot replies. It does not require the privileged Message Content intent.

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

- The chatbot calls `codex --ask-for-approval never --search exec --sandbox read-only -m <model> <prompt>` by default.
- It uses `--output-last-message` internally so only the final assistant response is shown.
- Conversation history is maintained by this app and included in each prompt.
- Available subscription models can vary by account and Codex CLI version. Use `/model <id>` to try a custom model.
