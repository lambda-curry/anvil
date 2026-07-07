import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectCliSignals } from "./lib/cli-detectors.ts";

let passed = 0;
let failed = 0;

type FixtureSetup = {
  packageJson: Record<string, unknown>;
  entrypointPath: string;
  entrypointLines: string[];
};

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function test(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

function createFixture(setup: FixtureSetup): string {
  const dir = mkdtempSync(join(tmpdir(), "anvil-cli-detectors-"));
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(setup.packageJson, null, 2),
  );
  writeFileSync(
    join(dir, setup.entrypointPath),
    `${setup.entrypointLines.join("\n")}\n`,
  );
  return dir;
}

function withFixture(setup: FixtureSetup, fn: (dir: string) => void) {
  const dir = createFixture(setup);
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertStrongCliSignals(dir: string) {
  const result = detectCliSignals(dir);
  assert(result.isCliProject, "classifies the repo as a CLI project");
  assert(
    result.entrypoints.includes("bin/sample.ts"),
    "keeps the declared bin entrypoint",
  );
  assert(
    result.frameworks.includes("commander"),
    "records CLI framework evidence",
  );
  assert(result.checks.argumentParsing, "detects argument parsing");
  assert(result.checks.helpText, "detects help text");
  assert(result.checks.exitCodeHygiene, "detects non-zero exit handling");
  assert(result.checks.inputValidation, "detects input validation");
  assert(result.checks.errorBoundary, "detects top-level error handling");
  assert(
    result.recommendations.length === 0,
    "emits no missing-check recommendations",
  );
}

function assertThinCliRecommendations(dir: string) {
  const result = detectCliSignals(dir);
  assert(result.isCliProject, "still treats a declared bin as a CLI project");
  assert(
    result.missingChecks.length === 5,
    "marks all five CLI safety checks as missing",
  );
  assert(
    result.recommendations.includes(
      "Add explicit --help/usage output to CLI entrypoints.",
    ),
    "recommends missing help text",
  );
  assert(
    result.recommendations.includes(
      "Wrap command handlers with a top-level error boundary to avoid unhandled rejections.",
    ),
    "recommends missing error-boundary handling",
  );
}

test("detectCliSignals finds bin entrypoints and CLI safety signals", () => {
  withFixture(
    {
      packageJson: {
        name: "sample-cli",
        bin: { sample: "./bin/sample.ts" },
        dependencies: { commander: "^12.0.0" },
      },
      entrypointPath: "bin/sample.ts",
      entrypointLines: [
        "import { z } from 'zod';",
        "const input = z.string().safeParse(process.argv[2]);",
        "if (!input.success) process.exit(1);",
        "try {",
        "  console.log('--help');",
        "} catch (error) {",
        "  console.error(error);",
        "}",
      ],
    },
    assertStrongCliSignals,
  );
});

test("detectCliSignals treats printHelp usage helpers as help text", () => {
  withFixture(
    {
      packageJson: {
        name: "usage-cli",
        bin: "./bin/usage.ts",
      },
      entrypointPath: "bin/usage.ts",
      entrypointLines: [
        "function printHelp() {",
        "  console.log('Usage:');",
        "}",
        "const first = process.argv[2];",
        "if (!first) {",
        "  printHelp();",
        "  process.exit(0);",
        "}",
        "if (first === '--version') {",
        "  console.log('1.0.0');",
        "  process.exit(0);",
        "}",
        "console.error('Unknown command');",
        "printHelp();",
        "process.exit(1);",
      ],
    },
    (dir) => {
      const result = detectCliSignals(dir);
      assert(result.isCliProject, "treats the declared bin as a CLI project");
      assert(result.checks.argumentParsing, "detects argv parsing");
      assert(result.checks.helpText, "detects help text via printHelp/Usage");
      assert(
        !result.missingChecks.includes("helpText"),
        "does not report helpText as missing",
      );
    },
  );
});

test("detectCliSignals only recommends missing CLI safety checks", () => {
  withFixture(
    {
      packageJson: {
        name: "thin-cli",
        bin: "./bin/thin.ts",
        scripts: { cli: "bun run ./bin/thin.ts" },
      },
      entrypointPath: "bin/thin.ts",
      entrypointLines: ["console.log('hello from thin cli');"],
    },
    assertThinCliRecommendations,
  );
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed, ${passed} passed.`);
  process.exit(1);
}

console.log(`\nAll ${passed} test(s) passed.`);
