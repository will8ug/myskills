import assert from "node:assert/strict";
import { test } from "node:test";
import { ArgvError, parseArgv } from "../src/parse-argv.ts";

test("parses the list subcommand", () => {
  assert.deepEqual(parseArgv(["list"]), {
    subcommand: "list",
    positionals: [],
    global: false,
    project: null,
  });
});

test("no arguments means no subcommand", () => {
  assert.deepEqual(parseArgv([]), {
    subcommand: null,
    positionals: [],
    global: false,
    project: null,
  });
});

test("parses --global", () => {
  assert.deepEqual(parseArgv(["list", "--global"]), {
    subcommand: "list",
    positionals: [],
    global: true,
    project: null,
  });
});

test("parses --project with its path", () => {
  assert.deepEqual(parseArgv(["list", "--project", "/repos/api"]), {
    subcommand: "list",
    positionals: [],
    global: false,
    project: "/repos/api",
  });
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
    () => parseArgv(["list", "--copy"]),
    (error: unknown) => error instanceof ArgvError && error.message === "Unknown flag: --copy",
  );
});

test("extra positionals are reported for the caller to accept or reject", () => {
  const parsed = parseArgv(["list", "tdd"]);
  assert.equal(parsed.subcommand, "list");
  assert.deepEqual(parsed.positionals, ["tdd"]);
});
