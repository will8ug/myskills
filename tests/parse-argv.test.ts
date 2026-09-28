import assert from "node:assert/strict";
import { test } from "node:test";
import { ArgvError, parseArgv } from "../src/parse-argv.ts";

test("parses the list subcommand", () => {
  assert.deepEqual(parseArgv(["list"]), {
    subcommand: "list",
    positionals: [],
    global: false,
    project: null,
    copy: false,
    force: false,
  });
});

test("no arguments means no subcommand", () => {
  assert.deepEqual(parseArgv([]), {
    subcommand: null,
    positionals: [],
    global: false,
    project: null,
    copy: false,
    force: false,
  });
});

test("parses --global", () => {
  assert.deepEqual(parseArgv(["list", "--global"]), {
    subcommand: "list",
    positionals: [],
    global: true,
    project: null,
    copy: false,
    force: false,
  });
});

test("parses --project with its path", () => {
  assert.deepEqual(parseArgv(["list", "--project", "/repos/api"]), {
    subcommand: "list",
    positionals: [],
    global: false,
    project: "/repos/api",
    copy: false,
    force: false,
  });
});

test("parses --copy and --force after the subcommand", () => {
  assert.deepEqual(parseArgv(["add", "--copy", "--force"]), {
    subcommand: "add",
    positionals: [],
    global: false,
    project: null,
    copy: true,
    force: true,
  });
});

test("parses --copy and --force before the subcommand", () => {
  const parsed = parseArgv(["--copy", "--force", "add", "tdd"]);
  assert.equal(parsed.subcommand, "add");
  assert.equal(parsed.copy, true);
  assert.equal(parsed.force, true);
});

test("flags may appear before the subcommand", () => {
  const parsed = parseArgv(["--project", "/repos/api", "list"]);
  assert.equal(parsed.subcommand, "list");
  assert.equal(parsed.project, "/repos/api");
});

test("--project may be given a ~ path verbatim; expansion happens in scope resolution", () => {
  const parsed = parseArgv(["list", "--project", "~/work/api"]);
  assert.equal(parsed.project, "~/work/api");
});

test("--project without a value is an error", () => {
  assert.throws(
    () => parseArgv(["list", "--project"]),
    (error: unknown) => error instanceof ArgvError && error.message === "--project requires a path",
  );
});

test("--project with an empty value is an error", () => {
  assert.throws(
    () => parseArgv(["list", "--project", ""]),
    (error: unknown) => error instanceof ArgvError && error.message === "--project requires a path",
  );
});

test("unknown flags are errors", () => {
  assert.throws(
    () => parseArgv(["list", "--verbose"]),
    (error: unknown) => error instanceof ArgvError && error.message === "Unknown flag: --verbose",
  );
});

test("extra positionals are reported for the caller to accept or reject", () => {
  const parsed = parseArgv(["list", "tdd"]);
  assert.equal(parsed.subcommand, "list");
  assert.deepEqual(parsed.positionals, ["tdd"]);
});
