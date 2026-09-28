import { resolve } from "node:path";
import { expandTilde } from "./scope.ts";

export class SourceError extends Error {}

export type SourceDeps = {
  home: string;
  cwd: string;
  isDirectory: (path: string) => Promise<boolean>;
};

/** Expands a leading ~, resolves against cwd, and validates the source exists as a directory. */
export async function resolveSource(deps: SourceDeps, input: string): Promise<string> {
  const absolute = resolve(deps.cwd, expandTilde(input, deps.home));
  if (!(await deps.isDirectory(absolute))) {
    throw new SourceError(`Skill source does not exist or is not a directory: ${absolute}`);
  }
  return absolute;
}
