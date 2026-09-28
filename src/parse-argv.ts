export type ParsedArgv = {
  subcommand: string | null;
  /** positionals after the subcommand; subcommand-specific validation happens above this layer */
  positionals: string[];
  global: boolean;
  project: string | null;
};

export class ArgvError extends Error {}

export function parseArgv(argv: readonly string[]): ParsedArgv {
  const positionals: string[] = [];
  let global = false;
  let project: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--global") {
      global = true;
    } else if (arg === "--project") {
      const value = argv[i + 1];
      if (value === undefined || value === "") {
        throw new ArgvError("--project requires a path");
      }
      project = value;
      i++;
    } else if (arg.startsWith("--")) {
      throw new ArgvError(`Unknown flag: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  const subcommand = positionals[0] ?? null;
  return { subcommand, positionals: positionals.slice(1), global, project };
}
