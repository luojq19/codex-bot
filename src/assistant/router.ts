import type { AppConfig } from "../config.js";
import { CodexCli } from "../codexCli.js";

export type ConversationSource = "cli" | "discord";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HandleUserMessageInput = {
  source: ConversationSource;
  text: string;
  history: ConversationMessage[];
  model?: string;
  context?: string;
};

export async function handleUserMessage(
  config: AppConfig,
  input: HandleUserMessageInput
): Promise<{ response: string; history: ConversationMessage[] }> {
  const model = input.model ?? config.model;
  const history = [...input.history, { role: "user" as const, content: input.text }];
  const codex = new CodexCli(config);
  const response = await codex.complete(model, buildPrompt(input.source, history, input.context));

  return {
    response,
    history: [...history, { role: "assistant", content: response }]
  };
}

function buildPrompt(source: ConversationSource, history: ConversationMessage[], context: string | undefined): string {
  const transcript = history
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");

  return [
    "You are a concise, helpful life/work assistant.",
    `Current interface: ${source}.`,
    "Answer the latest user message using the conversation history.",
    "Use web search when current facts, recent events, or literature updates matter.",
    "Do not edit local files, run shell commands, or perform coding-agent actions in normal chat.",
    context ? `\nAdditional context:\n${context}` : "",
    "",
    "Conversation:",
    transcript,
    "",
    "Assistant:"
  ].join("\n");
}
