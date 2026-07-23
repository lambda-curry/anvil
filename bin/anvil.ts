#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_MAP: Record<string, string> = {
  audit: "scripts/audit.ts",
  drift: "scripts/drift-detect.ts",
  bootstrap: "scripts/bootstrap-generate.ts",
  "mine-pr": "scripts/mine-pr-rules.ts",
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
  console.log("  audit      Run full rule audit (scripts/audit.ts)");
  console.log(
    "  drift      Detect drift in rule surfaces (scripts/drift-detect.ts)",
  );
  console.log(
    "  bootstrap  Generate bootstrap rule draft (scripts/bootstrap-generate.ts)",
  );
  console.log(
    "  mine-pr    Mine PR review comments for rule candidates (scripts/mine-pr-rules.ts)",
  );
  console.log("");
  console.log("Examples:");
  console.log("  anvil audit --target /absolute/path/to/my-repo");
  console.log("  anvil drift --target /absolute/path/to/my-repo");
  console.log(
    "  anvil bootstrap --target /absolute/path/to/my-repo --output /absolute/path/to/bootstrap-draft.md",
  );
  console.log("  anvil mine-pr owner/repo");
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
