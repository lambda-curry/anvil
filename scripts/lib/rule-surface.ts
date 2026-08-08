import {
  existsSync,
  lstatSync,
  readlinkSync,
  readdirSync,
  type Dirent,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export type RuleSurfaceLocation = {
  glob: string;
  tool: string;
  format: string;
};

export type RuleSurfaceFile = {
  path: string;
  relativePath: string;
  tool: string;
  format: string;
  /** True when this file is a symlink to another discovered file (CLAUDE.md -> AGENTS.md). */
  isSymlinkAlias?: boolean;
};

export const RULE_SURFACE_LOCATIONS: RuleSurfaceLocation[] = [
  { glob: "CLAUDE.md", tool: "claude-code", format: "markdown" },
  { glob: ".claude/rules/*.md", tool: "claude-code", format: "markdown" },
  { glob: ".claude/rules/*.mdc", tool: "claude-code", format: "mdc" },
  { glob: "AGENTS.md", tool: "agents-md", format: "markdown" },
  { glob: ".cursor/rules/*.md", tool: "cursor", format: "markdown" },
  { glob: ".cursor/rules/*.mdc", tool: "cursor", format: "mdc" },
  {
    glob: ".github/copilot-instructions.md",
    tool: "copilot",
    format: "markdown",
  },
  { glob: "ai-rules/*.md", tool: "ai-rules", format: "markdown" },
  {
    glob: "ai-rules/.generated-ai-rules/*.md",
    tool: "ai-rules-generated",
    format: "markdown",
  },
  { glob: "global_rules.md", tool: "windsurf", format: "markdown" },
  { glob: ".windsurf/rules/*.md", tool: "windsurf", format: "markdown" },
  { glob: ".augment/rules/*.md", tool: "augment", format: "markdown" },
  { glob: ".clinerules/*.md", tool: "cline", format: "markdown" },
  { glob: "TOOLS.md", tool: "openclaw", format: "markdown" },
  { glob: "SKILL.md", tool: "openclaw", format: "markdown" },
  {
    glob: "docs/bootstrap-templates/*.md",
    tool: "anvil-bootstrap-template",
    format: "markdown",
  },
  { glob: "docs/patterns/*.md", tool: "anvil-pattern", format: "markdown" },
];

const RECURSIVE_ROOT_RULE_GLOBS = new Set(["AGENTS.md", "CLAUDE.md"]);
const DEFAULT_ROOT_RULE_DISCOVERY_MAX_DEPTH = 5;
const ROOT_RULE_DISCOVERY_SKIP_DIRS = new Set([
  ".git",
  ".worktrees",
  "node_modules",
  "generated",
  "generated-workspaces",
  "examples",
  "templates",
  "fixtures",
  "__fixtures__",
  "__snapshots__",
  ".codex",
  "coverage",
  "site",
  "public",
  "out",
]);

function normalizeRelativePath(fullPath: string, projectRoot: string): string {
  return relative(projectRoot, fullPath).replaceAll("\\", "/");
}

function isWithinProjectRoot(path: string, projectRoot: string): boolean {
  const normalizedRoot = resolve(projectRoot);
  const normalizedPath = resolve(path);
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}${sep}`)
  );
}

function ruleSurfaceFileIsUsable(
  fullPath: string,
  projectRoot: string,
): boolean {
  try {
    const stats = lstatSync(fullPath);
    if (!stats.isSymbolicLink()) {
      return existsSync(fullPath);
    }

    const linkTarget = readlinkSync(fullPath);
    const resolvedTarget = resolve(dirname(fullPath), linkTarget);

    return (
      existsSync(resolvedTarget) &&
      isWithinProjectRoot(resolvedTarget, projectRoot)
    );
  } catch {
    return false;
  }
}

function discoverRecursiveRootRuleFiles(
  projectRoot: string,
  loc: RuleSurfaceLocation,
  maxDepth = DEFAULT_ROOT_RULE_DISCOVERY_MAX_DEPTH,
): RuleSurfaceFile[] {
  const discovered: RuleSurfaceFile[] = [];
  const queue = [{ dir: projectRoot, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    let entries: Dirent[];
    try {
      entries = readdirSync(current.dir, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current.dir, entry.name);

      if (
        entry.name === loc.glob &&
        ruleSurfaceFileIsUsable(fullPath, projectRoot)
      ) {
        discovered.push({
          path: fullPath,
          relativePath: normalizeRelativePath(fullPath, projectRoot),
          tool: loc.tool,
          format: loc.format,
        });
      }

      if (
        current.depth < maxDepth &&
        entry.isDirectory() &&
        !ROOT_RULE_DISCOVERY_SKIP_DIRS.has(entry.name)
      ) {
        queue.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }
  }

  return discovered;
}

/**
 * @param skipDirs Directory names to exclude anywhere in a file's path. Callers that expose a
 *   `--skip-dirs` flag must pass it here: this function is the only discovery path for the
 *   scanned rule set, so a skip list applied anywhere else silently does nothing.
 */
export function discoverRuleSurfaceFiles(
  projectRoot: string,
  skipDirs?: ReadonlySet<string>,
): RuleSurfaceFile[] {
  const discovered: RuleSurfaceFile[] = [];

  for (const loc of RULE_SURFACE_LOCATIONS) {
    if (loc.glob.includes("*")) {
      const parts = loc.glob.split("*")[0];
      const dir = join(projectRoot, parts.replace(/\/$/, ""));
      if (!existsSync(dir)) continue;

      let entries: string[];
      try {
        entries = readdirSync(dir).sort((a, b) => a.localeCompare(b));
      } catch {
        continue;
      }

      const ext = loc.glob.split("*.")[1];
      for (const entry of entries) {
        if (!entry.endsWith(`.${ext}`)) continue;
        const fullPath = join(dir, entry);
        if (!ruleSurfaceFileIsUsable(fullPath, projectRoot)) continue;
        discovered.push({
          path: fullPath,
          relativePath: normalizeRelativePath(fullPath, projectRoot),
          tool: loc.tool,
          format: loc.format,
        });
      }
    } else if (RECURSIVE_ROOT_RULE_GLOBS.has(loc.glob)) {
      discovered.push(...discoverRecursiveRootRuleFiles(projectRoot, loc));
    } else {
      const fullPath = join(projectRoot, loc.glob);
      if (!ruleSurfaceFileIsUsable(fullPath, projectRoot)) continue;
      discovered.push({
        path: fullPath,
        relativePath: normalizeRelativePath(fullPath, projectRoot),
        tool: loc.tool,
        format: loc.format,
      });
    }
  }

  const scoped = skipDirs?.size
    ? discovered.filter(
        (file) =>
          !file.relativePath
            .split("/")
            .some((segment) => skipDirs.has(segment)),
      )
    : discovered;

  return markSymlinkAliases(scoped);
}

/**
 * Mark a discovered file that is a symlink to another discovered file. `CLAUDE.md -> AGENTS.md`
 * is the cross-tool contract and is physically ONE file, so scanning both counts the same
 * content twice — inflating the file count and every per-file metric derived from it. Saffron's
 * drift backlog rose from 205 to 230 purely by pairing nine packages that already existed.
 *
 * It is marked rather than dropped because consumers need it differently: mirror-family
 * detection must still SEE both names to know the pair exists, while per-file scanning (drift)
 * must skip the alias so one file is not scanned twice.
 */
function markSymlinkAliases(files: RuleSurfaceFile[]): RuleSurfaceFile[] {
  const realPaths = new Set<string>();
  for (const file of files) {
    try {
      if (!lstatSync(file.path).isSymbolicLink()) realPaths.add(file.path);
    } catch {
      // unreadable; treat as a normal file below
    }
  }

  return files.map((file) => {
    try {
      if (!lstatSync(file.path).isSymbolicLink()) return file;
      const target = resolve(dirname(file.path), readlinkSync(file.path));
      return realPaths.has(target) ? { ...file, isSymlinkAlias: true } : file;
    } catch {
      return file;
    }
  });
}
