import type { PickerItem } from "./picker.ts";
import type { DiscoveredSkill } from "./discovery.ts";

/** The picker entries for the discovered skills: flat, in discovery order, path as hint. */
export function skillPickerItems(
  discovered: readonly DiscoveredSkill[],
  installed: ReadonlySet<string>,
): PickerItem[] {
  return discovered.map((skill) => ({
    value: skill.name,
    label: skill.name,
    hint: skill.relativePath,
    annotation: installed.has(skill.name) ? "already installed" : undefined,
  }));
}
