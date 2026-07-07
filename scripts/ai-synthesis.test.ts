import {
  heuristicTopImprovements,
  type SynthesisInput,
} from "./lib/ai-synthesis.ts";

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

function makeInput(overrides: Partial<SynthesisInput> = {}): SynthesisInput {
  return {
    projectName: "sample-repo",
    projectPath: "/tmp/sample-repo",
    ruleScore: 0,
    guardrailScore: 0,
    recommendations: [],
    coverageGaps: [],
    enforcementLevel: "hook",
    driftSummary: { pathIssues: 0, dateIssues: 0 },
    cliFindings: {
      isCliProject: false,
      confidence: 0,
      missingChecks: [],
      evidence: [],
    },
    guardrailFindings: {
      missingGuardrails: [],
      recommendations: [],
    },
    ...overrides,
  };
}

test("heuristicTopImprovements uses a short sentence title instead of clipping commands", () => {
  const suggestions = heuristicTopImprovements(
    makeInput({
      recommendations: [
        "🔴 No AI rule files detected. Run `bun run scripts/bootstrap-generate.ts <path>` to generate a starter set.",
      ],
    }),
  );

  assert(
    suggestions.length === 1,
    "creates one recommendation-based suggestion",
  );
  assert(
    suggestions[0]?.title ===
      "Address recommendation: No AI rule files detected",
    "keeps the heading short without clipping the command",
  );
  assert(
    suggestions[0]?.evidence[0]?.includes(
      "`bun run scripts/bootstrap-generate.ts <path>`",
    ),
    "preserves the full recommendation text in evidence",
  );
});

test("heuristicTopImprovements never leaves unmatched backticks in truncated titles", () => {
  const suggestions = heuristicTopImprovements(
    makeInput({
      recommendations: [
        "🔴 Prioritize validation or splitting for `TOOLS.md`, `AGENTS.md`, `README.md`, and `PLAYBOOK.md` so stale always-on guidance stops dominating the remediation path across the report surface.",
      ],
    }),
  );

  const title = suggestions[0]?.title ?? "";
  const backtickCount = [...title].filter((char) => char === "`").length;
  assert(
    suggestions.length === 1,
    "creates one long recommendation suggestion",
  );
  assert(
    backtickCount % 2 === 0,
    "keeps inline code fences balanced in the title",
  );
  assert(!title.endsWith("`"), "does not end on a clipped inline-code span");
});

test("heuristicTopImprovements leaves near-max clean audits without synthetic backlog", () => {
  const suggestions = heuristicTopImprovements(
    makeInput({
      nextRatchetLanes: [
        "enforcement layer (0.8/1)",
        "type safety (4/5 — 5/5 needs type-aware ESLint or a dedicated extra-strict TS lane in CI)",
      ],
    }),
  );

  assert(suggestions.length === 0, "does not invent a fallback task");
});

test("heuristicTopImprovements still points at the weakest lane when the clean audit gap is materially low", () => {
  const suggestions = heuristicTopImprovements(
    makeInput({
      nextRatchetLanes: ["enforcement layer (0.8/1)", "CI discipline (1/5)"],
    }),
  );

  assert(suggestions.length === 1, "creates one fallback suggestion");
  assert(
    suggestions[0]?.title === "Tighten the weakest scored lane next",
    "keeps the ratchet-lane fallback for materially weak lanes",
  );
  assert(
    suggestions[0]?.fix.includes("Start with enforcement layer (0.8/1)"),
    "turns the weakest lane into a concrete next step when a real gap remains",
  );
});

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} assertion(s) passed.`);
