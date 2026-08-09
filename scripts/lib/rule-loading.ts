/**
 * When is a rule file actually loaded?
 *
 * Context Load Pressure measures always-on instruction volume, but the audit
 * used to count every scoring file as always-on unless `hasGlob` fired. That
 * predicate missed the two most common ways a rule is lazily loaded, so a repo
 * using the recommended path-scoped layout scored as if every byte were resident
 * at session start — `budgets` reported 1098 always-on lines against a true
 * always-on surface of ~209.
 *
 * Three tiers, because the tools differ:
 *
 * - **always-on**   root `AGENTS.md` / `CLAUDE.md`, and tool-native rules with
 *                   no path scoping. Loaded at session start, every session.
 * - **chain-loaded** nested `AGENTS.md` / `CLAUDE.md`. Codex reads the
 *                   git-root→cwd chain, so these load only when the working
 *                   directory is inside that subtree; Claude Code does not read
 *                   them at all.
 * - **path-scoped**  rules carrying `paths:` / `globs:` / `fileMatching:`
 *                   frontmatter, or an explicit glob scope. Loaded on demand
 *                   when a matching file is touched.
 *
 * Only the always-on tier counts toward the pressure metric. The other two are
 * reported alongside it rather than discarded, because the goal is a model of
 * what gets loaded — not a smaller number.
 */

import { isPointerDocument } from "./document-role.ts";

/** Frontmatter keys that scope a rule to a subset of files. */
const SCOPE_KEYS = [
  "paths",
  "globs",
  "glob",
  "filematching",
  "applyto",
  "include",
] as const;

export type LoadTier = "always-on" | "chain-loaded" | "path-scoped";

export type LoadClassifiable = {
  relativePath: string;
  sizeLines: number;
  hasAlwaysApply: boolean;
  hasGlob: boolean;
  content?: string;
};

/** Raw frontmatter block, or null when the file has none. */
export function frontmatter(content: string): string | null {
  if (!content.startsWith("---")) {
    return null;
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) {
    return null;
  }
  return content.slice(3, end);
}

/**
 * Whether the frontmatter scopes this rule to particular files.
 *
 * `alwaysApply: true` wins outright — Cursor treats it as resident regardless
 * of any globs sitting next to it.
 */
export function hasPathScopedFrontmatter(content: string): boolean {
  const block = frontmatter(content);
  if (block === null) {
    return false;
  }
  if (/^\s*alwaysApply:\s*true\s*$/im.test(block)) {
    return false;
  }
  for (const key of SCOPE_KEYS) {
    const keyPattern = new RegExp(`^\\s*${key}\\s*:(.*)$`, "im");
    const match = keyPattern.exec(block);
    if (!match) {
      continue;
    }
    const inline = (match[1] ?? "").trim();
    // `paths:` with a list beneath it, or `globs: apps/**` inline. An empty
    // value with nothing following is not a scope.
    if (inline.length > 0) {
      return true;
    }
    const after = block.slice(match.index + match[0].length);
    if (/^\s*\n\s*-\s*\S/.test(`\n${after}`)) {
      return true;
    }
  }
  return false;
}

const ROOT_INSTRUCTION_FILES = new Set(["AGENTS.md", "CLAUDE.md"]);

function isNestedInstructionFile(relativePath: string): boolean {
  const segments = relativePath.split("/");
  if (segments.length < 2) {
    return false;
  }
  return ROOT_INSTRUCTION_FILES.has(segments[segments.length - 1] as string);
}

export function isRootInstructionFile(relativePath: string): boolean {
  return ROOT_INSTRUCTION_FILES.has(relativePath);
}

/** Which tier a rule file loads in. */
export function classifyLoadTier(file: LoadClassifiable): LoadTier {
  if (file.hasAlwaysApply) {
    return "always-on";
  }
  const content = file.content ?? "";
  if (hasPathScopedFrontmatter(content) || file.hasGlob) {
    return "path-scoped";
  }
  if (isNestedInstructionFile(file.relativePath)) {
    return "chain-loaded";
  }
  return "always-on";
}

export type LoadBreakdown = {
  alwaysOnLines: number;
  chainLoadedLines: number;
  pathScopedLines: number;
  /** Lines removed because a mirror twin carries the same content. */
  mirrorDedupedLines: number;
};

/**
 * Always-on volume is the largest load a *single* tool takes at session start.
 *
 * A generated `AGENTS.md`/`CLAUDE.md` pair holds one document twice: Codex reads
 * the first, Claude Code reads the second, and neither reads both. Summing them
 * double-counts the same instructions — the same defect as the symlinked
 * CLAUDE.md that was counted twice before, arriving by a different route, since
 * a generated twin is a copy rather than a link.
 */
export type TieredFile = {
  relativePath: string;
  sizeLines: number;
  loadTier: LoadTier;
  /**
   * True for a root `CLAUDE.md` whose body is an `@AGENTS.md` import — the
   * sanctioned alternative to a symlink. A shim is *additive*: Claude loads the
   * shim and the file it imports, so its lines add to the session rather than
   * replacing the twin's.
   */
  importsRootMirror?: boolean;
};

/**
 * Whether a file's body imports its mirror source rather than copying it.
 *
 * Same question as {@link isPointerDocument}; kept as a named re-export so the
 * loading model reads in its own vocabulary.
 */
export const importsRootMirror = isPointerDocument;

export function summarizeLoad(files: TieredFile[]): LoadBreakdown {
  let alwaysOn = 0;
  let chainLoaded = 0;
  let pathScoped = 0;

  const rootTwins: number[] = [];

  for (const file of files) {
    const tier = file.loadTier;
    if (tier === "chain-loaded") {
      chainLoaded += file.sizeLines;
      continue;
    }
    if (tier === "path-scoped") {
      pathScoped += file.sizeLines;
      continue;
    }
    if (isRootInstructionFile(file.relativePath)) {
      if (file.importsRootMirror) {
        // Additive, not an alternative: the shim plus what it pulls in.
        alwaysOn += file.sizeLines;
      } else {
        rootTwins.push(file.sizeLines);
      }
      continue;
    }
    alwaysOn += file.sizeLines;
  }

  // Only the heavier twin counts; a lone root file is unaffected.
  const twinTotal = rootTwins.reduce((sum, lines) => sum + lines, 0);
  const heaviestTwin = rootTwins.length > 0 ? Math.max(...rootTwins) : 0;

  return {
    alwaysOnLines: alwaysOn + heaviestTwin,
    chainLoadedLines: chainLoaded,
    pathScopedLines: pathScoped,
    mirrorDedupedLines: twinTotal - heaviestTwin,
  };
}
