import type { ClassifiedEntry } from "./entry-classification.ts";
import type { PickerItem } from "./picker.ts";
import { describeEntryKind } from "./report.ts";

/** The picker entries for a skills directory's contents: flat, in list order, kind as annotation, link target as hint. */
export function deletePickerItems(entries: readonly ClassifiedEntry[]): PickerItem[] {
  return entries.map((entry) => ({
    value: entry.name,
    label: entry.name,
    annotation: describeEntryKind(entry.kind),
    ...(entry.target !== null ? { hint: entry.target } : {}),
  }));
}
