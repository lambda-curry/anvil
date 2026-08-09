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
  expect(check?.detail).toContain("excludes 7 reference/pointer docs");
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
  expect(check?.detail).toContain("excludes 1 reference/pointer doc");
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

test("a repo whose governance surface is entirely exempt is not failed at 0%", () => {
  // The regression this nearly shipped with: exempting every file emptied the
  // denominator, and an empty denominator read as 0% — failing Anvil itself,
  // whose whole governance surface is bootstrap templates. With nothing left to
  // measure, fall back to the full set rather than inventing a failure.
  const files = ["a", "b", "c"].map((name) =>
    makeRuleFile({
      relativePath: `docs/patterns/${name}.md`,
      hasLastValidated: true,
    }),
  );

  const check = dateCheck(files);

  expect(check?.status).toBe("pass");
  expect(check?.detail).toBe("100% of governance files include Last validated");
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
