import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { WORKSPACE_ROOT } from "./workspace.js";

export type ReportSummary = {
  id: string;
  path: string;
  title: string;
  mtime: string;
};

export async function listReports(limit = 20): Promise<ReportSummary[]> {
  const paths = await findReportFiles(WORKSPACE_ROOT);
  const summaries = await Promise.all(paths.map(readReportSummary));
  return summaries
    .sort((left, right) => right.mtime.localeCompare(left.mtime))
    .slice(0, limit);
}

export async function getLatestReport(): Promise<{ summary: ReportSummary; content: string } | undefined> {
  const [summary] = await listReports(1);
  if (!summary) {
    return undefined;
  }
  return {
    summary,
    content: await readFile(summary.path, "utf8")
  };
}

async function findReportFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findReportFiles(path)));
    } else if (entry.isFile() && entry.name === "report.md") {
      results.push(path);
    }
  }
  return results;
}

async function readReportSummary(path: string): Promise<ReportSummary> {
  const [metadata, content] = await Promise.all([stat(path), readFile(path, "utf8")]);
  return {
    id: path.replace(`${WORKSPACE_ROOT}/`, ""),
    path,
    title: extractTitle(content),
    mtime: metadata.mtime.toISOString()
  };
}

function extractTitle(content: string): string {
  const heading = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  return heading?.replace(/^#\s+/, "") || "Untitled report";
}
