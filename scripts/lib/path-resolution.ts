/**
 * Where a cited path is allowed to resolve.
 *
 * Drift used to resolve every reference from the repo root, plus two fixed
 * ancestors. Measured across 35 repos that produced a ~60% false-positive floor,
 * because instruction files legitimately cite paths in four other frames:
 *
 * - relative to a workspace package (`app/routes/__root.tsx` under `apps/web/`)
 * - relative to an ancestor repo (`packages/vision/src/x.ts` cited from inside
 *   `packages/vision`, where the frame is the saffron root)
 * - as a package specifier, not a path at all (`@watchtower/ui`)
 * - through a tsconfig alias (`~/components/...` meaning `./app/components/...`)
 *
 * None of those are drift. This module collects the frames a reference may
 * legitimately resolve in, so only references that resolve *nowhere* are
 * reported.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export type ResolutionContext = {
  /** Directories a relative reference may resolve against. */
  roots: string[];
  /** Declared workspace package names — specifiers, not paths. */
  packageNames: Set<string>;
  /** tsconfig `paths` prefixes, e.g. `~/` -> [`<root>/app/`]. */
  aliases: Array<{ prefix: string; targets: string[] }>;
  /** Every tracked path, for the unique-suffix fallback. */
  trackedFiles: string[];
};

/**
 * A reference that names the tail of exactly one tracked file.
 *
 * `steps/create-order-note-step.ts` lives at
 * `apps/medusa/src/workflows/order-note/steps/create-order-note-step.ts` — far
 * below any workspace package root, so no frame resolves it, yet the file
 * plainly exists.
 *
 * The match must be UNIQUE. 360training alone has 221 two-segment suffixes
 * shared by more than one file, so an ambiguous tail is not evidence that this
 * particular reference is right — and silencing a real defect because some
 * unrelated file happens to end the same way is the direction `ancestorRoots`
 * already failed in once.
 */
export function matchesExactlyOneTrackedFile(
  reference: string,
  trackedFiles: readonly string[],
): boolean {
  if (reference.startsWith("/") || !reference.includes("/")) {
    return false;
  }
  const tail = `/${reference}`;
  let hits = 0;
  for (const file of trackedFiles) {
    if (file === reference || file.endsWith(tail)) {
      hits++;
      if (hits > 1) {
        return false;
      }
    }
  }
  return hits === 1;
}

/** Directories drift never scans, so a reference into one cannot resolve. */
export const UNRESOLVABLE_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
] as const;

export function pointsIntoSkippedDir(reference: string): boolean {
  return UNRESOLVABLE_DIRS.some(
    (dir) => reference === dir || reference.startsWith(`${dir}/`),
  );
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    // tsconfig files carry comments; strip the simple cases before parsing.
    const raw = readFileSync(path, "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Workspace globs from package.json `workspaces` or pnpm-workspace.yaml. */
function workspaceGlobs(repoRoot: string): string[] {
  const globs: string[] = [];
  const pkg = readJson(join(repoRoot, "package.json"));
  const declared = pkg?.workspaces;
  if (Array.isArray(declared)) {
    globs.push(...declared.filter((g): g is string => typeof g === "string"));
  } else if (
    declared &&
    typeof declared === "object" &&
    Array.isArray((declared as { packages?: unknown }).packages)
  ) {
    globs.push(
      ...(declared as { packages: unknown[] }).packages.filter(
        (g): g is string => typeof g === "string",
      ),
    );
  }
  try {
    const yaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
    for (const line of yaml.split("\n")) {
      const match = /^\s*-\s*["']?([^"'\n]+)["']?\s*$/.exec(line);
      if (match?.[1]) {
        globs.push(match[1].trim());
      }
    }
  } catch {
    // no pnpm workspace file
  }
  // Common layouts, even when undeclared — a monorepo without a workspaces key
  // still cites paths relative to its apps.
  globs.push("apps/*", "packages/*", "services/*");
  return globs;
}

/** Expand a one-level `dir/*` glob; other shapes are used literally. */
function expandGlob(repoRoot: string, glob: string): string[] {
  const cleaned = glob.replace(/\/\*\*$/, "/*").replace(/\/$/, "");
  if (!cleaned.endsWith("/*")) {
    const literal = join(repoRoot, cleaned);
    return existsSync(literal) ? [literal] : [];
  }
  const base = join(repoRoot, cleaned.slice(0, -2));
  if (!existsSync(base)) {
    return [];
  }
  try {
    return readdirSync(base)
      .map((entry) => join(base, entry))
      .filter((full) => {
        try {
          return statSync(full).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * Ancestor directories that look like a repo or workspace root.
 *
 * `packages/vision/AGENTS.md` cites `packages/vision/src/x.ts` — correct for a
 * reader at the saffron root. Walking up to the outermost ancestor holding a
 * package.json or .git covers that without hard-coding directory names, which
 * the previous "is the parent called projects?" rule did.
 */
function ancestorRoots(repoRoot: string): string[] {
  const roots: string[] = [];
  let current = dirname(repoRoot);
  for (let depth = 0; depth < 4; depth++) {
    if (!current || current === "/" || basename(current) === "") {
      break;
    }
    // Only real roots. Accepting every parent would let a genuinely missing
    // path resolve against an unrelated sibling repo further up the tree and
    // disappear from the report — trading a false positive for a false
    // negative, which is the worse of the two here.
    if (
      existsSync(join(current, "package.json")) ||
      existsSync(join(current, ".git"))
    ) {
      roots.push(current);
    }
    current = dirname(current);
  }
  return roots;
}

function collectPackageNames(roots: string[]): Set<string> {
  const names = new Set<string>();
  for (const root of roots) {
    const pkg = readJson(join(root, "package.json"));
    const name = pkg?.name;
    if (typeof name === "string" && name.length > 0) {
      names.add(name);
    }
  }
  return names;
}

function collectAliases(
  repoRoot: string,
  packageRoots: string[],
): ResolutionContext["aliases"] {
  const aliases: ResolutionContext["aliases"] = [];
  for (const root of [repoRoot, ...packageRoots]) {
    for (const file of ["tsconfig.json", "tsconfig.base.json"]) {
      const config = readJson(join(root, file));
      const compilerOptions = config?.compilerOptions as
        | { paths?: unknown; baseUrl?: unknown }
        | undefined;
      const paths = compilerOptions?.paths;
      if (!paths || typeof paths !== "object") {
        continue;
      }
      // Alias targets are relative to baseUrl when it is set, not to the
      // tsconfig's own directory.
      const base =
        typeof compilerOptions?.baseUrl === "string"
          ? resolve(root, compilerOptions.baseUrl)
          : root;
      for (const [key, value] of Object.entries(
        paths as Record<string, unknown>,
      )) {
        if (!Array.isArray(value)) {
          continue;
        }
        const prefix = key.replace(/\*$/, "");
        const targets = value
          .filter((v): v is string => typeof v === "string")
          .map((v) => resolve(base, v.replace(/\*$/, "")));
        if (prefix && targets.length > 0) {
          aliases.push({ prefix, targets });
        }
      }
    }
  }
  return aliases;
}

/** Tracked paths, repo-relative. Empty outside a git repo. */
function listTrackedFiles(repoRoot: string): string[] {
  const result = spawnSync("git", ["-C", repoRoot, "ls-files"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return [];
  }
  return (result.stdout ?? "").split("\n").filter(Boolean);
}

export function buildResolutionContext(repoRoot: string): ResolutionContext {
  const packageRoots = [
    ...new Set(
      workspaceGlobs(repoRoot).flatMap((glob) => expandGlob(repoRoot, glob)),
    ),
  ];
  const roots = [
    ...new Set([repoRoot, ...packageRoots, ...ancestorRoots(repoRoot)]),
  ];
  return {
    roots,
    packageNames: collectPackageNames([repoRoot, ...packageRoots]),
    aliases: collectAliases(repoRoot, packageRoots),
    trackedFiles: listTrackedFiles(repoRoot),
  };
}

/**
 * Whether a cited reference resolves in any legitimate frame.
 *
 * `~` is checked against tsconfig aliases FIRST, then as a home directory. Both
 * meanings are live in this fleet — currychat's `~/components/...` is an alias
 * while lc-classic-starter's `~/saffron/...` is a home — and expanding to $HOME
 * unconditionally just trades one false-positive class for another.
 */
export function resolvesSomewhere(
  reference: string,
  context: ResolutionContext,
): boolean {
  if (context.packageNames.has(reference)) {
    return true;
  }
  // A scoped specifier's subpath (`@watchtower/ui/button`) is still a specifier.
  for (const name of context.packageNames) {
    if (reference.startsWith(`${name}/`)) {
      return true;
    }
  }

  // Every declared alias, not only `~` — `@/components/x` and `#/lib/y` are as
  // common and were being reported as drift.
  for (const alias of context.aliases) {
    if (!reference.startsWith(alias.prefix)) {
      continue;
    }
    const aliasRest = reference.slice(alias.prefix.length);
    if (
      alias.targets.some(
        (target) =>
          existsSync(join(target, aliasRest)) ||
          resolveWithExtensions(join(target, aliasRest)),
      )
    ) {
      return true;
    }
  }

  // Only after aliases: `~` is a home directory in some of these repos and a
  // tsconfig alias in others.
  if (reference.startsWith("~")) {
    const rest = reference.slice(1).replace(/^\//, "");
    if (existsSync(join(homedir(), rest))) {
      return true;
    }
  }

  if (reference.startsWith("/")) {
    return existsSync(reference);
  }

  const candidates = [reference];
  // Claude's import sigil: `@.agents/commands/research.md` is a path with an `@`
  // in front, not a package specifier. A scoped specifier never has `.` or `/`
  // straight after the `@`, so the two shapes do not overlap.
  if (/^@[./]/.test(reference)) {
    candidates.push(reference.slice(1));
  }
  // The unbackticked scanner is anchored on `\b`, and there is no word boundary
  // between a delimiter and a leading dot — so `(mdc:.cursor/rules/x.mdc)` and
  // `(./.config/y)` both arrive here with the dot already gone, naming a path
  // that can never exist. Restoring it is what actually fixes Cursor's `mdc:`
  // links; stripping the scheme, which is where I first reached, changes
  // nothing because the dot is lost either way.
  if (!reference.startsWith(".")) {
    candidates.push(`.${reference}`);
  }

  return candidates.some(
    (candidate) =>
      context.roots.some(
        (root) =>
          existsSync(resolve(root, candidate)) ||
          resolveWithExtensions(resolve(root, candidate)),
      ) || matchesExactlyOneTrackedFile(candidate, context.trackedFiles),
  );
}

/** Alias targets are usually written without an extension. */
function resolveWithExtensions(candidate: string): boolean {
  return [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    "/index.ts",
    "/index.tsx",
  ].some((suffix) => existsSync(`${candidate}${suffix}`));
}
