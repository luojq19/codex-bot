import test from "node:test";
import assert from "node:assert/strict";
import { chunkDiscordMessage } from "./delivery.js";

test("chunkDiscordMessage keeps short messages intact", () => {
  assert.deepEqual(chunkDiscordMessage("hello"), ["hello"]);
});

test("chunkDiscordMessage splits long messages for Discord", () => {
  const chunks = chunkDiscordMessage("a".repeat(4500));
  assert.equal(chunks.length, 3);
  assert.ok(chunks[0].startsWith("(1/3)\n"));
  assert.ok(chunks[1].startsWith("(2/3)\n"));
  assert.ok(chunks[2].startsWith("(3/3)\n"));
  assert.ok(chunks.every((chunk) => chunk.length <= 2000));
});

test("chunkDiscordMessage prefers paragraph boundaries", () => {
  const first = "first paragraph ".repeat(80);
  const second = "second paragraph ".repeat(80);
  const chunks = chunkDiscordMessage(`${first}\n\n${second}`);
  assert.equal(chunks.length, 2);
  assert.match(chunks[0], /first paragraph/);
  assert.doesNotMatch(chunks[0], /second paragraph/);
  assert.match(chunks[1], /second paragraph/);
});

test("chunkDiscordMessage keeps URLs intact when splitting", () => {
  const url = "https://example.com/papers/autoresearch-agent?source=discord&window=30d";
  const chunks = chunkDiscordMessage(`${"a".repeat(1880)} ${url}\n\n${"b".repeat(400)}`);

  assert.ok(chunks.some((chunk) => chunk.includes(url)));
  assert.ok(chunks.every((chunk) => chunk.length <= 2000));
  assert.ok(chunks.every((chunk) => !chunk.includes("https://example.com/") || chunk.includes(url)));
});

test("chunkDiscordMessage keeps Markdown links intact when splitting", () => {
  const link = "[AutoResearch benchmark](https://arxiv.org/abs/2605.12345)";
  const chunks = chunkDiscordMessage(`${"a".repeat(1880)} ${link}\n\n${"b".repeat(400)}`);

  assert.ok(chunks.some((chunk) => chunk.includes(link)));
  assert.ok(chunks.every((chunk) => chunk.length <= 2000));
  assert.ok(chunks.every((chunk) => !chunk.includes("https://arxiv.org/") || chunk.includes(link)));
});
