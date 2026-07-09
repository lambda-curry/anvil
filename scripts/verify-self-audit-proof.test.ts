import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import {
  compareSelfAuditReports,
  defaultCheckedInReport,
  parseCliOptions,
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
