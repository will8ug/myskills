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
