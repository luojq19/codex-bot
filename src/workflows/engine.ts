import type { AppConfig } from "../config.js";
import { runSkill } from "../skillsRuntime.js";
import type { ScheduledTask } from "../tasks/types.js";

export type WorkflowResult = {
  output: string;
  workspaceDir: string;
  artifacts: string[];
};

export async function runSkillWorkflow(task: ScheduledTask, config: AppConfig, runId: string): Promise<WorkflowResult> {
  if (!task.workflow) {
    throw new Error(`Task ${task.id} does not have workflow config.`);
  }

  const result = await runSkill(config, {
    skill: task.workflow.skill,
    input: task.workflow.input,
    model: task.model,
    name: task.name,
    runId
  });

  return {
    output: result.output,
    workspaceDir: result.workspaceDir,
    artifacts: result.artifacts
  };
}
