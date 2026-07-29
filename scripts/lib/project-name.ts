/**
 * resolveProjectName — deterministic project name resolution.
 *
 * Replaces `basename(projectRoot)` which produces different output depending
 * on the checkout directory name. Deterministic naming is required for
 * reproducible audit artifacts and self-audit proof verification.
 *
 * Resolution order:
 *   1. Explicit override (--project-name flag)
 *   2. package.json `name` field (unscoped: `@lambdacurry/anvil` → `anvil`)
 *   3. Git remote origin repo name
 *   4. basename(projectRoot) as last resort
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Extract the unscoped package name from a package.json `name` field.
 * `@lambdacurry/anvil` → `anvil`, `my-package` → `my-package`.
 */
function unscopeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("@") && trimmed.includes("/")) {
    return trimmed.split("/").pop() ?? trimmed;
  }
  return trimmed;
}

/**
 * Try to get the repo name from git remote origin URL.
 * `git@github.com:lambdacurry/anvil.git` → `anvil`
 * `https://github.com/lambdacurry/anvil.git` → `anvil`
 */
function gitRemoteName(projectRoot: string): string | null {
  try {
    const result = spawnSync("git", ["remote", "get-url", "origin"], {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 5000,
    });
    if (result.status !== 0 || !result.stdout.trim()) return null;
    const url = result.stdout.trim();
    // Strip trailing .git and take the last path segment
    const cleaned = url.replace(/\.git$/, "");
    // Handle both SSH (git@host:org/name) and HTTPS (https://host/org/name)
    const lastSegment = cleaned.replace(/^.*[/:]/, "");
    return lastSegment || null;
  } catch {
    return null;
  }
}

/**
 * Try to read the `name` field from package.json in projectRoot.
 */
function packageName(projectRoot: string): string | null {
  const pkgPath = join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (typeof pkg.name === "string" && pkg.name.trim()) {
      return unscopeName(pkg.name);
    }
  } catch {
    // Malformed package.json — fall through
  }
  return null;
}

/**
 * Resolve a deterministic project name for use in report titles and artifact paths.
 *
 * @param projectRoot - Absolute path to the project root
 * @param explicitName - Optional explicit override (e.g. from --project-name flag)
 * @returns A deterministic project name string
 */
export function resolveProjectName(
  projectRoot: string,
  explicitName?: string | null,
): string {
  if (explicitName && explicitName.trim()) {
    return explicitName.trim();
  }

  const fromPackage = packageName(projectRoot);
  if (fromPackage) return fromPackage;

  const fromGit = gitRemoteName(projectRoot);
  if (fromGit) return fromGit;

  return basename(projectRoot);
}
