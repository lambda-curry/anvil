import { expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  buildDiff,
  compareSelfAuditReports,
  defaultCheckedInReport,
  formatVerificationSummary,
  parseCliOptions,
  retainVerificationBundle,
  validateCheckedInReportDatePath,
} from "./verify-self-audit-proof.ts";

const CLEAN_REPORT = `# Anvil Audit — anvil

## Summary

### ✅ Verdict: PASS

| What | Value |
|------|-------|
| Issues found | none |
| Remediation tasks | none |

- Action path: none generated for this run; use the supporting diagnostics below if you need the evidence behind the pass verdict.
`;

const SELF_AUDIT_PROOF_DOCS = [
  "docs/proofs/sfd-161-self-audit-clean-recheck.md",
  "docs/proofs/sfd-162-current-main-clean-recheck.md",
  "docs/proofs/sfe-538-self-audit-proof-guard.md",
] as const;

test("passes when checked-in report and fresh rerun are byte-identical", () => {
  const result = compareSelfAuditReports(CLEAN_REPORT, CLEAN_REPORT);

  expect(result.failures).toEqual([]);
  expect(result.checks).toContain(
    "fresh deterministic rerun matches the checked-in self-audit packet after normalizing expected date-stamped metadata",
  );
});

test("passes when only the report date and dated artifact paths change", () => {
  const checkedInReport = `# Anvil Audit — anvil
*Date: 2026-06-03*

### ✅ Verdict: PASS

| What | Value |
|------|-------|
| Issues found | none |
| Remediation tasks | none |

- Action path: none generated for this run; use the supporting diagnostics below if you need the evidence behind the pass verdict.
- Drift report: [\`./artifacts/anvil-2026-06-03/drift-report.md\`](./artifacts/anvil-2026-06-03/drift-report.md)
- Artifacts dir: \`./artifacts/anvil-2026-06-03\`
`;
  const freshReport = checkedInReport
    .replace("2026-06-03", "2026-06-04")
    .replaceAll("anvil-2026-06-03", "anvil-2026-06-04");

  const result = compareSelfAuditReports(checkedInReport, freshReport);

  expect(result.failures).toEqual([]);
  expect(result.checks).toContain(
    "fresh deterministic rerun matches the checked-in self-audit packet after normalizing expected date-stamped metadata",
  );
});

test("passes when only PR mining summary counts drift between reruns", () => {
  const checkedInReport = `# Anvil Audit — anvil

## Observed Failure Modes (PR Review Mining)

*What this means:* placeholder
*Why this matters:* This run analyzed 46 PRs and surfaced 6 recurring rule candidates.

Repo: \`lambda-curry/anvil\`
PRs analyzed: 46 · Comments reviewed: 61 · Substantive comments: 61 · Candidates: 6

### ✅ Verdict: PASS

| What | Value |
|------|-------|
| Issues found | none |
| Remediation tasks | none |

- Action path: none generated for this run; use the supporting diagnostics below if you need the evidence behind the pass verdict.
`;
  const freshReport = checkedInReport
    .replace("46 PRs", "47 PRs")
    .replace("PRs analyzed: 46", "PRs analyzed: 47");

  const result = compareSelfAuditReports(checkedInReport, freshReport);

  expect(result.failures).toEqual([]);
  expect(result.checks).toContain(
    "fresh deterministic rerun matches the checked-in self-audit packet after normalizing expected date-stamped metadata",
  );
});

test("fails when the fresh rerun diverges from the checked-in packet", () => {
  const result = compareSelfAuditReports(
    CLEAN_REPORT,
    CLEAN_REPORT.replace("| Issues found | none |", "| Issues found | 1 |"),
  );

  expect(result.failures).toEqual(
    expect.arrayContaining([
      "fresh deterministic rerun diverges from the checked-in self-audit packet",
      expect.stringContaining("first differing line"),
    ]),
  );
});

test("fails when a report no longer carries the required trust markers", () => {
  const result = compareSelfAuditReports(
    CLEAN_REPORT.replace("### ✅ Verdict: PASS", "### Verdict unavailable"),
    CLEAN_REPORT,
  );

  expect(result.failures).toContain(
    "checked-in report is missing required trust marker: verdict",
  );
});

test("fails when the checked-in filename date and embedded report date diverge", () => {
  const failure = validateCheckedInReportDatePath(
    "/repo/docs/audits/anvil-audit-2026-06-19.md",
    "# Anvil Audit — anvil\n*Date: 2026-06-24*\n",
  );

  expect(failure).toBe(
    "checked-in report filename date 2026-06-19 does not match embedded report date 2026-06-24",
  );
});

test("parses --retain-dir as an absolute path", () => {
  const options = parseCliOptions(
    ["--retain-dir", "./tmp/self-audit-bundle"],
    "/repo/anvil",
  );

  expect(options).toEqual({
    retainDir: "/repo/anvil/tmp/self-audit-bundle",
  });
});

test("fails when --retain-dir has no value", () => {
  expect(() => parseCliOptions(["--retain-dir"])).toThrow(
    "--retain-dir requires a directory path",
  );
});

test("proof guard doc names the same checked-in packet the verifier uses", () => {
  const proofGuardDoc = readFileSync(
    resolve(
      import.meta.dir,
      "..",
      "docs",
      "proofs",
      "sfe-538-self-audit-proof-guard.md",
    ),
    "utf8",
  );

  expect(proofGuardDoc).toContain(basename(defaultCheckedInReport));
  expect(proofGuardDoc).toContain(
    `Checked-in audit packet: \`docs/audits/${basename(defaultCheckedInReport)}\``,
  );
  expect(proofGuardDoc).toContain(
    `still matches \`docs/audits/${basename(defaultCheckedInReport)}\``,
  );
});

test("validateCheckedInReportDatePath fails when report has no date header", () => {
  const failure = validateCheckedInReportDatePath(
    "/repo/docs/audits/anvil-audit-2026-06-19.md",
    "# Anvil Audit — anvil\nNo date here\n",
  );

  expect(failure).toBe(
    "checked-in report is missing an embedded *Date: YYYY-MM-DD* header",
  );
});

test("validateCheckedInReportDatePath fails when path does not match naming pattern", () => {
  const failure = validateCheckedInReportDatePath(
    "/repo/docs/audits/custom-report.md",
    "# Anvil Audit — anvil\n*Date: 2026-06-19*\n",
  );

  expect(failure).toBe(
    "checked-in report path does not use the expected anvil-audit-YYYY-MM-DD.md naming",
  );
});

test("validateCheckedInReportDatePath passes when dates align", () => {
  const failure = validateCheckedInReportDatePath(
    "/repo/docs/audits/anvil-audit-2026-06-19.md",
    "# Anvil Audit — anvil\n*Date: 2026-06-19*\n",
  );

  expect(failure).toBeNull();
});

test("parseCliOptions rejects unknown arguments", () => {
  expect(() => parseCliOptions(["--unknown-flag"])).toThrow(
    "Unknown argument: --unknown-flag",
  );
});

test("parseCliOptions with no args returns null retainDir", () => {
  const options = parseCliOptions([]);
  expect(options).toEqual({ retainDir: null });
});

test("formatVerificationSummary renders checks and failures", () => {
  const summary = formatVerificationSummary({
    checks: ["check one", "check two"],
    failures: ["failure one"],
  });

  expect(summary).toContain("## Checks");
  expect(summary).toContain("- check one");
  expect(summary).toContain("- check two");
  expect(summary).toContain("## Failures");
  expect(summary).toContain("- failure one");
});

test("formatVerificationSummary renders empty result cleanly", () => {
  const summary = formatVerificationSummary({
    checks: [],
    failures: [],
  });

  expect(summary).toBe("# Self-audit verification summary\n");
});

test("formatVerificationSummary renders only checks when no failures", () => {
  const summary = formatVerificationSummary({
    checks: ["all good"],
    failures: [],
  });

  expect(summary).toContain("## Checks");
  expect(summary).not.toContain("## Failures");
});

test("compareSelfAuditReports detects missing trust markers in fresh report", () => {
  const result = compareSelfAuditReports(
    CLEAN_REPORT,
    CLEAN_REPORT.replace("### ✅ Verdict: PASS", "### Verdict unavailable"),
  );

  expect(result.failures).toContain(
    "fresh rerun report is missing required trust marker: verdict",
  );
});

test("self-audit proof docs do not point at the stale projects/anvil mirror", () => {
  for (const relativePath of SELF_AUDIT_PROOF_DOCS) {
    const proofDoc = readFileSync(
      resolve(import.meta.dir, "..", relativePath),
      "utf8",
    );

    expect(proofDoc).not.toContain(
      "/home/node/.openclaw/workspace/projects/anvil",
    );
  }
});

// --- buildDiff tests ---

test("buildDiff returns unified diff for differing files", () => {
  const tmp = mkdtempSync(join(tmpdir(), "anvil-diff-test-"));
  const fileA = join(tmp, "a.md");
  const fileB = join(tmp, "b.md");
  try {
    writeFileSync(fileA, "line one\nline two\n");
    writeFileSync(fileB, "line one\nline CHANGED\n");

    const diff = buildDiff(fileA, fileB);

    expect(diff).toContain("-line two");
    expect(diff).toContain("+line CHANGED");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildDiff returns empty string for identical files", () => {
  const tmp = mkdtempSync(join(tmpdir(), "anvil-diff-test-"));
  const fileA = join(tmp, "a.md");
  const fileB = join(tmp, "b.md");
  try {
    writeFileSync(fileA, "same content\n");
    writeFileSync(fileB, "same content\n");

    const diff = buildDiff(fileA, fileB);

    expect(diff).toBe("");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- retainVerificationBundle tests ---

test("retainVerificationBundle creates all expected files", () => {
  const tmp = mkdtempSync(join(tmpdir(), "anvil-retain-test-"));
  const checkedIn = join(tmp, "input-checked-in.md");
  const fresh = join(tmp, "input-fresh.md");
  const retainDir = join(tmp, "bundle");

  try {
    writeFileSync(checkedIn, "# Checked-in\n");
    writeFileSync(fresh, "# Fresh\n");

    retainVerificationBundle(
      retainDir,
      checkedIn,
      fresh,
      {
        checks: ["check-a", "check-b"],
        failures: ["fail-a"],
      },
      "--- diff content ---",
    );

    expect(existsSync(join(retainDir, "checked-in-self-audit.md"))).toBe(true);
    expect(existsSync(join(retainDir, "fresh-self-audit.md"))).toBe(true);
    expect(existsSync(join(retainDir, "verification-summary.md"))).toBe(true);
    expect(existsSync(join(retainDir, "diff.txt"))).toBe(true);

    const summary = readFileSync(
      join(retainDir, "verification-summary.md"),
      "utf8",
    );
    expect(summary).toContain("- check-a");
    expect(summary).toContain("- fail-a");

    const copiedCheckedIn = readFileSync(
      join(retainDir, "checked-in-self-audit.md"),
      "utf8",
    );
    expect(copiedCheckedIn).toBe("# Checked-in\n");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("retainVerificationBundle skips diff.txt when diff is empty", () => {
  const tmp = mkdtempSync(join(tmpdir(), "anvil-retain-test-"));
  const checkedIn = join(tmp, "checked.md");
  const fresh = join(tmp, "fresh.md");
  const retainDir = join(tmp, "bundle");

  try {
    writeFileSync(checkedIn, "identical\n");
    writeFileSync(fresh, "identical\n");

    retainVerificationBundle(
      retainDir,
      checkedIn,
      fresh,
      { checks: ["ok"], failures: [] },
      "",
    );

    expect(existsSync(join(retainDir, "diff.txt"))).toBe(false);
    expect(existsSync(join(retainDir, "verification-summary.md"))).toBe(true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("retainVerificationBundle creates nested retainDir", () => {
  const tmp = mkdtempSync(join(tmpdir(), "anvil-retain-test-"));
  const checkedIn = join(tmp, "c.md");
  const fresh = join(tmp, "f.md");
  const retainDir = join(tmp, "deep", "nested", "bundle");

  try {
    writeFileSync(checkedIn, "c\n");
    writeFileSync(fresh, "f\n");

    retainVerificationBundle(
      retainDir,
      checkedIn,
      fresh,
      { checks: [], failures: [] },
      "",
    );

    expect(existsSync(join(retainDir, "checked-in-self-audit.md"))).toBe(true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("retainVerificationBundle summary with only failures", () => {
  const tmp = mkdtempSync(join(tmpdir(), "anvil-retain-test-"));
  const checkedIn = join(tmp, "c.md");
  const fresh = join(tmp, "f.md");
  const retainDir = join(tmp, "bundle");

  try {
    writeFileSync(checkedIn, "c\n");
    writeFileSync(fresh, "f\n");

    retainVerificationBundle(
      retainDir,
      checkedIn,
      fresh,
      { checks: [], failures: ["only failure"] },
      "diff",
    );

    const summary = readFileSync(
      join(retainDir, "verification-summary.md"),
      "utf8",
    );
    expect(summary).not.toContain("## Checks");
    expect(summary).toContain("## Failures");
    expect(summary).toContain("- only failure");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- firstDifferingLine edge case via compareSelfAuditReports ---

test("compareSelfAuditReports divergence message includes line number when texts differ in length", () => {
  const base = CLEAN_REPORT;
  const longer = base + "\n## Extra trailing content\n";

  const result = compareSelfAuditReports(base, longer);

  expect(result.failures).toContain(
    "fresh deterministic rerun diverges from the checked-in self-audit packet",
  );
  expect(
    result.failures.some((f) => f.startsWith("first differing line")),
  ).toBe(true);
});

test("compareSelfAuditReports detects multiple missing trust markers at once", () => {
  const brokenReport = CLEAN_REPORT.replace(
    "### ✅ Verdict: PASS",
    "### Verdict unavailable",
  )
    .replace("| Issues found | none |", "| Issues found | 2 |")
    .replace("| Remediation tasks | none |", "| Remediation tasks | 5 |");

  const result = compareSelfAuditReports(brokenReport, brokenReport);

  expect(result.failures).toContain(
    "checked-in report is missing required trust marker: verdict",
  );
  expect(result.failures).toContain(
    "checked-in report is missing required trust marker: issues found",
  );
  expect(result.failures).toContain(
    "checked-in report is missing required trust marker: remediation tasks",
  );
});

test("compareSelfAuditReports passes when PR mining counts vary in both directions", () => {
  const base = `# Anvil Audit — anvil

*Why this matters:* This run analyzed 50 PRs and surfaced 8 recurring rule candidates.

PRs analyzed: 50 · Comments reviewed: 100 · Substantive comments: 80 · Candidates: 8

### ✅ Verdict: PASS

| What | Value |
|------|-------|
| Issues found | none |
| Remediation tasks | none |

- Action path: none generated for this run; use the supporting diagnostics below if you need the evidence behind the pass verdict.
`;
  const fresh = base
    .replace("50 PRs", "48 PRs")
    .replace("8 recurring", "7 recurring")
    .replace("PRs analyzed: 50", "PRs analyzed: 48")
    .replace("Comments reviewed: 100", "Comments reviewed: 95")
    .replace("Substantive comments: 80", "Substantive comments: 72")
    .replace("Candidates: 8", "Candidates: 7");

  const result = compareSelfAuditReports(base, fresh);

  expect(result.failures).toEqual([]);
});
