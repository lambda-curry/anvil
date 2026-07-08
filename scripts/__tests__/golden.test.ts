import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  analyzeCoverage,
  analyzeRuleFile,
  assessStageC,
  buildReport as buildAuditReport,
  type ParsedArgs,
  type PrMiningInsight,
  type RuleFile,
  resolveGitHubRepoSlug,
  runAudit,
  scoreAudit,
} from "../audit.ts";
import { detectStack } from "../bootstrap-detect.ts";
import {
  buildDraft,
  loadTemplatesFromFiles,
  matchesSignal,
} from "../bootstrap-generate.ts";
import {
  buildReport as buildDriftReport,
  type DriftIssue,
  detectDateDrift,
  detectPathDrift,
} from "../drift-detect.ts";
import { discoverRuleSurfaceFiles } from "../lib/rule-surface.ts";
import {
  buildMarkdown,
  type Cluster,
  type NormalizedComment,
} from "../mine-pr-rules.ts";

const WORKSPACE = resolve(import.meta.dir, "..", "..");
const FIXTURE = resolve(
  import.meta.dir,
  "..",
  "__fixtures__",
  "sample-cli-repo",
);
const TOOL_NATIVE_FIXTURE = resolve(
  import.meta.dir,
  "..",
  "__fixtures__",
  "tool-native-cursor-repo",
);
const GOLDEN_DIR = resolve(import.meta.dir, "golden");
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === "1";

function normalize(text: string): string {
  return text
    .replaceAll(WORKSPACE, "<WORKSPACE>")
    .replaceAll(FIXTURE, "<FIXTURE>")
    .replace(
      /\/(?:var\/folders|tmp)[^`\n ]*anvil-audit-artifacts-[A-Za-z0-9]+/g,
      "<TMP_ARTIFACT_DIR>",
    )
    .replace(/\d{4}-\d{2}-\d{2}/g, "<DATE>")
    .replace(/\r\n/g, "\n");
}

function assertGolden(name: string, actual: string) {
  if (!existsSync(GOLDEN_DIR)) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
  }

  const path = join(GOLDEN_DIR, name);
  if (UPDATE_GOLDEN || !existsSync(path)) {
    writeFileSync(path, actual, "utf8");
  }

  const expected = readFileSync(path, "utf8");
  expect(actual).toBe(expected);
}

test("bootstrap-detect output stays stable", async () => {
  const stack = await detectStack(FIXTURE);
  const normalized = normalize(JSON.stringify(stack, null, 2));
  assertGolden("bootstrap-detect.sample-cli.json", `${normalized}\n`);
});

test("bootstrap-generate draft stays stable", async () => {
  const stack = await detectStack(FIXTURE);
  const templates = loadTemplatesFromFiles();
  const matched = templates.filter((template) =>
    matchesSignal(template, stack),
  );
  const draft = buildDraft(stack, matched);
  assertGolden("bootstrap-generate.sample-cli.md", normalize(draft));
});

test("drift-detect report format stays stable", () => {
  const issues: DriftIssue[] = [
    {
      type: "path",
      file: "AGENTS.md",
      line: 12,
      detail: "Path reference not found: `docs/missing.md`",
      severity: "high",
    },
    {
      type: "date",
      file: "TOOLS.md",
      detail:
        "No validation date found. Expected pattern: `Last validated: YYYY-MM-DD`",
      severity: "medium",
    },
  ];

  const report = buildDriftReport(FIXTURE, issues, []);
  assertGolden("drift-detect.sample.md", normalize(report));
});

test("detectDateDrift accepts markdown metadata Last validated format", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-drift-date-metadata-"));
  const agentsPath = join(repo, "AGENTS.md");
  const toolsPath = join(repo, "TOOLS.md");
  const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  writeFileSync(
    agentsPath,
    [
      "# Agent Rules",
      "",
      `**Last validated:** \`${recentDate}\``,
      "",
      "Rule text.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    toolsPath,
    [
      "# Tool Rules",
      "",
      `**Last validated:** \`${recentDate}\``,
      "",
      "Tool guidance.",
    ].join("\n"),
    "utf8",
  );

  const issues = detectDateDrift(repo, [agentsPath, toolsPath]);

  rmSync(repo, { recursive: true, force: true });

  expect(issues).toEqual([]);
});

test("detectPathDrift skips URL-like and import-like references but keeps missing local paths", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-drift-path-fixture-"));
  const claudePath = join(repo, "CLAUDE.md");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "index.ts"), "export {};\n", "utf8");

  writeFileSync(
    claudePath,
    [
      "# Temp Rules",
      "",
      "Use `github.com/dvl-thepsilon/frontlineiq` for repo context.",
      "Package macro import: `@lingui/react/macro`.",
      "Reference docs at `ui.shadcn.com/docs/components`.",
      "Existing file: `src/index.ts`.",
      "Missing local file: `src/missing.ts`.",
    ].join("\n"),
    "utf8",
  );

  const result = detectPathDrift(repo, [claudePath]);

  rmSync(repo, { recursive: true, force: true });

  expect(result.issues).toEqual([
    {
      type: "path",
      file: "CLAUDE.md",
      line: 7,
      detail:
        "Path reference not found: `src/missing.ts` (checked: `src/missing.ts`)",
      severity: "high",
    },
  ]);
  expect(result.notes.map((note) => note.detail)).toEqual([
    "URL-like reference `github.com/dvl-thepsilon/frontlineiq` looks external; not treated as local path drift",
    "Import-like reference `@lingui/react/macro` looks external; not treated as local path drift",
    "URL-like reference `ui.shadcn.com/docs/components` looks external; not treated as local path drift",
  ]);
});

test("detectPathDrift skips cross-project example paths but keeps missing local docs refs", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-drift-example-fixture-"));
  const patternPath = join(repo, "docs", "patterns", "example.md");
  const templatePath = join(repo, "docs", "bootstrap-templates", "prisma.md");

  mkdirSync(join(repo, "docs", "patterns"), { recursive: true });
  mkdirSync(join(repo, "docs", "bootstrap-templates"), { recursive: true });
  mkdirSync(join(repo, "memory"), { recursive: true });
  mkdirSync(join(repo, "data"), { recursive: true });
  writeFileSync(join(repo, "data", "progress-log.md"), "log\n", "utf8");

  writeFileSync(
    patternPath,
    [
      "# Pattern",
      "",
      "*Origin: vercel/next.js*",
      "",
      "## Why",
      "Bad absolute artifact path: `/home/node/.openclaw/...`.",
      "",
      "## Examples",
      "- Update `memory/YYYY-MM-DD.md` after the cycle.",
      "- Read `data/research-log.md` before synthesis.",
      "- External code path: `apps/watchtower/src/timeline.ts`.",
      "- Cross-repo doc path: `docs/ARCHETYPE-COMPARISON.md`.",
      "",
      "## See Also",
      "- Local broken ref: `docs/missing-local.md`.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    templatePath,
    [
      "# Template",
      "",
      "1. Edit `prisma/schema.prisma` before running migrations.",
    ].join("\n"),
    "utf8",
  );

  const result = detectPathDrift(repo, [patternPath, templatePath]);

  rmSync(repo, { recursive: true, force: true });

  expect(result.issues).toEqual([
    {
      type: "path",
      file: "docs/patterns/example.md",
      line: 15,
      detail:
        "Path reference not found: `docs/missing-local.md` (checked: `docs/missing-local.md`)",
      severity: "high",
    },
  ]);
  expect(result.notes.map((note) => note.detail)).toEqual([
    "Example/template reference `/home/node/.openclaw/...` uses placeholder segments; not treated as local path drift",
    "Example/template reference `memory/YYYY-MM-DD.md` uses placeholder segments; not treated as local path drift",
    "Example/template reference `data/research-log.md` appears inside an Examples section; not treated as local path drift",
    "Example/template reference `apps/watchtower/src/timeline.ts` appears inside an Examples section; not treated as local path drift",
    "Example/template reference `docs/ARCHETYPE-COMPARISON.md` appears inside an Examples section; not treated as local path drift",
    "Example/template reference `prisma/schema.prisma` targets a cross-project path surface; not treated as local path drift",
  ]);
  expect(
    result.notes.some((note) => note.detail.includes("vercel/next.js")),
  ).toBe(false);
});

test("resolveGitHubRepoSlug explains nested-path audits as scope context", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-stage-c-nested-root-"));
  const nested = join(repo, "packages", "child");
  mkdirSync(nested, { recursive: true });

  writeFileSync(join(repo, "README.md"), "# Temp repo\n", "utf8");
  Bun.spawnSync(["git", "init", "-b", "main", repo], {
    stdout: "ignore",
    stderr: "ignore",
  });
  Bun.spawnSync(
    [
      "git",
      "-C",
      repo,
      "remote",
      "add",
      "origin",
      "git@github.com:example/temp.git",
    ],
    {
      stdout: "ignore",
      stderr: "ignore",
    },
  );

  const result = resolveGitHubRepoSlug(nested);

  rmSync(repo, { recursive: true, force: true });

  expect(result).toEqual({
    repo: null,
    reason:
      "PR mining was not evaluated for this scoped audit target because the path is nested inside a larger git repository. Re-run the audit at the repo root to include parent-repo PR signal.",
  });
});

test("anvil wrapper preserves caller cwd for drift and bootstrap", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-wrapper-cwd-fixture-"));
  const target = join(repo, "target");
  const driftReport = join(repo, "drift-report.md");
  const bootstrapDraft = join(repo, "bootstrap-draft.md");
  const today = new Date().toISOString().slice(0, 10);

  mkdirSync(join(target, ".cursor", "rules"), { recursive: true });
  writeFileSync(
    join(target, ".cursor", "rules", "AGENTS.md"),
    [
      "# Sample Rules",
      "",
      `**Last validated:** \`${today}\``,
      "",
      "## Why",
      "Keep this fixture minimal but valid.",
      "",
      "## Examples",
      "- Do: keep paths relative to the caller cwd",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(target, "package.json"),
    JSON.stringify({ name: "sample-target", version: "0.0.0" }, null, 2),
    "utf8",
  );

  const drift = spawnSync(
    process.execPath,
    [
      "run",
      join(WORKSPACE, "bin", "anvil.ts"),
      "drift",
      "./target",
      "--output",
      "./drift-report.md",
    ],
    {
      cwd: repo,
      encoding: "utf8",
    },
  );

  const bootstrap = spawnSync(
    process.execPath,
    [
      "run",
      join(WORKSPACE, "bin", "anvil.ts"),
      "bootstrap",
      "./target",
      "--output",
      "./bootstrap-draft.md",
    ],
    {
      cwd: repo,
      encoding: "utf8",
    },
  );

  expect(drift.status).toBe(0);
  expect(drift.stderr).toBe("");
  expect(existsSync(driftReport)).toBe(true);
  expect(readFileSync(driftReport, "utf8")).toContain(
    "No drift issues detected for Phase 1b checks (path + date).",
  );

  expect(bootstrap.status).toBe(0);
  expect(bootstrap.stderr).toBe("");
  expect(existsSync(bootstrapDraft)).toBe(true);
  expect(readFileSync(bootstrapDraft, "utf8")).toContain("# Bootstrap Draft");

  rmSync(repo, { recursive: true, force: true });
});

test("anvil wrapper preserves caller cwd and relative artifact links for audit", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-audit-wrapper-cwd-fixture-"));
  const target = join(repo, "target");
  const reportPath = join(repo, "report.md");
  const artifactsDir = join(repo, "artifacts");

  mkdirSync(join(target, ".cursor", "rules"), { recursive: true });
  writeFileSync(
    join(target, ".cursor", "rules", "AGENTS.md"),
    [
      "# Sample Rules",
      "",
      "**Last validated:** `2026-04-28`",
      "",
      "## Why",
      "Keep this fixture minimal but valid.",
      "",
      "## Examples",
      "- Do: keep paths relative to the caller cwd",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(target, "package.json"),
    JSON.stringify({ name: "sample-target", version: "0.0.0" }, null, 2),
    "utf8",
  );

  const audit = spawnSync(
    process.execPath,
    [
      "run",
      join(WORKSPACE, "bin", "anvil.ts"),
      "audit",
      "--target",
      "./target",
      "--output",
      "./report.md",
      "--artifacts-dir",
      "./artifacts",
      "--ci",
    ],
    {
      cwd: repo,
      encoding: "utf8",
    },
  );

  expect(audit.status).toBe(0);
  expect(audit.stderr).toBe("");
  expect(existsSync(reportPath)).toBe(true);
  expect(existsSync(join(artifactsDir, "drift-report.md"))).toBe(true);
  expect(existsSync(join(artifactsDir, "bootstrap-draft.md"))).toBe(true);

  const report = readFileSync(reportPath, "utf8");
  const artifactsSection =
    report.match(
      /## Artifacts\n[\s\S]*?(?=\n---\n\*Anvil audit pipeline)/,
    )?.[0] ?? report;

  expect(report).toContain("Target: `./target`");
  expect(report).not.toContain(realpathSync(target));
  expect(artifactsSection).toContain(
    "- Drift report: [`./artifacts/drift-report.md`](./artifacts/drift-report.md)",
  );
  expect(artifactsSection).toContain(
    "- Bootstrap draft: [`./artifacts/bootstrap-draft.md`](./artifacts/bootstrap-draft.md)",
  );
  expect(artifactsSection).toContain("- Artifacts dir: `./artifacts`");
  expect(artifactsSection).not.toContain(WORKSPACE);
  expect(artifactsSection).not.toContain(`${repo}/artifacts`);

  rmSync(repo, { recursive: true, force: true });
});

test("mine-pr-rules prefers coherent diff-based DO/DON'T examples", () => {
  const comments: NormalizedComment[] = [
    {
      prNumber: 201,
      prTitle: "Fix naming guidance",
      body: [
        "Consider replacing the placeholder names with explicit ones.",
        "```diff",
        "-function p(s: string) {}",
        "-class Builder2 {}",
        "+function parseRoutePattern(pattern: string) {}",
        "+class RouteManifestBuilder {}",
        "```",
      ].join("\n"),
      path: "src/routes.ts",
      createdAt: "2026-02-25T00:00:00Z",
    },
    {
      prNumber: 202,
      prTitle: "Follow naming conventions",
      body: "Prefer convention-aligned names instead of abbreviations.",
      path: "src/routes.ts",
      createdAt: "2026-02-25T00:00:01Z",
    },
    {
      prNumber: 203,
      prTitle: "Improve clarity",
      body: "Use descriptive function and class names here.",
      path: "src/routes.ts",
      createdAt: "2026-02-25T00:00:02Z",
    },
  ];

  const cluster: Cluster = {
    theme: "naming",
    comments,
    severitySignals: 2,
    uniquePRs: new Set([201, 202, 203]),
    score: 2.8,
  };

  const markdown = buildMarkdown(
    "example/routes",
    30,
    45,
    { tooShort: 0, approvals: 0, questionOnly: 0, lowSignal: 0 },
    [cluster],
  );

  expect(markdown).toContain(
    "function parseRoutePattern(pattern: string) {}\nclass RouteManifestBuilder {}",
  );
  expect(markdown).toContain("function p(s: string) {}\nclass Builder2 {}");
});

test("mine-pr-rules markdown output stays stable", () => {
  const comments: NormalizedComment[] = [
    {
      prNumber: 101,
      prTitle: "Improve CLI input parsing",
      body: "We should validate user input and avoid unsafe assumptions.",
      path: "src/cli.ts",
      createdAt: "2026-02-25T00:00:00Z",
    },
    {
      prNumber: 102,
      prTitle: "Fix edge case",
      body: "Please use zod validation and explicit error handling here.",
      path: "src/cli.ts",
      createdAt: "2026-02-25T00:00:01Z",
    },
    {
      prNumber: 103,
      prTitle: "CLI checks",
      body: "Need to validate auth token input and handle failures clearly.",
      path: "src/cli.ts",
      createdAt: "2026-02-25T00:00:02Z",
    },
  ];

  const cluster: Cluster = {
    theme: "security",
    comments,
    severitySignals: 4,
    uniquePRs: new Set([101, 102, 103]),
    score: 3.6,
  };

  const markdown = buildMarkdown(
    "example/cli",
    40,
    90,
    { tooShort: 10, approvals: 20, questionOnly: 5, lowSignal: 3 },
    [cluster],
  );
  assertGolden("mine-pr-rules.sample.md", normalize(markdown));
});

test("analyzeRuleFile recognizes AGENTS metadata loading tier", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-tier-fixture-"));
  const agentsPath = join(repo, "AGENTS.md");

  writeFileSync(
    agentsPath,
    [
      "# Temp Rules",
      "",
      "**Loading tier:** `alwaysApply`",
      "**Scope:** repository root",
      "**Last validated:** 2026-03-18",
      "",
      "## Why",
      "Tier metadata should be machine-detectable.",
      "",
      "## Examples",
      "- Do: declare loading tier explicitly",
    ].join("\n"),
    "utf8",
  );

  const analyzed = analyzeRuleFile(agentsPath, repo, "agents-md", "markdown");

  rmSync(repo, { recursive: true, force: true });

  expect(analyzed?.hasAlwaysApply).toBe(true);
  expect(analyzed?.hasGlob).toBe(false);
});

test("discoverRuleSurfaceFiles includes Anvil template and pattern docs", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-rule-surface-fixture-"));
  const templateDir = join(repo, "docs", "bootstrap-templates");
  const patternDir = join(repo, "docs", "patterns");

  mkdirSync(templateDir, { recursive: true });
  mkdirSync(patternDir, { recursive: true });

  writeFileSync(join(templateDir, "testing.md"), "# Template\n", "utf8");
  writeFileSync(join(patternDir, "handoff-packet.md"), "# Pattern\n", "utf8");

  const discovered = discoverRuleSurfaceFiles(repo)
    .map((file) => ({ relativePath: file.relativePath, tool: file.tool }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  rmSync(repo, { recursive: true, force: true });

  expect(discovered).toEqual([
    {
      relativePath: "docs/bootstrap-templates/testing.md",
      tool: "anvil-bootstrap-template",
    },
    { relativePath: "docs/patterns/handoff-packet.md", tool: "anvil-pattern" },
  ]);
});

test("discoverRuleSurfaceFiles finds nested AGENTS.md and CLAUDE.md files", () => {
  const repo = mkdtempSync(
    join(tmpdir(), "anvil-nested-rule-surface-fixture-"),
  );
  const nestedAgents = join(repo, "packages", "widget", "AGENTS.md");
  const nestedClaude = join(repo, "apps", "docs", "CLAUDE.md");
  const worktreeAgents = join(repo, ".worktrees", "feature", "AGENTS.md");
  const fixtureAgents = join(
    repo,
    "scripts",
    "__fixtures__",
    "sample-cli-repo",
    "AGENTS.md",
  );
  const fixtureClaude = join(repo, "fixtures", "demo", "CLAUDE.md");
  const rootAgents = join(repo, "AGENTS.md");
  const cursorRulesDir = join(repo, ".cursor", "rules");

  mkdirSync(join(repo, "packages", "widget"), { recursive: true });
  mkdirSync(join(repo, "apps", "docs"), { recursive: true });
  mkdirSync(join(repo, ".worktrees", "feature"), { recursive: true });
  mkdirSync(join(repo, "scripts", "__fixtures__", "sample-cli-repo"), {
    recursive: true,
  });
  mkdirSync(join(repo, "fixtures", "demo"), { recursive: true });
  mkdirSync(cursorRulesDir, { recursive: true });

  writeFileSync(rootAgents, "# Root rules\n", "utf8");
  writeFileSync(nestedAgents, "# Nested rules\n", "utf8");
  writeFileSync(nestedClaude, "# Nested claude rules\n", "utf8");
  writeFileSync(worktreeAgents, "# Worktree rules\n", "utf8");
  writeFileSync(fixtureAgents, "# Fixture rules\n", "utf8");
  writeFileSync(fixtureClaude, "# Fixture claude rules\n", "utf8");
  writeFileSync(join(cursorRulesDir, "repo.mdc"), "---\n", "utf8");

  const discovered = discoverRuleSurfaceFiles(repo)
    .map((file) => ({ relativePath: file.relativePath, tool: file.tool }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  rmSync(repo, { recursive: true, force: true });

  expect(discovered).toEqual([
    { relativePath: ".cursor/rules/repo.mdc", tool: "cursor" },
    { relativePath: "AGENTS.md", tool: "agents-md" },
    { relativePath: "apps/docs/CLAUDE.md", tool: "claude-code" },
    { relativePath: "packages/widget/AGENTS.md", tool: "agents-md" },
  ]);
});

test("discoverRuleSurfaceFiles skips symlinked rule files that escape the repo", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-external-rule-surface-"));
  const external = mkdtempSync(join(tmpdir(), "anvil-external-rules-"));
  const nestedAgentsSource = join(repo, "docs", "nested-agents-source.md");
  const nestedAgentsLink = join(repo, "packages", "widget", "AGENTS.md");
  const externalToolsSource = join(external, "TOOLS.md");
  const rootAgents = join(repo, "AGENTS.md");
  const rootTools = join(repo, "TOOLS.md");

  mkdirSync(join(repo, "docs"), { recursive: true });
  mkdirSync(join(repo, "packages", "widget"), { recursive: true });

  writeFileSync(rootAgents, "# Root rules\n", "utf8");
  writeFileSync(nestedAgentsSource, "# Nested rules\n", "utf8");
  writeFileSync(externalToolsSource, "# External tools\n", "utf8");
  symlinkSync(nestedAgentsSource, nestedAgentsLink);
  symlinkSync(externalToolsSource, rootTools);

  const discovered = discoverRuleSurfaceFiles(repo)
    .map((file) => ({ relativePath: file.relativePath, tool: file.tool }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  rmSync(repo, { recursive: true, force: true });
  rmSync(external, { recursive: true, force: true });

  expect(discovered).toEqual([
    { relativePath: "AGENTS.md", tool: "agents-md" },
    { relativePath: "packages/widget/AGENTS.md", tool: "agents-md" },
  ]);
});

test("analyzeRuleFile uses a larger size budget for pattern docs", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-pattern-budget-fixture-"));
  const patternDir = join(repo, "docs", "patterns");
  const patternPath = join(patternDir, "large-pattern.md");

  mkdirSync(patternDir, { recursive: true });
  writeFileSync(
    patternPath,
    Array.from({ length: 250 }, (_, i) => `Line ${i + 1}`).join("\n"),
    "utf8",
  );

  const analyzed = analyzeRuleFile(
    patternPath,
    repo,
    "anvil-pattern",
    "markdown",
  );

  rmSync(repo, { recursive: true, force: true });

  expect(analyzed?.sizeLines).toBe(250);
  expect(analyzed?.linesOverBudget).toBe(false);
});

test("audit coverage recognizes compact failure-handling language", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-coverage-fixture-"));
  const agentsPath = join(repo, "AGENTS.md");

  writeFileSync(
    agentsPath,
    [
      "# Temp Rules",
      "",
      "Last validated: 2026-03-17",
      "",
      "## Why",
      "Compact failure-handling guidance should still count.",
      "",
      "## The Rule",
      "### Handle failures explicitly",
      "Include the exact failed command and short failure signal.",
      "Stop at project boundaries and escalate blockers instead of forcing risky work.",
      "",
      "## Examples",
      "- Do: report the failed command",
    ].join("\n"),
    "utf8",
  );

  const fixtureRule: RuleFile = {
    path: agentsPath,
    relativePath: "AGENTS.md",
    tool: "agents",
    format: "markdown",
    sizeLines: 14,
    hasAlwaysApply: true,
    hasGlob: false,
    hasDescription: true,
    hasLastValidated: true,
    hasWhySection: true,
    hasExamplesSection: true,
    linesOverBudget: false,
    authorship: "governance",
    fingerprint: "fixture-agents",
  };

  const coverage = analyzeCoverage([fixtureRule], repo);
  const errorHandling = coverage.find((item) => item.name === "Error Handling");

  rmSync(repo, { recursive: true, force: true });

  expect(errorHandling?.present).toBe(true);
  expect(errorHandling?.signals).toContain("Handle failures explicitly");
});

test("stage C treats empty PR mining signal as unavailable instead of failing", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-stagec-fixture-"));
  const agentsPath = join(repo, "AGENTS.md");

  writeFileSync(
    agentsPath,
    [
      "# Temp Rules",
      "",
      "Last validated: 2026-03-18",
      "",
      "## Why",
      "Critical baseline rules are present.",
      "",
      "## The Rule",
      "Use TypeScript strict mode.",
      "Handle failures explicitly.",
      "Write tests for important changes.",
      "Validate inputs and avoid secret leaks.",
      "",
      "## Examples",
      "- Do: keep baseline rules concrete",
    ].join("\n"),
    "utf8",
  );

  const fixtureRule: RuleFile = {
    path: agentsPath,
    relativePath: "AGENTS.md",
    tool: "agents",
    format: "markdown",
    sizeLines: 15,
    hasAlwaysApply: true,
    hasGlob: false,
    hasDescription: true,
    hasLastValidated: true,
    hasWhySection: true,
    hasExamplesSection: true,
    linesOverBudget: false,
    authorship: "governance",
    fingerprint: "fixture-stagec-agents",
  };

  const coverage = analyzeCoverage([fixtureRule], repo);
  const emptyPrMining: PrMiningInsight = {
    status: "available",
    repo: "example/repo",
    reason: null,
    analyzedPrs: 5,
    reviewedComments: 5,
    substantiveComments: 5,
    candidateCount: 0,
    findings: [],
    artifactPath: null,
  };

  const result = assessStageC(coverage, emptyPrMining, [fixtureRule]);

  rmSync(repo, { recursive: true, force: true });

  expect(result.stage.status).toBe("pass");
  expect(result.metrics.score).toBe(1);
  expect(
    result.stage.checks.find((check) => check.id === "pr-theme-coverage")
      ?.status,
  ).toBe("warn");
  expect(
    result.stage.checks.find((check) => check.id === "comment-rule-alignment")
      ?.detail,
  ).toContain("No PR-derived clusters crossed confidence thresholds");
});

test("audit report output stays stable", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "anvil-audit-report-"));
  const artifactsDir = join(
    outputRoot,
    "docs",
    "audits",
    "artifacts",
    "sample-cli-repo-artifacts",
  );
  const outputFile = join(outputRoot, "docs", "audits", "report.md");
  const args: ParsedArgs = {
    targetPath: FIXTURE,
    outputFile,
    artifactsDir,
    skipBootstrap: true,
    jsonOutput: false,
    ciMode: true,
    noAi: true,
    noAiAliasUsed: false,
    aiProvider: null,
    aiModel: null,
    aiTimeoutMs: null,
    forceStageB: false,
  };

  const result = await runAudit(args);
  const report = buildAuditReport(result, {
    reportPath: outputFile,
    targetDisplayPath: args.targetPath,
  });

  // Cleanup temp artifacts from this test run.
  rmSync(outputRoot, { recursive: true, force: true });

  assertGolden("audit.sample-cli.md", normalize(report));
});

test("report marks non-scoring rule-file cells as advisory only", async () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-report-advisory-"));
  mkdirSync(join(repo, "ai-rules", ".generated-ai-rules"), {
    recursive: true,
  });
  writeFileSync(
    join(repo, "AGENTS.md"),
    [
      "# Agent Rules",
      "",
      "Last validated: 2026-05-09",
      "",
      "## Why",
      "Prevent drift between agent instructions.",
      "",
      "alwaysApply: true",
      "",
      "✅ Keep source-of-truth guidance together.",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(
      repo,
      "ai-rules",
      ".generated-ai-rules",
      "ai-rules-generated-agent.md",
    ),
    ["# Generated Projection", "", "Last validated: 2026-05-09", ""].join("\n"),
    "utf8",
  );

  const outputFile = join(repo, "audit.md");
  const args: ParsedArgs = {
    targetPath: repo,
    outputFile,
    artifactsDir: join(repo, "artifacts"),
    skipBootstrap: true,
    jsonOutput: false,
    ciMode: true,
    noAi: true,
    noAiAliasUsed: false,
    aiProvider: null,
    aiModel: null,
    aiTimeoutMs: null,
    forceStageB: false,
  };

  const result = await runAudit(args);
  const report = buildAuditReport(result, {
    reportPath: outputFile,
    targetDisplayPath: args.targetPath,
  });

  expect(report).toContain(
    "The format/helpfulness lane scores the canonical rule surface for clarity signals like rationale, examples, and size.",
  );
  expect(report).toContain(
    "Repos do not need every tool surface: missing AGENTS.md or CLAUDE.md is not automatically a gap if another canonical surface carries the repo's real instructions.",
  );
  expect(report).toContain(
    "starred cells are advisory inventory signals only and do not lower the score",
  );
  expect(report).toContain(
    "*`*` advisory-only on non-scoring rows; these cells are inventory signals and do not lower the score.*",
  );
  expect(report).toContain(
    "| `ai-rules/.generated-ai-rules/ai-rules-generated-agent.md` | ai-rules-generated | generated | — |",
  );
  expect(report).toContain(
    "| `ai-rules/.generated-ai-rules/ai-rules-generated-agent.md` | ai-rules-generated | generated | — | 4* | ❌* | ❌* | ❌* | ✅* |",
  );

  rmSync(repo, { recursive: true, force: true });
});

test("report marks non-tier-relevant pattern docs as not applicable", async () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-pattern-tier-na-"));
  mkdirSync(join(repo, "docs", "patterns"), { recursive: true });
  writeFileSync(
    join(repo, "docs", "patterns", "handoff-packet.md"),
    [
      "# Handoff Packet",
      "",
      "Last validated: 2026-06-20",
      "",
      "## Why",
      "Agents need durable transfer context.",
      "",
      "## Examples",
      "✅ Include the current state, evidence, and next action.",
      "",
    ].join("\n"),
    "utf8",
  );

  const outputFile = join(repo, "audit.md");
  const args: ParsedArgs = {
    targetPath: repo,
    outputFile,
    artifactsDir: join(repo, "artifacts"),
    skipBootstrap: true,
    jsonOutput: false,
    ciMode: true,
    noAi: true,
    noAiAliasUsed: false,
    aiProvider: null,
    aiModel: null,
    aiTimeoutMs: null,
    forceStageB: false,
  };

  const result = await runAudit(args);
  const report = buildAuditReport(result, {
    reportPath: outputFile,
    targetDisplayPath: args.targetPath,
  });

  expect(report).toContain("| Loading Tier Assignment | 1/1 |");
  expect(report).toContain(
    "| `docs/patterns/handoff-packet.md` | anvil-pattern | governance | ✅ | 10 | ✅ | ✅ | n/a | ✅ |",
  );
  expect(report).not.toContain(
    "| `docs/patterns/handoff-packet.md` | anvil-pattern | governance | ✅ | 10 | ✅ | ✅ | ❌ | ✅ |",
  );

  rmSync(repo, { recursive: true, force: true });
});

test("rule quality breakdown labels canonical helpfulness explicitly", async () => {
  const outputRoot = mkdtempSync(
    join(tmpdir(), "anvil-canonical-helpfulness-"),
  );
  const outputFile = join(outputRoot, "docs", "audits", "report.md");
  const args: ParsedArgs = {
    targetPath: FIXTURE,
    outputFile,
    artifactsDir: join(outputRoot, "artifacts"),
    skipBootstrap: true,
    jsonOutput: false,
    ciMode: true,
    noAi: true,
    noAiAliasUsed: false,
    aiProvider: null,
    aiModel: null,
    aiTimeoutMs: null,
    forceStageB: false,
  };

  const result = await runAudit(args);
  const report = buildAuditReport(result, {
    reportPath: outputFile,
    targetDisplayPath: args.targetPath,
  });

  expect(report).toContain(
    "| Canonical Rule Helpfulness (Why/Examples/Size) |",
  );

  rmSync(outputRoot, { recursive: true, force: true });
});

test("score recommendations name canonical scoring files explicitly", () => {
  const repo = mkdtempSync(join(tmpdir(), "anvil-score-wording-"));
  const rulePath = join(repo, "AGENTS.md");
  writeFileSync(
    rulePath,
    "# Agent Rules\n\nLast validated: 2026-05-09\n",
    "utf8",
  );

  const ruleFile = analyzeRuleFile(rulePath, repo, "agents-md", "markdown");
  expect(ruleFile).not.toBeNull();

  const score = scoreAudit(
    ruleFile ? [ruleFile] : [],
    [],
    {
      level: "none",
      detected: [],
    },
    0,
    0,
  );

  expect(score.recommendations).toContain(
    "⚠️ Only one canonical scoring rule file found. Consider splitting the scored source-of-truth surface into multiple focused files.",
  );
  expect(score.recommendations).toContain(
    '⚠️ 1 canonical scoring rule file(s) missing a "Why" section — explain the failure mode each rule prevents.',
  );
  expect(score.recommendations).toContain(
    "⚠️ 1 canonical scoring rule file(s) missing examples (DO/DON'T). Examples dramatically increase rule effectiveness.",
  );

  rmSync(repo, { recursive: true, force: true });
});

test("tool-native-first repos relabel Stage B helpfulness and keep low-yield advisory", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "anvil-tool-native-first-"));
  const outputFile = join(outputRoot, "docs", "audits", "report.md");
  const args: ParsedArgs = {
    targetPath: TOOL_NATIVE_FIXTURE,
    outputFile,
    artifactsDir: join(outputRoot, "artifacts"),
    skipBootstrap: true,
    jsonOutput: false,
    ciMode: true,
    noAi: true,
    noAiAliasUsed: false,
    aiProvider: null,
    aiModel: null,
    aiTimeoutMs: null,
    forceStageB: false,
  };

  const result = await runAudit(args);
  const report = buildAuditReport(result, {
    reportPath: outputFile,
    targetDisplayPath: args.targetPath,
  });
  const lowYieldCheck = result.stageD.checks.find(
    (check) => check.id === "low-yield-rules",
  );

  expect(result.surfacePosture?.posture).toBe("tool-native-first");
  expect(report).toContain("| Agent-Fit / Canonical Clarity |");
  expect(report).toContain(
    "Add rationale/examples to improve cross-tool portability",
  );
  expect(report).not.toContain("Rewrite or retire low-yield scoring rules");
  expect(lowYieldCheck?.status).toBe("warn");
  expect(lowYieldCheck?.detail).toContain("tool-native-first surface");
  expect(result.stageD.status).toBe("pass");

  rmSync(outputRoot, { recursive: true, force: true });
});

test("sample report action path uses concrete operator tasks", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "anvil-audit-action-path-"));
  const outputFile = join(outputRoot, "docs", "audits", "report.md");
  const args: ParsedArgs = {
    targetPath: FIXTURE,
    outputFile,
    artifactsDir: join(outputRoot, "artifacts"),
    skipBootstrap: true,
    jsonOutput: false,
    ciMode: true,
    noAi: true,
    noAiAliasUsed: false,
    aiProvider: null,
    aiModel: null,
    aiTimeoutMs: null,
    forceStageB: false,
  };

  const result = await runAudit(args);
  const report = buildAuditReport(result, {
    reportPath: outputFile,
    targetDisplayPath: args.targetPath,
  });
  const actionPath = report.slice(
    report.indexOf("## Remediation Pack"),
    report.indexOf("### Diagnostic Navigation"),
  );

  rmSync(outputRoot, { recursive: true, force: true });

  expect(actionPath).toContain(
    "Add rules for uncovered critical baseline categories",
  );
  expect(actionPath).toContain(
    "Re-run audit at the repo root to include parent-repo PR signal",
  );
  expect(actionPath).not.toContain("Stage C warn:");
  expect(actionPath).not.toContain("Stage D warn:");
});

test("default audit artifacts dir follows the report output directory", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "anvil-audit-output-"));
  const outputFile = join(outputRoot, "audit-report.md");
  const args: ParsedArgs = {
    targetPath: FIXTURE,
    outputFile,
    artifactsDir: null,
    skipBootstrap: true,
    jsonOutput: false,
    ciMode: true,
    noAi: true,
    noAiAliasUsed: false,
    aiProvider: null,
    aiModel: null,
    aiTimeoutMs: null,
    forceStageB: false,
  };

  const result = await runAudit(args);

  expect(result.artifactsDir).toBe(
    join(outputRoot, "artifacts", `sample-cli-repo-${result.auditDate}`),
  );

  const report = buildAuditReport(result, {
    reportPath: outputFile,
    targetDisplayPath: args.targetPath,
  });
  expect(report).toContain(
    `- Drift report: [\`./artifacts/sample-cli-repo-${result.auditDate}/drift-report.md\`](./artifacts/sample-cli-repo-${result.auditDate}/drift-report.md)`,
  );

  rmSync(outputRoot, { recursive: true, force: true });
});
