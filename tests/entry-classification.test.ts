import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyEntry, classifyTargetEntry, type EntryFacts, type TargetEntryFacts } from "../src/entry-classification.ts";

const facts = (overrides: Partial<EntryFacts>): EntryFacts => ({
  isSymbolicLink: false,
  target: null,
  targetExists: false,
  manifestPresent: false,
  isDirectory: false,
  ...overrides,
});

test("a symlink whose target exists and holds SKILL.md is a link carrying the target path", () => {
  assert.deepEqual(
    classifyEntry("tdd", facts({ isSymbolicLink: true, target: "/source/skills/tdd", targetExists: true, manifestPresent: true })),
    { name: "tdd", kind: "link", target: "/source/skills/tdd" },
  );
});

test("a symlink whose target exists but holds no SKILL.md is a hollow link carrying the target path", () => {
  assert.deepEqual(
    classifyEntry("tdd", facts({ isSymbolicLink: true, target: "/source/skills/tdd", targetExists: true })),
    { name: "tdd", kind: "hollow-link", target: "/source/skills/tdd" },
  );
});

test("a symlink whose target is missing is a broken link, still carrying the intended target path", () => {
  assert.deepEqual(
    classifyEntry("tdd", facts({ isSymbolicLink: true, target: "/moved/away/tdd", targetExists: false })),
    { name: "tdd", kind: "broken-link", target: "/moved/away/tdd" },
  );
});

test("a symlink whose readlink failed is treated as broken with no target", () => {
  assert.deepEqual(
    classifyEntry("tdd", facts({ isSymbolicLink: true, target: null, targetExists: false })),
    { name: "tdd", kind: "broken-link", target: null },
  );
});

test("a real directory is a directory, with no target", () => {
  assert.deepEqual(classifyEntry("handmade", facts({ isDirectory: true })), {
    name: "handmade",
    kind: "directory",
    target: null,
  });
});

test("a regular file is a file", () => {
  assert.deepEqual(classifyEntry("NOTES.md", facts({})), {
    name: "NOTES.md",
    kind: "file",
    target: null,
  });
});

const targetFacts = (overrides: Partial<TargetEntryFacts>): TargetEntryFacts => ({
  exists: false,
  isSymbolicLink: false,
  isDirectory: false,
  resolvedLinkTarget: null,
  ...overrides,
});

test("a missing target entry is absent and may be installed", () => {
  assert.deepEqual(classifyTargetEntry("/source/tdd", targetFacts({})), { kind: "absent" });
});

test("a link already pointing at the skill's source folder is a same-link no-op", () => {
  assert.deepEqual(
    classifyTargetEntry("/source/tdd", targetFacts({ exists: true, isSymbolicLink: true, resolvedLinkTarget: "/source/tdd" })),
    { kind: "same-link" },
  );
});

test("a link pointing elsewhere is a link conflict carrying where it points", () => {
  assert.deepEqual(
    classifyTargetEntry("/source/tdd", targetFacts({ exists: true, isSymbolicLink: true, resolvedLinkTarget: "/other/tdd" })),
    { kind: "conflict", entry: "link", target: "/other/tdd" },
  );
});

test("a link whose target cannot be read is a broken-link conflict", () => {
  assert.deepEqual(
    classifyTargetEntry("/source/tdd", targetFacts({ exists: true, isSymbolicLink: true, resolvedLinkTarget: null })),
    { kind: "conflict", entry: "broken-link", target: null },
  );
});

test("a real directory at the target is a directory conflict", () => {
  assert.deepEqual(
    classifyTargetEntry("/source/tdd", targetFacts({ exists: true, isDirectory: true })),
    { kind: "conflict", entry: "directory" },
  );
});

test("a regular file at the target is a file conflict", () => {
  assert.deepEqual(
    classifyTargetEntry("/source/tdd", targetFacts({ exists: true })),
    { kind: "conflict", entry: "file" },
  );
});
