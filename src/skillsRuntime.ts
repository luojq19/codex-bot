import { randomUUID } from "node:crypto";
import type { AppConfig } from "./config.js";
import { CodexCli } from "./codexCli.js";
import { loadSkill } from "./skills.js";
import { createWorkflowWorkspace, writeWorkspaceFile } from "./workspace.js";

export type RunSkillInput = {
  skill: string;
  input: string;
  model?: string;
  name?: string;
  runId?: string;
};

export type RunSkillResult = {
  output: string;
  workspaceDir: string;
  artifacts: string[];
  skill: string;
  runId: string;
};

export async function runSkill(config: AppConfig, input: RunSkillInput): Promise<RunSkillResult> {
  const skill = await loadSkill(input.skill);
  const runId = input.runId ?? randomUUID();
  const workspaceDir = await createWorkflowWorkspace(input.name ?? skill.name, runId);
  const skillPath = await writeWorkspaceFile(workspaceDir, "skill.md", skill.instructions);
  const inputPath = await writeWorkspaceFile(workspaceDir, "input.md", input.input);
  const runInstructions = buildSkillPrompt(skill.name);
  const promptPath = await writeWorkspaceFile(workspaceDir, "prompt.md", runInstructions);

  const codex = new CodexCli(config);
  const output = await codex.complete(input.model ?? config.model, buildCodexPrompt(skill.instructions, input.input, runInstructions), {
    cwd: workspaceDir,
    sandbox: "read-only",
    webSearchEnabled: true
  });
  const reportPath = await writeWorkspaceFile(workspaceDir, "report.md", output);

  return {
    output,
    workspaceDir,
    artifacts: [skillPath, inputPath, promptPath, reportPath],
    skill: skill.name,
    runId
  };
}

function buildSkillPrompt(skillName: string): string {
  return [
    `Skill: ${skillName}`,
    "",
    "Read skill.md and input.md in the current workspace.",
    "Complete the skill using the input.",
    "Use web search when the skill or task requires current information.",
    "Return the final artifact as Markdown in your final response.",
    "Do not include private credentials or environment details.",
    "If external information is unavailable, say so clearly instead of inventing details."
  ].join("\n");
}

function buildCodexPrompt(skillInstructions: string, skillInput: string, runInstructions: string): string {
  return [
    "You are running a reusable assistant skill.",
    "",
    "Skill instructions:",
    skillInstructions,
    "",
    "Skill input:",
    skillInput,
    "",
    "Run instructions:",
    runInstructions,
    "",
    "Use the instructions and input above as the source of task instructions and produce the final result as Markdown."
  ].join("\n");
}
