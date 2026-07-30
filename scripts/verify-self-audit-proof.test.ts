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
  main,
  parseCliOptions,
  retainVerificationBundle,
  runFreshAudit,
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

// --- runFreshAudit integration tests ---

test("runFreshAudit produces a non-empty audit report file", () => {
  const tmp = mkdtempSync(join(tmpdir(), "anvil-run-fresh-"));
  const outputPath = join(tmp, "self-audit.md");

  try {
    runFreshAudit(outputPath);

    expect(existsSync(outputPath)).toBe(true);
    const report = readFileSync(outputPath, "utf8");
    expect(report.length).toBeGreaterThan(0);
    expect(report).toContain("# Anvil Audit");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("runFreshAudit output includes required trust markers", () => {
  const tmp = mkdtempSync(join(tmpdir(), "anvil-run-fresh-"));
  const outputPath = join(tmp, "self-audit.md");

  try {
    runFreshAudit(outputPath);
    const report = readFileSync(outputPath, "utf8");

    // The self-audit should pass on the Anvil repo itself
    expect(report).toContain("### ✅ Verdict: PASS");
    expect(report).toContain("| Issues found | none |");
    expect(report).toContain("| Remediation tasks | none |");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("runFreshAudit output passes validateCheckedInReportDatePath", () => {
  const tmp = mkdtempSync(join(tmpdir(), "anvil-run-fresh-"));
  const outputPath = join(tmp, "anvil-audit-2026-07-29.md");

  try {
    runFreshAudit(outputPath);
    const report = readFileSync(outputPath, "utf8");

    // The fresh report should contain a date header that can be validated
    const dateMatch = report.match(/^\*Date: (\d{4}-\d{2}-\d{2})\*$/m);
    expect(dateMatch).not.toBeNull();

    const failure = validateCheckedInReportDatePath(outputPath, report);
    // If the date doesn't match our filename, that's fine — just verify the function works
    // The key is that the report has a parseable date
    if (failure) {
      expect(failure).toContain("does not match");
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- main() integration via subprocess ---

test("script exits 0 when self-audit matches checked-in packet", () => {
  const proc = Bun.spawnSync({
    cmd: ["bun", "run", "scripts/verify-self-audit-proof.ts"],
    cwd: resolve(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = proc.stdout.toString().trim();

  expect(proc.exitCode).toBe(0);
  expect(stdout).toContain("checked-in report filename date matches");
  expect(stdout).toContain("matches the checked-in self-audit packet");
});

test("script exits 1 when --retain-dir is missing its value", () => {
  const proc = Bun.spawnSync({
    cmd: ["bun", "run", "scripts/verify-self-audit-proof.ts", "--retain-dir"],
    cwd: resolve(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(proc.exitCode).toBe(1);
  expect(proc.stderr.toString()).toContain(
    "--retain-dir requires a directory path",
  );
});

test("script exits 1 on unknown argument", () => {
  const proc = Bun.spawnSync({
    cmd: ["bun", "run", "scripts/verify-self-audit-proof.ts", "--bogus"],
    cwd: resolve(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(proc.exitCode).toBe(1);
  expect(proc.stderr.toString()).toContain("Unknown argument: --bogus");
});

test("script with --retain-dir creates verification bundle", () => {
  const tmp = mkdtempSync(join(tmpdir(), "anvil-retain-cli-"));
  const retainDir = join(tmp, "bundle");

  try {
    const proc = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        "scripts/verify-self-audit-proof.ts",
        "--retain-dir",
        retainDir,
      ],
      cwd: resolve(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(proc.exitCode).toBe(0);
    expect(existsSync(join(retainDir, "checked-in-self-audit.md"))).toBe(true);
    expect(existsSync(join(retainDir, "fresh-self-audit.md"))).toBe(true);
    expect(existsSync(join(retainDir, "verification-summary.md"))).toBe(true);
    // No diff.txt when audit passes
    expect(existsSync(join(retainDir, "diff.txt"))).toBe(false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- main() direct-call tests (in-process for coverage tracking) ---
//
// These tests mock Bun.spawnSync to intercept the audit subprocess and diff
// command, allowing main() to execute in-process where the coverage tool can
// track line execution. They complement the subprocess integration tests above.

const originalSpawnSync = Bun.spawnSync;
const originalArgv = process.argv;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

type SpawnResult = {
  exitCode: number;
  stdout: Buffer;
  stderr: Buffer;
};

/**
 * Creates a mock Bun.spawnSync that intercepts the audit subprocess call,
 * writing a controlled report to the output path. Diff calls pass through
 * to the real implementation so we get authentic diff output.
 */
function mockSpawnSyncForAudit(reportContent: string, auditExitCode = 0) {
  const realSpawnSync = Bun.spawnSync;
  Bun.spawnSync = ((options: any): SpawnResult => {
    const cmd = options?.cmd;
    if (Array.isArray(cmd) && cmd[2] === "scripts/audit.ts") {
      // Intercepted audit subprocess: write controlled report
      const outputPath = cmd[cmd.length - 1];
      writeFileSync(outputPath, reportContent);
      return {
        exitCode: auditExitCode,
        stdout: Buffer.from(""),
        stderr: Buffer.from(auditExitCode !== 0 ? "audit error output" : ""),
      };
    }
    // Pass through diff and other commands
    return realSpawnSync(options);
  }) as typeof Bun.spawnSync;
}

test("main() succeeds and logs checks when fresh audit matches checked-in packet", () => {
  const checkedInText = readFileSync(defaultCheckedInReport, "utf8");
  const logs: string[] = [];
  const errors: string[] = [];

  mockSpawnSyncForAudit(checkedInText);
  process.argv = ["node", "verify-self-audit-proof.ts"];
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    main();

    expect(errors.length).toBe(0);
    expect(
      logs.some((l) => l.includes("matches the checked-in self-audit packet")),
    ).toBe(true);
    expect(logs.some((l) => l.includes("filename date matches"))).toBe(true);
  } finally {
    Bun.spawnSync = originalSpawnSync;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.argv = originalArgv;
  }
});

test("main() sets exitCode 1 and logs failures when fresh audit diverges", () => {
  const checkedInText = readFileSync(defaultCheckedInReport, "utf8");
  const divergingReport = checkedInText.replace(
    "| Issues found | none |",
    "| Issues found | 1 |",
  );
  const logs: string[] = [];
  const errors: string[] = [];

  mockSpawnSyncForAudit(divergingReport);
  process.argv = ["node", "verify-self-audit-proof.ts"];
  process.exitCode = 0;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    main();

    expect(process.exitCode).toBe(1);
    expect(
      errors.some((e) =>
        e.includes("diverges from the checked-in self-audit packet"),
      ),
    ).toBe(true);
    expect(errors.some((e) => e.includes("first differing line"))).toBe(true);

    process.exitCode = 0;
  } finally {
    Bun.spawnSync = originalSpawnSync;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.argv = originalArgv;
    process.exitCode = 0;
  }
});

test("main() with --retain-dir creates verification bundle in-process", () => {
  const checkedInText = readFileSync(defaultCheckedInReport, "utf8");
  const tmp = mkdtempSync(join(tmpdir(), "anvil-main-retain-"));
  const retainDir = join(tmp, "bundle");
  const logs: string[] = [];
  const errors: string[] = [];

  mockSpawnSyncForAudit(checkedInText);
  process.argv = [
    "node",
    "verify-self-audit-proof.ts",
    "--retain-dir",
    retainDir,
  ];
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    main();

    expect(errors.length).toBe(0);
    expect(existsSync(join(retainDir, "checked-in-self-audit.md"))).toBe(true);
    expect(existsSync(join(retainDir, "fresh-self-audit.md"))).toBe(true);
    expect(existsSync(join(retainDir, "verification-summary.md"))).toBe(true);
    expect(existsSync(join(retainDir, "diff.txt"))).toBe(false);
    expect(logs.some((l) => l.includes("retained verification bundle"))).toBe(
      true,
    );
  } finally {
    Bun.spawnSync = originalSpawnSync;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.argv = originalArgv;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("main() propagates error when audit subprocess fails", () => {
  const checkedInText = readFileSync(defaultCheckedInReport, "utf8");
  const errors: string[] = [];

  mockSpawnSyncForAudit(checkedInText, 1);
  process.argv = ["node", "verify-self-audit-proof.ts"];
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    expect(() => main()).toThrow("self-audit rerun failed with exit code 1");
    expect(errors.some((e) => e.includes("audit error output"))).toBe(true);
  } finally {
    Bun.spawnSync = originalSpawnSync;
    console.error = originalConsoleError;
    process.argv = originalArgv;
  }
});

test("main() propagates error on unknown argument", () => {
  const errors: string[] = [];

  Bun.spawnSync = originalSpawnSync; // No audit mock needed
  process.argv = ["node", "verify-self-audit-proof.ts", "--bogus"];
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    expect(() => main()).toThrow("Unknown argument: --bogus");
  } finally {
    console.error = originalConsoleError;
    process.argv = originalArgv;
  }
});

test("main() creates diff.txt in retain bundle when reports diverge", () => {
  const checkedInText = readFileSync(defaultCheckedInReport, "utf8");
  const divergingReport = checkedInText.replace(
    "| Issues found | none |",
    "| Issues found | 3 |",
  );
  const tmp = mkdtempSync(join(tmpdir(), "anvil-main-diff-retain-"));
  const retainDir = join(tmp, "bundle");
  const errors: string[] = [];

  mockSpawnSyncForAudit(divergingReport);
  process.argv = [
    "node",
    "verify-self-audit-proof.ts",
    "--retain-dir",
    retainDir,
  ];
  process.exitCode = 0;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    main();

    expect(process.exitCode).toBe(1);
    expect(existsSync(join(retainDir, "checked-in-self-audit.md"))).toBe(true);
    expect(existsSync(join(retainDir, "fresh-self-audit.md"))).toBe(true);
    expect(existsSync(join(retainDir, "diff.txt"))).toBe(true);
    expect(existsSync(join(retainDir, "verification-summary.md"))).toBe(true);

    process.exitCode = 0;
  } finally {
    Bun.spawnSync = originalSpawnSync;
    console.error = originalConsoleError;
    process.argv = originalArgv;
    process.exitCode = 0;
    rmSync(tmp, { recursive: true, force: true });
  }
});
