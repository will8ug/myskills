import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { add, AddError } from "../src/add.ts";

async function makeTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "myskills-add-"));
}

async function writeSkill(source: string, relativeDir: string, files: Record<string, string>): Promise<void> {
  await mkdir(join(source, relativeDir), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(source, relativeDir, name), content);
  }
}

/** skills/<bucket>/<name>/SKILL.md trees plus the discovery edge cases from the ticket. */
async function makeFixtureSource(root: string): Promise<string> {
  const source = join(root, "skill-source");
  await writeSkill(source, "skills/testing/tdd", { "SKILL.md": "tdd", "steps.md": "red, green" });
  await writeSkill(source, "skills/testing/tdd/references/deep", { "SKILL.md": "nested inside tdd" });
  await writeSkill(source, "skills/writing/grill-me", { "SKILL.md": "grill" });
  await writeSkill(source, "skills/.hidden", { "SKILL.md": "hidden" });
  await writeSkill(source, "skills/node_modules/pkg", { "SKILL.md": "dependency" });
  await writeSkill(source, ".broken/source", { "SKILL.md": "under a hidden dir" });
  await writeFile(join(source, "README.md"), "readme");
  return source;
}

async function snapshotTree(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  async function walk(dir: string, relative: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relativePath = relative === "" ? entry.name : `${relative}/${entry.name}`;
      const absolutePath = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        snapshot.set(relativePath, `link -> ${await readlink(absolutePath)}`);
      } else if (entry.isDirectory()) {
        snapshot.set(relativePath, "dir");
        await walk(absolutePath, relativePath);
      } else {
        snapshot.set(relativePath, await readFile(absolutePath, "utf8"));
      }
    }
  }
  await walk(root, "");
  return snapshot;
}

test("add installs absolute symlinks named after each skill folder", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const before = await snapshotTree(source);
  const skills = join(root, "project", ".agents", "skills");

  const report = await add({ source, skillNames: ["tdd", "grill-me"], skillsDirectory: skills });

  assert.equal(report.skillsDirectory, skills);
  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "installed", target: join(source, "skills", "testing", "tdd") },
    { name: "grill-me", outcome: "installed", target: join(source, "skills", "writing", "grill-me") },
  ]);
  for (const entry of report.entries) {
    const entryPath = join(skills, entry.name);
    assert.equal((await lstat(entryPath)).isSymbolicLink(), true, `${entryPath} is a symlink`);
    assert.equal(await readlink(entryPath), entry.target, `${entryPath} points at ${entry.target}`);
    assert.equal((await stat(entryPath)).isDirectory(), true, `${entryPath} resolves to the skill folder`);
  }
  assert.deepEqual(await snapshotTree(source), before, "the skill source is untouched");
});

test("a change in the skill source is visible at the target through the installed link", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, "project", ".agents", "skills");
  await add({ source, skillNames: ["tdd"], skillsDirectory: skills });

  await writeFile(join(source, "skills", "testing", "tdd", "pulled.md"), "fresh from git");

  assert.equal(await readFile(join(skills, "tdd", "pulled.md"), "utf8"), "fresh from git");
});

test("re-running the same install reports every skill as already installed and changes nothing", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, "project", ".agents", "skills");
  await add({ source, skillNames: ["tdd", "grill-me"], skillsDirectory: skills });
  const targetBefore = await snapshotTree(skills);

  const report = await add({ source, skillNames: ["grill-me", "tdd"], skillsDirectory: skills });

  assert.deepEqual(report.entries, [
    { name: "grill-me", outcome: "already-installed", target: join(source, "skills", "writing", "grill-me") },
    { name: "tdd", outcome: "already-installed", target: join(source, "skills", "testing", "tdd") },
  ]);
  assert.deepEqual(await snapshotTree(skills), targetBefore);
});

test("a pre-existing same-source link counts as already installed", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  await symlink(join(source, "skills", "testing", "tdd"), join(skills, "tdd"), "dir");

  const report = await add({ source, skillNames: ["tdd"], skillsDirectory: skills });

  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "already-installed", target: join(source, "skills", "testing", "tdd") },
  ]);
  assert.equal(await readlink(join(skills, "tdd")), join(source, "skills", "testing", "tdd"));
});

test("a differing existing entry aborts the whole run, reporting all conflicts and changing nothing", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  const otherTarget = join(root, "elsewhere");
  await mkdir(otherTarget);
  await symlink(otherTarget, join(skills, "tdd"), "dir");
  await mkdir(join(skills, "grill-me"));

  await assert.rejects(
    () => add({ source, skillNames: ["tdd", "grill-me"], skillsDirectory: skills }),
    (error: unknown) =>
      error instanceof AddError
      && error.message.includes("tdd")
      && error.message.includes(otherTarget)
      && error.message.includes("grill-me"),
  );

  assert.equal(await readlink(join(skills, "tdd")), otherTarget, "the differing link is untouched");
  assert.deepEqual(await readdir(join(skills, "grill-me")), [], "the real directory is untouched");
  assert.deepEqual(await readdir(skills).then((names) => names.sort()), ["grill-me", "tdd"], "nothing was added");
});

test("a file at the target aborts with a clear error and creates nothing", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  await writeFile(join(skills, "tdd"), "a plain file");

  await assert.rejects(
    () => add({ source, skillNames: ["tdd"], skillsDirectory: skills }),
    (error: unknown) => error instanceof AddError && error.message.includes("a file"),
  );
  assert.equal(await readFile(join(skills, "tdd"), "utf8"), "a plain file");
  assert.deepEqual(await readdir(skills), ["tdd"]);
});

test("unknown skill names fail before anything is installed", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");

  await assert.rejects(
    () => add({ source, skillNames: ["tdd", "typo-name"], skillsDirectory: skills }),
    (error: unknown) => error instanceof AddError && error.message.includes("typo-name"),
  );
  await assert.rejects(stat(skills), { code: "ENOENT" });
});

test("no skill names fails listing the available skills from the source", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");

  await assert.rejects(
    () => add({ source, skillNames: [], skillsDirectory: skills }),
    (error: unknown) =>
      error instanceof AddError
      && error.message.includes("tdd")
      && error.message.includes("grill-me")
      && !error.message.includes("node_modules")
      && !error.message.includes(".hidden"),
  );
  await assert.rejects(stat(skills), { code: "ENOENT" });
});

test("zero discovered skills in the source fails clearly", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "empty-source");
  await mkdir(source);
  const skills = join(root, ".agents", "skills");

  await assert.rejects(
    () => add({ source, skillNames: ["tdd"], skillsDirectory: skills }),
    (error: unknown) => error instanceof AddError && error.message.includes(source),
  );
});

test("a SKILL.md at the source root does not yield a skill", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "root-skill-source");
  await mkdir(source);
  await writeFile(join(source, "SKILL.md"), "the root itself");
  const skills = join(root, ".agents", "skills");

  await assert.rejects(
    () => add({ source, skillNames: ["root-skill-source"], skillsDirectory: skills }),
    (error: unknown) => error instanceof AddError && error.message.includes("No skills found"),
  );
});

test("a missing or non-directory source fails clearly", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const fileSource = join(root, "file-source");
  await writeFile(fileSource, "not a directory");
  const skills = join(root, ".agents", "skills");

  for (const source of [join(root, "missing"), fileSource]) {
    await assert.rejects(
      () => add({ source, skillNames: ["tdd"], skillsDirectory: skills }),
      (error: unknown) =>
        error instanceof AddError
        && error.message.includes(`Skill source does not exist or is not a directory: ${source}`),
    );
  }
  await assert.rejects(stat(skills), { code: "ENOENT" });
});

test("duplicate skill names in one source fail naming both paths", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "dup-source");
  await writeSkill(source, "skills/testing/tdd", { "SKILL.md": "one tdd" });
  await writeSkill(source, "skills/legacy/tdd", { "SKILL.md": "another tdd" });
  const skills = join(root, ".agents", "skills");

  await assert.rejects(
    () => add({ source, skillNames: ["tdd"], skillsDirectory: skills }),
    (error: unknown) =>
      error instanceof AddError
      && error.message.includes(join("skills", "testing", "tdd"))
      && error.message.includes(join("skills", "legacy", "tdd")),
  );
  await assert.rejects(stat(skills), { code: "ENOENT" });
});

test("a nested SKILL.md inside a skill does not create a second skill or a duplicate error", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");

  const report = await add({ source, skillNames: ["tdd"], skillsDirectory: skills });
  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "installed", target: join(source, "skills", "testing", "tdd") },
  ]);
});

test("the same skill name requested twice installs once", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");

  const report = await add({ source, skillNames: ["tdd", "tdd"], skillsDirectory: skills });
  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "installed", target: join(source, "skills", "testing", "tdd") },
  ]);
  assert.deepEqual(await readdir(skills), ["tdd"]);
});
