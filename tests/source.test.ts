import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSource, SourceError } from "../src/source.ts";

const HOME = "/home/dev";
const CWD = "/home/dev/work/api";

function depsWith(existingDirectories: string[]) {
  return {
    home: HOME,
    cwd: CWD,
    isDirectory: async (path: string) => existingDirectories.includes(path),
  };
}

test("resolves a relative source against the injected cwd", async () => {
  const source = await resolveSource(depsWith(["/home/dev/work/skills"]), "../skills");
  assert.equal(source, "/home/dev/work/skills");
});

test("expands a leading ~ against the injected home", async () => {
  const source = await resolveSource(depsWith(["/home/dev/skills"]), "~/skills");
  assert.equal(source, "/home/dev/skills");
});

test("a bare ~ resolves to the home itself", async () => {
  const source = await resolveSource(depsWith([HOME]), "~");
  assert.equal(source, HOME);
});

test("a missing source is an error naming the resolved path", async () => {
  await assert.rejects(
    () => resolveSource(depsWith([]), "~/skills"),
    (error: unknown) =>
      error instanceof SourceError
      && error.message === "Skill source does not exist or is not a directory: /home/dev/skills",
  );
});

test("a file where the source should be is an error", async () => {
  await assert.rejects(
    () => resolveSource(depsWith([]), "/home/dev/notes.txt"),
    (error: unknown) => error instanceof SourceError,
  );
});
