#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_MAP: Record<string, string> = {
  audit: "scripts/audit.ts",
  drift: "scripts/drift-detect.ts",
  bootstrap: "scripts/bootstrap-generate.ts",
  "mine-pr": "scripts/mine-pr-rules.ts",
  repo: "scripts/repo-audit.ts",
};

// Commands that take a subcommand. `anvil repo` alone is not runnable, and an
// unknown subcommand must fail here rather than being parsed as a target path.
const SUBCOMMANDS: Record<string, string[]> = {
  repo: ["audit"],
};

function getVersion(repoRoot: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, "package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const SUBCOMMAND_HELP: Record<string, string> = {
  audit:
    "Usage: anvil audit --target <path> [--output <file>] [--artifacts-dir <dir>] [--skip-bootstrap] [--json] [--ci] [--ai-provider <provider>] [--ai-model <model>] [--ai-timeout-ms <ms>] [--force-stage-b]\n\n" +
    "Options:\n" +
    "  --target <path>         Path to project to audit (required)\n" +
    "  --output <file>         Write report to this path (default: docs/audits/<name>-<date>.md)\n" +
    "  --artifacts-dir <dir>   Write drift/bootstrap artifacts here (default: docs/audits/artifacts/<name>-<date>)\n" +
    "  --skip-bootstrap        Skip bootstrap stack detection\n" +
    "  --json                  Output JSON instead of markdown report\n" +
    "  --ci                    Run deterministic structural lint mode (local-only heuristic suggestions)\n" +
    "  --ai-provider <name>    AI provider: auto | openai | codex-cli | claude-code | gemini-cli | opencode | heuristic\n" +
    "  --ai-model <name>       Override provider model\n" +
    "  --ai-timeout-ms <ms>    Timeout for AI synthesis calls in milliseconds\n" +
    "  --force-stage-b         Run Stage B scoring even when Stage A fails",
  drift:
    "Usage: anvil drift --target <path> [--skip-dirs dir1,dir2,...] [--output <file>]\n" +
    "       anvil drift <path> [--skip-dirs dir1,dir2,...] [--output <file>]\n\n" +
    "Default output: docs/audits/artifacts/<project>-<date>/drift-report.md",
  bootstrap:
    "Usage: anvil bootstrap --target <path> [--output <file>]\n" +
    "       anvil bootstrap <path> [--output <file>]",
  "mine-pr":
    "Usage: anvil mine-pr <owner/repo> [--limit <N>] [--output <dir>] [--dry-run]\n\n" +
    "Example:\n" +
    "  anvil mine-pr block/ai-rules --limit 100",
  repo:
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
    "  --fail-on <level>        high | medium | low | info (default: high)\n" +
    "  --verify-remote          Query the remote to confirm the canonical default branch\n" +
    "  --include-unreachable    Also fsck for commits reachable from no ref or reflog (slower)\n" +
    "  --remote <name>          Remote to resolve the default branch from (default: origin)\n" +
    "  --default-branch <name>  Skip detection and treat this branch as the default\n" +
    "  --reflog-days <n>        Reflog window for unreachable commits (default: 30)\n" +
    "  --stale-fetch-hours <n>  Age at which cached remote refs are called stale (default: 24)\n" +
    "  --output <file>          Also write the report to this path\n\n" +
    "Exit codes: 0 clean (or findings without --ci), 1 findings at/above --fail-on with --ci, 2 usage or repository error",
};

function printHelp(version: string): void {
  console.log(`anvil v${version}`);
  console.log(
    "AI rules audit engine — score, detect drift, and improve rules in any AI-assisted codebase",
  );
  console.log("");
  console.log("Usage:");
  console.log("  anvil <command> [...args]");
  console.log("");
  console.log("Launcher contract:");
  console.log(
    "  bunx @lambdacurry/anvil <command> [...args]   Recommended zero-install path",
  );
  console.log(
    "  npx @lambdacurry/anvil <command> [...args]    Alternate launcher; Bun and Node.js >= 20 must already be installed",
  );
  console.log("  bun add -g @lambdacurry/anvil                 Global install");
  console.log(
    "  anvil <command> [...args]                    Run after global install",
  );
  console.log("");
  console.log("Commands:");
  console.log("  audit      Run full rule audit");
  console.log("  drift      Detect drift in rule surfaces");
  console.log("  bootstrap  Generate bootstrap rule draft");
  console.log("  mine-pr    Mine PR review comments for rule candidates");
  console.log(
    "  repo       Repository hygiene checks (repo audit — read-only Git state)",
  );
  console.log("");
  console.log("Examples:");
  console.log("  anvil audit --target /absolute/path/to/my-repo");
  console.log("  anvil repo audit --target /absolute/path/to/my-repo");
  console.log("  anvil drift --target /absolute/path/to/my-repo");
  console.log(
    "  anvil bootstrap --target /absolute/path/to/my-repo --output /absolute/path/to/bootstrap-draft.md",
  );
  console.log("  anvil mine-pr owner/repo");
}

function requireValidSubcommand(
  command: string,
  subcommand: string | undefined,
): void {
  const allowed = SUBCOMMANDS[command];
  if (!allowed || allowed.includes(subcommand ?? "")) {
    return;
  }
  console.error(
    subcommand
      ? `Unknown '${command}' subcommand: ${subcommand}`
      : `'${command}' requires a subcommand.`,
  );
  console.error("");
  console.error(SUBCOMMAND_HELP[command] ?? "");
  process.exit(1);
}

function main(argv: string[]): void {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(currentDir, "..");
  const version = getVersion(repoRoot);

  const args = argv.slice(2);
  const first = args[0];

  if (!first || first === "--help" || first === "-h") {
    printHelp(version);
    process.exit(0);
  }

  if (first === "--version" || first === "-v") {
    console.log(version);
    process.exit(0);
  }

  const script = SCRIPT_MAP[first];
  if (!script) {
    console.error(`Unknown command: ${first}`);
    console.error("");
    printHelp(version);
    process.exit(1);
  }

  // Intercept --help/-h for known subcommands so the published CLI never leaks
  // internal script paths from the underlying script usage strings.
  const rest = args.slice(1);
  if (rest.includes("--help") || rest.includes("-h")) {
    console.log(SUBCOMMAND_HELP[first] ?? `No help available for '${first}'.`);
    process.exit(0);
  }

  requireValidSubcommand(first, rest[0]);

  const proc = Bun.spawnSync(
    ["bun", "run", resolve(repoRoot, script), ...args.slice(1)],
    {
      cwd: process.cwd(),
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  process.exit(proc.exitCode ?? 1);
}

main(process.argv);
