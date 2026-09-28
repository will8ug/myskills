#!/usr/bin/env node
import * as p from "@clack/prompts";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { add } from "./add.ts";
import { list } from "./list.ts";
import { parseArgv, ArgvError, type ParsedArgv } from "./parse-argv.ts";
import { splitAddPositionals } from "./positionals.ts";
import { addReportLines, reportLines } from "./report.ts";
import { resolveScope, ScopeError, skillsDirectoryFor, type ScopeDeps } from "./scope.ts";
import { resolveSource } from "./source.ts";

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

async function promptSkillSource(deps: ScopeDeps): Promise<string | null> {
  const typed = await p.text({ message: "Skill source (path to a local skills repo)", placeholder: "~/skills" });
  if (p.isCancel(typed) || typed.trim() === "") {
    return null;
  }
  return resolveSource(deps, typed);
}

async function resolveSkillsDirectory(deps: ScopeDeps, parsed: ParsedArgv): Promise<string | null> {
  let resolution = await resolveScope(deps, { global: parsed.global, project: parsed.project });
  if (resolution.outcome === "needs-prompt") {
    const skillsDirectory = await promptSkillsDirectory(deps);
    if (skillsDirectory === null) {
      return null;
    }
    return skillsDirectory;
  }
  return resolution.skillsDirectory;
}

async function runList(deps: ScopeDeps, parsed: ParsedArgv): Promise<void> {
  if (parsed.positionals.length > 0) {
    throw new ArgvError(`list takes no positional arguments, got: ${parsed.positionals.join(" ")}`);
  }
  const skillsDirectory = await resolveSkillsDirectory(deps, parsed);
  if (skillsDirectory === null) {
    p.cancel("No scope chosen");
    return;
  }
  for (const line of reportLines(await list({ skillsDirectory }))) {
    console.log(line);
  }
}

async function runAdd(deps: ScopeDeps, parsed: ParsedArgv): Promise<void> {
  const split = splitAddPositionals(parsed.positionals);
  const source = split.source !== null
    ? await resolveSource(deps, split.source)
    : await promptSkillSource(deps);
  if (source === null) {
    p.cancel("No skill source given");
    return;
  }

  const skillsDirectory = await resolveSkillsDirectory(deps, parsed);
  if (skillsDirectory === null) {
    p.cancel("No scope chosen");
    return;
  }

  const report = await add({ source, skillNames: split.skillNames, skillsDirectory });
  for (const line of addReportLines(report)) {
    console.log(line);
  }
}

function printUsage(): void {
  console.log(`myskills - manage installed skills

Usage:
  myskills list [--global | --project <path>]
  myskills add [source] [skill...] [--global | --project <path>]

Subcommands:
  list    show what is installed in a skills directory
  add     install skills by name as links into a skills directory

In add, the first positional is the skill source when it contains a path
separator or starts with ~ or .; bare words are always skill names.

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
  const deps: ScopeDeps = { home: homedir(), cwd: process.cwd(), isDirectory };
  if (parsed.subcommand === "add") {
    await runAdd(deps, parsed);
    return;
  }
  if (parsed.subcommand === "list") {
    await runList(deps, parsed);
    return;
  }
  throw new ArgvError(`Unknown subcommand: ${parsed.subcommand} (available: add, list)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
