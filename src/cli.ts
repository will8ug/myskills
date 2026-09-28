#!/usr/bin/env node
import * as p from "@clack/prompts";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { addConfirmations, AddError, discoverSkills, executeAddPlan, findInstalledSkills, planAdd, resolveAddPlan, type InstallMethod } from "./add.ts";
import { skillPickerItems } from "./add-picker-items.ts";
import { deleteConfirmations, DeleteError, executeDeletePlan, planDelete, resolveDeletePlan } from "./delete.ts";
import { deletePickerItems } from "./delete-picker-items.ts";
import { list } from "./list.ts";
import { parseArgv, ArgvError, type ParsedArgv } from "./parse-argv.ts";
import { splitAddPositionals } from "./positionals.ts";
import { pickMany } from "./picker.ts";
import { addConfirmationMessage, addReportLines, deleteConfirmationMessage, deleteReportLines, reportLines } from "./report.ts";
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
    // The --project flag hard-errors instead: a scripted run has no prompt to retry.
    while (true) {
      const typed = await p.text({ message: "Project path", placeholder: "~/some/project" });
      if (p.isCancel(typed) || typed.trim() === "") {
        return null;
      }
      try {
        const resolution = await resolveScope(deps, { project: typed });
        return resolution.outcome === "resolved" ? resolution.skillsDirectory : null;
      } catch (error) {
        if (!(error instanceof ScopeError)) throw error;
        p.log.error(error.message);
      }
    }
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

async function confirmEach(
  items: readonly { name: string }[],
  messageOf: (name: string) => string,
  initialValue: boolean,
): Promise<Set<string> | null> {
  const confirmed = new Set<string>();
  for (const item of items) {
    const answer = await p.confirm({ message: messageOf(item.name), initialValue });
    if (p.isCancel(answer)) {
      return null;
    }
    if (answer) {
      confirmed.add(item.name);
    }
  }
  return confirmed;
}

async function resolveSkillsDirectory(deps: ScopeDeps, parsed: ParsedArgv): Promise<string | null> {
  const resolution = await resolveScope(deps, { global: parsed.global, project: parsed.project });
  if (resolution.outcome === "needs-prompt") {
    const skillsDirectory = await promptSkillsDirectory(deps);
    if (skillsDirectory === null) {
      p.cancel("No scope chosen");
    }
    return skillsDirectory;
  }
  return resolution.skillsDirectory;
}

async function runList(deps: ScopeDeps, parsed: ParsedArgv): Promise<void> {
  if (parsed.positionals.length > 0) {
    throw new ArgvError(`list takes no positional arguments, got: ${parsed.positionals.join(" ")}`);
  }
  if (parsed.copy || parsed.force) {
    throw new ArgvError("list does not accept --copy or --force");
  }
  const skillsDirectory = await resolveSkillsDirectory(deps, parsed);
  if (skillsDirectory === null) return;
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
  if (skillsDirectory === null) return;

  const skillNames = split.skillNames.length > 0
    ? split.skillNames
    : await pickSkillNames(source, skillsDirectory);
  if (skillNames === null) return;

  const method: InstallMethod | null = parsed.copy
    ? "copy"
    : split.skillNames.length > 0
      ? "link"
      : await promptInstallMethod();
  if (method === null) return;

  const plan = await planAdd({ source, skillNames, skillsDirectory, method, force: parsed.force });

  const confirmations = addConfirmations(plan);
  const confirmed = await confirmEach(
    confirmations,
    (name) => addConfirmationMessage(confirmations.find((confirmation) => confirmation.name === name)!),
    true,
  );
  if (confirmed === null) {
    p.cancel("No changes made");
    return;
  }

  const report = await executeAddPlan(resolveAddPlan(plan, confirmed));
  for (const line of addReportLines(report)) {
    console.log(line);
  }
}

async function runDelete(deps: ScopeDeps, parsed: ParsedArgv): Promise<void> {
  if (parsed.copy) {
    throw new ArgvError("delete does not accept --copy");
  }
  const skillsDirectory = await resolveSkillsDirectory(deps, parsed);
  if (skillsDirectory === null) return;

  const skillNames = parsed.positionals.length > 0
    ? parsed.positionals
    : await pickDeleteNames(skillsDirectory);
  if (skillNames === null) return;

  const plan = await planDelete({ skillNames, skillsDirectory, force: parsed.force });

  // Enter must mean NO: a deleted hand-made directory is unrecoverable.
  const confirmations = deleteConfirmations(plan);
  const confirmed = await confirmEach(
    confirmations,
    (name) => deleteConfirmationMessage(confirmations.find((confirmation) => confirmation.name === name)!),
    false,
  );
  if (confirmed === null) {
    p.cancel("No changes made");
    return;
  }

  const report = await executeDeletePlan(resolveDeletePlan(plan, confirmed));
  for (const line of deleteReportLines(report)) {
    console.log(line);
  }
}

async function pickDeleteNames(skillsDirectory: string): Promise<string[] | null> {
  const { entries } = await list({ skillsDirectory });
  if (entries.length === 0) {
    p.cancel(`No skills installed in ${skillsDirectory}`);
    return null;
  }
  const picked = await pickMany({
    message: "Which skills to delete? (a selects all)",
    items: deletePickerItems(entries),
  });
  if (picked.outcome === "cancelled") {
    p.cancel("No skills chosen");
    return null;
  }
  return picked.values;
}

async function promptInstallMethod(): Promise<InstallMethod | null> {
  const method = await p.select<"link" | "copy">({
    message: "Install method?",
    initialValue: "link",
    options: [
      { value: "link", label: "Link", hint: "symlink into the skill source; updates with git pull" },
      { value: "copy", label: "Copy", hint: "independent duplicate of each skill folder" },
    ],
  });
  if (p.isCancel(method)) {
    p.cancel("No method chosen");
    return null;
  }
  return method;
}

async function pickSkillNames(source: string, skillsDirectory: string): Promise<string[] | null> {
  const discovered = await discoverSkills(source);
  const installed = await findInstalledSkills(source, skillsDirectory, discovered);
  const picked = await pickMany({
    message: "Which skills? (a selects all)",
    items: skillPickerItems(discovered, installed),
  });
  if (picked.outcome === "cancelled") {
    p.cancel("No skills chosen");
    return null;
  }
  return picked.values;
}

function printUsage(): void {
  console.log(`myskills - manage installed skills

Usage:
  myskills             with no subcommand, an interactive chooser offers add, delete, and list
  myskills list [--global | --project <path>]
  myskills add [source] [skill...] [--global | --project <path>] [--copy] [--force]
  myskills delete [skill...] [--global | --project <path>] [--force]

Subcommands:
  list    show what is installed in a skills directory
  add     install skills by name into a skills directory
  delete  delete installed skills from a skills directory
  help    print this usage

In add, the first positional is the skill source when it contains a path
separator or starts with ~ or .; bare words are always skill names.
In delete, every positional is a skill name; links go without
confirmation, real directories and files ask first.

Scope:
  (none)               prompted; Project (current folder) preselected, or type a path
  --global             the user-level skills directory (~/.agents/skills)
  --project <path>     a project's skills directory (<path>/.agents/skills)

Install method:
  (none)               Link (symlink into the skill source); prompted in the picker flow
  --copy               Copy: an independent duplicate of each skill folder (add only)
  --force              skip confirmations without asking (add and delete): replace a
                       different link or a real directory; delete real directories and files`);
}

async function promptSubcommand(deps: ScopeDeps, parsed: ParsedArgv): Promise<void> {
  const choice = await p.select<"add" | "delete" | "list">({
    message: "What do you want to do?",
    options: [
      { value: "add", label: "Add", hint: "install skills from a local skill source" },
      { value: "delete", label: "Delete", hint: "delete installed skills" },
      { value: "list", label: "List", hint: "show what is installed" },
    ],
  });
  if (p.isCancel(choice)) {
    p.cancel("Nothing chosen");
    printUsage();
    return;
  }
  if (choice === "add") {
    await runAdd(deps, parsed);
    return;
  }
  if (choice === "delete") {
    await runDelete(deps, parsed);
    return;
  }
  await runList(deps, parsed);
}

async function main(): Promise<void> {
  const parsed = parseArgv(process.argv.slice(2));
  const deps: ScopeDeps = { home: homedir(), cwd: process.cwd(), isDirectory };

  if (parsed.subcommand === null) {
    await promptSubcommand(deps, parsed);
    return;
  }
  if (parsed.subcommand === "add") {
    await runAdd(deps, parsed);
    return;
  }
  if (parsed.subcommand === "delete") {
    await runDelete(deps, parsed);
    return;
  }
  if (parsed.subcommand === "list") {
    await runList(deps, parsed);
    return;
  }
  if (parsed.subcommand === "help") {
    printUsage();
    return;
  }
  throw new ArgvError(`Unknown subcommand: ${parsed.subcommand} (available: add, delete, list, help)`);
}

main().catch((error: unknown) => {
  if (error instanceof AddError && error.partialReport !== null) {
    for (const line of addReportLines(error.partialReport)) {
      console.log(line);
    }
  }
  if (error instanceof DeleteError && error.partialReport !== null) {
    for (const line of deleteReportLines(error.partialReport)) {
      console.log(line);
    }
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
