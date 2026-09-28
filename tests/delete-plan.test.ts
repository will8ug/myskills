import assert from "node:assert/strict";
import { test } from "node:test";
import { decideDeletePlan, deleteConfirmations, DeleteError, resolveDeletePlan } from "../src/delete.ts";
import type { ClassifiedEntry } from "../src/entry-classification.ts";

const entries: ClassifiedEntry[] = [
  { name: "tdd", kind: "link", target: "/source/skills/testing/tdd" },
  { name: "grill-me", kind: "broken-link", target: "/source/skills/writing/grill-me" },
  { name: "code-review", kind: "directory", target: null },
  { name: "frontend-design", kind: "file", target: null },
];

const input = (overrides: {
  skillNames?: string[];
  entries?: ClassifiedEntry[];
  force?: boolean;
}) => ({
  skillsDirectory: "/project/.agents/skills",
  force: overrides.force ?? false,
  entries: overrides.entries ?? entries,
  skillNames: overrides.skillNames ?? [],
});

test("no skill names fails", () => {
  assert.throws(
    () => decideDeletePlan(input({})),
    (error: unknown) => error instanceof DeleteError && error.message === "No skill names given.",
  );
});

test("unknown names fail naming the directory, the unknowns, and the present entries", () => {
  assert.throws(
    () => decideDeletePlan(input({ skillNames: ["tdd", "typo-name"] })),
    (error: unknown) =>
      error instanceof DeleteError
      && error.message.includes("Not installed in /project/.agents/skills: typo-name")
      && error.message.includes("Present entries: tdd, grill-me, code-review, frontend-design"),
  );
});

test("unknown names against an empty skills directory report no present entries", () => {
  assert.throws(
    () => decideDeletePlan(input({ skillNames: ["tdd"], entries: [] })),
    (error: unknown) =>
      error instanceof DeleteError
      && error.message.includes("Not installed in /project/.agents/skills: tdd")
      && error.message.includes("Present entries: none"),
  );
});

test("links and broken links are planned as removals with zero confirmations", () => {
  const plan = decideDeletePlan(input({ skillNames: ["grill-me", "tdd"] }));

  assert.deepEqual(plan, {
    skillsDirectory: "/project/.agents/skills",
    removals: [
      { name: "grill-me", kind: "broken-link", action: "remove" },
      { name: "tdd", kind: "link", action: "remove" },
    ],
  });
  assert.deepEqual(deleteConfirmations(plan), []);
});

test("real directories and files become confirm-remove", () => {
  const plan = decideDeletePlan(input({ skillNames: ["code-review", "frontend-design"] }));

  assert.deepEqual(plan.removals, [
    { name: "code-review", kind: "directory", action: "confirm-remove" },
    { name: "frontend-design", kind: "file", action: "confirm-remove" },
  ]);
});

test("force plans real directories and files as removals", () => {
  const plan = decideDeletePlan(input({ skillNames: ["code-review", "frontend-design"], force: true }));

  assert.deepEqual(plan.removals, [
    { name: "code-review", kind: "directory", action: "remove" },
    { name: "frontend-design", kind: "file", action: "remove" },
  ]);
});

test("a name requested twice is planned once in request order", () => {
  const plan = decideDeletePlan(input({ skillNames: ["code-review", "tdd", "code-review"] }));

  assert.deepEqual(plan.removals.map((removal) => removal.name), ["code-review", "tdd"]);
});

test("deleteConfirmations lists each pending removal in request order", () => {
  const plan = decideDeletePlan(input({ skillNames: ["tdd", "code-review", "frontend-design"] }));

  assert.deepEqual(deleteConfirmations(plan), [
    { name: "code-review", kind: "directory" },
    { name: "frontend-design", kind: "file" },
  ]);
});

test("a force plan carries no confirmations", () => {
  const plan = decideDeletePlan(input({ skillNames: ["code-review", "frontend-design"], force: true }));

  assert.deepEqual(deleteConfirmations(plan), []);
});

test("resolveDeletePlan maps confirmed names to remove and the rest to skip, preserving order", () => {
  const plan = decideDeletePlan(input({ skillNames: ["tdd", "code-review", "frontend-design", "grill-me"] }));

  const resolved = resolveDeletePlan(plan, new Set(["frontend-design"]));

  assert.deepEqual(resolved, {
    skillsDirectory: "/project/.agents/skills",
    removals: [
      { name: "tdd", kind: "link", action: "remove" },
      { name: "code-review", kind: "directory", action: "skip" },
      { name: "frontend-design", kind: "file", action: "remove" },
      { name: "grill-me", kind: "broken-link", action: "remove" },
    ],
  });
});

test("resolveDeletePlan passes a force-planned remove through untouched", () => {
  const plan = decideDeletePlan(input({ skillNames: ["code-review"], force: true }));

  assert.deepEqual(resolveDeletePlan(plan, new Set()).removals, [
    { name: "code-review", kind: "directory", action: "remove" },
  ]);
});
