import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { AddError, addConfirmations, decideAddPlan, resolveAddPlan } from "../src/add.ts";
import type { DiscoveredSkill } from "../src/discovery.ts";
import type { TargetEntryState } from "../src/entry-classification.ts";

const discovered: DiscoveredSkill[] = [
  { name: "tdd", relativePath: join("skills", "testing", "tdd") },
  { name: "grill-me", relativePath: join("skills", "writing", "grill-me") },
  { name: "code-review", relativePath: join("skills", "reviewing", "code-review") },
  { name: "frontend-design", relativePath: join("skills", "design", "frontend-design") },
];

const input = (overrides: {
  skillNames?: string[];
  targetStates?: Record<string, TargetEntryState>;
  method?: "link" | "copy";
  force?: boolean;
}) => ({
  source: "/source",
  skillsDirectory: "/project/.agents/skills",
  method: overrides.method ?? "link",
  force: overrides.force ?? false,
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
    method: "link",
    installs: [{ name: "tdd", sourcePath: join("/source", "skills", "testing", "tdd"), action: "install" }],
  });
});

test("force plans a replace for every conflict kind", () => {
  const plan = decideAddPlan(input({
    skillNames: ["tdd", "grill-me", "code-review", "frontend-design"],
    method: "copy",
    force: true,
    targetStates: {
      tdd: { kind: "conflict", entry: "link", target: "/other/tdd" },
      "grill-me": { kind: "conflict", entry: "broken-link", target: null },
      "code-review": { kind: "conflict", entry: "directory" },
      "frontend-design": { kind: "conflict", entry: "file" },
    },
  }));

  assert.equal(plan.method, "copy");
  assert.deepEqual(
    plan.installs.map((install) => [install.name, install.action]),
    [
      ["tdd", "replace"],
      ["grill-me", "replace"],
      ["code-review", "replace"],
      ["frontend-design", "replace"],
    ],
  );
});

test("without force each conflict becomes a confirm-replace carrying its conflict, in request order", () => {
  const plan = decideAddPlan(input({
    skillNames: ["grill-me", "tdd"],
    targetStates: {
      tdd: { kind: "conflict", entry: "link", target: "/other/tdd" },
      "grill-me": { kind: "conflict", entry: "directory" },
    },
  }));

  assert.deepEqual(plan.installs, [
    {
      name: "grill-me",
      sourcePath: join("/source", "skills", "writing", "grill-me"),
      action: "confirm-replace",
      conflict: { kind: "conflict", entry: "directory" },
    },
    {
      name: "tdd",
      sourcePath: join("/source", "skills", "testing", "tdd"),
      action: "confirm-replace",
      conflict: { kind: "conflict", entry: "link", target: "/other/tdd" },
    },
  ]);
});

test("a same-source link is already-installed under both methods", () => {
  for (const method of ["link", "copy"] as const) {
    const plan = decideAddPlan(input({
      skillNames: ["tdd"],
      method,
      targetStates: { tdd: { kind: "same-link" } },
    }));

    assert.equal(plan.method, method);
    assert.deepEqual(plan.installs, [
      { name: "tdd", sourcePath: join("/source", "skills", "testing", "tdd"), action: "already-installed" },
    ]);
  }
});

test("a clean request passes through as installs, with same-link entries as already-installed", () => {
  const plan = decideAddPlan(input({
    skillNames: ["tdd", "grill-me"],
    targetStates: { tdd: { kind: "absent" }, "grill-me": { kind: "same-link" } },
  }));

  assert.deepEqual(plan, {
    skillsDirectory: "/project/.agents/skills",
    method: "link",
    installs: [
      { name: "tdd", sourcePath: join("/source", "skills", "testing", "tdd"), action: "install" },
      { name: "grill-me", sourcePath: join("/source", "skills", "writing", "grill-me"), action: "already-installed" },
    ],
  });
});

test("addConfirmations lists each pending replacement in request order", () => {
  const plan = decideAddPlan(input({
    skillNames: ["tdd", "grill-me", "code-review"],
    targetStates: {
      tdd: { kind: "absent" },
      "grill-me": { kind: "conflict", entry: "directory" },
      "code-review": { kind: "conflict", entry: "link", target: "/other/code-review" },
    },
  }));

  assert.deepEqual(addConfirmations(plan), [
    {
      name: "grill-me",
      conflict: { kind: "conflict", entry: "directory" },
    },
    {
      name: "code-review",
      conflict: { kind: "conflict", entry: "link", target: "/other/code-review" },
    },
  ]);
});

test("a force plan carries no confirmations", () => {
  const plan = decideAddPlan(input({
    skillNames: ["tdd"],
    force: true,
    targetStates: { tdd: { kind: "conflict", entry: "directory" } },
  }));

  assert.deepEqual(addConfirmations(plan), []);
});

test("resolveAddPlan maps confirmed names to replace and the rest to skip, preserving order", () => {
  const plan = decideAddPlan(input({
    skillNames: ["tdd", "grill-me", "code-review", "frontend-design"],
    targetStates: {
      tdd: { kind: "absent" },
      "grill-me": { kind: "conflict", entry: "directory" },
      "code-review": { kind: "conflict", entry: "link", target: "/other/code-review" },
      "frontend-design": { kind: "same-link" },
    },
  }));

  const resolved = resolveAddPlan(plan, new Set(["code-review"]));

  assert.deepEqual(resolved, {
    skillsDirectory: "/project/.agents/skills",
    method: "link",
    installs: [
      { name: "tdd", sourcePath: join("/source", "skills", "testing", "tdd"), action: "install" },
      { name: "grill-me", sourcePath: join("/source", "skills", "writing", "grill-me"), action: "skip" },
      { name: "code-review", sourcePath: join("/source", "skills", "reviewing", "code-review"), action: "replace" },
      { name: "frontend-design", sourcePath: join("/source", "skills", "design", "frontend-design"), action: "already-installed" },
    ],
  });
});

test("resolveAddPlan passes a force-planned replace through untouched", () => {
  const plan = decideAddPlan(input({
    skillNames: ["tdd"],
    force: true,
    targetStates: { tdd: { kind: "conflict", entry: "directory" } },
  }));

  assert.deepEqual(resolveAddPlan(plan, new Set()).installs, [
    { name: "tdd", sourcePath: join("/source", "skills", "testing", "tdd"), action: "replace" },
  ]);
});
