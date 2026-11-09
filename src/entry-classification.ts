export type EntryKind = "link" | "hollow-link" | "broken-link" | "directory" | "file";

export type ClassifiedEntry = {
  name: string;
  kind: EntryKind;
  target: string | null;
};

export type EntryFacts = {
  isSymbolicLink: boolean;
  /** readlink result; null when the entry is not a symlink or the link vanished mid-read */
  target: string | null;
  /** whether stat on the entry succeeds, i.e. the symlink's target exists */
  targetExists: boolean;
  /** whether the symlink target still contains a SKILL.md */
  manifestPresent: boolean;
  isDirectory: boolean;
};

export function classifyEntry(name: string, facts: EntryFacts): ClassifiedEntry {
  if (facts.isSymbolicLink) {
    if (facts.target === null || !facts.targetExists) {
      return { name, kind: "broken-link", target: facts.target };
    }
    return facts.manifestPresent
      ? { name, kind: "link", target: facts.target }
      : { name, kind: "hollow-link", target: facts.target };
  }
  if (facts.isDirectory) {
    return { name, kind: "directory", target: null };
  }
  return { name, kind: "file", target: null };
}

export type TargetEntryFacts = {
  /** whether any entry exists at the target path (lstat succeeds) */
  exists: boolean;
  isSymbolicLink: boolean;
  /** lstat says the entry is a real directory; false for symlinks */
  isDirectory: boolean;
  /** readlink resolved to an absolute path; null when absent, not a symlink, or unreadable */
  resolvedLinkTarget: string | null;
};

export type TargetEntryConflict =
  | { kind: "conflict"; entry: "link"; target: string }
  | { kind: "conflict"; entry: "broken-link"; target: string | null }
  | { kind: "conflict"; entry: "directory" }
  | { kind: "conflict"; entry: "file" };

export type TargetEntryState =
  | { kind: "absent" }
  | { kind: "same-link" }
  | TargetEntryConflict;

/** Decides how an install interacts with whatever already sits at the target path. */
export function classifyTargetEntry(expectedTarget: string, facts: TargetEntryFacts): TargetEntryState {
  if (!facts.exists) return { kind: "absent" };
  if (facts.isSymbolicLink) {
    if (facts.resolvedLinkTarget === expectedTarget) return { kind: "same-link" };
    return facts.resolvedLinkTarget === null
      ? { kind: "conflict", entry: "broken-link", target: null }
      : { kind: "conflict", entry: "link", target: facts.resolvedLinkTarget };
  }
  return facts.isDirectory
    ? { kind: "conflict", entry: "directory" }
    : { kind: "conflict", entry: "file" };
}
