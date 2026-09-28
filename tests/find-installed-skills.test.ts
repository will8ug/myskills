import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findInstalledSkills } from "../src/add.ts";

async function makeTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "myskills-installed-"));
}

async function writeSkill(source: string, relativeDir: string): Promise<void> {
  await mkdir(join(source, relativeDir), { recursive: true });
  await writeFile(join(source, relativeDir, "SKILL.md"), relativeDir);
}

async function discoveredFixture(root: string): Promise<{ source: string; skillsDirectory: string }> {
  const source = join(root, "skill-source");
  await writeSkill(source, join("skills", "testing", "tdd"));
  await writeSkill(source, join("skills", "writing", "grill-me"));
  await writeSkill(source, join("skills", "writing", "long-form"));
  const skillsDirectory = join(root, "project", ".agents", "skills");
  await mkdir(skillsDirectory, { recursive: true });
  return { source, skillsDirectory };
}

const discovered = [
  { name: "tdd", relativePath: join("skills", "testing", "tdd") },
  { name: "grill-me", relativePath: join("skills", "writing", "grill-me") },
];

test("a same-source link at the target counts as installed", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { source, skillsDirectory } = await discoveredFixture(root);
  await symlink(join(source, "skills", "testing", "tdd"), join(skillsDirectory, "tdd"), "dir");

  const installed = await findInstalledSkills(source, skillsDirectory, discovered);

  assert.deepEqual([...installed], ["tdd"]);
});

test("a differing link, a real directory, and a missing entry are not installed", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { source, skillsDirectory } = await discoveredFixture(root);
  const elsewhere = join(root, "elsewhere");
  await mkdir(elsewhere);
  await symlink(elsewhere, join(skillsDirectory, "tdd"), "dir");
  await mkdir(join(skillsDirectory, "grill-me"));

  const installed = await findInstalledSkills(source, skillsDirectory, discovered);

  assert.deepEqual([...installed], []);
});

test("a broken link is not installed", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { source, skillsDirectory } = await discoveredFixture(root);
  await symlink(join(root, "vanished"), join(skillsDirectory, "tdd"), "dir");

  const installed = await findInstalledSkills(source, skillsDirectory, discovered);

  assert.deepEqual([...installed], []);
});

test("a missing skills directory yields no installed skills", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { source } = await discoveredFixture(root);
  const missing = join(root, "no-such-project", ".agents", "skills");

  const installed = await findInstalledSkills(source, missing, discovered);

  assert.deepEqual([...installed], []);
});
