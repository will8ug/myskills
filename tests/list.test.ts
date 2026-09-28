import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { list } from "../src/list.ts";

async function makeTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "myskills-list-"));
}

test("list classifies links, broken links, directories, and files", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const skills = join(root, "skills");
  await mkdir(skills);
  const linkedSkill = join(root, "source", "tdd");
  await mkdir(linkedSkill, { recursive: true });
  const linkedFile = join(root, "source", "NOTES.md");
  await writeFile(linkedFile, "notes");

  await symlink(linkedSkill, join(skills, "tdd"), "dir");
  await symlink(join(root, "vanished"), join(skills, "moved"), "dir");
  await symlink(linkedFile, join(skills, "notes-file"));
  await mkdir(join(skills, "handmade"));
  await writeFile(join(skills, "README.md"), "readme");

  const report = await list({ skillsDirectory: skills });

  assert.equal(report.skillsDirectory, skills);
  assert.deepEqual(report.entries, [
    { name: "README.md", kind: "file", target: null },
    { name: "handmade", kind: "directory", target: null },
    { name: "moved", kind: "broken-link", target: join(root, "vanished") },
    { name: "notes-file", kind: "link", target: linkedFile },
    { name: "tdd", kind: "link", target: linkedSkill },
  ]);
});

test("a missing skills directory yields an empty report and creates nothing", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const skills = join(root, ".agents", "skills");
  const report = await list({ skillsDirectory: skills });

  assert.deepEqual(report, { skillsDirectory: skills, entries: [] });
  await assert.rejects(stat(skills), { code: "ENOENT" });
  assert.deepEqual(await readdir(root), []);
});

test("a file where the skills directory should be yields an empty report", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const skills = join(root, "skills");
  await writeFile(skills, "not a directory");
  const report = await list({ skillsDirectory: skills });

  assert.deepEqual(report, { skillsDirectory: skills, entries: [] });
});
