import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ClassifiedEntry, EntryKind } from "./entry-classification.ts";
import { list } from "./list.ts";

export class DeleteError extends Error {
  readonly partialReport: DeleteReport | null;
  constructor(message: string, partialReport: DeleteReport | null = null) {
    super(message);
    this.partialReport = partialReport;
  }
}

export type DeleteOptions = {
  skillNames: readonly string[];
  /** absolute path to the skills directory */
  skillsDirectory: string;
  force: boolean;
};

export type PlannedRemoval =
  | { name: string; kind: EntryKind; action: "remove" }
  | { name: string; kind: "directory" | "file"; action: "confirm-remove" };

export type DeletePlan = {
  skillsDirectory: string;
  removals: PlannedRemoval[];
};

export type DeleteConfirmation = {
  name: string;
  kind: "directory" | "file";
};

export type ResolvedRemoval = {
  name: string;
  kind: EntryKind;
  action: "remove" | "skip";
};

export type ResolvedDeletePlan = {
  skillsDirectory: string;
  removals: ResolvedRemoval[];
};

export type DeleteReportEntry = {
  name: string;
  kind: EntryKind;
  outcome: "deleted" | "skipped";
};

export type DeleteReport = {
  skillsDirectory: string;
  entries: DeleteReportEntry[];
};

const outcomeForAction: Record<ResolvedRemoval["action"], DeleteReportEntry["outcome"]> = {
  remove: "deleted",
  skip: "skipped",
};

/**
 * Validates the whole run up front: resolves the requested names against the skills directory's
 * entries, turning real directories and files into pending confirmations or (with force) planned
 * removals. Plan building performs no writes — execution is a separate step that only runs on a
 * complete plan.
 */
export async function planDelete(options: DeleteOptions): Promise<DeletePlan> {
  const { skillNames, skillsDirectory, force } = options;
  return decideDeletePlan({ skillNames, skillsDirectory, force, entries: (await list({ skillsDirectory })).entries });
}

/**
 * The pure decision behind planDelete: resolves the requested names against the listed entries and
 * decides each removal's action from its entry kind.
 */
export function decideDeletePlan(input: {
  skillNames: readonly string[];
  skillsDirectory: string;
  force: boolean;
  entries: readonly ClassifiedEntry[];
}): DeletePlan {
  const { skillNames, skillsDirectory, force, entries } = input;

  if (skillNames.length === 0) {
    throw new DeleteError("No skill names given.");
  }
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const requested = [...new Set(skillNames)];
  const unknown = requested.filter((name) => !byName.has(name));
  if (unknown.length > 0) {
    throw new DeleteError(
      `Not installed in ${skillsDirectory}: ${unknown.join(", ")}. Present entries: ${presentEntries(entries)}`,
    );
  }

  const removals: PlannedRemoval[] = [];
  for (const name of requested) {
    const entry = byName.get(name);
    if (entry === undefined) continue;
    if (entry.kind === "link" || entry.kind === "broken-link" || entry.kind === "hollow-link") {
      removals.push({ name, kind: entry.kind, action: "remove" });
      continue;
    }
    removals.push(force ? { name, kind: entry.kind, action: "remove" } : { name, kind: entry.kind, action: "confirm-remove" });
  }

  return { skillsDirectory, removals };
}

/** The removals still awaiting a decision, in request order. */
export function deleteConfirmations(plan: DeletePlan): DeleteConfirmation[] {
  const confirmations: DeleteConfirmation[] = [];
  for (const removal of plan.removals) {
    if (removal.action === "confirm-remove") {
      confirmations.push({ name: removal.name, kind: removal.kind });
    }
  }
  return confirmations;
}

export function resolveDeletePlan(plan: DeletePlan, confirmed: ReadonlySet<string>): ResolvedDeletePlan {
  const removals: ResolvedRemoval[] = plan.removals.map((removal): ResolvedRemoval => ({
    name: removal.name,
    kind: removal.kind,
    action: removal.action === "confirm-remove"
      ? confirmed.has(removal.name)
        ? "remove"
        : "skip"
      : removal.action,
  }));
  return { skillsDirectory: plan.skillsDirectory, removals };
}

/** The only write site: nothing before execution touches the filesystem. */
export async function executeDeletePlan(resolved: ResolvedDeletePlan): Promise<DeleteReport> {
  const entries: DeleteReportEntry[] = [];
  for (const removal of resolved.removals) {
    if (removal.action === "remove") {
      const entryPath = join(resolved.skillsDirectory, removal.name);
      try {
        // rm on a symlink removes the link only; the skill source is never touched.
        await rm(entryPath, { recursive: true, force: true });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new DeleteError(
          `Failed to delete ${entryPath}: ${reason}.`,
          entries.length > 0 ? { skillsDirectory: resolved.skillsDirectory, entries } : null,
        );
      }
    }
    entries.push({
      name: removal.name,
      kind: removal.kind,
      outcome: outcomeForAction[removal.action],
    });
  }
  return { skillsDirectory: resolved.skillsDirectory, entries };
}

function presentEntries(entries: readonly ClassifiedEntry[]): string {
  return entries.length === 0 ? "none" : entries.map((entry) => entry.name).join(", ");
}
