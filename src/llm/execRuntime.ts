import type { AppConfig } from "../config.js";
import { CodexCli } from "../codexCli.js";
import type { LLMRuntime, RuntimeCompletionInput } from "./types.js";

export class CodexExecRuntime implements LLMRuntime {
  private readonly codex: CodexCli;

  constructor(config: AppConfig) {
    this.codex = new CodexCli(config);
  }

  complete(input: RuntimeCompletionInput): Promise<string> {
    return this.codex.complete(input.model, input.prompt, {
      ...input.options,
      imagePaths: input.imagePaths ?? input.options?.imagePaths
    });
  }
}
