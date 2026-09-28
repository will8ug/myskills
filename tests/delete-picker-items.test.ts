import assert from "node:assert/strict";
import { test } from "node:test";
import { deletePickerItems } from "../src/delete-picker-items.ts";
import type { ClassifiedEntry } from "../src/entry-classification.ts";

const entries: ClassifiedEntry[] = [
  { name: "tdd", kind: "link", target: "/source/skills/testing/tdd" },
  { name: "grill-me", kind: "broken-link", target: "/source/skills/writing/grill-me" },
  { name: "code-review", kind: "directory", target: null },
  { name: "NOTES.md", kind: "file", target: null },
];

test("picker items are flat, in list order, with the kind as annotation and link target as hint", () => {
  const items = deletePickerItems(entries);

  assert.deepEqual(items, [
    { value: "tdd", label: "tdd", hint: "/source/skills/testing/tdd", annotation: "link" },
    { value: "grill-me", label: "grill-me", hint: "/source/skills/writing/grill-me", annotation: "broken link" },
    { value: "code-review", label: "code-review", annotation: "directory" },
    { value: "NOTES.md", label: "NOTES.md", annotation: "file" },
  ]);
});

test("directories and files carry no hint", () => {
  const items = deletePickerItems([
    { name: "code-review", kind: "directory", target: null },
    { name: "NOTES.md", kind: "file", target: null },
  ]);

  assert.deepEqual(items.map((item) => item.hint), [undefined, undefined]);
});

test("an empty skills directory yields no picker items", () => {
  assert.deepEqual(deletePickerItems([]), []);
});
