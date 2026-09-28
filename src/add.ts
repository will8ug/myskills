import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { classifyTargetEntry, type TargetEntryFacts } from "./entry-classification.ts";
import { decideSkills, DiscoveryError, findSkillMdPaths, type DiscoveredSkill } from "./discovery.ts";

export class AddError extends Error {}

export type AddOptions = {
  /** absolute path to the skill source root */
  source: string;
  skillNames: readonly string[];
  /** absolute path to the skills directory */
  skillsDirectory: string;
};

export type PlannedInstall = {
  name: string;
  /** the skill's folder in the skill source, absolute */
  sourcePath: string;
  outcome: "install" | "already-installed";
};

export type AddPlan = {
  skillsDirectory: string;
  installs: PlannedInstall[];
};

export type AddReportEntry = {
  name: string;
  outcome: "installed" | "already-installed";
  target: string;
};

export type AddReport = {
  skillsDirectory: string;
  entries: AddReportEntry[];
};

/**
 * Validates the whole run up front: resolves the requested names against the discovered skills and
 * checks every target entry state, collecting all conflicts. Execution only runs when no conflict
 * was found, so a failing run changes nothing. Ticket 04 replaces the abort with confirmations,
 * which is why plan building stays separate from execution.
 */
export async function planAdd(options: AddOptions): Promise<AddPlan> {
  const { source, skillNames, skillsDirectory } = options;

  const discovered = await discoverSkills(source);

  if (skillNames.length === 0) {
    throw new AddError(`No skill names given. Available skills: ${availableSkills(discovered)}`);
  }
  const byName = new Map(discovered.map((skill) => [skill.name, skill]));
  const unknown = skillNames.filter((name) => !byName.has(name));
  if (unknown.length > 0) {
    throw new AddError(
      `Unknown skill name(s): ${unknown.join(", ")}. Available skills: ${availableSkills(discovered)}`,
    );
  }

  const conflicts: string[] = [];
  const installs: PlannedInstall[] = [];
  for (const name of new Set(skillNames)) {
    const skill = byName.get(name);
    if (skill === undefined) continue;
    const sourcePath = join(source, skill.relativePath);
    const facts = await readTargetEntryFacts(join(skillsDirectory, name), skillsDirectory);
    const state = classifyTargetEntry(sourcePath, facts);
    if (state.kind === "conflict") {
      conflicts.push(`  ${name}: ${state.description}`);
      continue;
    }
    installs.push({ name, sourcePath, outcome: state.kind === "same-link" ? "already-installed" : "install" });
  }
  if (conflicts.length > 0) {
    throw new AddError(`Refusing to install; conflicting entries in ${skillsDirectory}:\n${conflicts.join("\n")}`);
  }

  return { skillsDirectory, installs };
}

/** Only execution writes anything: the skills directory is created on demand, then the links. */
export async function executeAddPlan(plan: AddPlan): Promise<AddReport> {
  await mkdir(plan.skillsDirectory, { recursive: true });
  const entries: AddReportEntry[] = [];
  for (const install of plan.installs) {
    if (install.outcome === "install") {
      await symlink(install.sourcePath, join(plan.skillsDirectory, install.name), "dir");
    }
    entries.push({ name: install.name, outcome: install.outcome === "install" ? "installed" : "already-installed", target: install.sourcePath });
  }
  return { skillsDirectory: plan.skillsDirectory, entries };
}

export async function add(options: AddOptions): Promise<AddReport> {
  return executeAddPlan(await planAdd(options));
}

async function discoverSkills(source: string): Promise<DiscoveredSkill[]> {
  let manifests: string[];
  try {
    manifests = await findSkillMdPaths(source);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      throw new AddError(`Skill source does not exist or is not a directory: ${source}`);
    }
    throw error;
  }

  let discovered: DiscoveredSkill[];
  try {
    discovered = decideSkills(manifests);
  } catch (error) {
    if (error instanceof DiscoveryError) {
      throw new AddError(`${error.message} (skill source: ${source})`);
    }
    throw error;
  }

  if (discovered.length === 0) {
    throw new AddError(`No skills found in skill source: ${source}`);
  }
  return discovered;
}

async function readTargetEntryFacts(entryPath: string, skillsDirectory: string): Promise<TargetEntryFacts> {
  let entry;
  try {
    entry = await lstat(entryPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { exists: false, isSymbolicLink: false, isDirectory: false, resolvedLinkTarget: null };
    }
    throw error;
  }
  if (!entry.isSymbolicLink()) {
    return { exists: true, isSymbolicLink: false, isDirectory: entry.isDirectory(), resolvedLinkTarget: null };
  }
  const rawTarget = await readlink(entryPath).catch(() => null);
  return {
    exists: true,
    isSymbolicLink: true,
    isDirectory: false,
    resolvedLinkTarget: rawTarget === null ? null : resolve(skillsDirectory, rawTarget),
  };
}

function availableSkills(discovered: readonly DiscoveredSkill[]): string {
  return discovered.map((skill) => skill.name).join(", ");
}
