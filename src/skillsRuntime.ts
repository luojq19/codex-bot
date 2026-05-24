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

type UpstreamSkillArtifact = {
  skill: string;
  outputFile: string;
  output: string;
};

const SKILL_DEPENDENCIES: Record<string, string[]> = {
  "literature-briefing": ["paper-discovery"],
  "deep-research": ["paper-discovery"]
};

const UPSTREAM_OUTPUT_FILES: Record<string, string> = {
  "paper-discovery": "paper_discovery.md"
};

export async function runSkill(config: AppConfig, input: RunSkillInput): Promise<RunSkillResult> {
  const skill = await loadSkill(input.skill);
  const runId = input.runId ?? randomUUID();
  const workspaceDir = await createWorkflowWorkspace(input.name ?? skill.name, runId);
  const artifacts: string[] = [];
  const skillPath = await writeWorkspaceFile(workspaceDir, "skill.md", skill.instructions);
  artifacts.push(skillPath);
  const inputPath = await writeWorkspaceFile(workspaceDir, "input.md", input.input);
  artifacts.push(inputPath);
  const codex = new CodexCli(config);
  const upstreamArtifacts = await runUpstreamSkills(config, codex, workspaceDir, skill.name, input);
  artifacts.push(...upstreamArtifacts.artifacts);

  const runInstructions = buildSkillPrompt(skill.name, upstreamArtifacts.outputs);
  const promptPath = await writeWorkspaceFile(workspaceDir, "prompt.md", runInstructions);
  artifacts.push(promptPath);

  const output = await codex.complete(
    input.model ?? config.model,
    buildCodexPrompt(skill.instructions, input.input, runInstructions, upstreamArtifacts.outputs),
    {
      cwd: workspaceDir,
      sandbox: "read-only",
      webSearchEnabled: true
    }
  );
  const reportPath = await writeWorkspaceFile(workspaceDir, "report.md", output);
  artifacts.push(reportPath);

  return {
    output,
    workspaceDir,
    artifacts,
    skill: skill.name,
    runId
  };
}

async function runUpstreamSkills(
  config: AppConfig,
  codex: CodexCli,
  workspaceDir: string,
  skillName: string,
  input: RunSkillInput
): Promise<{ outputs: UpstreamSkillArtifact[]; artifacts: string[] }> {
  const dependencyNames = SKILL_DEPENDENCIES[skillName] ?? [];
  const outputs: UpstreamSkillArtifact[] = [];
  const artifacts: string[] = [];

  for (const dependencyName of dependencyNames) {
    const dependency = await loadSkill(dependencyName);
    const dependencySkillPath = await writeWorkspaceFile(
      workspaceDir,
      `${dependency.name}.skill.md`,
      dependency.instructions
    );
    const dependencyPrompt = buildSkillPrompt(dependency.name, [], `${dependency.name}.skill.md`);
    const dependencyPromptPath = await writeWorkspaceFile(
      workspaceDir,
      `${dependency.name}.prompt.md`,
      dependencyPrompt
    );
    const dependencyOutput = await codex.complete(
      input.model ?? config.model,
      buildCodexPrompt(dependency.instructions, input.input, dependencyPrompt),
      {
        cwd: workspaceDir,
        sandbox: "read-only",
        webSearchEnabled: true
      }
    );
    const outputFile = UPSTREAM_OUTPUT_FILES[dependency.name] ?? `${dependency.name}.md`;
    const dependencyOutputPath = await writeWorkspaceFile(workspaceDir, outputFile, dependencyOutput);

    artifacts.push(dependencySkillPath, dependencyPromptPath, dependencyOutputPath);
    outputs.push({
      skill: dependency.name,
      outputFile,
      output: dependencyOutput
    });
  }

  return { outputs, artifacts };
}

function buildSkillPrompt(
  skillName: string,
  upstreamArtifacts: UpstreamSkillArtifact[] = [],
  skillFileName = "skill.md"
): string {
  const instructions = [
    `Skill: ${skillName}`,
    "",
    `Read ${skillFileName} and input.md in the current workspace.`,
    "Complete the skill using the input.",
    "Use web search when the skill or task requires current information.",
    "Return the final artifact as Markdown in your final response.",
    "Do not include private credentials or environment details.",
    "If external information is unavailable, say so clearly instead of inventing details."
  ];

  if (upstreamArtifacts.length) {
    instructions.push(
      "",
      "Upstream skill artifacts are already available in the current workspace:",
      ...upstreamArtifacts.map((artifact) => `- ${artifact.skill}: ${artifact.outputFile}`),
      "Use these upstream artifacts as input. Do not repeat upstream work unless the artifact is clearly inadequate."
    );
  }

  return instructions.join("\n");
}

function buildCodexPrompt(
  skillInstructions: string,
  skillInput: string,
  runInstructions: string,
  upstreamArtifacts: UpstreamSkillArtifact[] = []
): string {
  const parts = [
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
  ];

  if (upstreamArtifacts.length) {
    parts.push(
      "",
      "Upstream skill outputs:",
      ...upstreamArtifacts.flatMap((artifact) => [
        "",
        `File: ${artifact.outputFile}`,
        `Skill: ${artifact.skill}`,
        "",
        artifact.output
      ])
    );
  }

  return parts.join("\n");
}
