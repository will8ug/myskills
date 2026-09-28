import type { AddConfirmation, AddReport, AddReportEntry, InstallMethod } from "./add.ts";
import type { DeleteConfirmation, DeleteReport } from "./delete.ts";
import type { EntryKind, TargetEntryConflict } from "./entry-classification.ts";
import type { ListReport } from "./list.ts";

/** Pure rendering of an entry kind as user-facing wording; classification stays structural. */
export function describeEntryKind(kind: EntryKind): string {
  return kind === "broken-link" ? "broken link" : kind;
}

/** Pure rendering of a list report as output lines; printing and exit codes stay in the shell. */
export function reportLines(report: ListReport): string[] {
  const lines = [report.skillsDirectory];
  if (report.entries.length === 0) {
    lines.push("  no skills installed");
    return lines;
  }
  const nameWidth = Math.max(...report.entries.map((entry) => entry.name.length));
  for (const entry of report.entries) {
    const kind = describeEntryKind(entry.kind);
    const target = entry.target !== null ? ` -> ${entry.target}` : "";
    lines.push(`  ${entry.name.padEnd(nameWidth)}  ${kind}${target}`);
  }
  return lines;
}

/** Pure rendering of an add report as output lines; printing stays in the shell. */
export function addReportLines(report: AddReport): string[] {
  const lines = [report.skillsDirectory];
  const nameWidth = Math.max(...report.entries.map((entry) => entry.name.length));
  for (const entry of report.entries) {
    const outcome = entry.outcome === "already-installed" ? "already installed" : entry.outcome;
    lines.push(`  ${entry.name.padEnd(nameWidth)}  ${outcome}${addOutcomeDetail(report.method, entry)}`);
  }
  return lines;
}

/** An already-installed entry is always a Link, whatever method this run used. */
function addOutcomeDetail(method: InstallMethod, entry: AddReportEntry): string {
  if (entry.outcome === "skipped") return "";
  if (method === "copy" && (entry.outcome === "installed" || entry.outcome === "replaced")) {
    return ` (copy of ${entry.sourcePath})`;
  }
  return ` -> ${entry.sourcePath}`;
}

export function addConfirmationMessage(confirmation: AddConfirmation): string {
  return `Replace ${confirmation.name} (${describeTargetEntryConflict(confirmation.conflict)})?`;
}

/** Pure rendering of a conflicting target entry as user-facing wording; classification stays structural. */
export function describeTargetEntryConflict(conflict: TargetEntryConflict): string {
  switch (conflict.entry) {
    case "link":
      return `a different link -> ${conflict.target}`;
    case "broken-link":
      return "a link whose target cannot be read";
    case "directory":
      return "a real directory";
    case "file":
      return "a file";
  }
}

/** Pure rendering of a delete report as output lines; printing stays in the shell. */
export function deleteReportLines(report: DeleteReport): string[] {
  const lines = [report.skillsDirectory];
  const nameWidth = Math.max(...report.entries.map((entry) => entry.name.length));
  for (const entry of report.entries) {
    const detail = entry.outcome === "skipped" ? "" : ` (${describeEntryKind(entry.kind)})`;
    lines.push(`  ${entry.name.padEnd(nameWidth)}  ${entry.outcome}${detail}`);
  }
  return lines;
}

export function deleteConfirmationMessage(confirmation: DeleteConfirmation): string {
  return `Delete ${confirmation.name} (${confirmation.kind === "directory" ? "a real directory" : "a file"})?`;
}
