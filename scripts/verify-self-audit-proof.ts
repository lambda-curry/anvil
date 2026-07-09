import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

// When the checked-in self-audit packet is intentionally regenerated, update
// this path in the same change and refresh docs/proofs/sfe-538-self-audit-proof-guard.md
// with the new verifier run so future reruns stay pinned to one known packet.
export const defaultCheckedInReport = resolve(
  REPO_ROOT,
  "docs",
  "audits",
  "anvil-audit-2026-07-09.md",
);

const REPORT_DATE_PATTERN = /^\*Date: (\d{4}-\d{2}-\d{2})\*$/m;
const DATED_AUDIT_FILENAME_PATTERN = /anvil-audit-(\d{4}-\d{2}-\d{2})\.md$/;

const REQUIRED_TRUST_MARKERS = [
  {
    label: "verdict",
    snippet: "### ✅ Verdict: PASS",
  },
  {
    label: "issues found",
    snippet: "| Issues found | none |",
  },
  {
    label: "remediation tasks",
    snippet: "| Remediation tasks | none |",
  },
  {
    label: "action path",
    snippet:
      "Action path: none generated for this run; use the supporting diagnostics below if you need the evidence behind the pass verdict.",
  },
] as const;

type VerificationResult = {
  checks: string[];
  failures: string[];
};

type CliOptions = {
  retainDir: string | null;
};

function normalizeVolatileReportFields(reportText: string): string {
  return reportText
    .replace(/^\*Date: .+\*$/m, "*Date: <normalized>*")
    .replace(
      /\.\/artifacts\/anvil-\d{4}-\d{2}-\d{2}/g,
      "./artifacts/anvil-<normalized>",
    )
    .replace(
      /^\*Why this matters:\* This run analyzed \d+ PRs and surfaced \d+ recurring rule candidates\.$/m,
      "*Why this matters:* This run analyzed <normalized> PRs and surfaced <normalized> recurring rule candidates.",
    )
    .replace(
      /^PRs analyzed: \d+ · Comments reviewed: \d+ · Substantive comments: \d+ · Candidates: \d+$/m,
      "PRs analyzed: <normalized> · Comments reviewed: <normalized> · Substantive comments: <normalized> · Candidates: <normalized>",
    );
}

function firstDifferingLine(
  checkedInText: string,
  freshText: string,
): string | null {
  const checkedInLines = checkedInText.split("\n");
  const freshLines = freshText.split("\n");
  const maxLines = Math.max(checkedInLines.length, freshLines.length);

  for (let index = 0; index < maxLines; index++) {
    const checkedInLine = checkedInLines[index] ?? "";
    const freshLine = freshLines[index] ?? "";

    if (checkedInLine !== freshLine) {
      return `first differing line ${index + 1}: checked-in=${JSON.stringify(checkedInLine)} fresh=${JSON.stringify(freshLine)}`;
    }
  }

  return null;
}

function validateTrustMarkers(
  reportText: string,
  label: string,
  result: VerificationResult,
): void {
  for (const marker of REQUIRED_TRUST_MARKERS) {
    if (!reportText.includes(marker.snippet)) {
      result.failures.push(
        `${label} report is missing required trust marker: ${marker.label}`,
      );
      continue;
    }

    result.checks.push(`${label} report includes ${marker.label} marker`);
  }
}

export function compareSelfAuditReports(
  checkedInText: string,
  freshText: string,
): VerificationResult {
  const result: VerificationResult = {
    checks: [],
    failures: [],
  };

  validateTrustMarkers(checkedInText, "checked-in", result);
  validateTrustMarkers(freshText, "fresh rerun", result);

  const normalizedCheckedInText = normalizeVolatileReportFields(checkedInText);
  const normalizedFreshText = normalizeVolatileReportFields(freshText);

  if (normalizedCheckedInText === normalizedFreshText) {
    result.checks.push(
      "fresh deterministic rerun matches the checked-in self-audit packet after normalizing expected date-stamped metadata",
    );
  } else {
    result.failures.push(
      "fresh deterministic rerun diverges from the checked-in self-audit packet",
    );

    const firstDiff = firstDifferingLine(
      normalizedCheckedInText,
      normalizedFreshText,
    );
    if (firstDiff) {
      result.failures.push(firstDiff);
    }
  }

  return result;
}

export function validateCheckedInReportDatePath(
  reportPath: string,
  reportText: string,
): string | null {
  const embeddedDateMatch = reportText.match(REPORT_DATE_PATTERN);
  if (!embeddedDateMatch) {
    return "checked-in report is missing an embedded *Date: YYYY-MM-DD* header";
  }

  const pathDateMatch = reportPath.match(DATED_AUDIT_FILENAME_PATTERN);
  if (!pathDateMatch) {
    return "checked-in report path does not use the expected anvil-audit-YYYY-MM-DD.md naming";
  }

  const embeddedDate = embeddedDateMatch[1];
  const pathDate = pathDateMatch[1];

  if (embeddedDate !== pathDate) {
    return `checked-in report filename date ${pathDate} does not match embedded report date ${embeddedDate}`;
  }

  return null;
}

function buildDiff(checkedInPath: string, freshPath: string): string {
  const diff = Bun.spawnSync({
    cmd: ["diff", "-u", checkedInPath, freshPath],
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  return diff.stdout.toString().trim();
}

export function parseCliOptions(
  args: string[],
  cwd = process.cwd(),
): CliOptions {
  let retainDir: string | null = null;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === "--retain-dir") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--retain-dir requires a directory path");
      }
      retainDir = resolve(cwd, value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { retainDir };
}

function formatVerificationSummary(result: VerificationResult): string {
  const lines = ["# Self-audit verification summary", ""];

  if (result.checks.length > 0) {
    lines.push("## Checks", "");
    for (const check of result.checks) {
      lines.push(`- ${check}`);
    }
    lines.push("");
  }

  if (result.failures.length > 0) {
    lines.push("## Failures", "");
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function retainVerificationBundle(
  retainDir: string,
  checkedInPath: string,
  freshPath: string,
  result: VerificationResult,
  diff: string,
): void {
  mkdirSync(retainDir, { recursive: true });
  copyFileSync(checkedInPath, join(retainDir, "checked-in-self-audit.md"));
  copyFileSync(freshPath, join(retainDir, "fresh-self-audit.md"));
  writeFileSync(
    join(retainDir, "verification-summary.md"),
    formatVerificationSummary(result),
  );
  if (diff.length > 0) {
    writeFileSync(join(retainDir, "diff.txt"), `${diff}\n`);
  }
}

function runFreshAudit(outputPath: string): void {
  const audit = Bun.spawnSync({
    cmd: [
      "bun",
      "run",
      "scripts/audit.ts",
      "--target",
      ".",
      "--ci",
      "--output",
      outputPath,
    ],
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (audit.exitCode === 0) {
    return;
  }

  const stdout = audit.stdout.toString().trim();
  const stderr = audit.stderr.toString().trim();

  if (stdout) {
    console.error(stdout);
  }
  if (stderr) {
    console.error(stderr);
  }

  throw new Error(`self-audit rerun failed with exit code ${audit.exitCode}`);
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  const tempDirectory = mkdtempSync(join(tmpdir(), "anvil-self-audit-"));
  const freshPath = join(tempDirectory, "self-audit.md");

  try {
    runFreshAudit(freshPath);

    const checkedInText = readFileSync(defaultCheckedInReport, "utf8");
    const freshText = readFileSync(freshPath, "utf8");
    const result = compareSelfAuditReports(checkedInText, freshText);
    const checkedInReportDatePathFailure = validateCheckedInReportDatePath(
      defaultCheckedInReport,
      checkedInText,
    );

    if (checkedInReportDatePathFailure) {
      result.failures.unshift(checkedInReportDatePathFailure);
    } else {
      result.checks.unshift(
        "checked-in report filename date matches the embedded audit date",
      );
    }

    const diff =
      result.failures.length > 0
        ? buildDiff(defaultCheckedInReport, freshPath)
        : "";

    if (options.retainDir) {
      retainVerificationBundle(
        options.retainDir,
        defaultCheckedInReport,
        freshPath,
        result,
        diff,
      );
    }

    if (result.failures.length > 0) {
      for (const failure of result.failures) {
        console.error(failure);
      }

      if (diff.length > 0) {
        console.error(diff);
      }
      if (options.retainDir) {
        console.error(`retained verification bundle: ${options.retainDir}`);
      }

      process.exitCode = 1;
      return;
    }

    for (const check of result.checks) {
      console.log(check);
    }
    if (options.retainDir) {
      console.log(`retained verification bundle: ${options.retainDir}`);
    }
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true });
  }
}

if (import.meta.main) {
  main();
}
