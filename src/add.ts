import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { classifyTargetEntry, type TargetEntryFacts, type TargetEntryState } from "./entry-classification.ts";
import { decideSkills, DiscoveryError, findSkillMdPaths, type DiscoveredSkill } from "./discovery.ts";
import { describeTargetEntryConflict } from "./report.ts";

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
 * checks every target entry state, collecting all conflicts. Plan building performs no writes —
 * execution is a separate step that only runs on a complete plan, so a failing run changes nothing.
 */
export async function planAdd(options: AddOptions): Promise<AddPlan> {
  const { source, skillNames, skillsDirectory } = options;

  const discovered = await discoverSkills(source);

  const byName = new Map(discovered.map((skill) => [skill.name, skill]));
  const targetStates = new Map<string, TargetEntryState>();
  for (const name of new Set(skillNames)) {
    const skill = byName.get(name);
    if (skill === undefined) continue;
    targetStates.set(name, await classifySkillTarget(source, skillsDirectory, skill));
  }

  return decideAddPlan({ source, skillsDirectory, discovered, skillNames, targetStates });
}

/**
 * The pure decision behind planAdd: resolves the requested names against the discovered skills and
 * checks every target entry state, collecting all conflicts into one error. `targetStates` must
 * cover every requested name that appears in `discovered`.
 */
export function decideAddPlan(input: {
  source: string;
  skillsDirectory: string;
  discovered: readonly DiscoveredSkill[];
  skillNames: readonly string[];
  targetStates: ReadonlyMap<string, TargetEntryState>;
}): AddPlan {
  const { source, skillsDirectory, discovered, skillNames, targetStates } = input;

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
    const state = targetStates.get(name);
    if (skill === undefined || state === undefined) continue;
    if (state.kind === "conflict") {
      conflicts.push(`  ${name}: ${describeTargetEntryConflict(state)}`);
      continue;
    }
    installs.push({
      name,
      sourcePath: join(source, skill.relativePath),
      outcome: state.kind === "same-link" ? "already-installed" : "install",
    });
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

/**
 * Which of the discovered skills already sit in the skills directory as a same-source link.
 * Any differing entry (other link, real directory, file) is deliberately not "installed":
 * those surface as conflicts at plan time.
 */
export async function findInstalledSkills(
  source: string,
  skillsDirectory: string,
  discovered: readonly DiscoveredSkill[],
): Promise<ReadonlySet<string>> {
  const installed = new Set<string>();
  for (const skill of discovered) {
    if ((await classifySkillTarget(source, skillsDirectory, skill)).kind === "same-link") {
      installed.add(skill.name);
    }
  }
  return installed;
}

async function classifySkillTarget(
  source: string,
  skillsDirectory: string,
  skill: DiscoveredSkill,
): Promise<TargetEntryState> {
  const expectedTarget = join(source, skill.relativePath);
  const facts = await readTargetEntryFacts(join(skillsDirectory, skill.name), skillsDirectory);
  return classifyTargetEntry(expectedTarget, facts);
}

export async function discoverSkills(source: string): Promise<DiscoveredSkill[]> {
  let manifests: string[];
  try {
    manifests = await findSkillMdPaths(source);
  } catch (error) {
    if (isErrnoException(error, "ENOENT") || isErrnoException(error, "ENOTDIR")) {
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
    if (isErrnoException(error, "ENOENT")) {
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

function isErrnoException(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}
