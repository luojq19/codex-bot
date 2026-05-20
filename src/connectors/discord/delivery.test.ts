import test from "node:test";
import assert from "node:assert/strict";
import { chunkDiscordMessage } from "./delivery.js";

test("chunkDiscordMessage keeps short messages intact", () => {
  assert.deepEqual(chunkDiscordMessage("hello"), ["hello"]);
});

test("chunkDiscordMessage splits long messages for Discord", () => {
  const chunks = chunkDiscordMessage("a".repeat(4500));
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 2000);
  assert.equal(chunks[1].length, 2000);
  assert.equal(chunks[2].length, 500);
});
