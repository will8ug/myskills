import assert from "node:assert/strict";
import { test } from "node:test";
import { addConfirmationMessage, addReportLines, describeTargetEntryConflict, reportLines } from "../src/report.ts";

test("columns pad names to the widest entry and show kind and link target", () => {
  const lines = reportLines({
    skillsDirectory: "/repos/api/.agents/skills",
    entries: [
      { name: "tdd", kind: "link", target: "/sources/tdd" },
      { name: "handmade", kind: "directory", target: null },
    ],
  });

  assert.deepEqual(lines, [
    "/repos/api/.agents/skills",
    "  tdd       link -> /sources/tdd",
    "  handmade  directory",
  ]);
});

test("broken links are labelled as broken, with the target when one is readable", () => {
  const lines = reportLines({
    skillsDirectory: "/repos/api/.agents/skills",
    entries: [
      { name: "moved", kind: "broken-link", target: "/sources/vanished" },
      { name: "dangling", kind: "broken-link", target: null },
    ],
  });

  assert.deepEqual(lines, [
    "/repos/api/.agents/skills",
    "  moved     broken link -> /sources/vanished",
    "  dangling  broken link",
  ]);
});

test("a file entry is listed plainly with no arrow", () => {
  const lines = reportLines({
    skillsDirectory: "/repos/api/.agents/skills",
    entries: [{ name: "NOTES.md", kind: "file", target: null }],
  });

  assert.deepEqual(lines, ["/repos/api/.agents/skills", "  NOTES.md  file"]);
});

test("an empty report says so under the skills directory", () => {
  const lines = reportLines({ skillsDirectory: "/repos/api/.agents/skills", entries: [] });

  assert.deepEqual(lines, ["/repos/api/.agents/skills", "  no skills installed"]);
});

test("the add report pads names and shows each link outcome with its source", () => {
  const lines = addReportLines({
    skillsDirectory: "/repos/api/.agents/skills",
    method: "link",
    entries: [
      { name: "tdd", outcome: "installed", sourcePath: "/sources/skills/testing/tdd" },
      { name: "grill-me", outcome: "replaced", sourcePath: "/sources/skills/writing/grill-me" },
      { name: "ask-matt", outcome: "already-installed", sourcePath: "/sources/skills/asking/ask-matt" },
      { name: "code-review", outcome: "skipped", sourcePath: "/sources/skills/reviewing/code-review" },
    ],
  });

  assert.deepEqual(lines, [
    "/repos/api/.agents/skills",
    "  tdd          installed -> /sources/skills/testing/tdd",
    "  grill-me     replaced -> /sources/skills/writing/grill-me",
    "  ask-matt     already installed -> /sources/skills/asking/ask-matt",
    "  code-review  skipped",
  ]);
});

test("copy installs and replacements show the origin folder instead of an arrow", () => {
  const lines = addReportLines({
    skillsDirectory: "/repos/api/.agents/skills",
    method: "copy",
    entries: [
      { name: "tdd", outcome: "installed", sourcePath: "/sources/skills/testing/tdd" },
      { name: "grill-me", outcome: "replaced", sourcePath: "/sources/skills/writing/grill-me" },
    ],
  });

  assert.deepEqual(lines, [
    "/repos/api/.agents/skills",
    "  tdd       installed (copy of /sources/skills/testing/tdd)",
    "  grill-me  replaced (copy of /sources/skills/writing/grill-me)",
  ]);
});

test("under the copy method an already-installed entry is still shown as the link it is", () => {
  const lines = addReportLines({
    skillsDirectory: "/repos/api/.agents/skills",
    method: "copy",
    entries: [{ name: "tdd", outcome: "already-installed", sourcePath: "/sources/skills/testing/tdd" }],
  });

  assert.deepEqual(lines, [
    "/repos/api/.agents/skills",
    "  tdd  already installed -> /sources/skills/testing/tdd",
  ]);
});

test("a confirmation message names the skill and describes the conflicting entry", () => {
  assert.equal(
    addConfirmationMessage({
      name: "tdd",
      conflict: { kind: "conflict", entry: "directory" },
    }),
    "Replace tdd (a real directory)?",
  );
  assert.equal(
    addConfirmationMessage({
      name: "grill-me",
      conflict: { kind: "conflict", entry: "link", target: "/other/grill-me" },
    }),
    "Replace grill-me (a different link -> /other/grill-me)?",
  );
});

test("a differing link is described with where it points", () => {
  assert.equal(
    describeTargetEntryConflict({ kind: "conflict", entry: "link", target: "/other/tdd" }),
    "a different link -> /other/tdd",
  );
});

test("an unreadable link, a directory, and a file are described plainly", () => {
  assert.equal(
    describeTargetEntryConflict({ kind: "conflict", entry: "broken-link", target: null }),
    "a link whose target cannot be read",
  );
  assert.equal(describeTargetEntryConflict({ kind: "conflict", entry: "directory" }), "a real directory");
  assert.equal(describeTargetEntryConflict({ kind: "conflict", entry: "file" }), "a file");
});
