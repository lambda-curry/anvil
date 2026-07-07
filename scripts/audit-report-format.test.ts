/**
 * Regression tests for buildReport() high-value evidence formatting.
 *
 * Validates the Process Issue Queue now shows inline evidence examples so
 * reviewers can see why queued issues exist without hunting later sections.
 *
 * Run: bun run scripts/audit-report-format.test.ts
 */

import {
  assessStageA,
  type AuditResult,
  buildProcessIssues,
  buildRemediationPack,
  buildReport,
  type RuleInventory,
} from "./audit.ts";

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

function makeStage(name: "Stage A" | "Stage B" | "Stage C" | "Stage D") {
  return {
    name,
    status: "pass" as const,
    summary: `${name} summary`,
    checks: [],
  };
}

function makeResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    auditMode: "ci",
    projectName: "test-repo",
    projectPath: "/tmp/test-repo",
    auditDate: "2026-03-22",
    ruleFiles: [],
    scoringRuleFiles: [],
    ruleInventory: emptyInventory(),
    driftReportPath: null,
    bootstrapDraftPath: null,
    artifactsDir: "/tmp",
    coverageGaps: [],
    enforcementLayer: { level: "none", detected: [] },
    cliSignals: {
      isCli: false,
      isCliProject: false,
      confidence: 0,
      checks: {
        argumentParsing: false,
        helpText: false,
        exitCodeHygiene: false,
        inputValidation: false,
        errorBoundary: false,
      },
      recommendations: [],
      evidence: [],
    },
    guardrail: {
      total: 10,
      maturity: "Developing",
      profile: "baseline",
      rawTotal: 10,
      breakdown: {
        ciDiscipline: 1,
        typeSafety: 1,
        testDepth: 1,
        codeQuality: 1,
        reviewOwnership: 1,
        security: 1,
        driftResilience: 1,
      },
      applicability: {
        ciDiscipline: { applicable: true },
        typeSafety: { applicable: true },
        testDepth: { applicable: true },
        codeQuality: { applicable: true },
        reviewOwnership: { applicable: true },
        security: { applicable: true },
        driftResilience: { applicable: true },
      },
      hardGates: { enabled: false, passed: true, exitCode: 0, results: [] },
      missingGuardrails: [],
      recommendations: [],
    },
    aiSynthesis: { mode: "heuristic", model: null, suggestions: [] },
    hasBlockAiRules: false,
    hasAiRulesDir: false,
    ruleScore5: 3,
    ruleScore100: 60,
    scoreBreakdown: {},
    recommendations: [],
    driftSummary: { pathIssues: 0, dateIssues: 0, notes: 0 },
    stageA: makeStage("Stage A"),
    stageB: makeStage("Stage B"),
    stageC: makeStage("Stage C"),
    stageD: makeStage("Stage D"),
    gapCoverage: {
      score: 1,
      prCoverageScore: 1,
      commentAlignmentScore: 1,
      criticalCoverageScore: 1,
      highSeverityCoverageScore: 1,
      freshnessCoverageScore: 1,
      uncoveredThemes: [],
    },
    ruleEffectiveness: {
      status: "Unmeasured",
      instrumentedRuleCount: 0,
      totalRuleCount: 0,
      failureModeRuleCount: 0,
      baselineRuleCount: 0,
      signalRuleCount: 0,
      reviewIntervalRuleCount: 0,
      evidence: [],
      note: "",
    },
    overkill: {
      score: 1,
      redundancyPressure: 0,
      conflictPressure: 0,
      contextLoadPressure: 0,
      lowYieldPressure: 0,
      alwaysOnLines: 0,
      lowYieldRules: 0,
      keywordConflictCount: 0,
    },
    prMining: {
      status: "unavailable",
      repo: null,
      reason: "not needed",
      analyzedPrs: 0,
      reviewedComments: 0,
      substantiveComments: 0,
      candidateCount: 0,
      findings: [],
      artifactPath: null,
    },
    rulePortfolio: { changeExisting: [], addNew: [], reduceOverkill: [] },
    auditConfig: { present: false, config: null, path: null, error: null },
    processIssues: [],
    remediationPack: { strategy: "", tasks: [] },
    ...overrides,
  } as AuditResult;
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

test("Process Issue Queue renders inline evidence examples", () => {
  const report = buildReport(
    makeResult({
      processIssues: [
        {
          id: "stageA-date-hygiene",
          title: "Stage A warn: Validation Date Coverage",
          detail: "20% of governance files include Last validated",
          issueClass: "hygiene",
          owner: "rules-maintainers",
          slaDays: 14,
          dueDate: "2026-04-05",
          evidence: [
            "Structural health passes with warnings.",
            "20% of governance files include Last validated",
          ],
        },
      ],
    }),
  );

  assert(
    report.includes("Evidence examples:"),
    "adds evidence examples heading",
  );
  assert(
    report.includes(
      "- `stageA-date-hygiene` → Structural health passes with warnings.; 20% of governance files include Last validated",
    ),
    "includes inline evidence preview for the queued issue",
  );
});

test("Process Issue Queue does not render evidence examples when no issues exist", () => {
  const report = buildReport(makeResult({ processIssues: [] }));
  assert(
    !report.includes("Evidence examples:"),
    "skips evidence examples block when queue is empty",
  );
});

test("Rule Files inventory marks non-tier-relevant pattern docs as n/a", () => {
  const patternRule = {
    path: "/tmp/test-repo/docs/patterns/atticus-gate.md",
    relativePath: "docs/patterns/atticus-gate.md",
    tool: "anvil-pattern",
    format: "markdown",
    sizeLines: 131,
    hasAlwaysApply: false,
    hasGlob: false,
    hasDescription: true,
    hasLastValidated: true,
    hasWhySection: true,
    hasExamplesSection: true,
    linesOverBudget: false,
    authorship: "governance",
    fingerprint: "atticus-gate",
  } as AuditResult["ruleFiles"][number];

  const report = buildReport(
    makeResult({
      ruleFiles: [patternRule],
      scoringRuleFiles: [patternRule],
      ruleInventory: {
        ...emptyInventory(),
        allFiles: [patternRule],
        canonicalFiles: [patternRule],
        canonicalGovernanceFiles: [patternRule],
      },
    }),
  );

  assert(
    report.includes(
      "| `docs/patterns/atticus-gate.md` | anvil-pattern | governance | ✅ | 131 | ✅ | ✅ | n/a | ✅ |",
    ),
    "renders n/a for non-tier-relevant pattern docs",
  );
  assert(
    !report.includes(
      "| `docs/patterns/atticus-gate.md` | anvil-pattern | governance | ✅ | 131 | ✅ | ✅ | ❌ | ✅ |",
    ),
    "does not render a failure mark for non-tier-relevant pattern docs",
  );
});

test("clean reports collapse empty action sections into a compact diagnostic note", () => {
  const report = buildReport(
    makeResult({
      processIssues: [],
      remediationPack: { strategy: "Blocking → Hygiene → Backlog", tasks: [] },
    }),
  );

  assert(
    !report.includes("## Remediation Pack"),
    "omits remediation heading when no remediation tasks exist",
  );
  assert(
    !report.includes("## Process Issue Queue"),
    "omits process issue heading when no issues exist",
  );
  assert(
    !report.includes("No remediation tasks generated."),
    "does not render empty remediation placeholder prose",
  );
  assert(
    !report.includes("No process issues queued."),
    "does not render empty process queue placeholder prose",
  );
  assert(
    report.includes(
      "- Action path: none generated for this run; use the supporting diagnostics below if you need the evidence behind the pass verdict.",
    ),
    "keeps a compact no-action note in diagnostic navigation",
  );
  assert(
    !report.includes("- [Remediation Pack](#remediation-pack)"),
    "skips remediation navigation link when the section is absent",
  );
  assert(
    !report.includes("- [Process Issue Queue](#process-issue-queue)"),
    "skips process queue navigation link when the section is absent",
  );
});

test("Mirror Sync Health is honest when no mirror config exists", () => {
  const report = buildReport(
    makeResult({
      ruleInventory: {
        ...emptyInventory(),
        mirrorSourceOnlyCount: 1,
      },
    }),
  );

  assert(
    report.includes(
      "This repo does not declare a mirror/projection surface, so these counts are informational only.",
    ),
    "explains the no-mirror case explicitly",
  );
  assert(
    report.includes(
      "'Source-only' means Anvil found a rule family in one format, but there is no declared mirrored copy surface for it in this repo.",
    ),
    "defines source-only honestly when no mirror config exists",
  );
  assert(
    !report.includes(
      "This checks whether the same rule is being copied across multiple agent formats cleanly. Healthy means the copies match and there is a clear source of truth.",
    ),
    "does not imply active mirror copying when no mirror surface exists",
  );
});

test("Mirror Sync Health explains detected root mirrors honestly without ai-rules config", () => {
  const report = buildReport(
    makeResult({
      ruleInventory: {
        ...emptyInventory(),
        mirrorGroups: [
          {
            key: "agent-instructions/root",
            sourcePaths: ["AGENTS.md"],
            projectionPaths: ["CLAUDE.md"],
            status: "drifted",
            fingerprintCount: 2,
            memberPaths: ["AGENTS.md", "CLAUDE.md"],
          },
        ],
        mirrorDriftedCount: 1,
      },
    }),
  );

  assert(
    report.includes(
      "This repo does not declare an ai-rules mirror surface, but Anvil still found 1 mirror family on disk",
    ),
    "explains that an undeclared on-disk mirror surface was still detected",
  );
  assert(
    report.includes("AGENTS.md/CLAUDE.md"),
    "uses the root instruction mirror as the concrete example",
  );
  assert(
    !report.includes(
      "This repo does not declare a mirror/projection surface, so these counts are informational only.",
    ),
    "does not downplay scored root mirror drift as informational only",
  );
});

test("Mirror Sync Health detail surfaces source-only families in the early stage table", () => {
  const result = makeResult({
    ruleInventory: {
      ...emptyInventory(),
      mirrorGroups: [
        {
          key: "agent-instructions/root",
          sourcePaths: ["AGENTS.md"],
          projectionPaths: [],
          status: "source-only",
          fingerprintCount: 1,
          memberPaths: ["AGENTS.md"],
        },
      ],
      mirrorSourceOnlyCount: 1,
    },
  });
  result.stageA = assessStageA(result.ruleInventory, result.driftSummary);
  const report = buildReport(result);

  assert(
    report.includes(
      "| Mirror Sync Health | ✅ pass | healthy=0, drifted=0, orphan projections=0, source-only=1 (informational: source-only family: AGENTS.md) |",
    ),
    "keeps source-only mirror families visible in the stage summary detail with early framing",
  );
  assert(
    report.includes(
      "*Current surface:* Named source-only family: `AGENTS.md`.",
    ),
    "names the source-only family in the detailed mirror section",
  );
});

test("Remediation Pack carries example evidence into the action table", () => {
  const report = buildReport(
    makeResult({
      remediationPack: {
        strategy: "Blocking → Hygiene → Backlog",
        tasks: [
          {
            order: 1,
            title: "Stage A warn: Validation Date Coverage",
            issueClass: "hygiene",
            owner: "rules-maintainers",
            slaDays: 14,
            dueDate: "2026-04-05",
            expectedRuleDelta: 5,
            expectedGuardrailDelta: 3,
            exampleEvidence: [
              "Structural health passes with warnings.",
              "20% of governance files include Last validated",
            ],
            acceptanceCriteria: [],
          },
        ],
      },
    }),
  );

  assert(
    report.includes(
      "| # | Task | Class | Owner | Due | Expected Rule Δ | Expected Guardrail Δ | Example evidence |",
    ),
    "adds example evidence column to remediation table",
  );
  assert(
    report.includes(
      "| 1 | Stage A warn: Validation Date Coverage | 🟠 hygiene | rules-maintainers | 2026-04-05 | +5 | +3 | Structural health passes with warnings.; 20% of governance files include Last validated |",
    ),
    "shows compact evidence preview inline for remediation task",
  );
});

test("Remediation Pack repeats stale-risk cue inside the action path when freshness risk exists", () => {
  const report = buildReport(
    makeResult({
      scoringRuleFiles: [
        {
          path: "/tmp/test-repo/TOOLS.md",
          relativePath: "TOOLS.md",
          tool: "claude",
          format: "markdown",
          sizeLines: 220,
          hasAlwaysApply: true,
          hasGlob: false,
          hasDescription: true,
          hasLastValidated: false,
          hasWhySection: false,
          hasExamplesSection: false,
          linesOverBudget: true,
          authorship: "governance",
          fingerprint: "tools-md",
        },
      ] as AuditResult["scoringRuleFiles"],
      remediationPack: {
        strategy: "Blocking → Hygiene → Backlog",
        tasks: [
          {
            order: 1,
            title: "Stage A warn: Validation Date Coverage",
            issueClass: "hygiene",
            owner: "rules-maintainers",
            slaDays: 14,
            dueDate: "2026-04-05",
            expectedRuleDelta: 5,
            expectedGuardrailDelta: 3,
            exampleEvidence: ["Structural health passes with warnings."],
            acceptanceCriteria: [],
          },
        ],
      },
    }),
  );

  assert(
    report.includes(
      "Freshness focus: validate or split `TOOLS.md` first so stale always-on guidance does not stay buried below the summary path.",
    ),
    "adds a freshness-focus cue directly inside remediation pack",
  );
});

test("High-risk stale always-on rules become explicit remediation tasks and process issues", () => {
  const staleRule = {
    path: "/tmp/test-repo/TOOLS.md",
    relativePath: "TOOLS.md",
    tool: "claude",
    format: "markdown",
    sizeLines: 220,
    hasAlwaysApply: true,
    hasGlob: false,
    hasDescription: true,
    hasLastValidated: false,
    hasWhySection: false,
    hasExamplesSection: false,
    linesOverBudget: true,
    authorship: "governance",
    fingerprint: "tools-md",
  } as AuditResult["scoringRuleFiles"][number];
  const base = makeResult({
    scoringRuleFiles: [staleRule],
    ruleInventory: {
      ...emptyInventory(),
      allFiles: [staleRule],
      canonicalFiles: [staleRule],
      canonicalGovernanceFiles: [staleRule],
    },
  });
  const processIssues = buildProcessIssues(
    base.auditDate,
    base.stageA,
    base.stageB,
    base.stageC,
    base.stageD,
    base.scoringRuleFiles,
    base.ruleInventory,
    {
      noWhyCount: 0,
      noExamplesCount: 0,
      overBudgetCount: 0,
      undatedCount: 0,
    },
    base.guardrail,
    base.coverageGaps,
    base.prMining,
    [],
  );
  const remediationPack = buildRemediationPack(processIssues);
  const report = buildReport(
    makeResult({
      scoringRuleFiles: [staleRule],
      ruleInventory: base.ruleInventory,
      processIssues,
      remediationPack,
    }),
  );

  assert(
    processIssues.some(
      (issue) =>
        issue.id === "freshness-risk-stale-always-on" &&
        issue.title === "Validate or split stale always-on rules",
    ),
    "queues a process issue for the stale always-on remediation path",
  );
  assert(
    remediationPack.tasks.some(
      (task) => task.title === "Validate or split stale always-on rules",
    ),
    "promotes the stale always-on issue into the remediation pack",
  );
  assert(
    report.includes(
      "| 1 | Validate or split stale always-on rules | 🟠 hygiene | rules-maintainers | 2026-04-05 | +5 | +3 | TOOLS.md — missing Last validated + oversized always-on file + missing Why/failure mode + missing examples |",
    ),
    "renders the stale-rule task as a concrete remediation row",
  );
  assert(
    report.includes(
      "| `freshness-risk-stale-always-on` | 🟠 hygiene | rules-maintainers | 14d | 2026-04-05 | Validate or split stale always-on rules |",
    ),
    "renders the stale-rule process issue as a trackable queue row",
  );
});

test("Freshness-risk ordering stays aligned across summary, remediation pack, and process queue", () => {
  const staleRule = {
    path: "/tmp/test-repo/TOOLS.md",
    relativePath: "TOOLS.md",
    tool: "claude",
    format: "markdown",
    sizeLines: 220,
    hasAlwaysApply: true,
    hasGlob: false,
    hasDescription: true,
    hasLastValidated: false,
    hasWhySection: false,
    hasExamplesSection: false,
    linesOverBudget: true,
    authorship: "governance",
    fingerprint: "tools-md",
  } as AuditResult["scoringRuleFiles"][number];
  const base = makeResult({
    scoringRuleFiles: [staleRule],
    ruleInventory: {
      ...emptyInventory(),
      allFiles: [staleRule],
      canonicalFiles: [staleRule],
      canonicalGovernanceFiles: [staleRule],
    },
  });
  const processIssues = buildProcessIssues(
    base.auditDate,
    base.stageA,
    base.stageB,
    base.stageC,
    base.stageD,
    base.scoringRuleFiles,
    base.ruleInventory,
    {
      noWhyCount: 1,
      noExamplesCount: 1,
      overBudgetCount: 0,
      undatedCount: 0,
    },
    base.guardrail,
    base.coverageGaps,
    base.prMining,
    [],
  );
  const remediationPack = buildRemediationPack(processIssues);
  const report = buildReport(
    makeResult({
      scoringRuleFiles: [staleRule],
      ruleInventory: base.ruleInventory,
      processIssues,
      remediationPack,
    }),
  );

  assert(
    processIssues[0]?.id === "freshness-risk-stale-always-on",
    "sorts the freshness-risk process issue to the front of the queue",
  );
  assert(
    remediationPack.tasks[0]?.title ===
      "Validate or split stale always-on rules",
    "keeps the freshness-risk remediation task as task #1 when it is the fix-first cue",
  );
  assert(
    !report.includes("| 2 | Add examples (DO/DON'T) to canonical rules |"),
    "collapses the sibling example task when freshness-risk already captures the same file-level cleanup",
  );
  assert(
    !report.includes("| `format-examples` |"),
    "collapses the sibling example issue when freshness-risk already captures the same file-level cleanup",
  );
});

test("single stale always-on file collapses sibling hygiene work into one primary packet", () => {
  const staleRule = {
    path: "/tmp/test-repo/TOOLS.md",
    relativePath: "TOOLS.md",
    tool: "claude",
    format: "markdown",
    sizeLines: 220,
    hasAlwaysApply: false,
    hasGlob: false,
    hasDescription: true,
    hasLastValidated: false,
    hasWhySection: false,
    hasExamplesSection: false,
    linesOverBudget: true,
    authorship: "governance",
    fingerprint: "tools-md",
  } as AuditResult["scoringRuleFiles"][number];
  const base = makeResult({
    ruleScore5: 3.9,
    ruleScore100: 78,
    ruleEffectiveness: {
      status: "Unmeasured",
      instrumentedRuleCount: 0,
      totalRuleCount: 1,
      failureModeRuleCount: 0,
      baselineRuleCount: 0,
      signalRuleCount: 0,
      reviewIntervalRuleCount: 0,
      evidence: [],
      note: "",
    },
    overkill: {
      score: 1,
      redundancyPressure: 0,
      conflictPressure: 0,
      contextLoadPressure: 0,
      lowYieldPressure: 0,
      alwaysOnLines: 220,
      lowYieldRules: 1,
      keywordConflictCount: 0,
    },
    ruleFiles: [staleRule],
    scoringRuleFiles: [staleRule],
    ruleInventory: {
      ...emptyInventory(),
      allFiles: [staleRule],
      canonicalFiles: [staleRule],
      canonicalGovernanceFiles: [staleRule],
    },
  });
  const processIssues = buildProcessIssues(
    base.auditDate,
    base.stageA,
    base.stageB,
    base.stageC,
    base.stageD,
    base.scoringRuleFiles,
    base.ruleInventory,
    {
      noWhyCount: 1,
      noExamplesCount: 1,
      overBudgetCount: 1,
      undatedCount: 1,
    },
    base.guardrail,
    base.coverageGaps,
    base.prMining,
    [],
  );
  const remediationPack = buildRemediationPack(processIssues);
  const report = buildReport(
    makeResult({
      ruleScore5: 3.9,
      ruleScore100: 78,
      ruleEffectiveness: base.ruleEffectiveness,
      overkill: base.overkill,
      ruleFiles: [staleRule],
      scoringRuleFiles: [staleRule],
      ruleInventory: base.ruleInventory,
      processIssues,
      remediationPack,
    }),
  );

  assert(
    processIssues.map((issue) => issue.title).join(" | ") ===
      "Validate or split stale always-on rules",
    "keeps only the combined stale-file issue when one file explains all sibling hygiene symptoms",
  );
  assert(
    remediationPack.tasks.map((task) => task.title).join(" | ") ===
      "Validate or split stale always-on rules",
    "keeps remediation pack aligned to one primary stale-file packet",
  );
  assert(
    report.includes("| Issues found | 1 🟠 |"),
    "reduces summary issue count to one distinct work packet",
  );
  assert(
    report.includes("| Remediation tasks | 1 🟠 |"),
    "reduces remediation task count to one distinct work packet",
  );
  assert(
    report.includes(
      "| 1 | Validate or split stale always-on rules | 🟠 hygiene | rules-maintainers | 2026-04-05 | +5 | +3 | TOOLS.md — missing Last validated + oversized always-on file + missing Why/failure mode + missing examples |",
    ),
    "keeps the collapsed row explicit about the sub-fixes inside the single packet",
  );
  assert(
    !report.includes("Add examples (DO/DON'T) to canonical rules"),
    "does not mint a separate examples task for the same stale file",
  );
  assert(
    !report.includes("Add Last validated dates"),
    "does not mint a separate date task for the same stale file",
  );
  assert(
    !report.includes("Add Why sections to canonical rules"),
    "does not mint a separate why task for the same stale file",
  );
  assert(
    !report.includes("Split oversized rules into focused files"),
    "does not mint a separate size task for the same stale file",
  );
});

test("Mirror-only conflict pressure points remediation at mirror drift, not conflicting guidance", () => {
  const base = makeResult({
    stageD: {
      name: "Stage D",
      status: "fail",
      summary:
        "Overkill/noise pressure is high; repair mirror drift/orphan pressure and streamline low-yield rules before adding more.",
      checks: [
        {
          id: "conflict-pressure",
          label: "Conflict Pressure",
          status: "fail",
          detail: "70% pressure (mirror drift/orphans + keyword conflicts=0)",
        },
      ],
    },
    ruleInventory: {
      ...emptyInventory(),
      mirrorDriftedCount: 1,
      mirrorOrphanProjectionCount: 1,
    },
    overkill: {
      score: 0.5,
      redundancyPressure: 0,
      conflictPressure: 0.7,
      contextLoadPressure: 0.4,
      lowYieldPressure: 0.8,
      alwaysOnLines: 300,
      lowYieldRules: 4,
      keywordConflictCount: 0,
    },
  });

  const processIssues = buildProcessIssues(
    base.auditDate,
    base.stageA,
    base.stageB,
    base.stageC,
    base.stageD,
    base.scoringRuleFiles,
    base.ruleInventory,
    {
      noWhyCount: 0,
      noExamplesCount: 0,
      overBudgetCount: 0,
      undatedCount: 0,
    },
    base.guardrail,
    base.coverageGaps,
    base.prMining,
    [],
  );
  const remediationPack = buildRemediationPack(processIssues);
  const report = buildReport(
    makeResult({
      ...base,
      processIssues,
      remediationPack,
    }),
  );

  assert(
    processIssues.some(
      (issue) =>
        issue.id === "stageD-conflict-pressure" &&
        issue.title ===
          "Repair mirror drift/orphan pressure before adding more rules",
    ),
    "rewrites the stage-level conflict-pressure action to the real mirror failure mode",
  );
  assert(
    remediationPack.tasks.some(
      (task) =>
        task.title ===
        "Repair mirror drift/orphan pressure before adding more rules",
    ),
    "carries the mirror-specific action into the remediation pack",
  );
  assert(
    report.includes(
      "which means the repo likely has too much instruction load or mirror-sync drift.",
    ),
    "explains mirror-only conflict pressure honestly in the Stage D narrative",
  );
  assert(
    !report.includes(
      "which means the repo likely has too much instruction load or conflicting guidance.",
    ),
    "does not claim conflicting guidance when keyword conflicts are zero",
  );
});

test("Remediation Pack deduplicates overlapping mirror actions in the top slice", () => {
  const base = makeResult({
    stageA: {
      name: "Stage A",
      status: "fail",
      summary: "Structural health is below threshold.",
      checks: [
        {
          id: "mirror-sync",
          label: "Mirror Sync",
          status: "fail",
          detail: "healthy=7, drifted=1, orphan projections=1",
        },
      ],
    },
    ruleInventory: {
      ...emptyInventory(),
      mirrorGroups: [
        {
          status: "drifted",
          sourcePath: "AGENTS.md",
          memberPaths: ["AGENTS.md", "CLAUDE.md"],
        },
        {
          status: "orphan-projection",
          sourcePath: null,
          memberPaths: ["ai-rules/generated.md"],
        },
      ] as AuditResult["ruleInventory"]["mirrorGroups"],
      mirrorDriftedCount: 1,
      mirrorOrphanProjectionCount: 1,
      mirrorHealthyCount: 7,
    },
  });

  const processIssues = buildProcessIssues(
    base.auditDate,
    base.stageA,
    base.stageB,
    base.stageC,
    base.stageD,
    base.scoringRuleFiles,
    base.ruleInventory,
    {
      noWhyCount: 0,
      noExamplesCount: 0,
      overBudgetCount: 0,
      undatedCount: 0,
    },
    base.guardrail,
    base.coverageGaps,
    base.prMining,
    [],
  );
  const remediationPack = buildRemediationPack(processIssues);

  assert(
    remediationPack.tasks.filter((task) => /mirror/i.test(task.title))
      .length === 1,
    "keeps the top remediation slice to one distinct mirror action",
  );
  assert(
    remediationPack.tasks.some(
      (task) => task.title === "Fix drifted mirror projections",
    ),
    "prefers the concrete mirror fix over the generic stage-level duplicate",
  );
  assert(
    !remediationPack.tasks.some(
      (task) =>
        task.title === "Repair drifted or orphaned mirror rule projections",
    ),
    "drops the overlapping stage-level mirror action from the remediation pack",
  );
});

test("Metadata-only date coverage stays hygiene behind substantive blocking work", () => {
  const base = makeResult({
    stageC: {
      name: "Stage C",
      status: "fail",
      summary: "Gap coverage is below threshold.",
      checks: [
        {
          id: "freshness-coverage",
          label: "Freshness Coverage",
          status: "fail",
          detail: "10% of scoring files include Last validated",
        },
        {
          id: "critical-baseline-coverage",
          label: "Critical Baseline Coverage",
          status: "fail",
          detail: "2/5 critical categories covered",
        },
      ],
    },
  });

  const processIssues = buildProcessIssues(
    base.auditDate,
    base.stageA,
    base.stageB,
    base.stageC,
    base.stageD,
    base.scoringRuleFiles,
    base.ruleInventory,
    {
      noWhyCount: 0,
      noExamplesCount: 0,
      overBudgetCount: 0,
      undatedCount: 0,
    },
    base.guardrail,
    base.coverageGaps,
    base.prMining,
    [],
  );
  const remediationPack = buildRemediationPack(processIssues);
  const dateIssue = processIssues.find(
    (issue) => issue.id === "stageC-freshness-coverage",
  );

  assert(dateIssue?.issueClass === "hygiene", "keeps date coverage in hygiene");
  assert(
    remediationPack.tasks[0]?.title ===
      "Add rules for uncovered critical baseline categories",
    "prefers substantive coverage work before validation-date hygiene",
  );
  assert(
    remediationPack.tasks[0]?.title !==
      "Add Last validated dates to scoring rules",
    "does not let validation dates consume the lead blocking slot by default",
  );
});

test("Stage A trust repair leads remediation pack when Stage A is the first failing gate", () => {
  const base = makeResult({
    stageA: {
      name: "Stage A",
      status: "fail",
      summary:
        "Structural health is below threshold. Address process hygiene before deep rule scoring.",
      checks: [
        {
          id: "date-hygiene",
          label: "Validation Date Coverage",
          status: "fail",
          detail: "20% of governance files include Last validated",
        },
      ],
    },
    stageD: {
      name: "Stage D",
      status: "fail",
      summary:
        "Overkill/noise pressure is high; streamline and de-conflict rules before adding more.",
      checks: [
        {
          id: "low-yield-rules",
          label: "Low-Yield Rule Ratio",
          status: "fail",
          detail:
            "4/5 scoring files miss Why or Examples; Overkill/noise pressure is high; streamline and de-conflict rules before adding more.",
        },
      ],
    },
    scoringRuleFiles: [
      {
        path: "/tmp/test-repo/AGENTS.md",
        relativePath: "AGENTS.md",
        tool: "claude",
        format: "markdown",
        sizeLines: 120,
        hasAlwaysApply: true,
        hasGlob: false,
        hasDescription: true,
        hasLastValidated: false,
        hasWhySection: false,
        hasExamplesSection: false,
        linesOverBudget: false,
        authorship: "governance",
        fingerprint: "agents-md",
      } as AuditResult["scoringRuleFiles"][number],
    ],
    ruleInventory: {
      ...emptyInventory(),
      allFiles: [],
      canonicalFiles: [],
      canonicalGovernanceFiles: [],
    },
  });

  const processIssues = buildProcessIssues(
    base.auditDate,
    base.stageA,
    base.stageB,
    base.stageC,
    base.stageD,
    base.scoringRuleFiles,
    base.ruleInventory,
    {
      noWhyCount: 1,
      noExamplesCount: 1,
      overBudgetCount: 0,
      undatedCount: 1,
    },
    base.guardrail,
    base.coverageGaps,
    base.prMining,
    [],
  );
  const remediationPack = buildRemediationPack(processIssues, {
    promoteStageATrustIssues: true,
  });

  assert(
    remediationPack.tasks[0]?.title ===
      "Add Last validated dates to governance rules",
    "puts the concrete Stage A trust repair ahead of later blocking work",
  );
  assert(
    remediationPack.tasks[1]?.title ===
      "Rewrite or retire low-yield scoring rules",
    "keeps later Stage D blocking work immediately after the Stage A repair",
  );
});

test("Report renders rule effectiveness status section", () => {
  const report = buildReport(
    makeResult({
      ruleEffectiveness: {
        status: "Instrumented",
        instrumentedRuleCount: 1,
        totalRuleCount: 2,
        failureModeRuleCount: 2,
        baselineRuleCount: 1,
        signalRuleCount: 1,
        reviewIntervalRuleCount: 1,
        evidence: [
          "1/2 canonical rule file(s) show the minimum instrumentation loop",
        ],
        note: "At least one canonical rule file includes the minimum effectiveness loop: failure mode, baseline, signal, and review interval.",
      },
    }),
  );

  assert(
    report.includes("### Rule Effectiveness Status"),
    "adds the rule effectiveness section",
  );
  assert(
    report.includes("Status: **Instrumented**"),
    "shows the effectiveness status label",
  );
  assert(
    report.includes("| Minimum instrumentation loop | 1/2 |"),
    "shows instrumentation coverage counts",
  );
  assert(
    report.includes(
      "| Effectiveness coverage | full loop 1/2; baseline 1/2; signal 1/2; review 1/2 |",
    ),
    "surfaces incomplete instrumented coverage in the summary table",
  );
});

test("Unmeasured effectiveness surfaces concrete instrumentation candidate", () => {
  const report = buildReport(
    makeResult({
      ruleEffectiveness: {
        status: "Unmeasured",
        instrumentedRuleCount: 0,
        totalRuleCount: 2,
        failureModeRuleCount: 1,
        baselineRuleCount: 0,
        signalRuleCount: 0,
        reviewIntervalRuleCount: 0,
        evidence: [
          "0/2 canonical rule file(s) show the minimum instrumentation loop",
        ],
        note: "No canonical rule file currently shows the full effectiveness loop.",
        instrumentationCandidate: {
          fileName: "AGENTS.md",
          missing: ["baseline", "primary signal", "review interval"],
        },
      },
    }),
  );

  assert(
    report.includes("Start with `AGENTS.md`"),
    "names the specific rule file to instrument",
  );
  assert(
    report.includes(
      "Add the missing pieces: baseline, primary signal, review interval",
    ),
    "lists the missing pieces",
  );
  assert(
    report.includes("re-audit to confirm the loop closes"),
    "gives a completion signal",
  );
});

test("Remediation Pack appears before Process Issue Queue", () => {
  const report = buildReport(
    makeResult({
      processIssues: [
        {
          id: "stageA-date-hygiene",
          title: "Stage A warn: Validation Date Coverage",
          detail: "20% of governance files include Last validated",
          issueClass: "hygiene",
          owner: "rules-maintainers",
          slaDays: 14,
          dueDate: "2026-04-05",
          evidence: ["Structural health passes with warnings."],
        },
      ],
      remediationPack: {
        strategy: "Blocking → Hygiene → Backlog",
        tasks: [
          {
            order: 1,
            title: "Stage A warn: Validation Date Coverage",
            issueClass: "hygiene",
            owner: "rules-maintainers",
            slaDays: 14,
            dueDate: "2026-04-05",
            expectedRuleDelta: 5,
            expectedGuardrailDelta: 3,
            exampleEvidence: ["Structural health passes with warnings."],
            acceptanceCriteria: [],
          },
        ],
      },
    }),
  );

  assert(
    report.indexOf("## Remediation Pack") <
      report.indexOf("## Process Issue Queue"),
    "puts remediation path before issue diagnostics",
  );
});

test("Remediation path appears immediately after summary before AI and rule diagnostics", () => {
  const report = buildReport(
    makeResult({
      remediationPack: {
        strategy: "Blocking → Hygiene → Backlog",
        tasks: [
          {
            order: 1,
            title: "Stage A warn: Validation Date Coverage",
            issueClass: "hygiene",
            owner: "rules-maintainers",
            slaDays: 14,
            dueDate: "2026-04-05",
            expectedRuleDelta: 5,
            expectedGuardrailDelta: 3,
            exampleEvidence: ["Structural health passes with warnings."],
            acceptanceCriteria: [],
          },
        ],
      },
    }),
  );

  assert(
    report.indexOf("## Remediation Pack") > report.indexOf("## Summary"),
    "keeps remediation after summary",
  );
  assert(
    report.indexOf("## Remediation Pack") <
      report.indexOf("## Top 5 Improvements"),
    "moves remediation ahead of improvements backlog",
  );
  assert(
    report.indexOf("## Remediation Pack") < report.indexOf("## Rule Files"),
    "moves remediation ahead of supporting diagnostics",
  );
  assert(
    report.indexOf("## Remediation Pack") <
      report.indexOf("### Process Stages"),
    "moves remediation ahead of stage diagnostics",
  );
  assert(
    report.indexOf("## Process Issue Queue") <
      report.indexOf("### Process Stages"),
    "keeps process issue queue in the early action path",
  );
});

test("Detailed diagnostics use compact navigation links instead of action recap prose", () => {
  const report = buildReport(
    makeResult({
      processIssues: [
        {
          id: "stageA-date-hygiene",
          title: "Stage A warn: Validation Date Coverage",
          detail: "20% of governance files include Last validated",
          issueClass: "hygiene",
          owner: "rules-maintainers",
          slaDays: 14,
          dueDate: "2026-04-05",
          evidence: ["Structural health passes with warnings."],
        },
      ],
      remediationPack: {
        strategy: "Blocking → Hygiene → Backlog",
        tasks: [
          {
            order: 1,
            title: "Stage A warn: Validation Date Coverage",
            issueClass: "hygiene",
            owner: "rules-maintainers",
            slaDays: 14,
            dueDate: "2026-04-05",
            expectedRuleDelta: 5,
            expectedGuardrailDelta: 3,
            exampleEvidence: ["Structural health passes with warnings."],
            acceptanceCriteria: [],
          },
        ],
      },
    }),
  );

  assert(
    report.includes("### Diagnostic Navigation"),
    "adds compact diagnostics navigation heading",
  );
  assert(
    report.includes("- [Summary](#summary)"),
    "links back to summary section",
  );
  assert(
    report.includes("- [Remediation Pack](#remediation-pack)"),
    "links to remediation pack without repeating task prose",
  );
  assert(
    report.includes("- [Process Issue Queue](#process-issue-queue)"),
    "links to issue queue without repeating issue prose",
  );
  assert(
    !report.includes("### Action Path Recap"),
    "removes redundant action-path recap heading",
  );
  assert(
    !report.includes("- Start with [Remediation Pack](#remediation-pack):"),
    "removes repeated remediation recap sentence",
  );
  assert(
    !report.includes("- Track in [Process Issue Queue](#process-issue-queue):"),
    "removes repeated process-queue recap sentence",
  );
});

test("Remediation pack escapes markdown-reserved evidence in table cells", () => {
  const report = buildReport(
    makeResult({
      remediationPack: {
        strategy: "Blocking → Hygiene → Backlog",
        tasks: [
          {
            order: 1,
            title: "Fix drifted mirror projections",
            issueClass: "blocking",
            owner: "rules-platform",
            slaDays: 7,
            dueDate: "2026-05-08",
            expectedRuleDelta: 8,
            expectedGuardrailDelta: 5,
            exampleEvidence: [
              "AGENTS.md | CLAUDE.md",
              "Use `mirror-sync --apply` first",
            ],
            acceptanceCriteria: [],
          },
        ],
      },
    }),
  );

  assert(
    report.includes(
      "AGENTS.md \\| CLAUDE.md; Use \\`mirror-sync --apply\\` first",
    ),
    "keeps pipe and backtick evidence inside one readable table cell",
  );
  assert(
    !report.includes("| AGENTS.md | CLAUDE.md |"),
    "does not leak raw pipe-delimited evidence into extra markdown columns",
  );
});

test("Heuristic synthesis uses a non-AI heading and points to the next ratchet lane on empty state", () => {
  const report = buildReport(makeResult());

  assert(
    report.includes("## Top 5 Improvements"),
    "uses a neutral heading for heuristic synthesis",
  );
  assert(
    !report.includes("## AI Top 5 Improvements"),
    "does not claim heuristic synthesis is AI-backed",
  );
  assert(
    report.includes("No heuristic improvements surfaced from this run."),
    "explains heuristic empty state honestly",
  );
  assert(
    report.includes(
      "If you want the next ratchet, start with the weakest scored lane above: CI discipline (1/5).",
    ),
    "turns the empty state into a concrete next-step pointer",
  );
});

test("Heuristic empty state explains the type-safety 4/5 plateau precisely", () => {
  const report = buildReport(
    makeResult({
      scoreBreakdown: {
        presence: 1,
        format: 1,
        tiers: 1,
        hygiene: 1,
        coverage: 1,
        enforcement: 1,
        gapCoverage: 1,
        overkill: 1,
      },
      guardrail: {
        ...makeResult().guardrail,
        breakdown: {
          ciDiscipline: 5,
          typeSafety: 4,
          testDepth: 5,
          codeQuality: 5,
          reviewOwnership: 5,
          security: 5,
          driftResilience: 5,
        },
      },
    }),
  );

  assert(
    report.includes(
      "Remaining score delta is near-max: type safety (4/5 — 5/5 needs type-aware ESLint or a dedicated extra-strict TS lane in CI). Treat it as optional unless fresh evidence shows it is blocking a real outcome.",
    ),
    "keeps the near-max plateau visible without inventing backlog",
  );
  assert(
    !report.includes(
      "If you want the next ratchet, start with the weakest scored lane above: type safety",
    ),
    "does not turn a near-max plateau into a forced next step",
  );
});

test("Heuristic empty state does not invent a next ratchet for near-max rule deltas", () => {
  const report = buildReport(
    makeResult({
      scoreBreakdown: {
        presence: 1,
        format: 1,
        tiers: 1,
        hygiene: 1,
        coverage: 1,
        enforcement: 0.8,
        gapCoverage: 1,
        overkill: 1,
      },
      guardrail: {
        ...makeResult().guardrail,
        total: 35,
        maturity: "Hardened",
        rawTotal: 35,
        breakdown: {
          ciDiscipline: 5,
          typeSafety: 5,
          testDepth: 5,
          codeQuality: 5,
          reviewOwnership: 5,
          security: 5,
          driftResilience: 5,
        },
      },
    }),
  );

  assert(
    report.includes(
      "| Remaining score delta | near-max: enforcement layer (0.8/1); optional unless it blocks a real outcome |",
    ),
    "surfaces the optional near-max delta in the summary table",
  );
  assert(
    report.includes(
      "Remaining score delta is near-max: enforcement layer (0.8/1). Treat it as optional unless fresh evidence shows it is blocking a real outcome.",
    ),
    "keeps the remaining delta visible without turning a clean pass into backlog",
  );
  assert(
    !report.includes(
      "If you want the next ratchet, start with the weakest scored lane above: enforcement layer (0.8/1).",
    ),
    "does not tell the reader to start with a near-max rule delta",
  );
});

test("Guardrail Breakdown uses tie-aware wording when every dimension is equally strong", () => {
  const report = buildReport(
    makeResult({
      guardrail: {
        ...makeResult().guardrail,
        total: 35,
        maturity: "Hardened",
        rawTotal: 35,
        breakdown: {
          ciDiscipline: 5,
          typeSafety: 5,
          testDepth: 5,
          codeQuality: 5,
          reviewOwnership: 5,
          security: 5,
          driftResilience: 5,
        },
      },
    }),
  );

  assert(
    report.includes(
      "All measured guardrail dimensions are tied at 5/5, so no single area is currently weaker than the rest.",
    ),
    "explains tied perfect guardrail scores without inventing a weakest lane",
  );
  assert(
    !report.includes(
      "The strongest area is CI discipline, while the weakest is CI discipline.",
    ),
    "does not emit identical strongest/weakest prose on a tied pass",
  );
});

test("AI synthesis keeps the AI-specific heading", () => {
  const report = buildReport(
    makeResult({
      aiSynthesis: {
        mode: "ai",
        model: "gpt-5.4",
        suggestions: [],
      },
    }),
  );

  assert(
    report.includes("## AI Top 5 Improvements"),
    "keeps the AI-specific heading when a model produced the section",
  );
  assert(
    report.includes("No synthesized improvements available."),
    "keeps the AI empty-state copy for model-backed synthesis",
  );
});

test("Heuristic empty state does not invent weak lanes when all scores are already maxed", () => {
  const report = buildReport(
    makeResult({
      scoreBreakdown: {
        presence: 1,
        format: 1,
        tiers: 1,
        hygiene: 1,
        coverage: 1,
        enforcement: 1,
        gapCoverage: 1,
        overkill: 1,
      },
      guardrail: {
        ...makeResult().guardrail,
        breakdown: {
          ciDiscipline: 5,
          typeSafety: 5,
          testDepth: 5,
          codeQuality: 5,
          reviewOwnership: 5,
          security: 5,
          driftResilience: 5,
        },
      },
    }),
  );

  assert(
    !report.includes(
      "If you want the next ratchet, start with the weakest scored lane",
    ),
    "does not point to a fake weak lane when nothing is actually weak",
  );
  assert(
    report.includes(
      "If you want the next ratchet, review the weakest score lanes above and tighten the next one that has real evidence behind it.",
    ),
    "falls back to the generic empty-state guidance when all lanes are maxed",
  );
});

test("Diagnostic navigation stage-status line points to process stages when blockers exist", () => {
  const report = buildReport(
    makeResult({
      stageA: {
        name: "Stage A",
        status: "fail",
        summary: "Stage A summary",
        checks: [
          {
            label: "Structural Health",
            status: "fail",
            detail: "Structural health fails.",
          },
        ],
      },
    }),
  );
  assert(
    report.includes(
      "- Stage status: blockers in Stage A; prioritize those checks in [Process Stages](#process-stages).",
    ),
    "shows blocker-focused stage navigation line with process-stages link",
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
