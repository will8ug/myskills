import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { skillPickerItems } from "../src/add-picker-items.ts";
import type { DiscoveredSkill } from "../src/discovery.ts";

const discovered: DiscoveredSkill[] = [
  { name: "tdd", relativePath: join("skills", "testing", "tdd") },
  { name: "grill-me", relativePath: join("skills", "writing", "grill-me") },
];

test("picker items are flat, in discovery order, with the path as hint", () => {
  const items = skillPickerItems(discovered, new Set());

  assert.deepEqual(items, [
    { value: "tdd", label: "tdd", hint: join("skills", "testing", "tdd"), annotation: undefined },
    { value: "grill-me", label: "grill-me", hint: join("skills", "writing", "grill-me"), annotation: undefined },
  ]);
});

test("only installed skills carry the annotation", () => {
  const items = skillPickerItems(discovered, new Set(["grill-me"]));

  assert.deepEqual(
    items.map((item) => item.annotation),
    [undefined, "already installed"],
  );
  assert.deepEqual(
    items.map((item) => item.value),
    ["tdd", "grill-me"],
  );
});

test("an empty source yields no picker items", () => {
  assert.deepEqual(skillPickerItems([], new Set()), []);
});
