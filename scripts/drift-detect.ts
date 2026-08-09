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
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { discoverRuleSurfaceFiles } from "./lib/rule-surface.ts";
import { resolveProjectName } from "./lib/project-name.ts";
import {
  buildResolutionContext,
  pointsIntoSkippedDir,
  resolvesSomewhere,
} from "./lib/path-resolution.ts";

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
// Matches backtick-quoted shell commands: `npm run lint`, `eslint .`, `bun test`, etc.
const COMMAND_PATTERN =
  /`((?:npm|bun|yarn|pnpm|npx|bunx)\s+[\w.-]+(?:\s+[^`]+)?)`/g;
// Matches bare CLI tool references in backticks: `eslint`, `prettier`, `tsc`
const BARE_TOOL_PATTERN = /`([a-z][a-z0-9-]{1,30})`/g;
// Matches template placeholders in documentation: <script>, <package>, <tool>, etc.
const TEMPLATE_PLACEHOLDER = /^<[a-z][a-z0-9-]*>$/;
// Known package managers and runners that prefix script commands
const PACKAGE_MANAGERS = new Set(["npm", "bun", "yarn", "pnpm"]);
const RUNNER_TOOLS = new Set(["npx", "bunx"]);
// Well-known CLI tools that are commonly referenced in rule files
const KNOWN_CLI_TOOLS = new Set([
  "eslint",
  "prettier",
  "tsc",
  "vitest",
  "jest",
  "mocha",
  "ava",
  "webpack",
  "vite",
  "rollup",
  "esbuild",
  "turbo",
  "nx",
  "stylelint",
  "oxlint",
  "oxfmt",
  "biome",
  "babel",
  "swc",
  "postcss",
  "tailwindcss",
  "prisma",
  "drizzle-kit",
  "knex",
  "playwright",
  "cypress",
  "puppeteer",
]);

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
  const projectName = resolveProjectName(projectRoot);
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
    "Usage: anvil drift --target <project-path> [--skip-dirs dir1,dir2,...] [--output <file>]\n" +
      "       anvil drift <project-path> [--skip-dirs dir1,dir2,...] [--output <file>]\n" +
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
  let projectPath: string | null = null;
  let extraSkipDirs: string[] = [];
  let outputFile: string | null = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--target") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) {
        console.error("--target requires a project path");
        process.exit(1);
      }
      projectPath = val;
      i++;
    } else if (arg === "--skip-dirs") {
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
      if (!val || val.startsWith("--")) {
        console.error("--output requires a file path");
        process.exit(1);
      }
      outputFile = val;
      i++;
    } else if (!arg.startsWith("--") && !projectPath) {
      projectPath = arg;
    } else {
      console.error(`Unknown argument: ${arg}`);
      usageAndExit();
    }
  }

  if (!projectPath) {
    usageAndExit();
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
export function isGithubOrgRepoRef(
  reference: string,
  ...localRoots: string[]
): boolean {
  const parts = reference.split("/");
  if (parts.length !== 2) return false;
  const [owner, repo] = parts;
  // If the first segment exists as a local top-level directory, this is a
  // local file path (e.g. "src/config.ts"), not a GitHub org/repo slug.
  if (
    localRoots.length > 0 &&
    localTopLevelSegmentExists(owner, ...localRoots)
  ) {
    return false;
  }
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

/**
 * Absolute roots that belong to a different machine or container than the one running the
 * audit. A rule file legitimately documents these — "the workspace is mounted at
 * /home/node/.openclaw/workspace" is true of the container and unresolvable on the host —
 * so their absence is not drift and no edit to the rule would fix it.
 */
const FOREIGN_RUNTIME_ROOTS = [
  "/home/node/", // OpenClaw agent containers
  "/data/", // Railway persistent volumes
  "/app/", // container app roots
  "/workspace/",
  "/var/",
  "/etc/",
  "/opt/",
  "/tmp/",
];

export function expandTilde(reference: string): string {
  return reference.startsWith("~/")
    ? join(homedir(), reference.slice(2))
    : reference;
}

export function isForeignRuntimePath(reference: string): boolean {
  if (!reference.startsWith("/")) return false;
  // The running user's own home is never foreign, even inside a container
  // whose path appears in FOREIGN_RUNTIME_ROOTS (e.g. /home/node).
  const home = homedir();
  if (reference === home || reference.startsWith(home + "/")) return false;
  if (FOREIGN_RUNTIME_ROOTS.some((root) => reference.startsWith(root)))
    return true;
  // /Users/<someone>/… where <someone> is not the user running the audit.
  const otherUser = reference.match(/^\/Users\/([^/]+)\//);
  return otherUser !== null && !homedir().endsWith(`/${otherUser[1]}`);
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

  if (isForeignRuntimePath(reference)) {
    return `Path reference \`${reference}\` names a container or other-host runtime path; not resolvable here and not treated as drift`;
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

/**
 * Detect glob-pattern references in rule files that match zero files.
 * Phase 1b glob drift: a backtick path containing `*` should resolve to at
 * least one real file.  An empty glob is a stale or broken reference.
 */
export function detectGlobDrift(
  projectRoot: string,
  files: string[],
): DriftIssue[] {
  const issues: DriftIssue[] = [];
  const projectFiles = collectFiles(projectRoot);
  const relativeProjectFiles = projectFiles.map((f) =>
    normalizePath(relative(projectRoot, f) || f),
  );

  for (const filePath of files) {
    if (basename(filePath) === "drift-report.md") {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    const relativeFile = normalizePath(
      relative(projectRoot, filePath) || basename(filePath),
    );

    const seen = new Set<string>();

    for (const btMatch of content.matchAll(BACKTICK_PATH_PATTERN)) {
      const btPath = btMatch[1];
      if (!btPath.includes("*")) {
        continue;
      }

      const btIndex = btMatch.index ?? 0;
      const btLine = findLineNumber(content, btIndex);
      const key = `${btPath}:${btLine}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      // Skip if inside a code fence (documentation example, not a real reference)
      if (isCodeFenceRange(content, btIndex)) {
        continue;
      }

      const regex = globToRegex(btPath);
      if (!regex) {
        continue; // not a recognisable glob — leave to path drift
      }

      const hasMatch = relativeProjectFiles.some((rf) => regex.test(rf));
      if (!hasMatch) {
        issues.push({
          type: "glob",
          file: relativeFile,
          line: btLine,
          detail: `Glob pattern matches no files: \`${btPath}\``,
          severity: "medium",
        });
      }
    }
  }

  return issues;
}

/**
 * Convert a glob pattern (containing `*` and `**`) into a RegExp.
 * Returns null if the pattern doesn't look like a path glob.
 */
function globToRegex(pattern: string): RegExp | null {
  let normalized = normalizePath(pattern.trim());
  if (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }

  // Must contain at least one * to be a glob
  if (!normalized.includes("*")) {
    return null;
  }

  // Escape regex special characters (except * which we handle below)
  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

  // Replace globstar patterns so ** matches zero or more path segments
  // First handle /**/ as a unit: it should match zero or more intermediate dirs
  // Then handle any remaining ** as .*
  // Finally, * matches within a single path segment
  const regexSource = escaped
    .replace(/\*\*\/(?=[^/\n])/g, "__ANVIL_GLOBSTAR_SLASH__")
    .replace(/\*\*/g, ".*")
    .replace(/__ANVIL_GLOBSTAR_SLASH__/g, "(?:.*/)?")
    .replace(/\*/g, "[^/]*");

  try {
    return new RegExp(`^${regexSource}$`);
  } catch {
    return null;
  }
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
  const resolutionContext = buildResolutionContext(projectRoot);

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

      if (
        pointsIntoSkippedDir(btPath) ||
        resolvesSomewhere(btPath, resolutionContext)
      ) {
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
      if (
        isGithubOrgRepoRef(reference, projectRoot, parentRoot, workspaceRoot)
      ) {
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

      // `~/path` is a real reference the reader can follow, but `resolve()` treats `~` as a
      // literal directory name and always misses. Expand it before calling the path missing.
      if (reference.startsWith("~/") && existsSync(expandTilde(reference))) {
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

      if (
        pointsIntoSkippedDir(reference) ||
        resolvesSomewhere(reference, resolutionContext)
      ) {
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

/**
 * Detect command drift: rule files reference CLI commands/scripts that
 * don't exist in the project. Checks:
 * 1. `npm/bun/yarn/pnpm run <script>` or `<pm> <script>` → package.json scripts
 * 2. Bare CLI tool names (eslint, prettier, etc.) → node_modules/.bin or PATH
 */
export function detectCommandDrift(
  projectRoot: string,
  files: string[],
): DriftIssue[] {
  const issues: DriftIssue[] = [];
  const packageJsonPath = join(projectRoot, "package.json");
  let packageScripts: Record<string, string> = {};
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      packageScripts = pkg.scripts ?? {};
    } catch {
      // Malformed package.json — skip script checks
    }
  }
  const binDir = join(projectRoot, "node_modules", ".bin");
  const availableBins = existsSync(binDir)
    ? new Set(readdirSync(binDir).map((f) => f.toString()))
    : new Set<string>();
  const toolCheckCache = new Map<string, boolean>();

  function isToolAvailable(tool: string): boolean {
    if (toolCheckCache.has(tool)) {
      return toolCheckCache.get(tool)!;
    }
    // Check node_modules/.bin first
    if (availableBins.has(tool)) {
      toolCheckCache.set(tool, true);
      return true;
    }
    // Check PATH via which
    try {
      execSync(`which ${tool} 2>/dev/null`, {
        stdio: "ignore",
        timeout: 3000,
      });
      toolCheckCache.set(tool, true);
      return true;
    } catch {
      toolCheckCache.set(tool, false);
      return false;
    }
  }

  for (const filePath of files) {
    if (basename(filePath) === "drift-report.md") {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    const relativeFile = normalizePath(
      relative(projectRoot, filePath) || basename(filePath),
    );
    const seen = new Set<string>();

    // Check package-manager script references
    for (const cmdMatch of content.matchAll(COMMAND_PATTERN)) {
      const fullCmd = cmdMatch[1].trim();
      const cmdIndex = cmdMatch.index ?? 0;
      const cmdLine = findLineNumber(content, cmdIndex);

      // Skip inside code fences (documentation examples)
      if (isCodeFenceRange(content, cmdIndex)) {
        continue;
      }

      const parts = fullCmd.split(/\s+/);
      const pm = parts[0];
      // Extract script name: `npm run lint` → "lint"; `bun test` → "test";
      // `yarn dev` → "dev"; `npx eslint` → handled as bare tool below
      let scriptName: string | null = null;
      let isRunForm = false;

      if (PACKAGE_MANAGERS.has(pm)) {
        if (parts[1] === "run") {
          scriptName = parts[2] ?? null;
          isRunForm = true;
        } else if (RUNNER_TOOLS.has(pm)) {
          // npx/bunx <tool> — check if tool exists
          const tool = parts[1];
          // Skip template placeholders (e.g. <tool>, <script>)
          if (
            tool &&
            !TEMPLATE_PLACEHOLDER.test(tool) &&
            !isToolAvailable(tool)
          ) {
            const key = `runner:${tool}:${cmdLine}`;
            if (seen.has(key)) continue;
            seen.add(key);
            issues.push({
              type: "command",
              file: relativeFile,
              line: cmdLine,
              detail: `Runner command references unavailable tool: \`${fullCmd}\` — \`${tool}\` not found in node_modules/.bin or PATH`,
              severity: "medium",
            });
          }
          continue;
        } else if (parts.length >= 2) {
          // `bun test`, `yarn build`, `pnpm lint` — shorthand without "run"
          scriptName = parts[1];
        }
      }

      if (scriptName && isRunForm && !TEMPLATE_PLACEHOLDER.test(scriptName)) {
        // Only check `pm run <script>` form against package.json (skip placeholders)
        const key = `script:${scriptName}:${cmdLine}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!(scriptName in packageScripts)) {
          issues.push({
            type: "command",
            file: relativeFile,
            line: cmdLine,
            detail: `Command references undefined npm script: \`${fullCmd}\` — \`${scriptName}\` not found in package.json scripts`,
            severity: "medium",
          });
        }
      }
    }

    // Check bare CLI tool references
    for (const toolMatch of content.matchAll(BARE_TOOL_PATTERN)) {
      const tool = toolMatch[1];
      const toolIndex = toolMatch.index ?? 0;
      const toolLine = findLineNumber(content, toolIndex);

      // Skip inside code fences
      if (isCodeFenceRange(content, toolIndex)) {
        continue;
      }

      // Only check known CLI tools to avoid false positives
      if (!KNOWN_CLI_TOOLS.has(tool)) {
        continue;
      }

      const key = `tool:${tool}:${toolLine}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!isToolAvailable(tool)) {
        issues.push({
          type: "command",
          file: relativeFile,
          line: toolLine,
          detail: `Rule references unavailable CLI tool: \`${tool}\` — not found in node_modules/.bin or PATH`,
          severity: "medium",
        });
      }
    }
  }

  return issues;
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
  const projectName = resolveProjectName(projectRoot);
  const today = new Date().toISOString().slice(0, 10);
  const counts = countByType(issues);
  const brokenSymlinkCount = countBrokenSymlinkIssues(issues);

  const issueSection =
    issues.length === 0
      ? "No drift issues detected (path, glob, symlink, and date checks)."
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
    `- Glob drift: ${counts.glob} issues`,
    `- Command drift: ${counts.command} issues`,
    `- Date drift: ${counts.date} issues`,
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
  console.log(`- Glob drift: ${counts.glob}`);
  console.log(`- Command drift: ${counts.command}`);
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

  const discoveredRuleFiles = discoverRuleSurfaceFiles(projectRoot, SKIP_DIRS)
    // A CLAUDE.md symlinked to its AGENTS.md is one file; scanning both counts the same
    // references twice. Saffron's backlog rose 205 -> 230 purely from pairing nine packages
    // that already existed, with no new content anywhere.
    .filter((file) => !file.isSymlinkAlias)
    .map((file) => file.path);
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
  const globIssues = detectGlobDrift(projectRoot, readableRuleFiles);

  const issues = [
    ...brokenSymlinkIssues,
    ...pathResults.issues,
    ...globIssues,
    ...detectCommandDrift(projectRoot, readableRuleFiles),
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
