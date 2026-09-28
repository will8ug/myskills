import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyEntry, type EntryFacts } from "../src/entry-classification.ts";

const facts = (overrides: Partial<EntryFacts>): EntryFacts => ({
  isSymbolicLink: false,
  target: null,
  targetExists: false,
  isDirectory: false,
  ...overrides,
});

test("a symlink whose target exists is a link carrying the target path", () => {
  assert.deepEqual(
    classifyEntry("tdd", facts({ isSymbolicLink: true, target: "/source/skills/tdd", targetExists: true })),
    { name: "tdd", kind: "link", target: "/source/skills/tdd" },
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
