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
/auth
/clear
/quit
```

## Notes

- The chatbot calls `codex --ask-for-approval never exec --sandbox read-only -m <model> <prompt>` for each turn.
- It uses `--output-last-message` internally so only the final assistant response is shown.
- Conversation history is maintained by this app and included in each prompt.
- Available subscription models can vary by account and Codex CLI version. Use `/model <id>` to try a custom model.
