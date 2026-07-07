/**
 * Tests for buildSummaryLayer() — executive verdict block added in Cycle 26.
 *
 * Validates: verdict derivation, top-3 action rendering, at-a-glance table,
 * and fallback to AI suggestions when no remediation tasks exist.
 *
 * Run: bun run scripts/audit-summary-layer.test.ts
 */

import { type AuditResult, buildSummaryLayer } from "./audit.ts";

// ─── Minimal mock factory ─────────────────────────────────────────────────────

function makeStage(
  name: "Stage A" | "Stage B" | "Stage C" | "Stage D",
  status: "pass" | "fail" | "skipped",
) {
  return { name, status, summary: `${name} summary`, checks: [] };
}

function makeRuleFile(overrides: Record<string, unknown> = {}) {
  return {
    path: "/tmp/test-repo/AGENTS.md",
    relativePath: "AGENTS.md",
    tool: "openclaw",
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
    fingerprint: "fp-test",
    ...overrides,
  };
}

function makeResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    auditMode: "ci",
    projectName: "test-repo",
    projectPath: "/tmp/test-repo",
    auditDate: "2026-03-16",
    ruleFiles: [],
    scoringRuleFiles: [],
    ruleInventory: {
      allFiles: [],
      canonicalFiles: [],
      canonicalGovernanceFiles: [],
      canonicalGeneratedFiles: [],
      duplicateMirrorCount: 0,
      expectedDuplicateMirrorCount: 0,
      accidentalDuplicateMirrorCount: 0,
      duplicationRate: 0,
      accidentalDuplicationRate: 0,
      expectedDuplicateGroups: [],
      accidentalDuplicateGroups: [],
      mirrorGroups: [],
      mirrorHealthyCount: 0,
      mirrorDriftedCount: 0,
      mirrorOrphanProjectionCount: 0,
      mirrorSourceOnlyCount: 0,
    },
    driftReportPath: null,
    bootstrapDraftPath: null,
    artifactsDir: "/tmp",
    coverageGaps: [],
    enforcementLayer: { level: "none", detected: [], score: 0 },
    cliSignals: { isCli: false, confidence: 0 },
    guardrail: {
      total: 14,
      maturity: "Developing",
      breakdown: {
        ciDiscipline: 2,
        typeSafety: 3,
        testDepth: 2,
        codeQuality: 2,
        reviewOwnership: 1,
        security: 2,
        driftResilience: 2,
      },
    },
    aiSynthesis: { mode: "heuristic", model: null, suggestions: [] },
    hasBlockAiRules: false,
    hasAiRulesDir: false,
    ruleScore5: 3.0,
    ruleScore100: 60,
    scoreBreakdown: {},
    recommendations: [],
    driftSummary: {
      missingCount: 1,
      movedCount: 0,
      expiredCount: 1,
      total: 2,
      issues: [],
    },
    stageA: makeStage("Stage A", "pass"),
    stageB: makeStage("Stage B", "pass"),
    stageC: makeStage("Stage C", "pass"),
    stageD: makeStage("Stage D", "pass"),
    gapCoverage: {
      score: 0.7,
      prCoverageScore: 0.7,
      commentAlignmentScore: 0.7,
      criticalCoverageScore: 0.7,
      highSeverityCoverageScore: 0.7,
      freshnessCoverageScore: 0.7,
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
      score: 0.8,
      redundancyPressure: 0.2,
      conflictPressure: 0.1,
      contextLoadPressure: 0.1,
      lowYieldPressure: 0.1,
      alwaysOnLines: 50,
      lowYieldRules: 0,
      keywordConflictCount: 0,
    },
    prMining: {
      status: "unavailable",
      repo: null,
      reason: "no GitHub remote",
      analyzedPrs: 0,
      reviewedComments: 0,
      substantiveComments: 0,
      candidateCount: 0,
      findings: [],
    },
    rulePortfolio: { changeExisting: [], addNew: [], reduceOverkill: [] },
    processIssues: [],
    remediationPack: { strategy: "", tasks: [] },
    ...overrides,
  } as AuditResult;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

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

// ── Verdict derivation ────────────────────────────────────────────────────────

test("PASS verdict when all stages pass and score ≥ 50", () => {
  const result = makeResult({ ruleScore100: 65 });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("✅ Verdict: PASS")),
    "shows PASS verdict",
  );
});

test("CRITICAL verdict when Stage A fails", () => {
  const result = makeResult({ stageA: makeStage("Stage A", "fail") });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("🔴 Verdict: CRITICAL")),
    "shows CRITICAL verdict",
  );
});

test("NEEDS WORK when Stage C fails (A passes)", () => {
  const result = makeResult({ stageC: makeStage("Stage C", "fail") });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("🟡 Verdict: NEEDS WORK")),
    "shows NEEDS WORK verdict",
  );
});

test("NEEDS WORK when score < 50 even if all stages pass", () => {
  const result = makeResult({ ruleScore100: 40 });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("🟡 Verdict: NEEDS WORK")),
    "shows NEEDS WORK for low score",
  );
});

test("Fix first points to Stage A when structural trust fails", () => {
  const result = makeResult({ stageA: makeStage("Stage A", "fail") });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) =>
      l.includes("Fix first: restore Stage A structural trust"),
    ),
    "prioritizes Stage A before later scores",
  );
});

test("Fix first includes concise owner/due context for blocking remediation tasks", () => {
  const result = makeResult({
    remediationPack: {
      strategy: "test",
      tasks: [
        {
          order: 1,
          title: "Fix critical drift",
          issueClass: "blocking",
          owner: "Scout",
          slaDays: 7,
          dueDate: "2026-03-29",
          expectedRuleDelta: 10,
          expectedGuardrailDelta: 0,
          acceptanceCriteria: [],
        },
      ],
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) =>
      l.includes("Fix first: Fix critical drift (Scout · due 2026-03-29)."),
    ),
    "adds owner/due for selected remediation task",
  );
});

// ── At-a-glance table ─────────────────────────────────────────────────────────

test("At-a-Glance table shows correct drift count", () => {
  const result = makeResult({
    driftSummary: { pathIssues: 3, dateIssues: 1, notes: 0 },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("| Drift backlog |") && l.includes("4")),
    "drift backlog = 4",
  );
});

test("Small author-written rule surfaces do not warn on governance surface", () => {
  const result = makeResult({
    stageA: {
      name: "Stage A",
      status: "pass",
      summary: "Structural health checks passed.",
      checks: [
        {
          id: "governance-surface",
          label: "Governance Surface",
          status: "pass",
          detail: "2 governance canonical files vs 0 generated canonical files",
        },
      ],
    },
    aiSynthesis: {
      mode: "heuristic",
      model: null,
      suggestions: [
        {
          title: "Add one small improvement",
          why: "Small next step.",
          priority: "low",
          evidence: [],
        },
      ],
    } as AuditResult["aiSynthesis"],
    remediationPack: { strategy: "", tasks: [] },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("Fix first: Add one small improvement.")),
    "falls through to real improvement work instead of governance-surface noise",
  );
});

test("At-a-Glance shows effectiveness status", () => {
  const result = makeResult({
    ruleEffectiveness: {
      status: "Instrumented",
      instrumentedRuleCount: 1,
      totalRuleCount: 2,
      failureModeRuleCount: 2,
      baselineRuleCount: 1,
      signalRuleCount: 1,
      reviewIntervalRuleCount: 1,
      evidence: [],
      note: "",
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some(
      (l) =>
        l.includes("| Effectiveness status |") && l.includes("Instrumented"),
    ),
    "shows effectiveness status in at-a-glance table",
  );
});

test("At-a-Glance surfaces sparse effectiveness coverage on instrumented clean passes", () => {
  const result = makeResult({
    ruleEffectiveness: {
      status: "Instrumented",
      instrumentedRuleCount: 1,
      totalRuleCount: 43,
      failureModeRuleCount: 43,
      baselineRuleCount: 2,
      signalRuleCount: 1,
      reviewIntervalRuleCount: 4,
      evidence: [],
      note: "",
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some(
      (l) =>
        l.includes("| Effectiveness coverage |") &&
        l.includes("full loop 1/43; baseline 2/43; signal 1/43; review 4/43"),
    ),
    "shows sparse effectiveness coverage counts in the summary table",
  );
});

test("At-a-Glance omits effectiveness coverage row when instrumented coverage is complete", () => {
  const result = makeResult({
    ruleEffectiveness: {
      status: "Instrumented",
      instrumentedRuleCount: 3,
      totalRuleCount: 3,
      failureModeRuleCount: 3,
      baselineRuleCount: 3,
      signalRuleCount: 3,
      reviewIntervalRuleCount: 3,
      evidence: [],
      note: "",
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    !lines.some((l) => l.includes("| Effectiveness coverage |")),
    "does not add a redundant coverage row when every rule is fully instrumented",
  );
});

test("At-a-Glance shows zero issues when processIssues is empty", () => {
  const result = makeResult({ processIssues: [] });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("| Issues found |") && l.includes("none")),
    "shows 'none' for 0 issues",
  );
});

test("At-a-Glance shows zero remediation tasks when remediation pack is empty", () => {
  const result = makeResult({ remediationPack: { strategy: "", tasks: [] } });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some(
      (l) => l.includes("| Remediation tasks |") && l.includes("none"),
    ),
    "shows 'none' for 0 remediation tasks",
  );
});

test("At-a-Glance surfaces optional near-max score delta for clean passes", () => {
  const result = makeResult({
    processIssues: [],
    remediationPack: { strategy: "", tasks: [] },
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
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some(
      (l) =>
        l.includes("| Remaining score delta |") &&
        l.includes(
          "near-max: enforcement layer (0.8/1); optional unless it blocks a real outcome",
        ),
    ),
    "shows the optional near-max delta in the summary table",
  );
});

test("At-a-Glance omits near-max score delta when real action backlog exists", () => {
  const result = makeResult({
    processIssues: [
      {
        id: "a",
        title: "x",
        detail: "",
        issueClass: "blocking",
        owner: "",
        slaDays: 7,
        dueDate: "",
        evidence: [],
      },
    ],
    remediationPack: { strategy: "", tasks: [] },
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
  });
  const lines = buildSummaryLayer(result);
  assert(
    !lines.some((l) => l.includes("| Remaining score delta |")),
    "does not add a near-max delta row when real backlog exists",
  );
});

test("At-a-Glance shows issue counts by class", () => {
  const result = makeResult({
    processIssues: [
      {
        id: "a",
        title: "x",
        detail: "",
        issueClass: "blocking",
        owner: "",
        slaDays: 7,
        dueDate: "",
        evidence: [],
      },
      {
        id: "b",
        title: "y",
        detail: "",
        issueClass: "hygiene",
        owner: "",
        slaDays: 14,
        dueDate: "",
        evidence: [],
      },
      {
        id: "c",
        title: "z",
        detail: "",
        issueClass: "hygiene",
        owner: "",
        slaDays: 14,
        dueDate: "",
        evidence: [],
      },
    ],
  });
  const lines = buildSummaryLayer(result);
  const issueRow = lines.find((l) => l.includes("| Issues found |")) ?? "";
  assert(issueRow.includes("1 🔴"), "shows 1 blocking");
  assert(issueRow.includes("2 🟠"), "shows 2 hygiene");
});

test("At-a-Glance shows remediation task counts by class", () => {
  const result = makeResult({
    remediationPack: {
      strategy: "test",
      tasks: [
        {
          order: 1,
          title: "a",
          issueClass: "blocking",
          owner: "",
          slaDays: 7,
          dueDate: "",
          expectedRuleDelta: 0,
          expectedGuardrailDelta: 0,
          acceptanceCriteria: [],
        },
        {
          order: 2,
          title: "b",
          issueClass: "hygiene",
          owner: "",
          slaDays: 14,
          dueDate: "",
          expectedRuleDelta: 0,
          expectedGuardrailDelta: 0,
          acceptanceCriteria: [],
        },
        {
          order: 3,
          title: "c",
          issueClass: "backlog",
          owner: "",
          slaDays: 30,
          dueDate: "",
          expectedRuleDelta: 0,
          expectedGuardrailDelta: 0,
          acceptanceCriteria: [],
        },
      ],
    },
  });
  const lines = buildSummaryLayer(result);
  const remediationRow =
    lines.find((l) => l.includes("| Remediation tasks |")) ?? "";
  assert(remediationRow.includes("1 🔴"), "shows 1 blocking remediation task");
  assert(remediationRow.includes("1 🟠"), "shows 1 hygiene remediation task");
  assert(remediationRow.includes("1 🟡"), "shows 1 backlog remediation task");
});

test("At-a-Glance flags high-risk stale always-on rules", () => {
  const result = makeResult({
    scoringRuleFiles: [makeRuleFile()],
    ruleInventory: {
      ...makeResult().ruleInventory,
      canonicalGovernanceFiles: [makeRuleFile()],
    },
  });
  const lines = buildSummaryLayer(result);
  const staleRow =
    lines.find((l) => l.includes("| High-risk stale rules |")) ?? "";
  assert(staleRow.includes("🚩 1"), "shows stale-rule count with alert marker");
  assert(
    lines.some(
      (l) => l.includes("Freshness alert:") && l.includes("AGENTS.md"),
    ),
    "adds freshness alert callout with file preview",
  );
  assert(
    lines.some(
      (l) =>
        l.includes("Freshness alert:") &&
        l.includes("missing Last validated + oversized always-on file"),
    ),
    "adds compact stale reasons to freshness alert",
  );
});

test("At-a-Glance shows no stale-rule alert when none detected", () => {
  const cleanRule = makeRuleFile({
    sizeLines: 80,
    hasLastValidated: true,
    hasWhySection: true,
    hasExamplesSection: true,
    linesOverBudget: false,
  });
  const result = makeResult({
    scoringRuleFiles: [cleanRule],
    ruleInventory: {
      ...makeResult().ruleInventory,
      canonicalGovernanceFiles: [cleanRule],
    },
  });
  const lines = buildSummaryLayer(result);
  const staleRow =
    lines.find((l) => l.includes("| High-risk stale rules |")) ?? "";
  assert(
    staleRow.includes("none"),
    "shows none when no stale-rule alert is needed",
  );
  assert(
    !lines.some((l) => l.includes("Freshness alert:")),
    "does not add freshness alert callout when clean",
  );
});

test("Summary layer surfaces repeat-audit improvement context", () => {
  const result = makeResult({
    ruleEffectiveness: {
      status: "Improving",
      instrumentedRuleCount: 1,
      totalRuleCount: 2,
      failureModeRuleCount: 2,
      baselineRuleCount: 1,
      signalRuleCount: 1,
      reviewIntervalRuleCount: 1,
      evidence: [],
      note: "",
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some(
      (l) =>
        l.includes("Repeat-audit read:") &&
        l.includes("fresh evidence of improvement"),
    ),
    "calls out repeat-audit improvement evidence in summary",
  );
});

test("Summary layer surfaces repeat-audit flat context", () => {
  const result = makeResult({
    ruleEffectiveness: {
      status: "Flat",
      instrumentedRuleCount: 1,
      totalRuleCount: 2,
      failureModeRuleCount: 2,
      baselineRuleCount: 1,
      signalRuleCount: 1,
      reviewIntervalRuleCount: 1,
      evidence: [],
      note: "",
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some(
      (l) =>
        l.includes("Repeat-audit read:") &&
        l.includes("blocker story is still flat"),
    ),
    "calls out repeat-audit flat evidence in summary",
  );
});

// ── Top 3 Actions ─────────────────────────────────────────────────────────────

test("Top Actions header matches the number of available remediation tasks", () => {
  const result = makeResult({
    remediationPack: {
      strategy: "test",
      tasks: [
        {
          order: 1,
          title: "Fix critical drift",
          issueClass: "blocking",
          owner: "",
          slaDays: 7,
          dueDate: "",
          expectedRuleDelta: 10,
          expectedGuardrailDelta: 0,
          acceptanceCriteria: [],
        },
        {
          order: 2,
          title: "Add Why sections",
          issueClass: "hygiene",
          owner: "",
          slaDays: 14,
          dueDate: "",
          expectedRuleDelta: 5,
          expectedGuardrailDelta: 0,
          acceptanceCriteria: [],
        },
      ],
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("Top 2 Actions")),
    "renders a count-accurate Top Actions header",
  );
  assert(
    lines.some(
      (l) =>
        l.includes("🔴") &&
        l.includes("[Fix critical drift](#remediation-pack)") &&
        l.includes("task #1") &&
        l.includes("+10 rule pts"),
    ),
    "task 1 renders as a remediation-pack link with task number and delta",
  );
  assert(
    lines.some(
      (l) =>
        l.includes("🟠") &&
        l.includes("[Add Why sections](#remediation-pack)") &&
        l.includes("task #2") &&
        l.includes("+5 rule pts"),
    ),
    "task 2 renders as a remediation-pack link with task number and delta",
  );
});

test("Top Actions include concise owner/due context when remediation tasks have it", () => {
  const result = makeResult({
    remediationPack: {
      strategy: "test",
      tasks: [
        {
          order: 1,
          title: "Fix critical drift",
          issueClass: "blocking",
          owner: "Scout",
          slaDays: 7,
          dueDate: "2026-03-29",
          expectedRuleDelta: 10,
          expectedGuardrailDelta: 0,
          acceptanceCriteria: [],
        },
      ],
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some(
      (l) =>
        l.includes("[Fix critical drift](#remediation-pack)") &&
        l.includes("task #1 (Scout · due 2026-03-29)") &&
        l.includes("+10 rule pts"),
    ),
    "adds owner/due context to Top Actions remediation entries",
  );
});

test("Top Actions omit owner/due context when remediation tasks do not have it", () => {
  const result = makeResult({
    remediationPack: {
      strategy: "test",
      tasks: [
        {
          order: 1,
          title: "Add Why sections",
          issueClass: "hygiene",
          owner: "",
          slaDays: 14,
          dueDate: "",
          expectedRuleDelta: 5,
          expectedGuardrailDelta: 0,
          acceptanceCriteria: [],
        },
      ],
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some(
      (l) =>
        l.includes("[Add Why sections](#remediation-pack)") &&
        l.includes("task #1") &&
        !l.includes("due"),
    ),
    "keeps Top Actions concise when owner/due context is absent",
  );
});

test("Top 3 Actions lead with the earliest failing stage before later remediation tasks", () => {
  const result = makeResult({
    stageA: {
      name: "Stage A",
      status: "fail",
      summary: "Stage A summary",
      checks: [
        {
          id: "validation-date-coverage",
          label: "Validation Date Coverage",
          status: "fail",
          detail: "20% of governance files include Last validated",
        },
      ],
    },
    remediationPack: {
      strategy: "test",
      tasks: [
        {
          order: 1,
          title: "Rewrite or retire low-yield scoring rules",
          issueClass: "blocking",
          owner: "rules-platform",
          slaDays: 7,
          dueDate: "2026-05-10",
          expectedRuleDelta: 8,
          expectedGuardrailDelta: 5,
          acceptanceCriteria: [],
        },
        {
          order: 2,
          title: "Add Last validated dates",
          issueClass: "hygiene",
          owner: "rules-maintainers",
          slaDays: 14,
          dueDate: "2026-05-17",
          expectedRuleDelta: 5,
          expectedGuardrailDelta: 3,
          acceptanceCriteria: [],
        },
      ],
    },
  });
  const lines = buildSummaryLayer(result);
  const earliestStageLineIndex = lines.findIndex(
    (l) =>
      l.includes("[Restore Stage A structural trust](#process-stages)") &&
      l.includes("start with Validation Date Coverage"),
  );
  const laterTaskLineIndex = lines.findIndex((l) =>
    l.includes(
      "[Rewrite or retire low-yield scoring rules](#remediation-pack)",
    ),
  );

  assert(earliestStageLineIndex !== -1, "adds an explicit Stage A action cue");
  assert(laterTaskLineIndex !== -1, "still includes later remediation tasks");
  assert(
    earliestStageLineIndex < laterTaskLineIndex,
    "keeps the earliest failing stage ahead of later-stage tasks in Top Actions",
  );
});

test("Top 3 Actions falls back to AI suggestions when tasks empty", () => {
  const result = makeResult({
    remediationPack: { strategy: "", tasks: [] },
    aiSynthesis: {
      mode: "heuristic",
      model: null,
      suggestions: [
        {
          title: "Add validation dates",
          why: "Stale rules train wrong patterns.",
          evidence: [],
          fix: "Add last-validated comment.",
          priority: "high",
          confidence: 0.9,
          impact: 4,
        },
      ],
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) =>
      l.includes("[Add validation dates](#ai-top-5-improvements)"),
    ),
    "renders AI suggestion fallback as a diagnostics link",
  );
  assert(
    lines.some((l) => l.includes("Fix first: Add validation dates.")),
    "uses first AI suggestion as remediation-path cue",
  );
});

test("Fix first omits owner/due suffix when selected remediation task has no context", () => {
  const result = makeResult({
    remediationPack: {
      strategy: "test",
      tasks: [
        {
          order: 1,
          title: "Add Why sections",
          issueClass: "hygiene",
          owner: "",
          slaDays: 14,
          dueDate: "",
          expectedRuleDelta: 5,
          expectedGuardrailDelta: 0,
          acceptanceCriteria: [],
        },
      ],
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("Fix first: Add Why sections.")),
    "keeps fix-first line concise when owner/due is missing",
  );
});

test("High-risk stale rules become the fix-first cue when no task is present", () => {
  const result = makeResult({
    remediationPack: { strategy: "", tasks: [] },
    aiSynthesis: { mode: "heuristic", model: null, suggestions: [] },
    scoringRuleFiles: [makeRuleFile()],
    ruleInventory: {
      ...makeResult().ruleInventory,
      canonicalGovernanceFiles: [makeRuleFile()],
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("Fix first: validate or split `AGENTS.md`")),
    "uses stale always-on file as remediation-path cue",
  );
  assert(
    lines.some(
      (l) =>
        l.includes(
          "[Validate or split stale always-on rules](#freshness-risk)",
        ) && l.includes("missing Last validated + oversized always-on file"),
    ),
    "adds compact stale reasons to the summary action entry",
  );
});

test("Top Actions follow remediation order when a blocking task outranks freshness risk", () => {
  const staleRule = makeRuleFile({
    path: "/tmp/test-repo/TOOLS.md",
    relativePath: "TOOLS.md",
  });
  const result = makeResult({
    remediationPack: {
      strategy: "test",
      tasks: [
        {
          order: 1,
          title: "Fix critical drift",
          issueClass: "blocking",
          owner: "Scout",
          slaDays: 7,
          dueDate: "2026-03-29",
          expectedRuleDelta: 10,
          expectedGuardrailDelta: 0,
          acceptanceCriteria: [],
        },
        {
          order: 2,
          title: "Validate or split stale always-on rules",
          issueClass: "hygiene",
          owner: "rules-maintainers",
          slaDays: 14,
          dueDate: "2026-04-05",
          expectedRuleDelta: 5,
          expectedGuardrailDelta: 3,
          acceptanceCriteria: [],
        },
        {
          order: 3,
          title: "Add Why sections",
          issueClass: "hygiene",
          owner: "rules-maintainers",
          slaDays: 14,
          dueDate: "2026-04-05",
          expectedRuleDelta: 5,
          expectedGuardrailDelta: 3,
          acceptanceCriteria: [],
        },
      ],
    },
    scoringRuleFiles: [staleRule],
    ruleInventory: {
      ...makeResult().ruleInventory,
      canonicalGovernanceFiles: [staleRule],
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some(
      (l) =>
        l.includes("1. 🔴 [Fix critical drift](#remediation-pack)") &&
        l.includes("task #1"),
    ),
    "keeps the blocking remediation task as top action #1",
  );
  assert(
    lines.some(
      (l) =>
        l.includes(
          "2. 🚩 [Validate or split stale always-on rules](#freshness-risk)",
        ) && l.includes("`TOOLS.md`"),
    ),
    "renders freshness risk in-task order instead of always forcing it to the top",
  );
});

test("Fix first references instrumentation candidate when effectiveness is Unmeasured", () => {
  const result = makeResult({
    ruleEffectiveness: {
      status: "Unmeasured",
      instrumentedRuleCount: 0,
      totalRuleCount: 3,
      failureModeRuleCount: 2,
      baselineRuleCount: 1,
      signalRuleCount: 0,
      reviewIntervalRuleCount: 0,
      evidence: [
        "0/3 canonical rule file(s) show the minimum instrumentation loop",
      ],
      note: "No canonical rule file currently shows the full effectiveness loop.",
      instrumentationCandidate: {
        fileName: "AGENTS.md",
        missing: ["primary signal", "review interval"],
      },
    },
    remediationPack: { strategy: "", tasks: [] },
    aiSynthesis: { mode: "heuristic", model: null, suggestions: [] },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("Fix first: instrument `AGENTS.md`")),
    "names the instrumentation candidate in Fix-first",
  );
  assert(
    lines.some((l) => l.includes("add primary signal, review interval")),
    "lists the missing pieces",
  );
  assert(
    lines.some((l) =>
      l.includes("the rule surface becomes measurable for the first time"),
    ),
    "describes the measurable outcome",
  );
});

test("Fix first references instrumentation candidate when effectiveness is Flat", () => {
  const result = makeResult({
    ruleEffectiveness: {
      status: "Flat",
      instrumentedRuleCount: 1,
      totalRuleCount: 3,
      failureModeRuleCount: 3,
      baselineRuleCount: 2,
      signalRuleCount: 1,
      reviewIntervalRuleCount: 1,
      evidence: [
        "1/3 canonical rule file(s) show the minimum instrumentation loop",
      ],
      note: "The current rule/report surface includes flat effectiveness language.",
      instrumentationCandidate: {
        fileName: "CLAUDE.md",
        missing: ["baseline"],
      },
    },
    remediationPack: { strategy: "", tasks: [] },
    aiSynthesis: { mode: "heuristic", model: null, suggestions: [] },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("Fix first: instrument `CLAUDE.md`")),
    "names the instrumentation candidate",
  );
  assert(
    lines.some((l) =>
      l.includes(
        "effectiveness signal switches from flat to a measurable trend",
      ),
    ),
    "describes the Flat-specific measurable outcome",
  );
});

test("Fix first falls through to first remediation task when effectiveness is Improving", () => {
  const result = makeResult({
    ruleEffectiveness: {
      status: "Improving",
      instrumentedRuleCount: 2,
      totalRuleCount: 3,
      failureModeRuleCount: 3,
      baselineRuleCount: 2,
      signalRuleCount: 2,
      reviewIntervalRuleCount: 2,
      evidence: [
        "2/3 canonical rule file(s) show the minimum instrumentation loop",
      ],
      note: "The current rule/report surface includes explicit improvement language.",
    },
    remediationPack: {
      strategy: "",
      tasks: [
        {
          order: 1,
          title: "Add validation dates",
          issueClass: "hygiene" as const,
          owner: "rules-maintainers",
          slaDays: 14,
          dueDate: "2026-04-20",
          expectedRuleDelta: 5,
          expectedGuardrailDelta: 3,
          exampleEvidence: ["Most files undated."],
          acceptanceCriteria: ["Dates added."],
        },
      ],
    },
    aiSynthesis: { mode: "heuristic", model: null, suggestions: [] },
  });
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l.includes("Fix first: Add validation dates")),
    "uses normal remediation-path fallback when effectiveness is healthy",
  );
});

test("Summary omits non-actionable clean-audit ratchet suggestions", () => {
  const result = makeResult({
    ruleScore100: 96,
    guardrail: {
      total: 31,
      maturity: "Hardened",
      breakdown: {
        ciDiscipline: 4,
        typeSafety: 5,
        testDepth: 5,
        codeQuality: 5,
        reviewOwnership: 4,
        security: 4,
        driftResilience: 4,
      },
    },
    driftSummary: {
      missingCount: 0,
      movedCount: 0,
      expiredCount: 0,
      total: 0,
      issues: [],
    },
    ruleEffectiveness: {
      status: "Improving",
      instrumentedRuleCount: 3,
      totalRuleCount: 3,
      failureModeRuleCount: 3,
      baselineRuleCount: 3,
      signalRuleCount: 3,
      reviewIntervalRuleCount: 3,
      evidence: [],
      note: "",
    },
    aiSynthesis: {
      mode: "heuristic",
      model: null,
      suggestions: [
        {
          title: "Verify the remaining score delta is actionable",
          why: "Near-max lanes can reflect ceilings instead of repo-local defects.",
          evidence: ["Weakest scored lane: enforcement layer (0.8/1)"],
          fix: "Confirm whether the remaining gap is actionable before opening work.",
          priority: "low",
          confidence: 0.68,
          impact: 2,
        },
      ],
    },
  });
  const lines = buildSummaryLayer(result);
  assert(
    !lines.some((l) =>
      l.includes("Fix first: Verify the remaining score delta is actionable."),
    ),
    "does not promote the clean-audit ratchet as Fix first",
  );
  assert(
    !lines.some((l) =>
      l.includes("Verify the remaining score delta is actionable"),
    ),
    "does not surface the clean-audit ratchet in Top 3 Actions",
  );
});

test("No Top 3 Actions section when both sources empty", () => {
  const result = makeResult({
    remediationPack: { strategy: "", tasks: [] },
    aiSynthesis: { mode: "heuristic", model: null, suggestions: [] },
  });
  const lines = buildSummaryLayer(result);
  assert(
    !lines.some((l) => l.includes("Top 3 Actions")),
    "no Top 3 Actions section when empty",
  );
});

// ── Structure ─────────────────────────────────────────────────────────────────

test("Output ends with a separator line", () => {
  const result = makeResult();
  const lines = buildSummaryLayer(result);
  assert(
    lines.some((l) => l === "---"),
    "contains separator ---",
  );
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n─────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
