import { readdir } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";

export const SKILL_MANIFEST = "SKILL.md";

export type DiscoveredSkill = {
  /** the skill folder's basename */
  name: string;
  /** the skill folder's path relative to the source root */
  relativePath: string;
};

export class DiscoveryError extends Error {}

/**
 * Derives the skill list from the SKILL.md paths found by the walk (relative to the source root).
 * A SKILL.md nested inside an already-accepted skill's folder belongs to that skill; two accepted
 * skills sharing a folder name are a hard error naming both paths.
 */
export function decideSkills(skillMdPaths: readonly string[]): DiscoveredSkill[] {
  const candidates = [...skillMdPaths].sort((a, b) => {
    const depthDifference = a.split(sep).length - b.split(sep).length;
    if (depthDifference !== 0) return depthDifference;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const accepted: DiscoveredSkill[] = [];
  for (const candidate of candidates) {
    const folder = dirname(candidate);
    if (folder === ".") {
      throw new DiscoveryError(`A ${SKILL_MANIFEST} directly in the source root is not a skill folder`);
    }
    const nestedInsideAccepted = accepted.some((skill) => folder.startsWith(skill.relativePath + sep));
    if (nestedInsideAccepted) continue;
    accepted.push({ name: basename(folder), relativePath: folder });
  }

  const firstPathByName = new Map<string, string>();
  for (const skill of accepted) {
    const firstPath = firstPathByName.get(skill.name);
    if (firstPath !== undefined) {
      throw new DiscoveryError(
        `Duplicate skill name "${skill.name}": "${firstPath}" and "${skill.relativePath}"`,
      );
    }
    firstPathByName.set(skill.name, skill.relativePath);
  }
  return accepted;
}

/**
 * Collects every SKILL.md path below the source root, relative to it. Hidden directories and
 * node_modules are skipped; the source root itself is a container, not a skill.
 */
export async function findSkillMdPaths(sourceRoot: string): Promise<string[]> {
  const manifests: string[] = [];
  await walk(sourceRoot, "", manifests);
  return manifests;
}

async function walk(absoluteDir: string, relativeDir: string, manifests: string[]): Promise<void> {
  for (const entry of await readdir(absoluteDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    if (entry.isFile() && entry.name === SKILL_MANIFEST) {
      if (relativeDir !== "") manifests.push(join(relativeDir, entry.name));
      continue;
    }
    if (entry.isDirectory()) {
      await walk(
        join(absoluteDir, entry.name),
        relativeDir === "" ? entry.name : join(relativeDir, entry.name),
        manifests,
      );
    }
  }
}
