import test from "node:test";
import assert from "node:assert/strict";
import { chunkMarkdown, rankMemoryChunks } from "./search.js";

test("chunkMarkdown splits memory by markdown headings", () => {
  const chunks = chunkMarkdown(
    "MEMORY.md",
    ["# Memory", "", "Intro", "", "## Projects", "", "- codex-bots uses TypeScript"].join("\n")
  );

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].title, "Memory");
  assert.equal(chunks[1].title, "Projects");
  assert.equal(chunks[1].line, 5);
});

test("rankMemoryChunks finds the most relevant memory snippets", () => {
  const chunks = chunkMarkdown(
    "MEMORY.md",
    [
      "# Memory",
      "",
      "The user prefers concise Chinese replies.",
      "",
      "## Literature",
      "",
      "The user tracks autoresearch agents and bio-agent benchmark papers."
    ].join("\n")
  );

  const results = rankMemoryChunks("bio-agent benchmark", chunks, { limit: 1 });

  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Literature");
  assert.match(results[0].snippet, /bio-agent benchmark/);
});
