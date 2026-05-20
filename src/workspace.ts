import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const WORKSPACE_ROOT = join(process.cwd(), "workspace");

export async function createWorkflowWorkspace(taskName: string, runId: string): Promise<string> {
  const safeName = slugify(taskName);
  const dir = join(WORKSPACE_ROOT, safeName, runId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeWorkspaceFile(workspaceDir: string, name: string, content: string): Promise<string> {
  const path = join(workspaceDir, name);
  await writeFile(path, content, "utf8");
  return path;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "workflow";
}
