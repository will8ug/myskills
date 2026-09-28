#!/usr/bin/env node
import * as p from "@clack/prompts";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { list } from "./list.ts";
import { ArgvError, parseArgv } from "./parse-argv.ts";
import { reportLines } from "./report.ts";
import { resolveScope, ScopeError, skillsDirectoryFor, type ScopeDeps } from "./scope.ts";

const isDirectory = (path: string): Promise<boolean> =>
  stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );

async function promptSkillsDirectory(deps: ScopeDeps): Promise<string | null> {
  const choice = await p.select({
    message: "Which skills directory?",
    initialValue: "project",
    options: [
      { value: "project", label: "Project", hint: `current folder: ${skillsDirectoryFor(deps.cwd)}` },
      { value: "global", label: "Global", hint: skillsDirectoryFor(deps.home) },
      { value: "typed", label: "Other project", hint: "type a project path" },
    ],
  });
  if (p.isCancel(choice)) {
    return null;
  }
  if (choice === "typed") {
    const typed = await p.text({ message: "Project path", placeholder: "~/some/project" });
    if (p.isCancel(typed) || typed.trim() === "") {
      return null;
    }
    const resolution = await resolveScope(deps, { project: typed });
    return resolution.outcome === "resolved" ? resolution.skillsDirectory : null;
  }
  const resolution = await resolveScope(deps, choice === "global" ? { global: true } : { project: deps.cwd });
  return resolution.outcome === "resolved" ? resolution.skillsDirectory : null;
}

function printUsage(): void {
  console.log(`myskills - manage installed skills

Usage:
  myskills list [--global | --project <path>]

Subcommands:
  list    show what is installed in a skills directory

Scope:
  (none)               prompted; Project (current folder) preselected, or type a path
  --global             the user-level skills directory (~/.agents/skills)
  --project <path>     a project's skills directory (<path>/.agents/skills)`);
}

async function main(): Promise<void> {
  const parsed = parseArgv(process.argv.slice(2));

  if (parsed.subcommand === null) {
    printUsage();
    return;
  }
  if (parsed.subcommand !== "list") {
    throw new ArgvError(`Unknown subcommand: ${parsed.subcommand} (available: list)`);
  }
  if (parsed.positionals.length > 0) {
    throw new ArgvError(`list takes no positional arguments, got: ${parsed.positionals.join(" ")}`);
  }

  const deps: ScopeDeps = { home: homedir(), cwd: process.cwd(), isDirectory };
  let resolution = await resolveScope(deps, { global: parsed.global, project: parsed.project });
  if (resolution.outcome === "needs-prompt") {
    const skillsDirectory = await promptSkillsDirectory(deps);
    if (skillsDirectory === null) {
      p.cancel("No scope chosen");
      return;
    }
    resolution = { outcome: "resolved", skillsDirectory };
  }

  for (const line of reportLines(await list({ skillsDirectory: resolution.skillsDirectory }))) {
    console.log(line);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
