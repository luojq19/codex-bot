import type { AppConfig } from "../config.js";
import { CodexCli } from "../codexCli.js";
import { loadSkill } from "../skills.js";
import type { ScheduledTask } from "../tasks/types.js";
import { createWorkflowWorkspace, writeWorkspaceFile } from "../workspace.js";

export type WorkflowResult = {
  output: string;
  workspaceDir: string;
  artifacts: string[];
};

export async function runSkillWorkflow(task: ScheduledTask, config: AppConfig, runId: string): Promise<WorkflowResult> {
  if (!task.workflow) {
    throw new Error(`Task ${task.id} does not have workflow config.`);
  }

  const skill = await loadSkill(task.workflow.skill);
  const workspaceDir = await createWorkflowWorkspace(task.name, runId);
  const skillPath = await writeWorkspaceFile(workspaceDir, "skill.md", skill.instructions);
  const inputPath = await writeWorkspaceFile(workspaceDir, "input.md", task.workflow.input);
  const promptPath = await writeWorkspaceFile(workspaceDir, "prompt.md", buildWorkflowPrompt(task, skill.name));

  const codex = new CodexCli(config);
  const output = await codex.complete(task.model, await buildWorkflowPromptFromFiles(skillPath, inputPath, promptPath), {
    cwd: workspaceDir,
    sandbox: "workspace-write",
    webSearchEnabled: true
  });
  const reportPath = await writeWorkspaceFile(workspaceDir, "report.md", output);

  return {
    output,
    workspaceDir,
    artifacts: [skillPath, inputPath, promptPath, reportPath]
  };
}

function buildWorkflowPrompt(task: ScheduledTask, skillName: string): string {
  return [
    `Workflow task: ${task.name}`,
    `Skill: ${skillName}`,
    "",
    "Read skill.md and input.md in the current workspace.",
    "Complete the workflow described by the skill using the input.",
    "Use web search when the skill or task requires current information.",
    "Return the final artifact as Markdown in your final response.",
    "Do not include private credentials or environment details.",
    "If external information is unavailable, say so clearly instead of inventing details."
  ].join("\n");
}

async function buildWorkflowPromptFromFiles(skillPath: string, inputPath: string, promptPath: string): Promise<string> {
  return [
    "You are running a reusable assistant workflow.",
    "",
    `Skill instructions file: ${skillPath}`,
    `Workflow input file: ${inputPath}`,
    `Run instructions file: ${promptPath}`,
    "",
    "Use those files as the source of task instructions and produce the final report as Markdown."
  ].join("\n");
}
