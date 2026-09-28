import { cp, lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { classifyTargetEntry, type TargetEntryConflict, type TargetEntryFacts, type TargetEntryState } from "./entry-classification.ts";
import { decideSkills, DiscoveryError, findSkillMdPaths, type DiscoveredSkill } from "./discovery.ts";

export class AddError extends Error {
  readonly partialReport: AddReport | null;
  constructor(message: string, partialReport: AddReport | null = null) {
    super(message);
    this.partialReport = partialReport;
  }
}

export type InstallMethod = "link" | "copy";

export type AddOptions = {
  /** absolute path to the skill source root */
  source: string;
  skillNames: readonly string[];
  /** absolute path to the skills directory */
  skillsDirectory: string;
  method: InstallMethod;
  force: boolean;
};

export type PlannedInstall =
  | { name: string; sourcePath: string; action: "install" }
  | { name: string; sourcePath: string; action: "already-installed" }
  | { name: string; sourcePath: string; action: "replace" }
  | { name: string; sourcePath: string; action: "confirm-replace"; conflict: TargetEntryConflict };

export type AddPlan = {
  skillsDirectory: string;
  method: InstallMethod;
  installs: PlannedInstall[];
};

export type AddConfirmation = {
  name: string;
  conflict: TargetEntryConflict;
};

export type ResolvedInstall = {
  name: string;
  sourcePath: string;
  action: "install" | "replace" | "already-installed" | "skip";
};

export type ResolvedAddPlan = {
  skillsDirectory: string;
  method: InstallMethod;
  installs: ResolvedInstall[];
};

export type AddReportEntry = {
  name: string;
  outcome: "installed" | "replaced" | "already-installed" | "skipped";
  /** the skill's folder in the source: the link target for a Link, the copied origin for a Copy */
  sourcePath: string;
};

export type AddReport = {
  skillsDirectory: string;
  method: InstallMethod;
  entries: AddReportEntry[];
};

const outcomeForAction: Record<ResolvedInstall["action"], AddReportEntry["outcome"]> = {
  install: "installed",
  replace: "replaced",
  "already-installed": "already-installed",
  skip: "skipped",
};

/**
 * Validates the whole run up front: resolves the requested names against the discovered skills and
 * checks every target entry state, turning conflicts into pending confirmations or (with force)
 * planned replacements. Plan building performs no writes — execution is a separate step that only
 * runs on a complete plan.
 */
export async function planAdd(options: AddOptions): Promise<AddPlan> {
  const { source, skillNames, skillsDirectory, method, force } = options;

  const discovered = await discoverSkills(source);

  const byName = new Map(discovered.map((skill) => [skill.name, skill]));
  const targetStates = new Map<string, TargetEntryState>();
  for (const name of new Set(skillNames)) {
    const skill = byName.get(name);
    if (skill === undefined) continue;
    targetStates.set(name, await classifySkillTarget(source, skillsDirectory, skill));
  }

  return decideAddPlan({ source, skillsDirectory, method, force, discovered, skillNames, targetStates });
}

/**
 * The pure decision behind planAdd: resolves the requested names against the discovered skills and
 * decides each install's action from its target entry state. `targetStates` must cover every
 * requested name that appears in `discovered`.
 */
export function decideAddPlan(input: {
  source: string;
  skillsDirectory: string;
  method: InstallMethod;
  force: boolean;
  discovered: readonly DiscoveredSkill[];
  skillNames: readonly string[];
  targetStates: ReadonlyMap<string, TargetEntryState>;
}): AddPlan {
  const { source, skillsDirectory, method, force, discovered, skillNames, targetStates } = input;

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

  const installs: PlannedInstall[] = [];
  for (const name of new Set(skillNames)) {
    const skill = byName.get(name);
    const state = targetStates.get(name);
    if (skill === undefined || state === undefined) continue;
    const sourcePath = join(source, skill.relativePath);
    if (state.kind === "same-link") {
      installs.push({ name, sourcePath, action: "already-installed" });
      continue;
    }
    if (state.kind === "absent") {
      installs.push({ name, sourcePath, action: "install" });
      continue;
    }
    installs.push(
      force
        ? { name, sourcePath, action: "replace" }
        : { name, sourcePath, action: "confirm-replace", conflict: state },
    );
  }

  return { skillsDirectory, method, installs };
}

/** The replacements still awaiting a decision, in request order. */
export function addConfirmations(plan: AddPlan): AddConfirmation[] {
  const confirmations: AddConfirmation[] = [];
  for (const install of plan.installs) {
    if (install.action === "confirm-replace") {
      confirmations.push({ name: install.name, conflict: install.conflict });
    }
  }
  return confirmations;
}

export function resolveAddPlan(plan: AddPlan, confirmed: ReadonlySet<string>): ResolvedAddPlan {
  const installs: ResolvedInstall[] = plan.installs.map((install): ResolvedInstall => ({
    name: install.name,
    sourcePath: install.sourcePath,
    action: install.action === "confirm-replace"
      ? confirmed.has(install.name)
        ? "replace"
        : "skip"
      : install.action,
  }));
  return { skillsDirectory: plan.skillsDirectory, method: plan.method, installs };
}

/** The only write site: nothing before execution touches the filesystem. */
export async function executeAddPlan(resolved: ResolvedAddPlan): Promise<AddReport> {
  await mkdir(resolved.skillsDirectory, { recursive: true });
  const entries: AddReportEntry[] = [];
  for (const install of resolved.installs) {
    if (install.action === "install" || install.action === "replace") {
      try {
        await createEntry(resolved, install);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new AddError(
          reason,
          entries.length > 0
            ? { skillsDirectory: resolved.skillsDirectory, method: resolved.method, entries }
            : null,
        );
      }
    }
    entries.push({ name: install.name, outcome: outcomeForAction[install.action], sourcePath: install.sourcePath });
  }
  return { skillsDirectory: resolved.skillsDirectory, method: resolved.method, entries };
}

async function createEntry(resolved: ResolvedAddPlan, install: ResolvedInstall): Promise<void> {
  const entryPath = join(resolved.skillsDirectory, install.name);
  if (install.action === "replace") {
    // rm on a symlink removes the link only; the skill source is never touched.
    await rm(entryPath, { recursive: true, force: true });
  }
  if (resolved.method === "copy") {
    try {
      await cp(install.sourcePath, entryPath, { recursive: true });
    } catch (error) {
      throw new AddError(
        `Failed to copy ${install.sourcePath} to ${entryPath}: ${error instanceof Error ? error.message : error}.`,
      );
    }
    return;
  }
  try {
    await symlink(install.sourcePath, entryPath, "dir");
  } catch (error) {
    throw new AddError(
      `Failed to create link ${entryPath}: ${error instanceof Error ? error.message : error}. Retry with --copy.`,
    );
  }
}

/**
 * Which of the discovered skills already sit in the skills directory as a same-source link.
 * A Copy at the target is deliberately not "installed": stateless per ADR 0002, it is
 * indistinguishable from a hand-made directory.
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
