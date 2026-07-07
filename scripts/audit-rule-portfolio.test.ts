/**
 * Regression tests for buildRulePortfolioActions() coverage-gap recommendations.
 *
 * Validates the Multi-Agent Topology gap emits a specific recommendation that
 * points to the Subagent Boundary Declaration pattern instead of a generic
 * baseline-rule suggestion.
 *
 * Run: bun run scripts/audit-rule-portfolio.test.ts
 */

import {
  buildRulePortfolioActions,
  type CoverageCategory,
  type PortfolioActionInput,
  type PrFinding,
  type RuleFile,
  type RuleInventory,
  type RulePortfolioAction,
} from "./audit.ts";
import type { Theme } from "./mine-pr-rules.ts";

function emptyInventory(): RuleInventory {
  return {
    allFiles: [],
    canonicalFiles: [],
    canonicalGovernanceFiles: [],
    canonicalGeneratedFiles: [],
    mirrorConfig: { hasConfig: false, agents: [] },
    mirrorGroups: [],
    mirrorHealthyCount: 0,
    mirrorDriftedCount: 0,
    mirrorOrphanProjectionCount: 0,
    mirrorSourceOnlyCount: 0,
    duplicateGroups: [],
    expectedDuplicateGroups: [],
    accidentalDuplicateGroups: [],
    duplicateMirrorCount: 0,
    expectedDuplicateMirrorCount: 0,
    accidentalDuplicateMirrorCount: 0,
    duplicationRate: 0,
    accidentalDuplicationRate: 0,
  };
}

function makeRuleFile(
  relativePath: string,
  overrides: Partial<RuleFile> = {},
): RuleFile {
  return {
    path: relativePath,
    relativePath,
    tool: "agents",
    format: "markdown",
    sizeLines: 120,
    hasAlwaysApply: true,
    hasGlob: false,
    hasDescription: true,
    hasLastValidated: true,
    hasWhySection: true,
    hasExamplesSection: true,
    linesOverBudget: false,
    authorship: "governance",
    fingerprint: `fingerprint:${relativePath}`,
    ...overrides,
  };
}

function makeFinding(
  label: string,
  overrides: Partial<PrFinding> = {},
): PrFinding {
  const { theme: overrideTheme, label: _overrideLabel, ...rest } = overrides;
  const theme = (overrideTheme ?? "error-handling") as Theme;
  return {
    theme,
    label,
    frequency: 8,
    score: 8,
    uniquePrs: 4,
    severity: "medium",
    representativeness: "high",
    coverageStatus: "match",
    commentAlignmentRate: 1,
    commentAlignmentStatus: "strong",
    samplePaths: ["src/example.ts"],
    ...rest,
  };
}

function makeInput(
  coverageGaps: CoverageCategory[],
  overrides: Partial<PortfolioActionInput> = {},
): PortfolioActionInput {
  return {
    scoringRuleFiles: [],
    inventory: emptyInventory(),
    diagnostics: {
      noWhyCount: 0,
      noExamplesCount: 0,
      overBudgetCount: 0,
      undatedCount: 0,
    },
    coverageGaps,
    prMining: {
      status: "unavailable",
      repo: null,
      reason: "not needed for this test",
      analyzedPrs: 0,
      reviewedComments: 0,
      substantiveComments: 0,
      candidateCount: 0,
      findings: [],
      artifactPath: null,
    },
    stageC: { name: "Stage C", status: "pass", summary: "", checks: [] },
    stageD: { name: "Stage D", status: "pass", summary: "", checks: [] },
    ...overrides,
  };
}

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

test("Multi-Agent Topology gap recommends the specific Subagent Boundary Declaration pattern", () => {
  const { addNew } = buildRulePortfolioActions(
    makeInput([
      {
        name: "Multi-Agent Topology",
        present: false,
        signals: ["sessions_spawn"],
      },
    ]),
  );

  const action = addNew[0] as RulePortfolioAction | undefined;
  assert(Boolean(action), "emits an add-new action");
  assert(
    action?.title ===
      "Add multi-agent topology declaration (role, delegation contract, Rule-of-Two security state)",
    "uses the specific multi-agent topology action title",
  );
  assert(
    action?.detail.includes("docs/patterns/subagent-boundary-declaration.md") ??
      false,
    "points detail text at the Subagent Boundary Declaration pattern",
  );
  assert(
    action?.evidence.includes(
      "Pattern: docs/patterns/subagent-boundary-declaration.md",
    ) ?? false,
    "includes the pattern link in evidence",
  );
});

test("Not-applicable Multi-Agent Topology gap does not create a portfolio action", () => {
  const { addNew } = buildRulePortfolioActions(
    makeInput([
      {
        name: "Multi-Agent Topology",
        present: false,
        notApplicable: true,
        signals: [],
      },
    ]),
  );

  assert(
    addNew.length === 0,
    "skips conditional gap when marked notApplicable",
  );
});

test("Other baseline gaps still use the generic baseline recommendation path", () => {
  const { addNew } = buildRulePortfolioActions(
    makeInput([{ name: "Performance", present: false, signals: [] }]),
  );

  const action = addNew[0] as RulePortfolioAction | undefined;
  assert(
    action?.title === "Add baseline rule for Performance",
    "keeps generic title for non-topology gaps",
  );
  assert(
    action?.detail === "Community baseline category is uncovered.",
    "keeps generic detail for non-topology gaps",
  );
});

test("Sparse rule surfaces do not trigger extraction when alignment is already strong", () => {
  const { addNew } = buildRulePortfolioActions(
    makeInput([], {
      scoringRuleFiles: [
        makeRuleFile("AGENTS.md"),
        makeRuleFile("docs/operator-contract.md"),
      ],
      prMining: {
        status: "available",
        repo: "example/repo",
        reason: null,
        analyzedPrs: 6,
        reviewedComments: 18,
        substantiveComments: 11,
        candidateCount: 1,
        findings: [
          makeFinding("Error Handling", {
            theme: "error-handling",
            frequency: 11,
            uniquePrs: 6,
            severity: "high",
            commentAlignmentRate: 1,
            commentAlignmentStatus: "strong",
            samplePaths: ["scripts/audit.ts"],
          }),
        ],
        artifactPath: null,
      },
    }),
  );

  assert(
    addNew.length === 0,
    "skips focused-rule extraction when a sparse surface already matches review language strongly",
  );
});

test("Sparse rule surfaces still recommend extraction when alignment is weak", () => {
  const { addNew } = buildRulePortfolioActions(
    makeInput([], {
      scoringRuleFiles: [
        makeRuleFile("AGENTS.md"),
        makeRuleFile("docs/operator-contract.md"),
      ],
      prMining: {
        status: "available",
        repo: "example/repo",
        reason: null,
        analyzedPrs: 6,
        reviewedComments: 18,
        substantiveComments: 11,
        candidateCount: 1,
        findings: [
          makeFinding("Error Handling", {
            theme: "error-handling",
            frequency: 11,
            uniquePrs: 6,
            severity: "high",
            commentAlignmentRate: 0.6,
            commentAlignmentStatus: "partial",
            samplePaths: ["scripts/audit.ts"],
          }),
        ],
        artifactPath: null,
      },
    }),
  );

  const action = addNew[0] as RulePortfolioAction | undefined;
  assert(Boolean(action), "emits an add-new action for weak alignment");
  assert(
    action?.title === "Create focused Error Handling rule file",
    "keeps focused-rule extraction for sparse surfaces with weak alignment",
  );
  assert(
    action?.detail.includes("partially matches") ?? false,
    "explains that sparse-surface extraction is driven by weak alignment",
  );
});

test("Low-yield rule surfaces still recommend extraction even when alignment is strong", () => {
  const { addNew } = buildRulePortfolioActions(
    makeInput([], {
      scoringRuleFiles: [
        makeRuleFile("AGENTS.md", { hasExamplesSection: false }),
        makeRuleFile("docs/operator-contract.md"),
      ],
      prMining: {
        status: "available",
        repo: "example/repo",
        reason: null,
        analyzedPrs: 6,
        reviewedComments: 18,
        substantiveComments: 11,
        candidateCount: 1,
        findings: [
          makeFinding("Error Handling", {
            theme: "error-handling",
            frequency: 11,
            uniquePrs: 6,
            severity: "high",
            commentAlignmentRate: 1,
            commentAlignmentStatus: "strong",
            samplePaths: ["scripts/audit.ts"],
          }),
        ],
        artifactPath: null,
      },
    }),
  );

  const action = addNew[0] as RulePortfolioAction | undefined;
  assert(Boolean(action), "emits an add-new action for low-yield surfaces");
  assert(
    action?.detail.includes("overloaded or low-yield") ?? false,
    "keeps low-yield extraction detail even with strong alignment",
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
