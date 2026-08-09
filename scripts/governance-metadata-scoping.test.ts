import { expect, test } from "bun:test";

import {
  assessStageA,
  type DriftSummary,
  type RuleFile,
  type RuleInventory,
} from "./audit.ts";

function makeRuleFile(overrides: Partial<RuleFile>): RuleFile {
  return {
    path: `/repo/${overrides.relativePath ?? "AGENTS.md"}`,
    relativePath: "AGENTS.md",
    tool: "agents",
    format: "markdown",
    sizeLines: 120,
    hasAlwaysApply: false,
    hasGlob: false,
    hasDescription: true,
    hasLastValidated: false,
    hasWhySection: true,
    hasExamplesSection: true,
    linesOverBudget: false,
    authorship: "governance",
    fingerprint: overrides.relativePath ?? "AGENTS.md",
    loadTier: "always-on",
    importsRootMirror: false,
    isUpstreamAuthored: false,
    ...overrides,
  };
}

function inventoryOf(files: RuleFile[]): RuleInventory {
  return {
    allFiles: files,
    canonicalFiles: files,
    canonicalGovernanceFiles: files,
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

const NO_DRIFT: DriftSummary = {
  pathIssues: 0,
  dateIssues: 0,
  notes: 0,
} as DriftSummary;

function dateCheck(files: RuleFile[]) {
  const stage = assessStageA(inventoryOf(files), NO_DRIFT);
  return stage.checks.find((check) => check.id === "date-hygiene");
}

test("a reference catalog does not need governance metadata", () => {
  // lc-classic-starter's shape: two governance docs, both dated, plus seven
  // docs/patterns entries read on demand. It reported 22% and sat CRITICAL.
  const files = [
    makeRuleFile({ relativePath: "AGENTS.md", hasLastValidated: true }),
    makeRuleFile({ relativePath: "TOOLS.md", hasLastValidated: true }),
    ...["a", "b", "c", "d", "e", "f", "README"].map((name) =>
      makeRuleFile({
        relativePath: `docs/patterns/${name}.md`,
        hasLastValidated: false,
      }),
    ),
  ];

  const check = dateCheck(files);

  expect(check?.status).toBe("pass");
  expect(check?.detail).toContain("100%");
  // The exemption is stated, so a coverage figure that rose is auditable.
  expect(check?.detail).toContain("excludes 7 reference/pointer/upstream docs");
});

test("a pointer document does not need governance metadata", () => {
  const files = [
    makeRuleFile({ relativePath: "AGENTS.md", hasLastValidated: true }),
    makeRuleFile({
      relativePath: "CLAUDE.md",
      hasLastValidated: false,
      importsRootMirror: true,
      sizeLines: 11,
    }),
  ];

  const check = dateCheck(files);

  expect(check?.status).toBe("pass");
  expect(check?.detail).toContain("excludes 1 reference/pointer/upstream doc");
});

test("real governance docs still have to carry a date", () => {
  // The guard against exempting our way to green. forge's remaining two files
  // are ordinary instruction docs, and it must stay failing.
  const files = [
    makeRuleFile({ relativePath: "AGENTS.md", hasLastValidated: false }),
    makeRuleFile({
      relativePath: ".devagent/plugins/ralph/AGENTS.md",
      hasLastValidated: false,
    }),
    makeRuleFile({
      relativePath: "docs/patterns/auditable-autonomy.md",
      hasLastValidated: false,
    }),
  ];

  const check = dateCheck(files);

  expect(check?.status).toBe("fail");
  expect(check?.detail).toContain("0%");
});

test("a repo with no exemptions reads exactly as before", () => {
  const files = [
    makeRuleFile({ relativePath: "AGENTS.md", hasLastValidated: true }),
    makeRuleFile({ relativePath: "CLAUDE.md", hasLastValidated: false }),
  ];

  const check = dateCheck(files);

  expect(check?.detail).toBe("50% of governance files include Last validated");
});

test("a repo whose governance surface is entirely exempt passes", () => {
  // Nothing left to ask is a pass, not a 0%. This previously fell back to the
  // unexempted set, which re-failed exactly the repos the exemption exists for
  // — openclaw's 23 files are all upstream's.
  const files = ["a", "b", "c"].map((name) =>
    makeRuleFile({
      relativePath: `docs/patterns/${name}.md`,
      hasLastValidated: true,
    }),
  );

  const check = dateCheck(files);

  expect(check?.status).toBe("pass");
  expect(check?.detail).toContain("excludes 3 reference/pointer/upstream docs");
});

test("bootstrap templates are governance documents, not reference catalogs", () => {
  // Deliberately NOT exempt: Anvil's own 18 templates are its governance
  // surface and are all dated. Exempting them was scope creep that inverted
  // Anvil's own verdict to CRITICAL.
  const files = [
    makeRuleFile({
      relativePath: "docs/bootstrap-templates/ts-no-any.md",
      hasLastValidated: false,
    }),
    makeRuleFile({ relativePath: "AGENTS.md", hasLastValidated: true }),
  ];

  const check = dateCheck(files);

  expect(check?.detail).toBe("50% of governance files include Last validated");
});

test("an upstream-authored file is not asked for our governance metadata", () => {
  // openclaw and postiz-app sat permanently red for files carrying zero lines
  // of ours. Adding a date would be our first authored line in someone else's
  // document, and would conflict on every merge.
  const files = [
    makeRuleFile({
      relativePath: "AGENTS.md",
      hasLastValidated: false,
      isUpstreamAuthored: true,
    }),
    makeRuleFile({ relativePath: "OURS.md", hasLastValidated: true }),
  ];

  const check = dateCheck(files);

  expect(check?.status).toBe("pass");
  expect(check?.detail).toContain("excludes 1 reference/pointer/upstream doc");
});

test("a file we have committed to is still ours to date", () => {
  // The guard: authorship is the signal, not living in a vendored repo.
  const files = [
    makeRuleFile({
      relativePath: "AGENTS.md",
      hasLastValidated: false,
      isUpstreamAuthored: false,
    }),
  ];

  expect(dateCheck(files)?.status).toBe("fail");
});
