export type EntryKind = "link" | "broken-link" | "directory" | "file";

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
  isDirectory: boolean;
};

export function classifyEntry(name: string, facts: EntryFacts): ClassifiedEntry {
  if (facts.isSymbolicLink) {
    if (facts.target === null) {
      return { name, kind: "broken-link", target: null };
    }
    return facts.targetExists
      ? { name, kind: "link", target: facts.target }
      : { name, kind: "broken-link", target: facts.target };
  }
  if (facts.isDirectory) {
    return { name, kind: "directory", target: null };
  }
  return { name, kind: "file", target: null };
}
