import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MODEL } from "../models.js";
import { buildCreateTaskInput } from "../taskInputs.js";
import { calculateNextRunAt, parseInterval } from "./schedule.js";

const config = {
  codexCommand: "codex",
  model: DEFAULT_MODEL,
  execArgsTemplate: []
};

test("parseInterval supports minutes, hours, and days", () => {
  assert.equal(parseInterval("10m"), 10 * 60 * 1000);
  assert.equal(parseInterval("1h"), 60 * 60 * 1000);
  assert.equal(parseInterval("1d"), 24 * 60 * 60 * 1000);
});

test("parseInterval rejects invalid values", () => {
  assert.throws(() => parseInterval("0m"), /positive/);
  assert.throws(() => parseInterval("5x"), /Invalid interval/);
});

test("calculateNextRunAt supports cron schedules", () => {
  const next = calculateNextRunAt(
    {
      type: "cron",
      expression: "0 9 * * *",
      timezone: "UTC"
    },
    new Date("2026-05-19T08:00:00.000Z")
  );
  assert.equal(next, "2026-05-19T09:00:00.000Z");
});

test("buildCreateTaskInput requires exactly one schedule kind", () => {
  assert.throws(
    () =>
      buildCreateTaskInput(
        {
          name: "demo",
          prompt: "hello",
          every: "1h",
          cron: "0 9 * * *"
        },
        config
      ),
    /Use only one of --once, --every, --daily, or --cron/
  );
});

test("buildCreateTaskInput defaults model from config", () => {
  const input = buildCreateTaskInput(
    {
      name: "demo",
      prompt: "hello",
      every: "1h"
    },
    config
  );

  assert.equal(input.model, DEFAULT_MODEL);
  assert.deepEqual(input.schedule, { type: "interval", everyMs: 60 * 60 * 1000 });
});

test("buildCreateTaskInput supports one-time delayed runs", () => {
  const input = buildCreateTaskInput(
    {
      name: "once",
      prompt: "hello",
      once: "1m"
    },
    config
  );

  assert.equal(input.schedule.type, "once");
  assert.ok(new Date(input.schedule.runAt).getTime() > Date.now());
});

test("buildCreateTaskInput supports daily HH:mm schedules", () => {
  const input = buildCreateTaskInput(
    {
      name: "daily",
      prompt: "hello",
      daily: "08:30",
      timezone: "America/New_York"
    },
    config
  );

  assert.deepEqual(input.schedule, {
    type: "cron",
    expression: "30 8 * * *",
    timezone: "America/New_York"
  });
});

test("buildCreateTaskInput supports workflow skills and Discord delivery", () => {
  const input = buildCreateTaskInput(
    {
      kind: "workflow",
      name: "daily ai",
      prompt: "",
      skill: "literature-briefing",
      workflowInput: "Track new AI agent papers.",
      every: "1d",
      discordChannelId: "123"
    },
    config
  );

  assert.equal(input.kind, "workflow");
  assert.equal(input.workflow?.skill, "literature-briefing");
  assert.equal(input.workflow?.input, "Track new AI agent papers.");
  assert.equal(input.delivery?.discordChannelId, "123");
});
