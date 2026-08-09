#!/usr/bin/env bun
/**
 * `anvil repo audit` — a strictly read-only report on the Git state of a repository.
 *
 * It reports; it never reconciles. Nothing in this command path merges, resets,
 * checks out, stashes, drops, deletes branches, removes worktrees, prunes, or
 * pushes. See `scripts/lib/git-state.ts` for the enforced read-only allowlist.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  collectGitState,
  DEFAULT_REFLOG_DAYS,
  DEFAULT_STALE_FETCH_HOURS,
} from "./lib/git-state.ts";
import {
  buildReport,
  evaluateFindings,
  isSeverity,
  renderHuman,
  renderJson,
  type RepoAuditReport,
  type Severity,
  SEVERITY_ORDER,
} from "./lib/repo-audit.ts";

export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_ERROR = 2;

export const USAGE =
  "Usage: anvil repo audit [--target <path>] [--json] [--ci] [--fail-on <level>]\n" +
  "                        [--verify-remote] [--remote <name>] [--default-branch <name>]\n" +
  "                        [--reflog-days <n>] [--stale-fetch-hours <n>]\n" +
  "                        [--include-unreachable] [--output <file>]\n\n" +
  "Reports Git state read-only. It never merges, resets, checks out, stashes,\n" +
  "drops, deletes branches, removes worktrees, prunes, or pushes.\n\n" +
  "Options:\n" +
  "  --target <path>          Repository to audit (default: current directory)\n" +
  "  --json                   Emit the deterministic JSON report instead of human output\n" +
  "  --ci                     Exit non-zero when findings reach the --fail-on level\n" +
  `  --fail-on <level>        high | medium | low | info (default: high)\n` +
  "  --verify-remote          Query the remote to confirm the canonical default branch\n" +
  "  --include-unreachable    Also fsck for commits reachable from no ref or reflog (slower)\n" +
  "  --remote <name>          Remote to resolve the default branch from (default: origin)\n" +
  "  --default-branch <name>  Skip detection and treat this branch as the default\n" +
  `  --reflog-days <n>        Reflog window for unreachable commits (default: ${DEFAULT_REFLOG_DAYS})\n` +
  `  --stale-fetch-hours <n>  Age at which cached remote refs are called stale (default: ${DEFAULT_STALE_FETCH_HOURS})\n` +
  "  --output <file>          Also write the report to this path\n\n" +
  "Exit codes: 0 clean (or findings without --ci), 1 findings at/above --fail-on with --ci, 2 usage or repository error";

export type ParsedArgs = {
  projectPath: string;
  json: boolean;
  ci: boolean;
  failOn: Severity;
  verifyRemote: boolean;
  includeUnreachable: boolean;
  remote: string;
  defaultBranch: string | null;
  reflogDays: number;
  staleFetchHours: number;
  outputFile: string | null;
};

export class UsageError extends Error {}

function requireValue(
  argv: readonly string[],
  index: number,
  flag: string,
): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new UsageError(`${flag} requires a value`);
  }
  return value;
}

function requirePositiveInt(raw: string, flag: string): number {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) {
    throw new UsageError(`${flag} requires a non-negative integer`);
  }
  return value;
}

/**
 * `argv` is the raw process.argv. The `repo` launcher forwards the `audit`
 * subcommand token, so it is accepted and consumed here.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    projectPath: ".",
    json: false,
    ci: false,
    failOn: "high",
    verifyRemote: false,
    includeUnreachable: false,
    remote: "origin",
    defaultBranch: null,
    reflogDays: DEFAULT_REFLOG_DAYS,
    staleFetchHours: DEFAULT_STALE_FETCH_HOURS,
    outputFile: null,
  };

  let sawSubcommand = false;
  let sawTarget = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i] as string;

    if (arg === "audit" && !sawSubcommand && !sawTarget) {
      sawSubcommand = true;
    } else if (arg === "--target") {
      parsed.projectPath = requireValue(argv, i + 1, "--target");
      sawTarget = true;
      i++;
    } else if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--ci") {
      parsed.ci = true;
    } else if (arg === "--verify-remote") {
      parsed.verifyRemote = true;
    } else if (arg === "--include-unreachable") {
      parsed.includeUnreachable = true;
    } else if (arg === "--fail-on") {
      const value = requireValue(argv, i + 1, "--fail-on");
      if (!isSeverity(value)) {
        throw new UsageError(
          `--fail-on must be one of: ${SEVERITY_ORDER.join(", ")}`,
        );
      }
      parsed.failOn = value;
      i++;
    } else if (arg === "--remote") {
      parsed.remote = requireValue(argv, i + 1, "--remote");
      i++;
    } else if (arg === "--default-branch") {
      parsed.defaultBranch = requireValue(argv, i + 1, "--default-branch");
      i++;
    } else if (arg === "--reflog-days") {
      parsed.reflogDays = requirePositiveInt(
        requireValue(argv, i + 1, "--reflog-days"),
        "--reflog-days",
      );
      i++;
    } else if (arg === "--stale-fetch-hours") {
      parsed.staleFetchHours = requirePositiveInt(
        requireValue(argv, i + 1, "--stale-fetch-hours"),
        "--stale-fetch-hours",
      );
      i++;
    } else if (arg === "--output") {
      parsed.outputFile = requireValue(argv, i + 1, "--output");
      i++;
    } else if (!arg.startsWith("-") && !sawTarget) {
      parsed.projectPath = arg;
      sawTarget = true;
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

export type RunResult = {
  report: RepoAuditReport | null;
  output: string;
  exitCode: number;
  error: string | null;
};

/** Pure-ish core: resolves and evaluates, returns what to print and the exit code. */
export function runRepoAudit(args: ParsedArgs, now?: Date): RunResult {
  const projectRoot = resolve(args.projectPath);

  if (!existsSync(projectRoot)) {
    return {
      report: null,
      output: "",
      exitCode: EXIT_ERROR,
      error: `Target path not found: ${projectRoot}`,
    };
  }
  if (!statSync(projectRoot).isDirectory()) {
    return {
      report: null,
      output: "",
      exitCode: EXIT_ERROR,
      error: `Target path is not a directory: ${projectRoot}`,
    };
  }

  const state = collectGitState({
    repoRoot: projectRoot,
    remote: args.remote,
    defaultBranch: args.defaultBranch,
    verifyRemote: args.verifyRemote,
    includeUnreachable: args.includeUnreachable,
    reflogDays: args.reflogDays,
    staleFetchHours: args.staleFetchHours,
    now,
  });

  if (!state.isRepository) {
    return {
      report: null,
      output: "",
      exitCode: EXIT_ERROR,
      error: `Not a git repository: ${projectRoot}`,
    };
  }

  const findings = evaluateFindings(state, {
    staleFetchHours: args.staleFetchHours,
  });
  const report = buildReport(state, findings, { failOn: args.failOn });
  const output = args.json ? renderJson(report) : renderHuman(report);
  const exitCode = args.ci && !report.summary.passed ? EXIT_FINDINGS : EXIT_OK;

  return { report, output, exitCode, error: null };
}

export function main(argv: string[] = process.argv): number {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      console.error("");
      console.error(USAGE);
      return EXIT_ERROR;
    }
    throw error;
  }

  const result = runRepoAudit(args);
  if (result.error) {
    console.error(result.error);
    return EXIT_ERROR;
  }

  process.stdout.write(result.output);

  if (args.outputFile) {
    const outputPath = resolve(args.outputFile);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, result.output, "utf8");
    console.error(`Report written to: ${outputPath}`);
  }

  return result.exitCode;
}

if (import.meta.main) {
  process.exit(main(process.argv));
}
