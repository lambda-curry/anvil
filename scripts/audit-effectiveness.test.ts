import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessRuleEffectiveness, type RuleFile } from "./audit.ts";

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

function makeRuleFile(path: string): RuleFile {
  return {
    path,
    relativePath: "AGENTS.md",
    tool: "openclaw",
    format: "markdown",
    sizeLines: 20,
    hasAlwaysApply: true,
    hasGlob: false,
    hasDescription: true,
    hasLastValidated: true,
    hasWhySection: true,
    hasExamplesSection: true,
    linesOverBudget: false,
    authorship: "governance",
    fingerprint: "fp-effectiveness",
  };
}

test("assessRuleEffectiveness detects instrumented improving language with word boundaries", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-effectiveness-"));
  try {
    const filePath = join(dir, "AGENTS.md");
    writeFileSync(
      filePath,
      [
        "# Rule",
        "Why: prevents a recurring failure mode in reviews.",
        "Baseline: before adoption, this issue recurred in PR comments.",
        "Primary signal: review recurrence should trend down over time.",
        "Review interval: check again in the next audit cycle.",
        "Status: improving.",
      ].join("\n"),
    );

    const result = assessRuleEffectiveness([makeRuleFile(filePath)]);
    assert(result.baselineRuleCount === 1, "counts baseline evidence");
    assert(
      result.signalRuleCount === 1,
      "counts effectiveness signal evidence",
    );
    assert(
      result.reviewIntervalRuleCount === 1,
      "counts review interval evidence",
    );
    assert(result.instrumentedRuleCount === 1, "marks file as instrumented");
    assert(
      result.status === "Improving",
      "prefers explicit improving status when present",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assessRuleEffectiveness ignores incidental flat mentions outside explicit status markers", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-effectiveness-"));
  try {
    const filePath = join(dir, "AGENTS.md");
    writeFileSync(
      filePath,
      [
        "# Rule",
        "Why: prevents a recurring failure mode in reviews.",
        "Baseline: before adoption, this issue recurred in PR comments.",
        "Primary signal: review recurrence should trend down over time.",
        "Review interval: check again in the next audit cycle.",
        "If the signal stays flat, rewrite or escalate the rule.",
      ].join("\n"),
    );

    const result = assessRuleEffectiveness([makeRuleFile(filePath)]);
    assert(result.instrumentedRuleCount === 1, "keeps the file instrumented");
    assert(
      result.status === "Instrumented",
      "does not downgrade to Flat from incidental wording",
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
