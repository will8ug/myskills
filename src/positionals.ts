export type SplitPositionals = {
  /** the skill source positional, or null when the shell must prompt for it */
  source: string | null;
  skillNames: string[];
};

/** Purely syntactic: a path separator, a leading ~, or a leading . makes the first positional source-shaped. */
export function isSourceShaped(arg: string): boolean {
  return arg.includes("/") || arg.startsWith("~") || arg.startsWith(".");
}

/** Only the first positional can be the source; every other positional is a skill name. */
export function splitAddPositionals(positionals: readonly string[]): SplitPositionals {
  const [first] = positionals;
  if (first !== undefined && isSourceShaped(first)) {
    return { source: first, skillNames: positionals.slice(1) };
  }
  return { source: null, skillNames: [...positionals] };
}
