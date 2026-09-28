import assert from "node:assert/strict";
import { test } from "node:test";
import { decideSkills, DiscoveryError } from "../src/discovery.ts";

test("each directory with a direct SKILL.md is a skill named after its folder", () => {
  assert.deepEqual(decideSkills(["skills/testing/tdd/SKILL.md", "skills/writing/grill-me/SKILL.md"]), [
    { name: "tdd", relativePath: "skills/testing/tdd" },
    { name: "grill-me", relativePath: "skills/writing/grill-me" },
  ]);
});

test("a SKILL.md nested inside an accepted skill's folder belongs to that skill", () => {
  assert.deepEqual(
    decideSkills([
      "tdd/SKILL.md",
      "tdd/references/deep/SKILL.md",
      "tdd/examples/nested/again/SKILL.md",
    ]),
    [{ name: "tdd", relativePath: "tdd" }],
  );
});

test("shadowing holds regardless of the order the walk reported the manifests", () => {
  assert.deepEqual(
    decideSkills(["a/b/c/SKILL.md", "a/SKILL.md", "a/b/SKILL.md"]),
    [{ name: "a", relativePath: "a" }],
  );
});

test("a nested folder sharing the skill's own name is shadowing, not a duplicate", () => {
  assert.deepEqual(decideSkills(["tdd/SKILL.md", "tdd/tdd/SKILL.md"]), [
    { name: "tdd", relativePath: "tdd" },
  ]);
});

test("sibling skills with the same folder name are a duplicate error naming both paths", () => {
  assert.throws(
    () => decideSkills(["skills/testing/tdd/SKILL.md", "skills/legacy/tdd/SKILL.md"]),
    (error: unknown) =>
      error instanceof DiscoveryError
      && error.message.includes('Duplicate skill name "tdd"')
      && error.message.includes("skills/testing/tdd")
      && error.message.includes("skills/legacy/tdd"),
  );
});

test("a SKILL.md at the source root is not a skill folder", () => {
  assert.throws(
    () => decideSkills(["SKILL.md"]),
    (error: unknown) => error instanceof DiscoveryError && error.message.includes("source root"),
  );
});
