/**
 * Which instruction files are upstream's rather than ours.
 *
 * A vendored fork carries the upstream project's own AGENTS.md. Asking it for a
 * `Last validated:` line asks us to write our first authored line into someone
 * else's document, which then conflicts on every merge — and until we do, the
 * repo sits permanently red on governance metadata for files we have authored
 * nothing in. openclaw (0/23) and postiz-app (0/2, byte-identical to upstream's
 * CLAUDE.md) are both in that state.
 *
 * Both signals are LOCAL. `upstream/main` only has to be *configured*, not
 * reachable: `git log upstream/main..HEAD` and `git ls-tree upstream/main` read
 * refs already on disk. Where no upstream remote exists the check simply does
 * not fire, which is the right default for almost every repo, and keeps the
 * audit offline and deterministic.
 *
 * Stale refs degrade toward "not exempt" — we ask for a date on a file that
 * might be upstream's, rather than silently exempting one that is ours.
 */

import { spawnSync } from "node:child_process";

const UPSTREAM_REF_CANDIDATES = [
  "upstream/main",
  "upstream/master",
  "upstream/HEAD",
] as const;

function git(repoRoot: string, args: string[]): string | null {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout ?? "";
}

/** The first configured upstream ref that resolves from local refs. */
export function resolveUpstreamRef(repoRoot: string): string | null {
  for (const ref of UPSTREAM_REF_CANDIDATES) {
    if (git(repoRoot, ["rev-parse", "--verify", "--quiet", ref]) !== null) {
      return ref;
    }
  }
  return null;
}

/**
 * Repo-relative paths that exist in upstream and carry no local commits.
 *
 * Two git calls for the whole repo rather than two per file: the set of paths
 * we have touched since diverging, subtracted from the set upstream ships.
 */
export function upstreamAuthoredFiles(repoRoot: string): Set<string> {
  const ref = resolveUpstreamRef(repoRoot);
  if (!ref) {
    return new Set();
  }

  const upstreamTree = git(repoRoot, ["ls-tree", "-r", "--name-only", ref]);
  if (upstreamTree === null) {
    return new Set();
  }

  const locallyTouched = new Set(
    (git(repoRoot, ["log", "--name-only", "--format=", `${ref}..HEAD`]) ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );

  const authored = new Set<string>();
  for (const path of upstreamTree.split("\n")) {
    const trimmed = path.trim();
    if (trimmed && !locallyTouched.has(trimmed)) {
      authored.add(trimmed);
    }
  }

  for (const path of renamedUpstreamFiles(repoRoot, ref)) {
    authored.add(path);
  }
  return authored;
}

/**
 * Files we renamed but did not write.
 *
 * We rename `CLAUDE.md` to `AGENTS.md` on every fork so Codex can read it, which
 * gives the file a local commit and no counterpart at its own path upstream —
 * so path-and-history alone calls upstream's document ours.
 *
 * The test is content identity, not a guess about renames: git's blob hash IS
 * the content, so a file whose blob appears anywhere in the upstream tree
 * contains zero bytes of ours no matter what it is called. Edit one character
 * and the hash diverges and the exemption drops. That bound comes from
 * construction rather than from sample size, which is what separates this from
 * the basename discriminator that had to be abandoned.
 */
function renamedUpstreamFiles(repoRoot: string, ref: string): string[] {
  const upstreamBlobs = new Set<string>();
  for (const line of (git(repoRoot, ["ls-tree", "-r", ref]) ?? "").split(
    "\n",
  )) {
    // `<mode> blob <sha>\t<path>`
    const sha = line.split(/\s+/)[2];
    if (sha) {
      upstreamBlobs.add(sha);
    }
  }
  if (upstreamBlobs.size === 0) {
    return [];
  }

  const renamed: string[] = [];
  for (const line of (git(repoRoot, ["ls-tree", "-r", "HEAD"]) ?? "").split(
    "\n",
  )) {
    const parts = line.split("\t");
    const sha = (parts[0] ?? "").split(/\s+/)[2];
    const path = (parts[1] ?? "").trim();
    if (sha && path && upstreamBlobs.has(sha)) {
      renamed.push(path);
    }
  }
  return renamed;
}
