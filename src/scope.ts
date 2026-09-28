import { join, resolve } from "node:path";

export class ScopeError extends Error {}

export type ScopeOptions = {
  global?: boolean;
  project?: string | null;
};

export type ScopeDeps = {
  home: string;
  cwd: string;
  isDirectory: (path: string) => Promise<boolean>;
};

export type ResolvedScope =
  | { outcome: "resolved"; skillsDirectory: string }
  | { outcome: "needs-prompt" };

export function skillsDirectoryFor(root: string): string {
  return join(root, ".agents", "skills");
}

export function expandTilde(input: string, home: string): string {
  if (input === "~") return home;
  if (input.startsWith("~/")) return join(home, input.slice(2));
  return input;
}

export async function resolveScope(deps: ScopeDeps, options: ScopeOptions): Promise<ResolvedScope> {
  const { global, project } = options;
  if (global && project) {
    throw new ScopeError("--global and --project cannot be used together");
  }
  if (global) {
    return { outcome: "resolved", skillsDirectory: skillsDirectoryFor(deps.home) };
  }
  if (project) {
    const root = resolve(deps.cwd, expandTilde(project, deps.home));
    if (!(await deps.isDirectory(root))) {
      throw new ScopeError(`Project path does not exist or is not a directory: ${root}`);
    }
    return { outcome: "resolved", skillsDirectory: skillsDirectoryFor(root) };
  }
  return { outcome: "needs-prompt" };
}
