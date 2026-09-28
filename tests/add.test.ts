import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, mkdir, readdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addConfirmations, AddError, executeAddPlan, planAdd, resolveAddPlan, type AddOptions, type AddReport } from "../src/add.ts";

async function add(options: AddOptions): Promise<AddReport> {
  return executeAddPlan(resolveAddPlan(await planAdd(options), new Set()));
}

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

  const report = await add({ source, skillNames: ["tdd", "grill-me"], skillsDirectory: skills, method: "link", force: false });

  assert.equal(report.skillsDirectory, skills);
  assert.equal(report.method, "link");
  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "installed", sourcePath: join(source, "skills", "testing", "tdd") },
    { name: "grill-me", outcome: "installed", sourcePath: join(source, "skills", "writing", "grill-me") },
  ]);
  for (const entry of report.entries) {
    const entryPath = join(skills, entry.name);
    assert.equal((await lstat(entryPath)).isSymbolicLink(), true, `${entryPath} is a symlink`);
    assert.equal(await readlink(entryPath), entry.sourcePath, `${entryPath} points at ${entry.sourcePath}`);
    assert.equal((await stat(entryPath)).isDirectory(), true, `${entryPath} resolves to the skill folder`);
  }
  assert.deepEqual(await snapshotTree(source), before, "the skill source is untouched");
});

test("a change in the skill source is visible at the target through the installed link", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, "project", ".agents", "skills");
  await add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "link", force: false });

  await writeFile(join(source, "skills", "testing", "tdd", "pulled.md"), "fresh from git");

  assert.equal(await readFile(join(skills, "tdd", "pulled.md"), "utf8"), "fresh from git");
});

test("re-running the same install reports every skill as already installed and changes nothing", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, "project", ".agents", "skills");
  await add({ source, skillNames: ["tdd", "grill-me"], skillsDirectory: skills, method: "link", force: false });
  const targetBefore = await snapshotTree(skills);

  const report = await add({ source, skillNames: ["grill-me", "tdd"], skillsDirectory: skills, method: "link", force: false });

  assert.deepEqual(report.entries, [
    { name: "grill-me", outcome: "already-installed", sourcePath: join(source, "skills", "writing", "grill-me") },
    { name: "tdd", outcome: "already-installed", sourcePath: join(source, "skills", "testing", "tdd") },
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

  const report = await add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "link", force: false });

  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "already-installed", sourcePath: join(source, "skills", "testing", "tdd") },
  ]);
  assert.equal(await readlink(join(skills, "tdd")), join(source, "skills", "testing", "tdd"));
});

test("unresolved conflicts are reported as skipped and nothing is destroyed", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  const otherTarget = join(root, "elsewhere");
  await mkdir(otherTarget);
  await symlink(otherTarget, join(skills, "tdd"), "dir");
  await mkdir(join(skills, "grill-me"));

  const report = await add({ source, skillNames: ["tdd", "grill-me"], skillsDirectory: skills, method: "link", force: false });

  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "skipped", sourcePath: join(source, "skills", "testing", "tdd") },
    { name: "grill-me", outcome: "skipped", sourcePath: join(source, "skills", "writing", "grill-me") },
  ]);
  assert.equal(await readlink(join(skills, "tdd")), otherTarget, "the differing link is untouched");
  assert.deepEqual(await readdir(join(skills, "grill-me")), [], "the real directory is untouched");
  assert.deepEqual(await readdir(skills).then((names) => names.sort()), ["grill-me", "tdd"], "nothing was added");
});

test("a file at the target is skipped and left as it is", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  await writeFile(join(skills, "tdd"), "a plain file");

  const report = await add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "link", force: false });

  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "skipped", sourcePath: join(source, "skills", "testing", "tdd") },
  ]);
  assert.equal(await readFile(join(skills, "tdd"), "utf8"), "a plain file");
  assert.deepEqual(await readdir(skills), ["tdd"]);
});

test("confirming a replacement swaps a differing link for the new one", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const before = await snapshotTree(source);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  const otherTarget = join(root, "elsewhere");
  await mkdir(otherTarget);
  await symlink(otherTarget, join(skills, "tdd"), "dir");

  const plan = await planAdd({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "link", force: false });
  assert.deepEqual(addConfirmations(plan), [
    { name: "tdd", conflict: { kind: "conflict", entry: "link", target: otherTarget } },
  ]);

  const report = await executeAddPlan(resolveAddPlan(plan, new Set(["tdd"])));

  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "replaced", sourcePath: join(source, "skills", "testing", "tdd") },
  ]);
  assert.equal(await readlink(join(skills, "tdd")), join(source, "skills", "testing", "tdd"));
  assert.equal((await stat(otherTarget)).isDirectory(), true, "the old link target still exists");
  assert.deepEqual(await snapshotTree(source), before, "the skill source is untouched");
});

test("confirming a replacement over a real directory removes its contents", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const before = await snapshotTree(source);
  const skills = join(root, ".agents", "skills");
  await mkdir(join(skills, "tdd"), { recursive: true });
  await writeFile(join(skills, "tdd", "handmade.md"), "hand made");

  const plan = await planAdd({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "link", force: false });

  const report = await executeAddPlan(resolveAddPlan(plan, new Set(["tdd"])));

  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "replaced", sourcePath: join(source, "skills", "testing", "tdd") },
  ]);
  assert.equal((await lstat(join(skills, "tdd"))).isSymbolicLink(), true, "the directory is now a link");
  assert.equal(await readlink(join(skills, "tdd")), join(source, "skills", "testing", "tdd"));
  await assert.rejects(stat(join(skills, "tdd", "handmade.md")), { code: "ENOENT" }, "the hand-made file is gone");
  assert.deepEqual(await snapshotTree(source), before, "the skill source is untouched");
});

test("force replaces a differing link and a real directory without any confirmations", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  const otherTarget = join(root, "elsewhere");
  await mkdir(otherTarget);
  await symlink(otherTarget, join(skills, "tdd"), "dir");
  await mkdir(join(skills, "grill-me"));

  const plan = await planAdd({ source, skillNames: ["tdd", "grill-me"], skillsDirectory: skills, method: "link", force: true });

  const report = await executeAddPlan(resolveAddPlan(plan, new Set()));

  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "replaced", sourcePath: join(source, "skills", "testing", "tdd") },
    { name: "grill-me", outcome: "replaced", sourcePath: join(source, "skills", "writing", "grill-me") },
  ]);
  assert.equal(await readlink(join(skills, "tdd")), join(source, "skills", "testing", "tdd"));
  assert.equal(await readlink(join(skills, "grill-me")), join(source, "skills", "writing", "grill-me"));
  assert.equal((await stat(otherTarget)).isDirectory(), true, "the old link target still exists");
});

test("a copy install is a real directory with the skill's contents, independent of the source", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, "project", ".agents", "skills");
  const before = await snapshotTree(source);

  const report = await add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "copy", force: false });

  assert.equal(report.method, "copy");
  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "installed", sourcePath: join(source, "skills", "testing", "tdd") },
  ]);
  assert.equal((await lstat(join(skills, "tdd"))).isSymbolicLink(), false, "a copy is a real directory, not a link");
  assert.equal(await readFile(join(skills, "tdd", "SKILL.md"), "utf8"), "tdd");
  assert.equal(await readFile(join(skills, "tdd", "steps.md"), "utf8"), "red, green");
  assert.equal(
    await readFile(join(skills, "tdd", "references", "deep", "SKILL.md"), "utf8"),
    "nested inside tdd",
    "nested folders are copied",
  );
  assert.deepEqual(await snapshotTree(source), before, "the skill source is untouched");

  await writeFile(join(source, "skills", "testing", "tdd", "SKILL.md"), "edited in the source");

  assert.equal(await readFile(join(skills, "tdd", "SKILL.md"), "utf8"), "tdd", "the copy does not follow the source");
});

test("a copy with force replaces a real directory with a fresh copy", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(join(skills, "tdd"), { recursive: true });
  await writeFile(join(skills, "tdd", "handmade.md"), "hand made");

  const report = await add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "copy", force: true });

  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "replaced", sourcePath: join(source, "skills", "testing", "tdd") },
  ]);
  assert.equal((await lstat(join(skills, "tdd"))).isSymbolicLink(), false, "the replacement is a real directory");
  assert.equal(await readFile(join(skills, "tdd", "SKILL.md"), "utf8"), "tdd");
  await assert.rejects(stat(join(skills, "tdd", "handmade.md")), { code: "ENOENT" }, "the hand-made file is gone");
});

test("a copy request over a same-source link reports already installed and keeps the link", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  await symlink(join(source, "skills", "testing", "tdd"), join(skills, "tdd"), "dir");

  const report = await add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "copy", force: false });

  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "already-installed", sourcePath: join(source, "skills", "testing", "tdd") },
  ]);
  assert.equal((await lstat(join(skills, "tdd"))).isSymbolicLink(), true, "the link survives as-is");
  assert.equal(await readlink(join(skills, "tdd")), join(source, "skills", "testing", "tdd"));
});

test("a symlink creation failure is a hard error suggesting --copy and creates nothing", async (t) => {
  const root = await makeTempRoot();
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  await chmod(skills, 0o555);
  t.after(async () => {
    await chmod(skills, 0o755);
    await rm(root, { recursive: true, force: true });
  });

  await assert.rejects(
    () => add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "link", force: false }),
    (error: unknown) =>
      error instanceof AddError
      && error.message.includes("Retry with --copy")
      && error.message.includes(join(skills, "tdd"))
      && error.message.includes("EACCES"),
  );
  await assert.rejects(lstat(join(skills, "tdd")), { code: "ENOENT" }, "no entry was created");
});

test("a link failure after completed entries rejects with a partial report", async (t) => {
  const root = await makeTempRoot();
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  await symlink(join(source, "skills", "testing", "tdd"), join(skills, "tdd"), "dir");
  await chmod(skills, 0o555);
  t.after(async () => {
    await chmod(skills, 0o755);
    await rm(root, { recursive: true, force: true });
  });

  let caught: unknown;
  try {
    await add({ source, skillNames: ["tdd", "grill-me"], skillsDirectory: skills, method: "link", force: false });
    assert.fail("add should reject");
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof AddError);
  assert.ok(caught.message.includes("Retry with --copy"));
  assert.deepEqual(caught.partialReport, {
    skillsDirectory: skills,
    method: "link",
    entries: [{ name: "tdd", outcome: "already-installed", sourcePath: join(source, "skills", "testing", "tdd") }],
  });
  await assert.rejects(lstat(join(skills, "grill-me")), { code: "ENOENT" }, "grill-me was not created");
});

test("a copy failure after completed entries rejects with a partial report and no --copy hint", async (t) => {
  const root = await makeTempRoot();
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");
  await mkdir(skills, { recursive: true });
  await symlink(join(source, "skills", "testing", "tdd"), join(skills, "tdd"), "dir");
  await chmod(skills, 0o555);
  t.after(async () => {
    await chmod(skills, 0o755);
    await rm(root, { recursive: true, force: true });
  });

  let caught: unknown;
  try {
    await add({ source, skillNames: ["tdd", "grill-me"], skillsDirectory: skills, method: "copy", force: false });
    assert.fail("add should reject");
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof AddError);
  assert.equal(caught.message.includes("--copy"), false, "the --copy hint is only for link failures");
  assert.ok(caught.message.includes("Failed to copy"));
  assert.deepEqual(caught.partialReport, {
    skillsDirectory: skills,
    method: "copy",
    entries: [{ name: "tdd", outcome: "already-installed", sourcePath: join(source, "skills", "testing", "tdd") }],
  });
  await assert.rejects(lstat(join(skills, "grill-me")), { code: "ENOENT" }, "grill-me was not created");
});

test("unknown skill names fail before anything is installed", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");

  await assert.rejects(
    () => add({ source, skillNames: ["tdd", "typo-name"], skillsDirectory: skills, method: "link", force: false }),
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
    () => add({ source, skillNames: [], skillsDirectory: skills, method: "link", force: false }),
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
    () => add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "link", force: false }),
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
    () => add({ source, skillNames: ["root-skill-source"], skillsDirectory: skills, method: "link", force: false }),
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
      () => add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "link", force: false }),
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
    () => add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "link", force: false }),
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

  const report = await add({ source, skillNames: ["tdd"], skillsDirectory: skills, method: "link", force: false });
  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "installed", sourcePath: join(source, "skills", "testing", "tdd") },
  ]);
});

test("the same skill name requested twice installs once", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await makeFixtureSource(root);
  const skills = join(root, ".agents", "skills");

  const report = await add({ source, skillNames: ["tdd", "tdd"], skillsDirectory: skills, method: "link", force: false });
  assert.deepEqual(report.entries, [
    { name: "tdd", outcome: "installed", sourcePath: join(source, "skills", "testing", "tdd") },
  ]);
  assert.deepEqual(await readdir(skills), ["tdd"]);
});
