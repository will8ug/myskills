import assert from "node:assert/strict";
import { test } from "node:test";
import { expandTilde, resolveScope, ScopeError, type ScopeDeps } from "../src/scope.ts";

const HOME = "/home/dev";
const CWD = "/home/dev/work/api";

function depsWith(existingDirectories: string[]): ScopeDeps {
  return {
    home: HOME,
    cwd: CWD,
    isDirectory: async (path) => existingDirectories.includes(path),
  };
}

test("--global resolves to <home>/.agents/skills", async () => {
  const result = await resolveScope(depsWith([]), { global: true });
  assert.deepEqual(result, { outcome: "resolved", skillsDirectory: "/home/dev/.agents/skills" });
});

test("--project resolves to <project>/.agents/skills", async () => {
  const result = await resolveScope(depsWith(["/repos/api"]), { project: "/repos/api" });
  assert.deepEqual(result, { outcome: "resolved", skillsDirectory: "/repos/api/.agents/skills" });
});

test("--project expands a leading ~ against the injected home", async () => {
  const result = await resolveScope(depsWith(["/home/dev/proj"]), { project: "~/proj" });
  assert.deepEqual(result, { outcome: "resolved", skillsDirectory: "/home/dev/proj/.agents/skills" });
});

test("--project resolves relative paths against the injected cwd", async () => {
  const result = await resolveScope(depsWith(["/home/dev/work/other"]), { project: "../other" });
  assert.deepEqual(result, { outcome: "resolved", skillsDirectory: "/home/dev/work/other/.agents/skills" });
});

test("no flags hands scope choice to the shell's prompt", async () => {
  const result = await resolveScope(depsWith([]), {});
  assert.deepEqual(result, { outcome: "needs-prompt" });
});

test("--global together with --project is an error", async () => {
  await assert.rejects(
    () => resolveScope(depsWith([]), { global: true, project: "/repos/api" }),
    (error: unknown) =>
      error instanceof ScopeError && error.message === "--global and --project cannot be used together",
  );
});

test("a nonexistent project path is an error naming the path", async () => {
  await assert.rejects(
    () => resolveScope(depsWith([]), { project: "/repos/typo" }),
    (error: unknown) =>
      error instanceof ScopeError && error.message.includes("/repos/typo"),
  );
});

test("--global works even when nothing exists under home", async () => {
  const result = await resolveScope(depsWith([]), { global: true });
  assert.deepEqual(result, { outcome: "resolved", skillsDirectory: "/home/dev/.agents/skills" });
});

test("~ expands to the home itself", () => {
  assert.equal(expandTilde("~", HOME), HOME);
});

test("~/... expands against the home", () => {
  assert.equal(expandTilde("~/skills", HOME), "/home/dev/skills");
});

test("a tilde only at the start counts as a leading tilde", () => {
  assert.equal(expandTilde("/repo/~backup", HOME), "/repo/~backup");
});

test("~user is not expanded", () => {
  assert.equal(expandTilde("~other/skills", HOME), "~other/skills");
});
