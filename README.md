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
pnpm dev server start
```

Create and manage tasks from the CLI:

```bash
pnpm dev tasks add --name digest --every 1h --prompt "Summarize what I should focus on next."
pnpm dev tasks add --name morning --cron "0 9 * * *" --timezone America/New_York --prompt "Prepare a morning briefing."
pnpm dev tasks list
pnpm dev tasks run-now <id>
pnpm dev runs list --limit 20
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
