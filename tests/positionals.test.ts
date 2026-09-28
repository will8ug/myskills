import assert from "node:assert/strict";
import { test } from "node:test";
import { isSourceShaped, splitAddPositionals } from "../src/positionals.ts";

test("a path with a separator is the source; the rest are skill names", () => {
  assert.deepEqual(splitAddPositionals(["~/sources/skills", "tdd", "grill-me"]), {
    source: "~/sources/skills",
    skillNames: ["tdd", "grill-me"],
  });
});

test("an absolute path is the source", () => {
  assert.deepEqual(splitAddPositionals(["/repos/skills", "tdd"]), {
    source: "/repos/skills",
    skillNames: ["tdd"],
  });
});

test("a relative path with a separator is the source", () => {
  assert.deepEqual(splitAddPositionals(["../skills", "tdd"]), {
    source: "../skills",
    skillNames: ["tdd"],
  });
  assert.deepEqual(splitAddPositionals(["./skills", "tdd"]), {
    source: "./skills",
    skillNames: ["tdd"],
  });
});

test("a lone . or .. is the source", () => {
  assert.deepEqual(splitAddPositionals([".", "tdd"]), { source: ".", skillNames: ["tdd"] });
  assert.deepEqual(splitAddPositionals(["..", "tdd"]), { source: "..", skillNames: ["tdd"] });
});

test("a leading ~ makes the first positional the source, even ~user form", () => {
  assert.deepEqual(splitAddPositionals(["~other/skills", "tdd"]), {
    source: "~other/skills",
    skillNames: ["tdd"],
  });
});

test("bare words are always skill names, never a source", () => {
  assert.deepEqual(splitAddPositionals(["tdd", "grill-me"]), {
    source: null,
    skillNames: ["tdd", "grill-me"],
  });
});

test("a bare first positional makes every positional a skill name, source-shaped or not", () => {
  assert.deepEqual(splitAddPositionals(["tdd", "~/skills"]), {
    source: null,
    skillNames: ["tdd", "~/skills"],
  });
});

test("a source-shaped first positional with no names yields just the source", () => {
  assert.deepEqual(splitAddPositionals(["~/skills"]), { source: "~/skills", skillNames: [] });
});

test("no positionals yields no source and no names", () => {
  assert.deepEqual(splitAddPositionals([]), { source: null, skillNames: [] });
});

test("source-shaped later positionals stay skill names", () => {
  assert.deepEqual(splitAddPositionals(["/repos/skills", "./nested", "tdd"]), {
    source: "/repos/skills",
    skillNames: ["./nested", "tdd"],
  });
});

test("isSourceShaped is purely syntactic", () => {
  for (const shaped of ["/a", "a/b", "~/a", "~", ".", "..", "./a", "../a", ".hidden/"]) {
    assert.equal(isSourceShaped(shaped), true, shaped);
  }
  for (const bare of ["tdd", "grill-me", "a", "", "SKILL.md"]) {
    assert.equal(isSourceShaped(bare), false, bare);
  }
});
