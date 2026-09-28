import type { AddReport } from "./add.ts";
import type { TargetEntryConflict } from "./entry-classification.ts";
import type { ListReport } from "./list.ts";

/** Pure rendering of a list report as output lines; printing and exit codes stay in the shell. */
export function reportLines(report: ListReport): string[] {
  const lines = [report.skillsDirectory];
  if (report.entries.length === 0) {
    lines.push("  no skills installed");
    return lines;
  }
  const nameWidth = Math.max(...report.entries.map((entry) => entry.name.length));
  for (const entry of report.entries) {
    const kind = entry.kind === "broken-link" ? "broken link" : entry.kind;
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
    lines.push(`  ${entry.name.padEnd(nameWidth)}  ${outcome} -> ${entry.target}`);
  }
  return lines;
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
