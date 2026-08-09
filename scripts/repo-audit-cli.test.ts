import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  EXIT_ERROR,
  EXIT_FINDINGS,
  EXIT_OK,
  parseArgs,
  runRepoAudit,
  USAGE,
  UsageError,
} from "./repo-audit.ts";
import {
  cleanupFixtures,
  commitFile,
  createMergeConflict,
  gitOrThrow,
  makeRepo,
  makeRepoWithRemote,
  makeTempDir,
  writeFile,
} from "./__tests__/git-fixtures.ts";

afterAll(() => {
  cleanupFixtures();
});

const REPO_ROOT = resolve(import.meta.dir, "..");
const CLI = resolve(REPO_ROOT, "bin/anvil.ts");

function argv(...args: string[]): string[] {
  return ["bun", "repo-audit.ts", ...args];
}

// ─── Argument parsing ───────────────────────────────────────────────────────

test("the forwarded `audit` subcommand token is consumed", () => {
  const parsed = parseArgs(argv("audit", "--target", "./repo"));
  expect(parsed.projectPath).toBe("./repo");
});

test("target defaults to the current directory and accepts a positional", () => {
  expect(parseArgs(argv("audit")).projectPath).toBe(".");
  expect(parseArgs(argv("audit", "./somewhere")).projectPath).toBe(
    "./somewhere",
  );
});

test("defaults match the documented contract", () => {
  const parsed = parseArgs(argv("audit"));
  expect(parsed).toEqual({
    projectPath: ".",
    json: false,
    ci: false,
    failOn: "high",
    verifyRemote: false,
    includeUnreachable: false,
    remote: "origin",
    defaultBranch: null,
    reflogDays: 30,
    staleFetchHours: 24,
    outputFile: null,
  });
});

test("every documented flag parses", () => {
  const parsed = parseArgs(
    argv(
      "audit",
      "--target",
      "/repo",
      "--json",
      "--ci",
      "--fail-on",
      "medium",
      "--verify-remote",
      "--include-unreachable",
      "--remote",
      "upstream",
      "--default-branch",
      "trunk",
      "--reflog-days",
      "7",
      "--stale-fetch-hours",
      "1",
      "--output",
      "out.json",
    ),
  );

  expect(parsed).toEqual({
    projectPath: "/repo",
    json: true,
    ci: true,
    failOn: "medium",
    verifyRemote: true,
    includeUnreachable: true,
    remote: "upstream",
    defaultBranch: "trunk",
    reflogDays: 7,
    staleFetchHours: 1,
    outputFile: "out.json",
  });
});

test("invalid arguments raise a usage error rather than being ignored", () => {
  expect(() => parseArgs(argv("audit", "--fail-on", "catastrophic"))).toThrow(
    UsageError,
  );
  expect(() => parseArgs(argv("audit", "--target"))).toThrow(UsageError);
  expect(() => parseArgs(argv("audit", "--reflog-days", "later"))).toThrow(
    UsageError,
  );
  expect(() => parseArgs(argv("audit", "--nonsense"))).toThrow(UsageError);
});

// ─── Exit-code semantics ────────────────────────────────────────────────────

test("findings alone do not fail without --ci", () => {
  const root = makeRepo();
  writeFile(root, "untracked.txt", "loose\n");

  const result = runRepoAudit(parseArgs(argv("audit", "--target", root)));

  expect(result.exitCode).toBe(EXIT_OK);
  expect(result.report?.summary.findingCount).toBeGreaterThan(0);
});

test("--ci fails only at or above the threshold", () => {
  const root = makeRepo();
  commitFile(root, "file.txt", "v1\n", "feat: file");
  writeFile(root, "file.txt", "v2\n");
  gitOrThrow(root, ["stash", "push", "-m", "wip"]);

  // Stash entries are medium; the default high threshold must pass.
  expect(
    runRepoAudit(parseArgs(argv("audit", "--target", root, "--ci"))).exitCode,
  ).toBe(EXIT_OK);
  expect(
    runRepoAudit(
      parseArgs(argv("audit", "--target", root, "--ci", "--fail-on", "medium")),
    ).exitCode,
  ).toBe(EXIT_FINDINGS);
});

test("--ci fails on a high finding at the default threshold", () => {
  const root = makeRepo();
  createMergeConflict(root);

  const result = runRepoAudit(
    parseArgs(argv("audit", "--target", root, "--ci")),
  );

  expect(result.exitCode).toBe(EXIT_FINDINGS);
  expect(result.report?.summary.passed).toBe(false);
});

test("a clean repository passes under --ci", () => {
  const { root } = makeRepoWithRemote();
  const result = runRepoAudit(
    parseArgs(argv("audit", "--target", root, "--ci", "--verify-remote")),
  );

  expect(result.exitCode).toBe(EXIT_OK);
  expect(result.report?.summary.findingCount).toBe(0);
});

test("a missing path and a non-repository are operational errors", () => {
  const missing = runRepoAudit(
    parseArgs(argv("audit", "--target", "/definitely/not/here")),
  );
  expect(missing.exitCode).toBe(EXIT_ERROR);
  expect(missing.error).toContain("not found");

  const notARepo = runRepoAudit(
    parseArgs(argv("audit", "--target", makeTempDir())),
  );
  expect(notARepo.exitCode).toBe(EXIT_ERROR);
  expect(notARepo.error).toContain("Not a git repository");
});

// ─── End-to-end through the published launcher ──────────────────────────────

async function runCli(args: string[], cwd = REPO_ROOT) {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

test("`anvil repo audit --json` emits parseable JSON and exits 0", async () => {
  const { root } = makeRepoWithRemote();
  const result = await runCli(["repo", "audit", "--target", root, "--json"]);

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { schemaVersion: number };
  expect(parsed.schemaVersion).toBe(1);
});

test("`anvil repo audit` defaults to the working directory", async () => {
  const { root } = makeRepoWithRemote();
  const result = await runCli(["repo", "audit", "--json"], root);

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { repoRoot: string };
  expect(parsed.repoRoot).toContain(root.split("/").pop() as string);
});

test("`anvil repo` without a subcommand fails with help", async () => {
  const result = await runCli(["repo"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("requires a subcommand");
  expect(result.stderr).toContain("anvil repo audit");
});

test("`anvil repo bogus` is rejected rather than treated as a path", async () => {
  const result = await runCli(["repo", "bogus"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Unknown 'repo' subcommand");
});

test("`anvil repo --help` prints help without leaking script paths", async () => {
  const result = await runCli(["repo", "--help"]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("anvil repo audit");
  expect(result.stdout).toContain("--fail-on");
  expect(result.stdout).not.toContain("scripts/repo-audit.ts");
});

test("`anvil --help` lists the repo command", async () => {
  const result = await runCli(["--help"]);

  expect(result.stdout).toContain("repo ");
  expect(result.stdout).toContain("anvil repo audit --target");
});

test("--output writes the same bytes that were printed", async () => {
  const { root } = makeRepoWithRemote();
  const outputPath = join(makeTempDir(), "nested", "report.json");
  const result = await runCli([
    "repo",
    "audit",
    "--target",
    root,
    "--json",
    "--output",
    outputPath,
  ]);

  expect(result.exitCode).toBe(0);
  expect(readFileSync(outputPath, "utf8")).toBe(result.stdout);
});

test("the help text and the script usage string stay in sync", () => {
  const launcher = readFileSync(CLI, "utf8");
  for (const flag of [
    "--target",
    "--json",
    "--ci",
    "--fail-on",
    "--verify-remote",
    "--include-unreachable",
    "--remote",
    "--default-branch",
    "--reflog-days",
    "--stale-fetch-hours",
    "--output",
  ]) {
    expect(`launcher documents ${flag}: ${launcher.includes(flag)}`).toBe(
      `launcher documents ${flag}: true`,
    );
    expect(`usage documents ${flag}: ${USAGE.includes(flag)}`).toBe(
      `usage documents ${flag}: true`,
    );
  }
});
