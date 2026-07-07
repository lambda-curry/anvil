#!/usr/bin/env bun

/**
 * Drift Detection Script — Phase 1b
 * False positive improvements:
 * - Operational file exclusions for date drift checks
 * - Workspace-root fallback for path references
 * - Tighter path extraction regex
 */
import {
  type Dirent,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { discoverRuleSurfaceFiles } from "./lib/rule-surface.ts";

export interface DriftIssue {
  type: "path" | "glob" | "command" | "date" | "coverage-gap";
  file: string;
  line?: number;
  detail: string;
  severity: "high" | "medium" | "low";
}

export interface DriftNote {
  file: string;
  line?: number;
  detail: string;
}

const DATE_DRIFT_SKIP_BASENAMES = new Set([
  "SCRATCHPAD.md",
  "CHANGELOG.md",
  "HEARTBEAT.md",
  "MEMORY.md",
  "USER.md",
  "SOUL.md",
  "IDENTITY.md",
  "PLDP.md",
]);
const DATE_PATTERN =
  /Last validated:\s*(?:\*\*|__)?\s*`?(\d{4}-\d{2}-\d{2})`?/i;
// Matches paths NOT inside backticks (word-boundary anchored, no leading dot)
const PATH_PATTERN =
  /\b(?:[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\.[a-zA-Z0-9]{1,6}|[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+){2,})\b/g;
// Matches paths inside backtick spans — preserves leading dots (.project/, .cursor/) and scoped imports (@pkg/name)
const BACKTICK_PATH_PATTERN =
  /`([@.~/]?[a-zA-Z0-9._/-]+(?:\/[@a-zA-Z0-9._*-]+)+)`/g;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const DOMAIN_LIKE_HOST_PATTERN =
  /^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,24}$/i;
const PACKAGE_SEGMENT_PATTERN = /^@?[a-z0-9][a-z0-9._-]*$/i;
const PLACEHOLDER_SEGMENT_PATTERN = /^(?:YYYY(?:-MM(?:-DD)?)?|MM|DD)$/;
const DEFAULT_SKIP_DIRS = new Set([
  ".git",
  ".worktrees",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".cache",
  "generated",
  "generated-workspaces",
  "examples",
  "templates",
  "fixtures",
  "__fixtures__",
  "__snapshots__",
  ".codex",
  "coverage",
  "docs-site",
  "site",
  "public",
  "out",
]);
const ANVIL_IGNORE_FILE = ".anvilignore";

// Runtime skip dirs — populated by parseArgs(), merges with DEFAULT_SKIP_DIRS
let SKIP_DIRS = DEFAULT_SKIP_DIRS;

function defaultReportOutputPath(projectRoot: string): string {
  const date = new Date().toISOString().split("T")[0];
  const projectName = basename(projectRoot);
  return join(
    process.cwd(),
    "docs",
    "audits",
    "artifacts",
    `${projectName}-${date}`,
    "drift-report.md",
  );
}

export function usageAndExit(): never {
  console.error(
    "Usage: bun run scripts/drift-detect.ts <project-path> [--skip-dirs dir1,dir2,...] [--output <file>]\n" +
      "Default output: docs/audits/artifacts/<project>-<date>/drift-report.md",
  );
  process.exit(1);
}

export type ParsedArgs = {
  projectPath: string;
  extraSkipDirs: string[];
  outputFile: string | null;
};

export type IgnoreMatcher = {
  raw: string;
  regex: RegExp;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const projectPath = argv[2];
  let extraSkipDirs: string[] = [];
  let outputFile: string | null = null;

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--skip-dirs") {
      const val = argv[i + 1];
      if (!val) {
        console.error(
          "--skip-dirs requires a comma-separated list of directory names",
        );
        process.exit(1);
      }
      extraSkipDirs = val
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      i++;
    } else if (arg === "--output") {
      const val = argv[i + 1];
      if (!val) {
        console.error("--output requires a file path");
        process.exit(1);
      }
      outputFile = val;
      i++;
    } else {
      console.error(`Unknown argument: ${arg}`);
      usageAndExit();
    }
  }

  return { projectPath, extraSkipDirs, outputFile };
}

export function collectFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      files.push(fullPath);
    }
  }

  return files;
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\\\", "/");
}

export function loadAnvilIgnore(projectRoot: string): IgnoreMatcher[] {
  const ignorePath = join(projectRoot, ANVIL_IGNORE_FILE);
  if (!existsSync(ignorePath)) {
    return [];
  }

  const content = readFileSync(ignorePath, "utf8");
  const patterns = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return patterns.map((pattern) => ({
    raw: pattern,
    regex: compileIgnorePattern(pattern),
  }));
}

export function compileIgnorePattern(pattern: string): RegExp {
  let normalized = normalizePath(pattern.trim());
  if (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  if (normalized.endsWith("/")) {
    normalized += "**";
  }

  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const withGlobstarPlaceholder = escaped.replaceAll(
    "**",
    "__ANVIL_GLOBSTAR__",
  );
  const withSingleStarPlaceholder = withGlobstarPlaceholder.replaceAll(
    "*",
    "__ANVIL_STAR__",
  );
  const regexSource = withSingleStarPlaceholder
    .replaceAll("__ANVIL_GLOBSTAR__", ".*")
    .replaceAll("__ANVIL_STAR__", "[^/]*");

  return new RegExp(`^${regexSource}$`);
}

export function isIgnored(
  filePath: string,
  projectRoot: string,
  ignoreMatchers: IgnoreMatcher[],
): boolean {
  if (ignoreMatchers.length === 0) {
    return false;
  }

  const relativeFile = normalizePath(
    relative(projectRoot, filePath) || basename(filePath),
  );
  return ignoreMatchers.some((matcher) => matcher.regex.test(relativeFile));
}

export function scanBrokenSymlinks(
  projectRoot: string,
  files: string[],
): { issues: DriftIssue[]; brokenFiles: Set<string> } {
  const issues: DriftIssue[] = [];
  const brokenFiles = new Set<string>();

  for (const filePath of files) {
    let isSymlink = false;
    try {
      isSymlink = lstatSync(filePath).isSymbolicLink();
    } catch {
      continue;
    }
    if (!isSymlink) {
      continue;
    }
    if (existsSync(filePath)) {
      continue;
    }

    brokenFiles.add(filePath);
    const relativeFile = normalizePath(
      relative(projectRoot, filePath) || basename(filePath),
    );

    let targetText = "(unknown target)";
    let resolvedTargetText = "";
    try {
      const linkTarget = readlinkSync(filePath);
      targetText = normalizePath(linkTarget);
      const resolvedTarget = resolve(dirname(filePath), linkTarget);
      resolvedTargetText = normalizePath(resolvedTarget);
    } catch {
      // Keep fallback target text if readlink cannot resolve.
    }

    issues.push({
      type: "path",
      file: relativeFile,
      detail: `Broken symlink target missing: \`${targetText}\`${resolvedTargetText ? ` (resolved: \`${resolvedTargetText}\`)` : ""}`,
      severity: "medium",
    });
  }

  return { issues, brokenFiles };
}

/**
 * Returns true if the reference looks like a GitHub org/repo slug (e.g. "lambda-curry/anvil", "block/ai-rules").
 * These are exactly two-segment path-like strings where neither segment has a file extension.
 */
function isGithubOrgRepoRef(reference: string): boolean {
  const parts = reference.split("/");
  if (parts.length !== 2) return false;
  const [owner, repo] = parts;
  return /^[a-zA-Z0-9_.-]+$/.test(owner) && /^[a-zA-Z0-9_.-]+$/.test(repo);
}

function hasFileLikeExtension(segment: string): boolean {
  return /\.[a-zA-Z0-9]{1,6}$/.test(segment);
}

function localTopLevelSegmentExists(
  segment: string,
  ...roots: string[]
): boolean {
  const normalized = segment.replace(/^[@/]+/, "");
  if (!normalized) {
    return false;
  }

  return roots.some((root) => existsSync(join(root, normalized)));
}

function firstPathSegment(reference: string): string | null {
  const normalized = normalizePath(reference).replace(/^\/+/, "");
  const [first] = normalized.split("/").filter(Boolean);
  return first ?? null;
}

function isPlaceholderReference(reference: string): boolean {
  if (reference.includes("...")) {
    return true;
  }

  return reference
    .split("/")
    .filter(Boolean)
    .some((segment) => {
      const stem = segment.replace(/\.[^.]+$/, "");
      return PLACEHOLDER_SEGMENT_PATTERN.test(stem);
    });
}

function isCrossProjectDocSurface(relativeFile: string): boolean {
  return (
    relativeFile.startsWith("docs/patterns/") ||
    relativeFile.startsWith("docs/bootstrap-templates/")
  );
}

export function classifyReference(
  reference: string,
  projectRoot: string,
  parentRoot: string,
  workspaceRoot: string,
): "url-like" | "package-import" | null {
  if (URL_SCHEME_PATTERN.test(reference)) {
    return "url-like";
  }

  const segments = reference.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const [first] = segments;
  const last = segments.at(-1) ?? "";

  if (DOMAIN_LIKE_HOST_PATTERN.test(first)) {
    return "url-like";
  }

  if (segments.length > 4 || hasFileLikeExtension(last)) {
    return null;
  }

  if (!segments.every((segment) => PACKAGE_SEGMENT_PATTERN.test(segment))) {
    return null;
  }

  if (
    localTopLevelSegmentExists(first, projectRoot, parentRoot, workspaceRoot)
  ) {
    return null;
  }

  return "package-import";
}

function noteForReferenceKind(
  reference: string,
  kind: "url-like" | "package-import",
): string {
  if (kind === "url-like") {
    return `URL-like reference \`${reference}\` looks external; not treated as local path drift`;
  }
  return `Import-like reference \`${reference}\` looks external; not treated as local path drift`;
}

function noteForExampleReference(reference: string, reason: string): string {
  return `Example/template reference \`${reference}\` ${reason}; not treated as local path drift`;
}

function isInlineBacktickRange(content: string, index: number): boolean {
  const backtickPattern = /`[^`\n]+`/g;
  let m: RegExpExecArray | null;
  while ((m = backtickPattern.exec(content)) !== null) {
    if (m.index <= index && index < m.index + m[0].length) {
      return true;
    }
    if (m.index > index) break;
  }
  return false;
}

/**
 * Returns true if the character at `index` in `content` falls inside a fenced code block (``` ... ```).
 * Used to skip PATH_PATTERN matches that are documentation examples, not real file paths.
 */
function isCodeFenceRange(content: string, index: number): boolean {
  const fencePattern = /```[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard while-match pattern
  while ((m = fencePattern.exec(content)) !== null) {
    if (m.index <= index && index < m.index + m[0].length) {
      return true;
    }
    if (m.index > index) break;
  }
  return false;
}

export function findLineNumber(content: string, index: number): number {
  if (index <= 0) {
    return 1;
  }
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function isInExamplesSection(content: string, index: number): boolean {
  const lines = content.split("\n");
  let cursor = 0;
  let currentH2 = "";

  for (const line of lines) {
    const lineStart = cursor;
    const lineEnd = cursor + line.length;
    const heading = /^##\s+(.+)$/.exec(line.trim());
    if (heading) {
      currentH2 = heading[1].trim().toLowerCase();
    }

    if (lineStart <= index && index <= lineEnd) {
      return currentH2 === "examples";
    }

    cursor = lineEnd + 1;
  }

  return currentH2 === "examples";
}

function classifyMissingReferenceContext(
  reference: string,
  relativeFile: string,
  content: string,
  index: number,
  projectRoot: string,
  parentRoot: string,
  workspaceRoot: string,
): string | null {
  if (isPlaceholderReference(reference)) {
    return noteForExampleReference(reference, "uses placeholder segments");
  }

  if (!isCrossProjectDocSurface(relativeFile)) {
    return null;
  }

  if (isInExamplesSection(content, index)) {
    return noteForExampleReference(
      reference,
      "appears inside an Examples section",
    );
  }

  const first = firstPathSegment(reference);
  if (
    first &&
    !localTopLevelSegmentExists(first, projectRoot, parentRoot, workspaceRoot)
  ) {
    return noteForExampleReference(
      reference,
      "targets a cross-project path surface",
    );
  }

  return null;
}

export function detectPathDrift(
  projectRoot: string,
  files: string[],
): { issues: DriftIssue[]; notes: DriftNote[] } {
  const issues: DriftIssue[] = [];
  const notes: DriftNote[] = [];
  const parentRoot = resolve(projectRoot, "..");
  const workspaceRoot =
    basename(parentRoot) === "projects"
      ? resolve(parentRoot, "..")
      : parentRoot;

  for (const filePath of files) {
    if (basename(filePath) === "drift-report.md") {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    const seen = new Set<string>();
    const relativeFile = normalizePath(
      relative(projectRoot, filePath) || basename(filePath),
    );

    // Build a set of backtick-quoted path spans so PATH_PATTERN matches inside them can be skipped.
    // BACKTICK_PATH_PATTERN extracts the full path (including leading dot), so we process them separately.
    const backtickPaths = new Map<string, { line: number; index: number }>();
    for (const btMatch of content.matchAll(BACKTICK_PATH_PATTERN)) {
      const btPath = btMatch[1];
      const btIndex = btMatch.index ?? 0;
      const btLine = findLineNumber(content, btIndex);
      // Only record the first occurrence per path
      if (!backtickPaths.has(btPath)) {
        backtickPaths.set(btPath, { line: btLine, index: btIndex });
      }
    }

    // Paths to skip when iterating PATH_PATTERN (because they're also in backtickPaths, already handled)
    const backtickPathSet = new Set(backtickPaths.keys());

    // Process backtick paths first (they have the correct leading dots)
    for (const [btPath, location] of backtickPaths) {
      const { line: btLine, index: btIndex } = location;
      // Skip globs, relative paths
      if (
        btPath.includes("*") ||
        btPath.startsWith("./") ||
        btPath.startsWith("../")
      ) {
        continue;
      }
      const key = `${btPath}:${btLine}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const referenceKind = classifyReference(
        btPath,
        projectRoot,
        parentRoot,
        workspaceRoot,
      );
      if (referenceKind) {
        notes.push({
          file: relativeFile,
          line: btLine,
          detail: noteForReferenceKind(btPath, referenceKind),
        });
        continue;
      }

      const resolved = resolve(projectRoot, btPath);
      if (existsSync(resolved)) {
        continue;
      }
      const parentResolved = resolve(parentRoot, btPath);
      if (existsSync(parentResolved)) {
        notes.push({
          file: relativeFile,
          line: btLine,
          detail: `Path reference \`${btPath}\` resolves at workspace root; not treated as drift`,
        });
        continue;
      }
      const workspaceResolved = resolve(workspaceRoot, btPath);
      if (workspaceRoot !== parentRoot && existsSync(workspaceResolved)) {
        notes.push({
          file: relativeFile,
          line: btLine,
          detail: `Path reference \`${btPath}\` resolves at workspace root; not treated as drift`,
        });
        continue;
      }

      const contextNote = classifyMissingReferenceContext(
        btPath,
        relativeFile,
        content,
        btIndex,
        projectRoot,
        parentRoot,
        workspaceRoot,
      );
      if (contextNote) {
        notes.push({
          file: relativeFile,
          line: btLine,
          detail: contextNote,
        });
        continue;
      }

      issues.push({
        type: "path",
        file: relativeFile,
        line: btLine,
        detail: `Path reference not found: \`${btPath}\` (checked: \`${normalizePath(relative(projectRoot, resolved) || resolved)}\`)`,
        severity: "high",
      });
    }

    for (const match of content.matchAll(PATH_PATTERN)) {
      const reference = match[0];
      const start = match.index ?? 0;
      const line = findLineNumber(content, start);

      // Skip paths already handled by backtick extraction or still inside inline code.
      if (
        isInlineBacktickRange(content, start) ||
        backtickPathSet.has(reference) ||
        backtickPathSet.has(`.${reference}`) ||
        backtickPathSet.has(`~/${reference}`) ||
        backtickPathSet.has(`/${reference}`) ||
        backtickPathSet.has(`@${reference}`)
      ) {
        continue;
      }

      if (reference.startsWith("./") || reference.startsWith("../")) {
        continue;
      }

      const key = `${reference}:${line}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      // Skip GitHub org/repo references (e.g. "lambda-curry/anvil", "block/ai-rules")
      if (isGithubOrgRepoRef(reference)) {
        continue;
      }
      const referenceKind = classifyReference(
        reference,
        projectRoot,
        parentRoot,
        workspaceRoot,
      );
      if (referenceKind) {
        notes.push({
          file: relativeFile,
          line,
          detail: noteForReferenceKind(reference, referenceKind),
        });
        continue;
      }
      // Skip paths inside fenced code blocks (documentation examples, not real paths)
      if (isCodeFenceRange(content, start)) {
        continue;
      }

      const resolved = resolve(projectRoot, reference);
      if (existsSync(resolved)) {
        continue;
      }

      const parentResolved = resolve(parentRoot, reference);
      if (existsSync(parentResolved)) {
        notes.push({
          file: relativeFile,
          line,
          detail: `Path reference \`${reference}\` resolves at workspace root; not treated as drift`,
        });
        continue;
      }

      const workspaceResolved = resolve(workspaceRoot, reference);
      if (workspaceRoot !== parentRoot && existsSync(workspaceResolved)) {
        notes.push({
          file: relativeFile,
          line,
          detail: `Path reference \`${reference}\` resolves at workspace root; not treated as drift`,
        });
        continue;
      }

      const contextNote = classifyMissingReferenceContext(
        reference,
        relativeFile,
        content,
        start,
        projectRoot,
        parentRoot,
        workspaceRoot,
      );
      if (contextNote) {
        notes.push({
          file: relativeFile,
          line,
          detail: contextNote,
        });
        continue;
      }

      issues.push({
        type: "path",
        file: relativeFile,
        line,
        detail: `Path reference not found: \`${reference}\` (checked: \`${normalizePath(relative(projectRoot, resolved) || resolved)}\`)`,
        severity: "high",
      });
    }
  }

  return { issues, notes };
}

export function daysSince(dateText: string): number | null {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function dateCadenceForFile(filePath: string): {
  thresholdDays: number;
  cadenceLabel: string;
  alwaysApply: boolean;
} {
  const base = basename(filePath);
  if (base === "AGENTS.md" || base === "TOOLS.md") {
    return {
      thresholdDays: 30,
      cadenceLabel: "alwaysApply",
      alwaysApply: true,
    };
  }
  return { thresholdDays: 90, cadenceLabel: "pattern/doc", alwaysApply: false };
}

export function shouldSkipDateDrift(filePath: string): boolean {
  const base = basename(filePath);
  if (DATE_DRIFT_SKIP_BASENAMES.has(base)) {
    return true;
  }
  if (/-log\.md$/i.test(base)) {
    return true;
  }
  if (/-report.*\.md$/i.test(base)) {
    return true;
  }
  return false;
}

export function detectDateDrift(
  projectRoot: string,
  markdownFiles: string[],
): DriftIssue[] {
  const issues: DriftIssue[] = [];

  for (const filePath of markdownFiles) {
    if (basename(filePath) === "drift-report.md") {
      continue;
    }
    if (shouldSkipDateDrift(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    const relativeFile = normalizePath(
      relative(projectRoot, filePath) || basename(filePath),
    );
    const cadence = dateCadenceForFile(filePath);
    const match = DATE_PATTERN.exec(content);

    if (!match) {
      issues.push({
        type: "date",
        file: relativeFile,
        detail: `No validation date found. Expected pattern: \`Last validated: YYYY-MM-DD\` (cadence: ${cadence.cadenceLabel}, threshold: ${cadence.thresholdDays} days)`,
        severity: cadence.alwaysApply ? "high" : "medium",
      });
      continue;
    }

    const validatedDate = match[1];
    const ageDays = daysSince(validatedDate);
    if (ageDays === null) {
      issues.push({
        type: "date",
        file: relativeFile,
        detail: `Invalid validation date format: \`${validatedDate}\``,
        severity: cadence.alwaysApply ? "high" : "medium",
      });
      continue;
    }

    if (ageDays > cadence.thresholdDays) {
      issues.push({
        type: "date",
        file: relativeFile,
        detail: `Validation date stale: ${validatedDate} (${ageDays} days old) exceeds ${cadence.cadenceLabel} threshold (${cadence.thresholdDays} days)`,
        severity: cadence.alwaysApply ? "high" : "medium",
      });
    }
  }

  return issues;
}

export function countByType(
  issues: DriftIssue[],
): Record<DriftIssue["type"], number> {
  return {
    path: issues.filter((i) => i.type === "path").length,
    glob: issues.filter((i) => i.type === "glob").length,
    command: issues.filter((i) => i.type === "command").length,
    date: issues.filter((i) => i.type === "date").length,
    "coverage-gap": issues.filter((i) => i.type === "coverage-gap").length,
  };
}

export function countBrokenSymlinkIssues(issues: DriftIssue[]): number {
  return issues.filter(
    (issue) =>
      issue.type === "path" &&
      issue.detail.startsWith("Broken symlink target missing:"),
  ).length;
}

export function severitySymbol(severity: DriftIssue["severity"]): string {
  if (severity === "high") {
    return "🔴";
  }
  if (severity === "medium") {
    return "🟡";
  }
  return "🟢";
}

export function titleForType(type: DriftIssue["type"]): string {
  switch (type) {
    case "path":
      return "Path Drift";
    case "glob":
      return "Glob Drift";
    case "command":
      return "Command Drift";
    case "date":
      return "Date Drift";
    case "coverage-gap":
      return "Coverage Gap";
    default:
      return type;
  }
}

export function formatIssue(issue: DriftIssue): string {
  const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
  return [
    `### ${severitySymbol(issue.severity)} ${capitalize(issue.severity)} — ${titleForType(issue.type)}`,
    `**File:** ${location}`,
    `**Detail:** ${issue.detail}`,
  ].join("\n");
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function buildReport(
  projectRoot: string,
  issues: DriftIssue[],
  notes: DriftNote[],
  ignoreMatchers: IgnoreMatcher[] = [],
  scopeCount?: number,
): string {
  const projectName = basename(projectRoot);
  const today = new Date().toISOString().slice(0, 10);
  const counts = countByType(issues);
  const brokenSymlinkCount = countBrokenSymlinkIssues(issues);

  const issueSection =
    issues.length === 0
      ? "No drift issues detected for Phase 1b checks (path + date)."
      : issues.map((issue) => formatIssue(issue)).join("\n\n");
  const notesSection =
    notes.length === 0
      ? "No non-drift reference notes."
      : notes
          .map((note) => {
            const location = note.line
              ? `${note.file}:${note.line}`
              : note.file;
            return `- ${location} — ${note.detail}`;
          })
          .join("\n");

  const skipDirList = [...SKIP_DIRS].join(", ");
  const ignorePatternList = ignoreMatchers
    .map((matcher) => matcher.raw)
    .join(", ");

  return [
    `# Drift Detection Report — ${projectName} — ${today}`,
    "",
    "## Summary",
    ...(typeof scopeCount === "number"
      ? [`- Scope: discovered rule files only (${scopeCount} files)`]
      : []),
    `- Path drift: ${counts.path} issues`,
    `- Missing symlink targets: ${brokenSymlinkCount} issues`,
    "- Glob drift: 0 issues (not implemented in Phase 1b)",
    "- Command drift: 0 issues (not implemented in Phase 1b)",
    `- Date drift: ${counts.date} issues`,
    "- Coverage gap: 0 issues (not implemented in Phase 2)",
    `- **Skip dirs:** ${skipDirList}`,
    ...(ignoreMatchers.length > 0
      ? [`- **Anvil ignore patterns:** ${ignorePatternList}`]
      : []),
    "",
    "## Issues",
    "",
    issueSection,
    "",
    "## Notes (Non-Drift References)",
    "",
    notesSection,
    "",
  ].join("\n");
}

export function printConsoleSummary(
  projectRoot: string,
  issues: DriftIssue[],
  notes: DriftNote[],
  outputPath: string,
): void {
  const counts = countByType(issues);
  const brokenSymlinkCount = countBrokenSymlinkIssues(issues);
  console.log(`Drift detection complete for ${projectRoot}`);
  console.log(`- Path drift: ${counts.path}`);
  console.log(`- Missing symlink targets: ${brokenSymlinkCount}`);
  console.log(`- Date drift: ${counts.date}`);
  console.log(`- Non-drift path notes: ${notes.length}`);
  console.log("- Glob drift: 0 (Phase 1b)");
  console.log("- Command drift: 0 (Phase 1b)");
  console.log("- Coverage gap: 0 (Phase 2)");
  console.log(`Report written to: ${outputPath}`);
}

export function main(): void {
  const rawArgs = process.argv;
  if (!rawArgs[2]) {
    usageAndExit();
  }

  const args = parseArgs(rawArgs);
  if (!args.projectPath) {
    usageAndExit();
  }

  // Merge extra skip dirs with defaults
  if (args.extraSkipDirs.length > 0) {
    SKIP_DIRS = new Set([...DEFAULT_SKIP_DIRS, ...args.extraSkipDirs]);
    console.log(`Skip dirs: ${[...SKIP_DIRS].join(", ")}`);
  }

  const projectRoot = resolve(args.projectPath);
  if (!existsSync(projectRoot)) {
    console.error(`Project path not found: ${projectRoot}`);
    process.exit(1);
  }

  const stats = statSync(projectRoot);
  if (!stats.isDirectory()) {
    console.error(`Project path is not a directory: ${projectRoot}`);
    process.exit(1);
  }

  const ignoreMatchers = loadAnvilIgnore(projectRoot);
  if (ignoreMatchers.length > 0) {
    console.log(
      `Anvil ignore: ${ignoreMatchers.map((matcher) => matcher.raw).join(", ")}`,
    );
  }

  const discoveredRuleFiles = discoverRuleSurfaceFiles(projectRoot).map(
    (file) => file.path,
  );
  const includedRuleFiles = discoveredRuleFiles.filter(
    (filePath) => !isIgnored(filePath, projectRoot, ignoreMatchers),
  );
  const { issues: brokenSymlinkIssues, brokenFiles } = scanBrokenSymlinks(
    projectRoot,
    includedRuleFiles,
  );
  const readableRuleFiles = includedRuleFiles.filter(
    (filePath) => !brokenFiles.has(filePath),
  );
  const pathResults = detectPathDrift(projectRoot, readableRuleFiles);

  const issues = [
    ...brokenSymlinkIssues,
    ...pathResults.issues,
    ...detectDateDrift(projectRoot, readableRuleFiles),
  ];

  issues.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 } as const;
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type);
    }
    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }
    return (a.line ?? 0) - (b.line ?? 0);
  });

  const outputPath = args.outputFile ?? defaultReportOutputPath(projectRoot);
  mkdirSync(dirname(outputPath), { recursive: true });
  const report = buildReport(
    projectRoot,
    issues,
    pathResults.notes,
    ignoreMatchers,
    includedRuleFiles.length,
  );
  writeFileSync(outputPath, report, "utf8");
  printConsoleSummary(projectRoot, issues, pathResults.notes, outputPath);
}

if (import.meta.main) {
  main();
}
