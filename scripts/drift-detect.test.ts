import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, describe } from "bun:test";

// Mock process.exit for testing exit paths — converts to throwable error
const originalExit = process.exit;
function mockExit() {
  process.exit = ((code?: number | string | null) => {
    throw new Error(`__EXIT_${code ?? 1}__`);
  }) as typeof process.exit;
}
function restoreExit() {
  process.exit = originalExit;
}

import {
  type DriftIssue,
  parseArgs,
  normalizePath,
  collectFiles,
  compileIgnorePattern,
  loadAnvilIgnore,
  isIgnored,
  scanBrokenSymlinks,
  classifyReference,
  findLineNumber,
  daysSince,
  dateCadenceForFile,
  shouldSkipDateDrift,
  detectDateDrift,
  detectPathDrift,
  countByType,
  countBrokenSymlinkIssues,
  severitySymbol,
  titleForType,
  formatIssue,
  capitalize,
  buildReport,
} from "./drift-detect.ts";

// ─── parseArgs ──────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  test("parses --target with value", () => {
    const result = parseArgs(["node", "script.ts", "--target", "/some/path"]);
    expect(result.projectPath).toBe("/some/path");
    expect(result.extraSkipDirs).toEqual([]);
    expect(result.outputFile).toBeNull();
  });

  test("parses positional path argument", () => {
    const result = parseArgs(["node", "script.ts", "./my-project"]);
    expect(result.projectPath).toBe("./my-project");
  });

  test("parses --skip-dirs comma-separated list", () => {
    const result = parseArgs([
      "node",
      "script.ts",
      "--target",
      ".",
      "--skip-dirs",
      "foo,bar,baz",
    ]);
    expect(result.extraSkipDirs).toEqual(["foo", "bar", "baz"]);
  });

  test("parses --output path", () => {
    const result = parseArgs([
      "node",
      "script.ts",
      "--target",
      ".",
      "--output",
      "/tmp/report.md",
    ]);
    expect(result.outputFile).toBe("/tmp/report.md");
  });

  test("exits on unknown argument", () => {
    mockExit();
    try {
      expect(() =>
        parseArgs(["node", "script.ts", "--target", ".", "--bogus"]),
      ).toThrow(/__EXIT/);
    } finally {
      restoreExit();
    }
  });

  test("exits when no project path provided", () => {
    mockExit();
    try {
      expect(() => parseArgs(["node", "script.ts"])).toThrow(/__EXIT/);
    } finally {
      restoreExit();
    }
  });

  test("exits when --target has no value", () => {
    mockExit();
    try {
      expect(() => parseArgs(["node", "script.ts", "--target"])).toThrow(
        /__EXIT/,
      );
    } finally {
      restoreExit();
    }
  });

  test("exits when --target value starts with --", () => {
    mockExit();
    try {
      expect(() =>
        parseArgs(["node", "script.ts", "--target", "--skip-dirs"]),
      ).toThrow(/__EXIT/);
    } finally {
      restoreExit();
    }
  });

  test("exits when --output has no value", () => {
    mockExit();
    try {
      expect(() =>
        parseArgs(["node", "script.ts", "--target", ".", "--output"]),
      ).toThrow(/__EXIT/);
    } finally {
      restoreExit();
    }
  });

  test("exits when --skip-dirs has no value", () => {
    mockExit();
    try {
      expect(() =>
        parseArgs(["node", "script.ts", "--target", ".", "--skip-dirs"]),
      ).toThrow(/__EXIT/);
    } finally {
      restoreExit();
    }
  });

  test("--output value starting with -- is rejected", () => {
    mockExit();
    try {
      expect(() =>
        parseArgs([
          "node",
          "script.ts",
          "--target",
          ".",
          "--output",
          "--bogus",
        ]),
      ).toThrow(/__EXIT/);
    } finally {
      restoreExit();
    }
  });
});

// ─── normalizePath ──────────────────────────────────────────────────────────

describe("normalizePath", () => {
  test("converts backslashes to forward slashes", () => {
    expect(normalizePath("foo\\\\bar\\\\baz")).toBe("foo/bar/baz");
  });

  test("leaves forward slashes unchanged", () => {
    expect(normalizePath("foo/bar/baz")).toBe("foo/bar/baz");
  });

  test("handles mixed separators", () => {
    expect(normalizePath("foo\\\\bar/baz")).toBe("foo/bar/baz");
  });

  test("handles empty string", () => {
    expect(normalizePath("")).toBe("");
  });
});

// ─── compileIgnorePattern ───────────────────────────────────────────────────

describe("compileIgnorePattern", () => {
  test("exact path matches", () => {
    const re = compileIgnorePattern("docs/patterns/foo.md");
    expect(re.test("docs/patterns/foo.md")).toBe(true);
    expect(re.test("docs/patterns/bar.md")).toBe(false);
  });

  test("strips leading ./ ", () => {
    const re = compileIgnorePattern("./docs/secret.md");
    expect(re.test("docs/secret.md")).toBe(true);
  });

  test("strips leading /", () => {
    const re = compileIgnorePattern("/docs/secret.md");
    expect(re.test("docs/secret.md")).toBe(true);
  });

  test("trailing / becomes globstar", () => {
    const re = compileIgnorePattern("docs/patterns/");
    expect(re.test("docs/patterns/foo.md")).toBe(true);
    expect(re.test("docs/patterns/sub/bar.md")).toBe(true);
    expect(re.test("docs/other/foo.md")).toBe(false);
  });

  test("single * matches one segment", () => {
    const re = compileIgnorePattern("docs/*.md");
    expect(re.test("docs/foo.md")).toBe(true);
    expect(re.test("docs/sub/foo.md")).toBe(false);
  });

  test("** matches multiple segments", () => {
    const re = compileIgnorePattern("docs/**/*.md");
    // ** requires at least one intermediate path segment by design
    expect(re.test("docs/sub/foo.md")).toBe(true);
    expect(re.test("docs/sub/deep/foo.md")).toBe(true);
    expect(re.test("docs/foo.md")).toBe(false);
  });

  test("escapes regex metacharacters", () => {
    const re = compileIgnorePattern("docs/file.name.md");
    expect(re.test("docs/file.name.md")).toBe(true);
    // Dot should be literal, not wildcard
    expect(re.test("docs/fileXname.md")).toBe(false);
  });
});

// ─── loadAnvilIgnore ────────────────────────────────────────────────────────

describe("loadAnvilIgnore", () => {
  test("returns empty array when no .anvilignore exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-no-ignore-"));
    expect(loadAnvilIgnore(tmp)).toEqual([]);
  });

  test("reads and compiles patterns from .anvilignore", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-ignore-"));
    writeFileSync(
      join(tmp, ".anvilignore"),
      ["# comment", "docs/patterns/", "", "secret.md"].join("\n"),
    );
    const matchers = loadAnvilIgnore(tmp);
    expect(matchers).toHaveLength(2);
    expect(matchers[0].raw).toBe("docs/patterns/");
    expect(matchers[1].raw).toBe("secret.md");
  });
});

// ─── isIgnored ──────────────────────────────────────────────────────────────

describe("isIgnored", () => {
  test("returns false when no matchers provided", () => {
    expect(isIgnored("/foo/bar.md", "/foo", [])).toBe(false);
  });

  test("matches exact relative path", () => {
    const matchers = [
      { raw: "secret.md", regex: compileIgnorePattern("secret.md") },
    ];
    expect(isIgnored("/root/secret.md", "/root", matchers)).toBe(true);
    expect(isIgnored("/root/docs/secret.md", "/root", matchers)).toBe(false);
  });

  test("matches directory glob pattern", () => {
    const matchers = [
      { raw: "docs/patterns/", regex: compileIgnorePattern("docs/patterns/") },
    ];
    expect(isIgnored("/root/docs/patterns/foo.md", "/root", matchers)).toBe(
      true,
    );
    expect(isIgnored("/root/docs/other.md", "/root", matchers)).toBe(false);
  });
});

// ─── scanBrokenSymlinks ─────────────────────────────────────────────────────

describe("scanBrokenSymlinks", () => {
  test("detects broken symlink", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-symlink-"));
    const linkPath = join(tmp, "broken-link.md");
    symlinkSync("/nonexistent/target/path", linkPath);
    const { issues, brokenFiles } = scanBrokenSymlinks(tmp, [linkPath]);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("path");
    expect(issues[0].severity).toBe("medium");
    expect(issues[0].detail).toContain("Broken symlink");
    expect(brokenFiles.has(linkPath)).toBe(true);
  });

  test("does not report valid symlinks", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-valid-symlink-"));
    const targetPath = join(tmp, "real-file.md");
    writeFileSync(targetPath, "content");
    const linkPath = join(tmp, "good-link.md");
    symlinkSync(targetPath, linkPath);
    const { issues, brokenFiles } = scanBrokenSymlinks(tmp, [linkPath]);
    expect(issues).toHaveLength(0);
    expect(brokenFiles.size).toBe(0);
  });

  test("skips non-symlink files", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-regular-file-"));
    const filePath = join(tmp, "normal.md");
    writeFileSync(filePath, "content");
    const { issues, brokenFiles } = scanBrokenSymlinks(tmp, [filePath]);
    expect(issues).toHaveLength(0);
    expect(brokenFiles.size).toBe(0);
  });
});

// ─── classifyReference ──────────────────────────────────────────────────────

describe("classifyReference", () => {
  const projectRoot = "/project";
  const parentRoot = "/workspace";
  const workspaceRoot = "/workspace";

  test("classifies URL with scheme as url-like", () => {
    expect(
      classifyReference(
        "https://example.com/path",
        projectRoot,
        parentRoot,
        workspaceRoot,
      ),
    ).toBe("url-like");
  });

  test("classifies domain-like first segment as url-like", () => {
    expect(
      classifyReference(
        "github.com/user/repo",
        projectRoot,
        parentRoot,
        workspaceRoot,
      ),
    ).toBe("url-like");
  });

  test("returns null for single segment", () => {
    expect(
      classifyReference("README.md", projectRoot, parentRoot, workspaceRoot),
    ).toBeNull();
  });

  test("returns null for paths with file extensions on last segment", () => {
    expect(
      classifyReference(
        "docs/patterns/foo.md",
        projectRoot,
        parentRoot,
        workspaceRoot,
      ),
    ).toBeNull();
  });

  test("returns null for paths with more than 4 segments", () => {
    expect(
      classifyReference("a/b/c/d/e", projectRoot, parentRoot, workspaceRoot),
    ).toBeNull();
  });
});

// ─── findLineNumber ─────────────────────────────────────────────────────────

describe("findLineNumber", () => {
  test("returns 1 for index 0", () => {
    expect(findLineNumber("hello", 0)).toBe(1);
  });

  test("returns 1 for negative index", () => {
    expect(findLineNumber("hello", -1)).toBe(1);
  });

  test("counts newlines correctly", () => {
    const content = "line1\nline2\nline3";
    expect(findLineNumber(content, 0)).toBe(1);
    expect(findLineNumber(content, 6)).toBe(2);
    expect(findLineNumber(content, 12)).toBe(3);
  });

  test("handles multi-byte content", () => {
    const content = "héllo\nwörld";
    expect(findLineNumber(content, 7)).toBe(2);
  });
});

// ─── daysSince ──────────────────────────────────────────────────────────────

describe("daysSince", () => {
  test("returns null for invalid date", () => {
    expect(daysSince("not-a-date")).toBeNull();
    expect(daysSince("2026-13-45")).toBeNull();
  });

  test("returns 0 for today", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(daysSince(today)).toBe(0);
  });

  test("returns positive days for past date", () => {
    const past = "2020-01-01";
    const result = daysSince(past);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
  });

  test("computes day boundaries correctly", () => {
    // A date exactly 1 day ago should return at least 0 (could be 0 or 1 depending on time)
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split("T")[0];
    const result = daysSince(yesterday);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
  });
});

// ─── dateCadenceForFile ─────────────────────────────────────────────────────

describe("dateCadenceForFile", () => {
  test("returns 30-day threshold for AGENTS.md", () => {
    const result = dateCadenceForFile("/root/AGENTS.md");
    expect(result.thresholdDays).toBe(30);
    expect(result.cadenceLabel).toBe("alwaysApply");
    expect(result.alwaysApply).toBe(true);
  });

  test("returns 30-day threshold for TOOLS.md", () => {
    const result = dateCadenceForFile("/root/TOOLS.md");
    expect(result.thresholdDays).toBe(30);
    expect(result.alwaysApply).toBe(true);
  });

  test("returns 90-day threshold for pattern/doc files", () => {
    const result = dateCadenceForFile("/root/docs/patterns/some-pattern.md");
    expect(result.thresholdDays).toBe(90);
    expect(result.cadenceLabel).toBe("pattern/doc");
    expect(result.alwaysApply).toBe(false);
  });

  test("returns 90-day threshold for regular markdown", () => {
    const result = dateCadenceForFile("/root/README.md");
    expect(result.thresholdDays).toBe(90);
    expect(result.alwaysApply).toBe(false);
  });
});

// ─── shouldSkipDateDrift ────────────────────────────────────────────────────

describe("shouldSkipDateDrift", () => {
  test("skips known transient basenames", () => {
    expect(shouldSkipDateDrift("/root/SCRATCHPAD.md")).toBe(true);
    expect(shouldSkipDateDrift("/root/CHANGELOG.md")).toBe(true);
    expect(shouldSkipDateDrift("/root/MEMORY.md")).toBe(true);
    expect(shouldSkipDateDrift("/root/SOUL.md")).toBe(true);
  });

  test("skips -log.md files", () => {
    expect(shouldSkipDateDrift("/root/data/progress-log.md")).toBe(true);
  });

  test("skips -report*.md files", () => {
    expect(shouldSkipDateDrift("/root/drift-report.md")).toBe(true);
    expect(shouldSkipDateDrift("/root/audit-report-2026.md")).toBe(true);
  });

  test("does not skip regular markdown files", () => {
    expect(shouldSkipDateDrift("/root/docs/patterns/some-rule.md")).toBe(false);
    expect(shouldSkipDateDrift("/root/AGENTS.md")).toBe(false);
  });
});

// ─── detectDateDrift ────────────────────────────────────────────────────────

describe("detectDateDrift", () => {
  test("reports missing date header", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-date-missing-"));
    const filePath = join(tmp, "rules.md");
    writeFileSync(filePath, "# Rules\n\nSome content without a date.");
    const issues = detectDateDrift(tmp, [filePath]);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("date");
    expect(issues[0].detail).toContain("No validation date");
  });

  test("does not report when date is fresh", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-date-fresh-"));
    const filePath = join(tmp, "rules.md");
    const today = new Date().toISOString().split("T")[0];
    writeFileSync(filePath, `# Rules\n\nLast validated: ${today}\n`);
    const issues = detectDateDrift(tmp, [filePath]);
    expect(issues).toHaveLength(0);
  });

  test("reports stale date for pattern docs (>90 days)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-date-stale-"));
    const filePath = join(tmp, "pattern.md");
    writeFileSync(filePath, "# Pattern\n\nLast validated: 2020-01-01\n");
    const issues = detectDateDrift(tmp, [filePath]);
    expect(issues).toHaveLength(1);
    expect(issues[0].detail).toContain("stale");
    expect(issues[0].severity).toBe("medium");
  });

  test("reports stale date for AGENTS.md as high severity", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-date-agents-"));
    const filePath = join(tmp, "AGENTS.md");
    writeFileSync(filePath, "# AGENTS\n\nLast validated: 2020-01-01\n");
    const issues = detectDateDrift(tmp, [filePath]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high");
  });

  test("skips files in the skip list", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-date-skip-"));
    const filePath = join(tmp, "SCRATCHPAD.md");
    writeFileSync(filePath, "# Scratch\n\nNo date here.");
    const issues = detectDateDrift(tmp, [filePath]);
    expect(issues).toHaveLength(0);
  });

  test("reports invalid date format", () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-date-invalid-"));
    const filePath = join(tmp, "rules.md");
    // Regex matches \d{4}-\d{2}-\d{2} but Date rejects 2026-99-99
    writeFileSync(filePath, "# Rules\n\nLast validated: 2026-99-99\n");
    const issues = detectDateDrift(tmp, [filePath]);
    expect(issues).toHaveLength(1);
    expect(issues[0].detail).toContain("Invalid validation date");
  });
});

// ─── countByType ────────────────────────────────────────────────────────────

describe("countByType", () => {
  test("returns zero counts for empty array", () => {
    const result = countByType([]);
    expect(result).toEqual({
      path: 0,
      glob: 0,
      command: 0,
      date: 0,
      "coverage-gap": 0,
    });
  });

  test("counts each type correctly", () => {
    const issues: DriftIssue[] = [
      { type: "path", file: "a", detail: "d", severity: "high" },
      { type: "path", file: "b", detail: "d", severity: "low" },
      { type: "date", file: "c", detail: "d", severity: "medium" },
      { type: "glob", file: "d", detail: "d", severity: "low" },
      { type: "command", file: "e", detail: "d", severity: "high" },
      { type: "coverage-gap", file: "f", detail: "d", severity: "medium" },
    ];
    const result = countByType(issues);
    expect(result).toEqual({
      path: 2,
      glob: 1,
      command: 1,
      date: 1,
      "coverage-gap": 1,
    });
  });
});

// ─── countBrokenSymlinkIssues ───────────────────────────────────────────────

describe("countBrokenSymlinkIssues", () => {
  test("counts only broken symlink issues", () => {
    const issues: DriftIssue[] = [
      {
        type: "path",
        file: "a",
        detail: "Broken symlink target missing: `/foo`",
        severity: "medium",
      },
      {
        type: "path",
        file: "b",
        detail: "Path reference not found: `foo/bar`",
        severity: "high",
      },
      {
        type: "path",
        file: "c",
        detail: "Broken symlink target missing: `/bar` (resolved: `/bar`)",
        severity: "medium",
      },
    ];
    expect(countBrokenSymlinkIssues(issues)).toBe(2);
  });

  test("returns 0 for no broken symlinks", () => {
    const issues: DriftIssue[] = [
      { type: "date", file: "a", detail: "stale", severity: "medium" },
    ];
    expect(countBrokenSymlinkIssues(issues)).toBe(0);
  });
});

// ─── severitySymbol ─────────────────────────────────────────────────────────

describe("severitySymbol", () => {
  test("🔴 for high", () => {
    expect(severitySymbol("high")).toBe("🔴");
  });

  test("🟡 for medium", () => {
    expect(severitySymbol("medium")).toBe("🟡");
  });

  test("🟢 for low", () => {
    expect(severitySymbol("low")).toBe("🟢");
  });
});

// ─── titleForType ───────────────────────────────────────────────────────────

describe("titleForType", () => {
  test("returns human-readable titles", () => {
    expect(titleForType("path")).toBe("Path Drift");
    expect(titleForType("glob")).toBe("Glob Drift");
    expect(titleForType("command")).toBe("Command Drift");
    expect(titleForType("date")).toBe("Date Drift");
    expect(titleForType("coverage-gap")).toBe("Coverage Gap");
  });
});

// ─── capitalize ─────────────────────────────────────────────────────────────

describe("capitalize", () => {
  test("capitalizes first letter", () => {
    expect(capitalize("high")).toBe("High");
    expect(capitalize("medium")).toBe("Medium");
    expect(capitalize("low")).toBe("Low");
  });

  test("handles already capitalized string", () => {
    expect(capitalize("High")).toBe("High");
  });

  test("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });
});

// ─── formatIssue ────────────────────────────────────────────────────────────

describe("formatIssue", () => {
  test("formats issue with line number", () => {
    const issue: DriftIssue = {
      type: "path",
      file: "docs/rules.md",
      line: 42,
      detail: "Path reference not found: `foo/bar`",
      severity: "high",
    };
    const result = formatIssue(issue);
    expect(result).toContain("🔴 High — Path Drift");
    expect(result).toContain("docs/rules.md:42");
    expect(result).toContain("Path reference not found: `foo/bar`");
  });

  test("formats issue without line number", () => {
    const issue: DriftIssue = {
      type: "date",
      file: "AGENTS.md",
      detail: "No validation date found",
      severity: "medium",
    };
    const result = formatIssue(issue);
    expect(result).toContain("🟡 Medium — Date Drift");
    expect(result).toContain("**File:** AGENTS.md");
  });
});

// ─── buildReport ────────────────────────────────────────────────────────────

describe("buildReport", () => {
  test("generates well-formed report with issues", () => {
    const issues: DriftIssue[] = [
      {
        type: "path",
        file: "docs/missing.md",
        line: 10,
        detail: "Path reference not found: `foo/bar`",
        severity: "high",
      },
      {
        type: "date",
        file: "AGENTS.md",
        detail: "No validation date",
        severity: "high",
      },
    ];
    const report = buildReport("/my/project", issues, []);
    expect(report).toContain("# Drift Detection Report — project");
    expect(report).toContain("Path drift: 1 issues");
    expect(report).toContain("Date drift: 1 issues");
    expect(report).toContain("Path reference not found: `foo/bar`");
    expect(report).toContain("No validation date");
  });

  test("generates report with no issues", () => {
    const report = buildReport("/my/project", [], []);
    expect(report).toContain(
      "No drift issues detected for Phase 1b checks (path + date).",
    );
  });

  test("includes scope count when provided", () => {
    const report = buildReport("/my/project", [], [], [], 5);
    expect(report).toContain("Scope: discovered rule files only (5 files)");
  });

  test("includes ignore patterns when provided", () => {
    const matchers = [
      { raw: "docs/patterns/", regex: compileIgnorePattern("docs/patterns/") },
    ];
    const report = buildReport("/my/project", [], [], matchers);
    expect(report).toContain("**Anvil ignore patterns:** docs/patterns/");
  });

  test("includes notes section", () => {
    const notes = [
      { file: "docs/guide.md", line: 5, detail: "URL-like reference" },
    ];
    const report = buildReport("/my/project", [], notes);
    expect(report).toContain("docs/guide.md:5 — URL-like reference");
  });
});

// ─── collectFiles ──────────────────────────────────────────────────────────

describe("collectFiles", () => {
  test("collects files from a flat directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-collect-"));
    writeFileSync(join(dir, "a.md"), "hello");
    writeFileSync(join(dir, "b.txt"), "world");

    const files = collectFiles(dir).sort();
    expect(files).toEqual([join(dir, "a.md"), join(dir, "b.txt")].sort());
  });

  test("recurses into subdirectories", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-collect-"));
    writeFileSync(join(dir, "top.md"), "top");
    mkdirSync(join(dir, "sub"), { recursive: true });
    writeFileSync(join(dir, "sub", "deep.md"), "deep");

    const files = collectFiles(dir);
    expect(files.some((f) => f.endsWith("top.md"))).toBe(true);
    expect(files.some((f) => f.endsWith(join("sub", "deep.md")))).toBe(true);
  });

  test("skips default skip directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-collect-"));
    writeFileSync(join(dir, "real.md"), "real");
    mkdirSync(join(dir, "node_modules"), { recursive: true });
    mkdirSync(join(dir, ".git"), { recursive: true });
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "pkg.json"), "{}");
    writeFileSync(join(dir, ".git", "config"), "cfg");
    writeFileSync(join(dir, "dist", "out.js"), "js");

    const files = collectFiles(dir);
    expect(files.some((f) => f.endsWith("real.md"))).toBe(true);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(files.some((f) => f.includes(".git"))).toBe(false);
    expect(files.some((f) => f.includes("dist"))).toBe(false);
  });

  test("returns empty array for nonexistent directory", () => {
    const files = collectFiles(join(tmpdir(), "anvil-nonexistent-xyz"));
    expect(files).toEqual([]);
  });
});

// ─── detectPathDrift ───────────────────────────────────────────────────────

describe("detectPathDrift", () => {
  test("reports high-severity issue for missing path reference", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-drift-"));
    writeFileSync(
      join(dir, "AGENTS.md"),
      "See `src/utils/config.ts` for details.\n",
    );

    const result = detectPathDrift(dir, [join(dir, "AGENTS.md")]);
    expect(result.issues.length).toBeGreaterThan(0);
    const issue = result.issues.find((i) => i.type === "path");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("high");
    expect(issue?.detail).toContain("src/utils/config.ts");
  });

  test("does not report when path reference exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-drift-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "config.ts"), "export default {};");
    writeFileSync(join(dir, "AGENTS.md"), "See `src/config.ts` for details.\n");

    const result = detectPathDrift(dir, [join(dir, "AGENTS.md")]);
    const pathIssues = result.issues.filter((i) => i.type === "path");
    expect(pathIssues).toEqual([]);
  });

  test("skips glob patterns in backtick paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-drift-"));
    writeFileSync(
      join(dir, "AGENTS.md"),
      "Rules match `src/**/*.rules.md` patterns.\n",
    );

    const result = detectPathDrift(dir, [join(dir, "AGENTS.md")]);
    const pathIssues = result.issues.filter((i) => i.type === "path");
    expect(pathIssues).toEqual([]);
  });

  test("skips URL-like references", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-drift-"));
    writeFileSync(
      join(dir, "AGENTS.md"),
      "See https://example.com/guide for docs.\n",
    );

    const result = detectPathDrift(dir, [join(dir, "AGENTS.md")]);
    const pathIssues = result.issues.filter((i) => i.type === "path");
    expect(pathIssues).toEqual([]);
  });

  test("skips relative paths (./ and ../)", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-drift-"));
    writeFileSync(
      join(dir, "AGENTS.md"),
      "See `./config.ts` and `../shared/utils.ts` for details.\n",
    );

    const result = detectPathDrift(dir, [join(dir, "AGENTS.md")]);
    const pathIssues = result.issues.filter((i) => i.type === "path");
    expect(pathIssues).toEqual([]);
  });

  test("notes workspace-root resolution for existing parent paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-drift-"));
    mkdirSync(join(dir, "..", "shared-docs"), { recursive: true });
    // Create a file at the parent level
    writeFileSync(join(dir, "..", "shared-docs", "shared-file.md"), "shared");
    writeFileSync(
      join(dir, "AGENTS.md"),
      "Reference: `shared-docs/shared-file.md`\n",
    );

    const result = detectPathDrift(dir, [join(dir, "AGENTS.md")]);
    // Should produce a note about workspace-root resolution, not a high-severity issue
    const highIssues = result.issues.filter(
      (i) => i.type === "path" && i.severity === "high",
    );
    expect(highIssues).toEqual([]);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  test("processes multiple files", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-drift-"));
    writeFileSync(join(dir, "AGENTS.md"), "Missing: `src/missing1.ts`\n");
    writeFileSync(join(dir, "README.md"), "Missing: `src/missing2.ts`\n");

    const result = detectPathDrift(dir, [
      join(dir, "AGENTS.md"),
      join(dir, "README.md"),
    ]);
    expect(result.issues.filter((i) => i.type === "path").length).toBe(2);
  });

  test("skips drift-report.md files", () => {
    const dir = mkdtempSync(join(tmpdir(), "anvil-drift-"));
    writeFileSync(
      join(dir, "drift-report.md"),
      "Missing: `src/nonexistent.ts`\n",
    );

    const result = detectPathDrift(dir, [join(dir, "drift-report.md")]);
    expect(result.issues).toEqual([]);
  });
});

// ─── normalizePath ─────────────────────────────────────────────────────────

describe("normalizePath", () => {
  test("converts backslashes to forward slashes", () => {
    expect(normalizePath("src\\\\utils\\\\file.ts")).toBe("src/utils/file.ts");
  });

  test("leaves forward slashes unchanged", () => {
    expect(normalizePath("src/utils/file.ts")).toBe("src/utils/file.ts");
  });
});
