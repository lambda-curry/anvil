import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreGuardrails } from "./lib/guardrail-score.ts";

let passed = 0;
let failed = 0;

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

test("scoreGuardrails recognizes Bun coverage thresholds from bunfig.toml", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-guardrail-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "workflows", "ci.yml"),
      [
        "name: ci",
        "on: [pull_request]",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: bun test --coverage",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "bun test" } }, null, 2),
    );
    writeFileSync(join(dir, "sample.test.ts"), "test('ok', () => {});\n");
    writeFileSync(
      join(dir, "bunfig.toml"),
      "[test]\ncoverageThreshold = { lines = 0.45, functions = 0.6, statements = 0.45 }\n",
    );

    const result = scoreGuardrails({
      projectRoot: dir,
      ruleFilePaths: [],
      driftSummary: { pathIssues: 0, dateIssues: 0 },
    });

    assert(
      result.breakdown.testDepth >= 4,
      "raises test-depth score for Bun coverage thresholds",
    );
    assert(
      !result.recommendations.includes(
        "Set explicit coverage thresholds in test config.",
      ),
      "clears stale coverage-threshold recommendation when bunfig.toml is present",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scoreGuardrails recognizes explicit zero-flake policy signals in CI workflow text", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-guardrail-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "workflows", "ci.yml"),
      [
        "name: ci",
        "on: [pull_request]",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - name: Run test suite with coverage thresholds (flaky tests block merge; no quarantine)",
        "        run: bun test --coverage",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "bun test" } }, null, 2),
    );
    writeFileSync(join(dir, "sample.test.ts"), "test('ok', () => {});\n");
    writeFileSync(
      join(dir, "bunfig.toml"),
      "[test]\ncoverageThreshold = { lines = 0.45, functions = 0.6, statements = 0.45 }\n",
    );

    const result = scoreGuardrails({
      projectRoot: dir,
      ruleFilePaths: [],
      driftSummary: { pathIssues: 0, dateIssues: 0 },
    });

    assert(
      result.breakdown.testDepth === 5,
      "awards the top test-depth score when zero-flake policy is explicit in CI",
    );
    assert(
      result.evidence.testDepth.includes("flaky test policy signal detected"),
      "records flaky-test policy evidence when workflow text names the zero-flake posture",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scoreGuardrails recognizes Oxlint and Oxfmt config files as code-quality tooling", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-guardrail-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "workflows", "ci.yml"),
      [
        "name: ci",
        "on: [pull_request]",
        "jobs:",
        "  validate:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: bun run lint",
        "      - run: bun run format:check",
      ].join("\n"),
    );
    writeFileSync(join(dir, ".oxlintrc.json"), "{}\n");
    writeFileSync(join(dir, ".oxfmtrc.json"), "{}\n");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          scripts: {
            lint: "oxlint bin scripts",
            "format:check": "oxfmt --check bin scripts",
          },
        },
        null,
        2,
      ),
    );

    const result = scoreGuardrails({
      projectRoot: dir,
      ruleFilePaths: [],
      driftSummary: { pathIssues: 0, dateIssues: 0 },
    });

    assert(
      result.breakdown.codeQuality >= 3,
      "counts Oxlint and Oxfmt config files toward code-quality guardrails",
    );
    assert(
      !result.recommendations.includes("Add lint tooling (ESLint or Biome)."),
      "does not recommend adding lint tooling when Oxlint config is already present",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scoreGuardrails follows tsconfig extends before recommending strictness alignment", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-guardrail-"));
  try {
    mkdirSync(join(dir, "docs-site"), { recursive: true });
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            noEmit: true,
          },
          include: ["scripts/**/*.ts"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, "tsconfig.strict-share-bundle.json"),
      JSON.stringify(
        {
          extends: "./tsconfig.json",
          compilerOptions: {
            noUncheckedIndexedAccess: true,
            exactOptionalPropertyTypes: true,
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, "docs-site", "tsconfig.json"),
      JSON.stringify(
        {
          extends: "astro/tsconfigs/strict",
          include: ["**/*"],
        },
        null,
        2,
      ),
    );

    const result = scoreGuardrails({
      projectRoot: dir,
      ruleFilePaths: [],
      driftSummary: { pathIssues: 0, dateIssues: 0 },
    });

    assert(
      result.evidence.typeSafety.includes(
        "strict=true in 3/3 tsconfig file(s)",
      ),
      "counts inherited strictness across workspace tsconfig files",
    );
    assert(
      !result.recommendations.includes(
        "Align strict TypeScript settings across workspace tsconfig files.",
      ),
      "does not recommend strictness alignment when all tsconfigs inherit strict=true",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scoreGuardrails awards 5/5 type safety for a dedicated extra-strict CI lane", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-guardrail-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "workflows", "ci.yml"),
      [
        "name: ci",
        "on: [pull_request]",
        "jobs:",
        "  validate:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: bun run typecheck",
        "      - run: bun run typecheck:strict",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            noEmit: true,
          },
          include: ["scripts/**/*.ts"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, "tsconfig.strict.json"),
      JSON.stringify(
        {
          extends: "./tsconfig.json",
          compilerOptions: {
            noUncheckedIndexedAccess: true,
            exactOptionalPropertyTypes: true,
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          scripts: {
            typecheck: "tsc --noEmit",
            "typecheck:strict": "tsc -p tsconfig.strict.json --noEmit",
          },
        },
        null,
        2,
      ),
    );

    const result = scoreGuardrails({
      projectRoot: dir,
      ruleFilePaths: [],
      driftSummary: { pathIssues: 0, dateIssues: 0 },
    });

    assert(
      result.breakdown.typeSafety === 5,
      "awards the top type-safety score for a dedicated extra-strict lane",
    );
    assert(
      result.evidence.typeSafety.includes(
        "dedicated extra-strict TypeScript lane enforced in CI",
      ),
      "records the extra-strict CI lane as evidence",
    );
    assert(
      !result.recommendations.includes(
        "To reach 5/5 type safety, either add type-aware ESLint rules or enforce a dedicated extra-strict tsconfig lane in CI (for example `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`).",
      ),
      "does not keep the 4/5 plateau recommendation once the top lane exists",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scoreGuardrails recognizes merge_group as top-tier CI coverage", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-guardrail-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "workflows", "ci.yml"),
      [
        "name: ci",
        "on:",
        "  pull_request:",
        "  merge_group:",
        "    types: [checks_requested]",
        "jobs:",
        "  validate:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: bun run lint",
        "      - run: bun run typecheck",
        "      - run: bun test",
        "      - run: bun run build",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          scripts: {
            lint: "oxlint bin scripts",
            typecheck: "tsc --noEmit",
            test: "bun test",
            build: "tsc --noEmit",
          },
        },
        null,
        2,
      ),
    );

    const result = scoreGuardrails({
      projectRoot: dir,
      ruleFilePaths: [],
      driftSummary: { pathIssues: 0, dateIssues: 0 },
    });

    assert(
      result.breakdown.ciDiscipline === 5,
      "awards the top CI-discipline score when merge_group coverage is present",
    );
    assert(
      !result.recommendations.includes(
        "If you rely on GitHub merge queue, trigger CI on merge_group too.",
      ),
      "does not recommend merge_group coverage once it is already wired in",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed, ${passed} passed.`);
  process.exit(1);
}

console.log(`\nAll ${passed} test(s) passed.`);
