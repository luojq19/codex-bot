import type { CodexCompleteOptions } from "../codexCli.js";

export type RuntimeCompletionInput = {
  model: string;
  prompt: string;
  conversationKey?: string;
  source?: "cli" | "discord";
  options?: CodexCompleteOptions;
};

export interface LLMRuntime {
  complete(input: RuntimeCompletionInput): Promise<string>;
}
