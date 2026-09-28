import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  deleteConfirmations,
  DeleteError,
  executeDeletePlan,
  planDelete,
  resolveDeletePlan,
  type DeleteOptions,
  type DeleteReport,
} from "../src/delete.ts";

const run = promisify(execFile);

async function deleteSkill(options: DeleteOptions): Promise<DeleteReport> {
  return executeDeletePlan(resolveDeletePlan(await planDelete(options), new Set()));
}

async function makeTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "myskills-delete-"));
}

/** A skills directory holding one entry of every kind: link, broken link, real directory, file. */
async function makeFixtureSkillsDirectory(root: string): Promise<{ skills: string; source: string }> {
  const source = join(root, "skill-source");
  const tddPath = join(source, "skills", "testing", "tdd");
  await mkdir(tddPath, { recursive: true });
  await writeFile(join(tddPath, "SKILL.md"), "tdd");
  const movedPath = join(root, "moved-elsewhere");
  await mkdir(movedPath);

  const skills = join(root, "project", ".agents", "skills");
  await mkdir(skills, { recursive: true });
  await symlink(tddPath, join(skills, "tdd"), "dir");
  await symlink(movedPath, join(skills, "grill-me"), "dir");
  await rm(movedPath, { recursive: true });
  await mkdir(join(skills, "code-review"));
  await writeFile(join(skills, "code-review", "SKILL.md"), "hand made");
  await writeFile(join(skills, "NOTES.md"), "a plain file");
  return { skills, source };
}

test("removing a link needs no confirmation and leaves the skill source untouched", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { skills, source } = await makeFixtureSkillsDirectory(root);

  const plan = await planDelete({ skillNames: ["tdd"], skillsDirectory: skills, force: false });

  const report = await executeDeletePlan(resolveDeletePlan(plan, new Set()));

  assert.deepEqual(report, {
    skillsDirectory: skills,
    entries: [{ name: "tdd", kind: "link", outcome: "deleted" }],
  });
  await assert.rejects(lstat(join(skills, "tdd")), { code: "ENOENT" }, "the symlink is gone");
  assert.equal(await readFile(join(source, "skills", "testing", "tdd", "SKILL.md"), "utf8"), "tdd", "the skill source is untouched");
  assert.deepEqual(
    await readdir(skills).then((names) => names.sort()),
    ["NOTES.md", "code-review", "grill-me"],
    "only the requested entry is removed",
  );
});

test("a broken link is removed without confirmation", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { skills } = await makeFixtureSkillsDirectory(root);

  const report = await deleteSkill({ skillNames: ["grill-me"], skillsDirectory: skills, force: false });

  assert.deepEqual(report.entries, [{ name: "grill-me", kind: "broken-link", outcome: "deleted" }]);
  await assert.rejects(lstat(join(skills, "grill-me")), { code: "ENOENT" }, "the broken link is gone");
});

test("a real directory is removed only when its confirmation is confirmed", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { skills } = await makeFixtureSkillsDirectory(root);

  const plan = await planDelete({ skillNames: ["code-review"], skillsDirectory: skills, force: false });
  assert.deepEqual(deleteConfirmations(plan), [{ name: "code-review", kind: "directory" }]);

  const declined = await executeDeletePlan(resolveDeletePlan(plan, new Set()));
  assert.deepEqual(declined.entries, [{ name: "code-review", kind: "directory", outcome: "skipped" }]);
  assert.equal(
    await readFile(join(skills, "code-review", "SKILL.md"), "utf8"),
    "hand made",
    "a declined removal leaves the directory and its contents untouched",
  );

  const confirmed = await executeDeletePlan(resolveDeletePlan(plan, new Set(["code-review"])));
  assert.deepEqual(confirmed.entries, [{ name: "code-review", kind: "directory", outcome: "deleted" }]);
  await assert.rejects(lstat(join(skills, "code-review")), { code: "ENOENT" }, "the directory is gone");
});

test("force removes a real directory with no confirmations", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { skills } = await makeFixtureSkillsDirectory(root);

  const plan = await planDelete({ skillNames: ["code-review"], skillsDirectory: skills, force: true });

  const report = await executeDeletePlan(resolveDeletePlan(plan, new Set()));

  assert.deepEqual(report.entries, [{ name: "code-review", kind: "directory", outcome: "deleted" }]);
  await assert.rejects(lstat(join(skills, "code-review")), { code: "ENOENT" }, "the directory is gone");
});

test("a file entry asks for confirmation like a directory", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { skills } = await makeFixtureSkillsDirectory(root);

  const plan = await planDelete({ skillNames: ["NOTES.md"], skillsDirectory: skills, force: false });

  const report = await executeDeletePlan(resolveDeletePlan(plan, new Set(["NOTES.md"])));

  assert.deepEqual(report.entries, [{ name: "NOTES.md", kind: "file", outcome: "deleted" }]);
  await assert.rejects(lstat(join(skills, "NOTES.md")), { code: "ENOENT" }, "the file is gone");
});

test("unknown names reject and remove nothing", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { skills } = await makeFixtureSkillsDirectory(root);

  await assert.rejects(
    () => deleteSkill({ skillNames: ["tdd", "typo-name"], skillsDirectory: skills, force: false }),
    (error: unknown) =>
      error instanceof DeleteError
      && error.message.includes(skills)
      && error.message.includes("typo-name")
      && error.message.includes("tdd"),
  );
  assert.deepEqual(
    await readdir(skills).then((names) => names.sort()),
    ["NOTES.md", "code-review", "grill-me", "tdd"],
    "nothing was removed",
  );
});

test("names against a missing skills directory reject clearly and create nothing", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const missing = join(root, "nowhere", ".agents", "skills");

  await assert.rejects(
    () => deleteSkill({ skillNames: ["tdd"], skillsDirectory: missing, force: false }),
    (error: unknown) =>
      error instanceof DeleteError
      && error.message.includes(`Not installed in ${missing}: tdd`)
      && error.message.includes("Present entries: none"),
  );
  await assert.rejects(stat(join(root, "nowhere")), { code: "ENOENT" }, "delete never creates the skills directory");
});

test("an rm failure after a completed entry rejects with a partial report", async (t) => {
  const root = await makeTempRoot();
  const { skills } = await makeFixtureSkillsDirectory(root);
  const locked = join(skills, "code-review");
  await run("chflags", ["uchg", locked]);
  t.after(async () => {
    await run("chflags", ["nouchg", locked]);
    await rm(root, { recursive: true, force: true });
  });

  let caught: unknown;
  try {
    await deleteSkill({ skillNames: ["tdd", "code-review"], skillsDirectory: skills, force: true });
    assert.fail("delete should reject");
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DeleteError);
  assert.ok(caught.message.includes("Failed to delete"));
  assert.ok(caught.message.includes(locked));
  assert.deepEqual(caught.partialReport, {
    skillsDirectory: skills,
    entries: [{ name: "tdd", kind: "link", outcome: "deleted" }],
  });
});
