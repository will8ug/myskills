import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { AddError, decideAddPlan } from "../src/add.ts";
import type { DiscoveredSkill } from "../src/discovery.ts";
import type { TargetEntryState } from "../src/entry-classification.ts";

const discovered: DiscoveredSkill[] = [
  { name: "tdd", relativePath: join("skills", "testing", "tdd") },
  { name: "grill-me", relativePath: join("skills", "writing", "grill-me") },
];

const input = (overrides: {
  skillNames?: string[];
  targetStates?: Record<string, TargetEntryState>;
}) => ({
  source: "/source",
  skillsDirectory: "/project/.agents/skills",
  discovered,
  skillNames: overrides.skillNames ?? [],
  targetStates: new Map(Object.entries(overrides.targetStates ?? {})),
});

test("no skill names fails listing the available skills", () => {
  assert.throws(
    () => decideAddPlan(input({})),
    (error: unknown) =>
      error instanceof AddError
      && error.message.includes("No skill names given")
      && error.message.includes("tdd")
      && error.message.includes("grill-me"),
  );
});

test("unknown skill names fail listing the available skills", () => {
  assert.throws(
    () => decideAddPlan(input({ skillNames: ["tdd", "typo-name"] })),
    (error: unknown) =>
      error instanceof AddError
      && error.message.includes("Unknown skill name(s): typo-name")
      && error.message.includes("tdd")
      && error.message.includes("grill-me"),
  );
});

test("a name requested twice is planned once", () => {
  const plan = decideAddPlan(input({
    skillNames: ["tdd", "tdd"],
    targetStates: { tdd: { kind: "absent" } },
  }));

  assert.deepEqual(plan, {
    skillsDirectory: "/project/.agents/skills",
    installs: [{ name: "tdd", sourcePath: join("/source", "skills", "testing", "tdd"), outcome: "install" }],
  });
});

test("every conflicting entry lands in one error naming all of them", () => {
  assert.throws(
    () => decideAddPlan(input({
      skillNames: ["tdd", "grill-me"],
      targetStates: {
        tdd: { kind: "conflict", entry: "file" },
        "grill-me": { kind: "conflict", entry: "directory" },
      },
    })),
    (error: unknown) =>
      error instanceof AddError
      && error.message.includes("Refusing to install; conflicting entries in /project/.agents/skills")
      && error.message.includes("tdd")
      && error.message.includes("a file")
      && error.message.includes("grill-me")
      && error.message.includes("a real directory"),
  );
});

test("a clean request passes through as installs, with same-link entries as already-installed", () => {
  const plan = decideAddPlan(input({
    skillNames: ["tdd", "grill-me"],
    targetStates: { tdd: { kind: "absent" }, "grill-me": { kind: "same-link" } },
  }));

  assert.deepEqual(plan, {
    skillsDirectory: "/project/.agents/skills",
    installs: [
      { name: "tdd", sourcePath: join("/source", "skills", "testing", "tdd"), outcome: "install" },
      { name: "grill-me", sourcePath: join("/source", "skills", "writing", "grill-me"), outcome: "already-installed" },
    ],
  });
});
