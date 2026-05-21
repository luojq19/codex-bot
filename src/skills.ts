import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const SKILLS_ROOT = join(process.cwd(), "skills");

export async function loadSkill(skillName: string): Promise<{ name: string; path: string; instructions: string }> {
  const normalized = normalizeSkillName(skillName);
  const path = join(SKILLS_ROOT, `${normalized}.md`);
  const instructions = await readFile(path, "utf8");
  return {
    name: normalized,
    path,
    instructions
  };
}

export async function listSkills(): Promise<string[]> {
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.replace(/\.md$/i, ""))
    .sort();
}

export function normalizeSkillName(skillName: string): string {
  const normalized = skillName.trim().replace(/\.md$/i, "");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(normalized)) {
    throw new Error("Skill names may only contain letters, numbers, and hyphens.");
  }
  return normalized;
}
