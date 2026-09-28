import { readdir, readlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { classifyEntry, type ClassifiedEntry } from "./entry-classification.ts";

export type ListOptions = {
  skillsDirectory: string;
};

export type ListReport = {
  skillsDirectory: string;
  entries: ClassifiedEntry[];
};

/** Read-only. Never prompts, never creates anything; a missing skills directory is an empty report. */
export async function list(options: ListOptions): Promise<ListReport> {
  const { skillsDirectory } = options;

  let dirents;
  try {
    dirents = await readdir(skillsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return { skillsDirectory, entries: [] };
    }
    throw error;
  }

  const entries = await Promise.all(
    dirents.map((dirent) => classifyDirent(skillsDirectory, dirent.name, dirent.isSymbolicLink(), dirent.isDirectory())),
  );
  entries.sort(byName);
  return { skillsDirectory, entries };
}

async function classifyDirent(
  skillsDirectory: string,
  name: string,
  isSymbolicLink: boolean,
  isDirectory: boolean,
): Promise<ClassifiedEntry> {
  const entryPath = join(skillsDirectory, name);
  if (isSymbolicLink) {
    const target = await readlink(entryPath).catch(() => null);
    let targetExists = false;
    let targetIsDirectory = false;
    try {
      const targetStat = await stat(entryPath);
      targetExists = true;
      targetIsDirectory = targetStat.isDirectory();
    } catch {
      // stat on a symlink follows the link; failure means the target is gone
    }
    return classifyEntry(name, { isSymbolicLink, target, targetExists, isDirectory: targetIsDirectory });
  }
  return classifyEntry(name, { isSymbolicLink, target: null, targetExists: false, isDirectory });
}

function byName(a: ClassifiedEntry, b: ClassifiedEntry): number {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}
