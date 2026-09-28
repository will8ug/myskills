import assert from "node:assert/strict";
import { test } from "node:test";
import { reportLines } from "../src/report.ts";

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
