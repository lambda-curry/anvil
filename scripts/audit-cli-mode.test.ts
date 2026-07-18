import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { main, parseArgs } from "./audit.ts";

const repoRoot = resolve(import.meta.dir, "..");
const fixture = "./scripts/__fixtures__/sample-cli-repo";
const providerEnvKeys = [
  "OPENAI_API_KEY",
  "ANVIL_OPENAI_API_KEY",
  "ANVIL_CODEX_PATH",
  "ANVIL_CLAUDE_PATH",
  "ANVIL_GEMINI_PATH",
  "ANVIL_OPENCODE_PATH",
] as const;

type ExitSignal = {
  __auditExit: true;
  code: number;
};

function applyNoProviderEnv() {
  process.env.OPENAI_API_KEY = "";
  process.env.ANVIL_OPENAI_API_KEY = "";
  process.env.ANVIL_CODEX_PATH = "/definitely/missing-codex";
  process.env.ANVIL_CLAUDE_PATH = "/definitely/missing-claude";
  process.env.ANVIL_GEMINI_PATH = "/definitely/missing-gemini";
  process.env.ANVIL_OPENCODE_PATH = "/definitely/missing-opencode";
}

function isExitSignal(value: unknown): value is ExitSignal {
  return (
    typeof value === "object" &&
    value !== null &&
    "__auditExit" in value &&
    value.__auditExit === true
  );
}

async function runAuditCli(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalArgv = [...process.argv];
  const originalCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;
  const originalEnv = Object.fromEntries(
    providerEnvKeys.map((key) => [key, process.env[key]]),
  ) as Record<(typeof providerEnvKeys)[number], string | undefined>;

  let exitCode = 0;

  console.log = (...parts: unknown[]) => {
    stdout.push(parts.map(String).join(" "));
  };
  console.error = (...parts: unknown[]) => {
    stderr.push(parts.map(String).join(" "));
  };
  process.exit = ((code?: number) => {
    throw {
      __auditExit: true,
      code: code ?? 0,
    } satisfies ExitSignal;
  }) as typeof process.exit;

  applyNoProviderEnv();
  process.argv = ["bun", "audit", ...args];
  process.chdir(repoRoot);

  try {
    await main();
  } catch (error) {
    if (isExitSignal(error)) {
      exitCode = error.code;
    } else {
      exitCode = 1;
      stderr.push(error instanceof Error ? error.message : String(error));
    }
  } finally {
    process.argv = originalArgv;
    process.chdir(originalCwd);
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;

    for (const key of providerEnvKeys) {
      const originalValue = originalEnv[key];
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  }

  return {
    exitCode,
    stderr: stderr.join("\n"),
    stdout: stdout.join("\n"),
  };
}

test("parseArgs supports --ci and tracks deprecated --no-ai alias", () => {
  const ciArgs = parseArgs(["bun", "audit", "--target", ".", "--ci"]);
  expect(ciArgs.ciMode).toBe(true);
  expect(ciArgs.noAi).toBe(true);
  expect(ciArgs.noAiAliasUsed).toBe(false);

  const aliasArgs = parseArgs(["bun", "audit", "--target", ".", "--no-ai"]);
  expect(aliasArgs.ciMode).toBe(true);
  expect(aliasArgs.noAi).toBe(true);
  expect(aliasArgs.noAiAliasUsed).toBe(true);
});

test("default audit path fails with guidance when no AI provider is available", async () => {
  const run = await runAuditCli(["--target", fixture, "--skip-bootstrap"]);

  expect(run.exitCode).toBe(1);
  const combined = `${run.stdout}\n${run.stderr}`;
  expect(combined).toContain(
    "AI synthesis is required for the default `anvil audit` path.",
  );
  expect(combined).toContain("--ci");
});

test("--ci succeeds without any AI provider and reports structural lint mode", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "anvil-ci-mode-"));
  const outputFile = join(tempDir, "audit-report.md");

  try {
    const run = await runAuditCli([
      "--target",
      fixture,
      "--skip-bootstrap",
      "--ci",
      "--output",
      outputFile,
    ]);

    expect(run.exitCode).toBe(0);
    const combined = `${run.stdout}\n${run.stderr}`;
    expect(combined).toContain("Structural Lint Score");
    expect(readFileSync(outputFile, "utf8")).toContain("Structural Lint Score");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("--json keeps stdout machine-parseable and sends progress to stderr", async () => {
  const run = await runAuditCli([
    "--target",
    fixture,
    "--skip-bootstrap",
    "--ci",
    "--json",
  ]);

  expect(run.exitCode).toBe(0);
  expect(() => JSON.parse(run.stdout)).not.toThrow();
  expect(run.stderr).toContain("🔍 Anvil Audit:");
  expect(run.stdout).not.toContain("🔍 Anvil Audit:");
});

test("--ci keeps the early mirror-sync story consistent when no mirror families are detected", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "anvil-ci-mirror-sync-"));
  const outputFile = join(tempDir, "audit-report.md");

  try {
    const run = await runAuditCli([
      "--target",
      fixture,
      "--skip-bootstrap",
      "--ci",
      "--output",
      outputFile,
    ]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain(
      "Mirror sync: healthy=0, drifted=0, orphan projections=0",
    );
    expect(readFileSync(outputFile, "utf8")).toContain(
      "| Mirror Sync Health | ✅ pass | healthy=0, drifted=0, orphan projections=0 |",
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("--no-ai remains compatible and emits a deprecation warning", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "anvil-no-ai-mode-"));
  const outputFile = join(tempDir, "audit-report.md");

  try {
    const run = await runAuditCli([
      "--target",
      fixture,
      "--skip-bootstrap",
      "--no-ai",
      "--output",
      outputFile,
    ]);

    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("`--no-ai` is deprecated");
    expect(run.stderr).toContain("Use `--ci`");
    const combined = `${run.stdout}\n${run.stderr}`;
    expect(combined).toContain("Structural Lint Score");
    expect(readFileSync(outputFile, "utf8")).toContain("Structural Lint Score");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
