/**
 * Read-only Git state collection for `anvil repo audit`.
 *
 * Every git invocation in this module passes through `runGit`, which refuses any
 * command outside an explicit read-only allowlist. The audit reports what it sees;
 * it never merges, resets, checks out, stashes, drops, prunes, pushes, or otherwise
 * reconciles the repository. `--no-optional-locks` keeps even `status` from
 * refreshing the on-disk index, and `gc.auto=0` blocks incidental repacking.
 *
 * This engine is deliberately generic: it knows about Git, not about who owns a
 * branch or which session created a worktree.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Allowlisted read-only git surface.
 *
 * `subVerbs` restricts commands whose safety depends on the second token
 * (`worktree list` is read-only, `worktree remove` is not). `maxOperands` guards
 * commands that switch from reading to writing once given extra operands
 * (`symbolic-ref NAME` reads, `symbolic-ref NAME REF` writes).
 */
type ReadOnlyRule = {
  subVerbs?: readonly string[];
  maxOperands?: number;
  /** Flags that turn an otherwise-read-only command into a writing one. */
  forbiddenFlags?: readonly string[];
};

export const READ_ONLY_GIT_COMMANDS: Readonly<Record<string, ReadOnlyRule>> =
  Object.freeze({
    "cat-file": {},
    "check-ignore": {},
    config: { subVerbs: ["--get", "--get-all", "--list"] },
    diff: {},
    "for-each-ref": {},
    // `fsck` only reads — except `--lost-found`, which writes recovered objects
    // into .git/lost-found/.
    fsck: { forbiddenFlags: ["--lost-found"] },
    lfs: { subVerbs: ["version", "status", "env"] },
    log: {},
    "ls-files": {},
    "ls-remote": {},
    "merge-base": {},
    reflog: { subVerbs: ["show"] },
    remote: { subVerbs: ["get-url", "-v", "--verbose"] },
    "rev-list": {},
    "rev-parse": {},
    show: {},
    status: {},
    submodule: { subVerbs: ["status"] },
    "symbolic-ref": { maxOperands: 1 },
    version: {},
    worktree: { subVerbs: ["list"] },
  });

export class MutatingGitCommandError extends Error {
  constructor(args: readonly string[], reason: string) {
    super(
      `Refused to run a git command that is not on the read-only allowlist: ` +
        `\`git ${args.join(" ")}\` (${reason}). ` +
        `anvil repo audit never mutates the repository it inspects.`,
    );
    this.name = "MutatingGitCommandError";
  }
}

/**
 * Throws unless `args` is a known read-only git invocation.
 *
 * Exported so the read-only contract is directly testable rather than only
 * observable through side effects that would, by definition, be the bug.
 */
export function assertReadOnlyGitArgs(args: readonly string[]): void {
  const operands: string[] = [];
  let subcommand: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (subcommand === null) {
      // Pre-subcommand global options. `-c` and `-C` take a value; the rest of
      // the global flags we ever emit are self-contained.
      if (arg === "-c" || arg === "-C") {
        i++;
        continue;
      }
      if (arg.startsWith("-")) {
        continue;
      }
      subcommand = arg;
      continue;
    }
    operands.push(arg);
  }

  if (subcommand === null) {
    throw new MutatingGitCommandError(args, "no subcommand");
  }

  const rule = READ_ONLY_GIT_COMMANDS[subcommand];
  if (!rule) {
    throw new MutatingGitCommandError(
      args,
      `\`${subcommand}\` is not an allowlisted read-only subcommand`,
    );
  }

  if (rule.subVerbs) {
    const subVerb = operands[0];
    if (!subVerb || !rule.subVerbs.includes(subVerb)) {
      throw new MutatingGitCommandError(
        args,
        `\`${subcommand}\` is only allowed with: ${rule.subVerbs.join(", ")}`,
      );
    }
  }

  if (rule.forbiddenFlags) {
    for (const flag of rule.forbiddenFlags) {
      if (
        operands.some(
          (operand) => operand === flag || operand.startsWith(`${flag}=`),
        )
      ) {
        throw new MutatingGitCommandError(
          args,
          `\`${subcommand} ${flag}\` writes to the repository`,
        );
      }
    }
  }

  if (rule.maxOperands !== undefined) {
    const positional = operands.filter((operand) => !operand.startsWith("-"));
    if (positional.length > rule.maxOperands) {
      throw new MutatingGitCommandError(
        args,
        `\`${subcommand}\` becomes a write operation with more than ` +
          `${rule.maxOperands} operand(s)`,
      );
    }
  }
}

export type GitResult = {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
};

export type GitRunner = (
  args: readonly string[],
  options?: { cwd?: string },
) => GitResult;

/** Global options applied to every invocation to keep the audit side-effect free. */
const READ_ONLY_GLOBAL_ARGS = ["--no-optional-locks", "-c", "gc.auto=0"];

export function runGit(
  args: readonly string[],
  options: { cwd?: string } = {},
): GitResult {
  assertReadOnlyGitArgs(args);
  const result = spawnSync("git", [...READ_ONLY_GLOBAL_ARGS, ...args], {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const status = result.status ?? 1;
  return {
    ok: status === 0,
    status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

// --- collected state -------------------------------------------------------

export type DefaultBranchSource =
  | "explicit"
  | "remote-query"
  | "remote-head-ref"
  | "config"
  | "heuristic"
  | "unresolved";

export type DefaultBranchInfo = {
  name: string | null;
  /** Local ref that the default branch resolves to, when one exists. */
  ref: string | null;
  source: DefaultBranchSource;
  /** True only when the remote was queried during this run. */
  verifiedAgainstRemote: boolean;
  /** Age of the newest cached fetch, in seconds; null when never fetched. */
  remoteCacheAgeSeconds: number | null;
  caveat: string | null;
};

export type HeadInfo = {
  detached: boolean;
  branch: string | null;
  commit: string | null;
};

export type WorktreeStatus = {
  path: string;
  headCommit: string | null;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockReason: string | null;
  /** Git reports the registration as prunable, or the path no longer exists. */
  prunable: boolean;
  prunableReason: string | null;
  missing: boolean;
  isPrimary: boolean;
  /**
   * For a detached HEAD: whether its commit is reachable from some branch or
   * tag. A detached HEAD on a reachable commit is an ordinary CI checkout or a
   * `git checkout <tag>`; one on an unreachable commit holds work that exists
   * nowhere else. Null when HEAD is attached or could not be resolved.
   */
  headReachableFromRef: boolean | null;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  conflictedPaths: string[];
  operations: GitOperation[];
};

export type GitOperation = {
  kind:
    | "merge"
    | "rebase"
    | "am"
    | "cherry-pick"
    | "revert"
    | "bisect"
    | "sequencer";
  marker: string;
};

export type StashEntry = {
  ref: string;
  commit: string;
  message: string;
  date: string;
};

export type BranchInfo = {
  name: string;
  commit: string;
  upstream: string | null;
  upstreamGone: boolean;
  isDefault: boolean;
  /** Null when the branch shares no merge base with the default branch. */
  aheadOfDefault: number | null;
  behindDefault: number | null;
  /** Total commits on each side; meaningful when histories are unrelated. */
  totalCommits: number;
  sharesHistoryWithDefault: boolean;
  aheadOfUpstream: number | null;
  behindUpstream: number | null;
};

export type OrphanCommit = {
  commit: string;
  date: string;
  subject: string;
  author: string;
  /**
   * Whether a reflog entry still names this commit. True means `git reflog` can
   * still recover it until the reflog expires; false means the object store is
   * the only thing holding it and the next `gc` is final.
   */
  recoverableFromReflog: boolean;
};

export type ReflogOnlyCommit = OrphanCommit & {
  /** Reflog selectors that still reference this commit, e.g. `HEAD@{7}`. */
  selectors: string[];
};

export type SubmoduleInfo = {
  path: string;
  commit: string;
  state: "ok" | "uninitialized" | "modified" | "conflicted";
  describe: string | null;
};

export type LfsInfo = {
  applicable: boolean;
  toolAvailable: boolean;
  /** Files whose declaration made LFS applicable. */
  declaredIn: string[];
};

export type RemoteInfo = {
  name: string;
  fetchUrl: string | null;
};

export type GitState = {
  repoRoot: string;
  gitDir: string;
  commonDir: string;
  isRepository: boolean;
  defaultBranch: DefaultBranchInfo;
  head: HeadInfo;
  worktrees: WorktreeStatus[];
  stashes: StashEntry[];
  branches: BranchInfo[];
  reflogOnlyCommits: ReflogOnlyCommit[];
  /**
   * Commits reachable from neither refs nor reflogs — the population a `gc`
   * discards outright. Only populated when `includeUnreachable` is set, because
   * the fsck it requires is expensive on large repositories.
   */
  unreachableCommits: OrphanCommit[];
  unreachableScanned: boolean;
  submodules: SubmoduleInfo[];
  submodulesApplicable: boolean;
  lfs: LfsInfo;
  remotes: RemoteInfo[];
  /** Non-fatal problems encountered while collecting, surfaced as-is. */
  collectionErrors: string[];
};

export type CollectOptions = {
  repoRoot: string;
  remote?: string;
  defaultBranch?: string | null;
  verifyRemote?: boolean;
  reflogDays?: number;
  staleFetchHours?: number;
  /** Run the fsck pass for commits reachable from neither refs nor reflogs. */
  includeUnreachable?: boolean;
  /** Injected for deterministic tests. */
  now?: Date;
  git?: GitRunner;
};

export const DEFAULT_REFLOG_DAYS = 30;
export const DEFAULT_STALE_FETCH_HOURS = 24;
const DEFAULT_BRANCH_CANDIDATES = ["main", "master", "trunk", "develop"];
const MAX_REFLOG_ONLY_REPORTED = 50;

export function isGitRepository(
  repoRoot: string,
  git: GitRunner = runGit,
): boolean {
  const result = git(["-C", repoRoot, "rev-parse", "--is-inside-work-tree"]);
  return result.ok && /\btrue\b/i.test(result.stdout);
}

function resolveDefaultBranch(
  repoRoot: string,
  git: GitRunner,
  options: CollectOptions,
  remote: string,
  remoteCacheAgeSeconds: number | null,
  staleFetchHours: number,
): DefaultBranchInfo {
  const localRefExists = (name: string): boolean =>
    git([
      "-C",
      repoRoot,
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${name}`,
    ]).ok;

  const staleCaveat = (): string | null => {
    if (remoteCacheAgeSeconds === null) {
      return "Remote-tracking refs have never been fetched in this clone; the default branch was inferred locally.";
    }
    const hours = remoteCacheAgeSeconds / 3600;
    if (hours >= staleFetchHours) {
      return `Default branch was read from cached remote-tracking refs last fetched ${formatAge(remoteCacheAgeSeconds)} ago; re-run with --verify-remote to confirm against the remote.`;
    }
    return "Default branch was read from cached remote-tracking refs, not from the remote; re-run with --verify-remote to confirm.";
  };

  if (options.defaultBranch) {
    return {
      name: options.defaultBranch,
      ref: localRefExists(options.defaultBranch)
        ? `refs/heads/${options.defaultBranch}`
        : `refs/remotes/${remote}/${options.defaultBranch}`,
      source: "explicit",
      verifiedAgainstRemote: false,
      remoteCacheAgeSeconds,
      caveat:
        "Default branch was supplied with --default-branch and not verified.",
    };
  }

  if (options.verifyRemote) {
    const result = git([
      "-C",
      repoRoot,
      "ls-remote",
      "--symref",
      remote,
      "HEAD",
    ]);
    const match = result.ok
      ? /^ref:\s+refs\/heads\/(?<name>\S+)\s+HEAD$/m.exec(result.stdout)
      : null;
    const name = match?.groups?.name;
    if (name) {
      return {
        name,
        ref: localRefExists(name)
          ? `refs/heads/${name}`
          : `refs/remotes/${remote}/${name}`,
        source: "remote-query",
        verifiedAgainstRemote: true,
        remoteCacheAgeSeconds,
        caveat: null,
      };
    }
  }

  const symbolic = git([
    "-C",
    repoRoot,
    "symbolic-ref",
    "--quiet",
    `refs/remotes/${remote}/HEAD`,
  ]);
  if (symbolic.ok) {
    const ref = symbolic.stdout.trim();
    const name = ref.replace(`refs/remotes/${remote}/`, "");
    if (name) {
      return {
        name,
        ref: localRefExists(name) ? `refs/heads/${name}` : ref,
        source: "remote-head-ref",
        verifiedAgainstRemote: false,
        remoteCacheAgeSeconds,
        caveat: staleCaveat(),
      };
    }
  }

  const configured = git([
    "-C",
    repoRoot,
    "config",
    "--get",
    "init.defaultBranch",
  ]);
  const configuredName = configured.ok ? configured.stdout.trim() : "";
  if (configuredName && localRefExists(configuredName)) {
    return {
      name: configuredName,
      ref: `refs/heads/${configuredName}`,
      source: "config",
      verifiedAgainstRemote: false,
      remoteCacheAgeSeconds,
      caveat:
        "Default branch came from init.defaultBranch, not from the remote; it may not match the canonical default.",
    };
  }

  for (const candidate of DEFAULT_BRANCH_CANDIDATES) {
    if (localRefExists(candidate)) {
      return {
        name: candidate,
        ref: `refs/heads/${candidate}`,
        source: "heuristic",
        verifiedAgainstRemote: false,
        remoteCacheAgeSeconds,
        caveat: `No remote HEAD is recorded; \`${candidate}\` was guessed from conventional names and may not be the canonical default.`,
      };
    }
  }

  return {
    name: null,
    ref: null,
    source: "unresolved",
    verifiedAgainstRemote: false,
    remoteCacheAgeSeconds,
    caveat:
      "The canonical default branch could not be determined; branch comparisons were skipped.",
  };
}

export function formatAge(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h`;
  }
  return `${Math.floor(seconds / 86_400)}d`;
}

function newestFetchAgeSeconds(commonDir: string, now: Date): number | null {
  let newest: number | null = null;
  for (const candidate of ["FETCH_HEAD", join("logs", "refs", "remotes")]) {
    const path = join(commonDir, candidate);
    if (!existsSync(path)) {
      continue;
    }
    try {
      const mtime = statSync(path).mtimeMs;
      if (newest === null || mtime > newest) {
        newest = mtime;
      }
    } catch {
      // An unreadable timestamp is a missing timestamp, not a failure.
    }
  }
  if (newest === null) {
    return null;
  }
  return Math.max(0, (now.getTime() - newest) / 1000);
}

function parseStatusCounts(porcelain: string): {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  conflictedPaths: string[];
} {
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let conflicted = 0;
  const conflictedPaths: string[] = [];

  for (const line of porcelain.split("\n")) {
    if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const xy = line.slice(2, 4);
      if (xy[0] !== ".") {
        staged++;
      }
      if (xy[1] !== ".") {
        unstaged++;
      }
    } else if (line.startsWith("u ")) {
      conflicted++;
      const path = line.split("\t")[0]?.split(" ").slice(10).join(" ");
      if (path) {
        conflictedPaths.push(path);
      }
    } else if (line.startsWith("? ")) {
      untracked++;
    }
  }

  return { staged, unstaged, untracked, conflicted, conflictedPaths };
}

function detectOperations(worktreeGitDir: string): GitOperation[] {
  const operations: GitOperation[] = [];
  const has = (name: string): boolean => existsSync(join(worktreeGitDir, name));

  if (has("MERGE_HEAD")) {
    operations.push({ kind: "merge", marker: "MERGE_HEAD" });
  }
  if (has("rebase-merge")) {
    operations.push({ kind: "rebase", marker: "rebase-merge/" });
  }
  if (has("rebase-apply")) {
    // `git am` and `git rebase --apply` share the directory; `applying` disambiguates.
    const kind = has(join("rebase-apply", "applying")) ? "am" : "rebase";
    operations.push({ kind, marker: "rebase-apply/" });
  }
  if (has("CHERRY_PICK_HEAD")) {
    operations.push({ kind: "cherry-pick", marker: "CHERRY_PICK_HEAD" });
  }
  if (has("REVERT_HEAD")) {
    operations.push({ kind: "revert", marker: "REVERT_HEAD" });
  }
  if (has("BISECT_LOG")) {
    operations.push({ kind: "bisect", marker: "BISECT_LOG" });
  }
  if (has("sequencer")) {
    operations.push({ kind: "sequencer", marker: "sequencer/" });
  }

  return operations;
}

function collectWorktrees(
  repoRoot: string,
  git: GitRunner,
  errors: string[],
): WorktreeStatus[] {
  const result = git(["-C", repoRoot, "worktree", "list", "--porcelain"]);
  if (!result.ok) {
    errors.push(`Unable to list worktrees: ${result.stderr.trim()}`);
    return [];
  }

  const worktrees: WorktreeStatus[] = [];
  let current: Partial<WorktreeStatus> | null = null;

  const flush = (): void => {
    if (current?.path) {
      worktrees.push(finalizeWorktree(current, git, worktrees.length === 0));
    }
    current = null;
  };

  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") {
      flush();
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");
    if (key === "worktree") {
      flush();
      current = { path: value };
    } else if (!current) {
      continue;
    } else if (key === "HEAD") {
      current.headCommit = value;
    } else if (key === "branch") {
      current.branch = value.replace("refs/heads/", "");
    } else if (key === "detached") {
      current.detached = true;
    } else if (key === "bare") {
      current.bare = true;
    } else if (key === "locked") {
      current.locked = true;
      current.lockReason = value || null;
    } else if (key === "prunable") {
      current.prunable = true;
      current.prunableReason = value || null;
    }
  }
  flush();

  return worktrees;
}

function finalizeWorktree(
  partial: Partial<WorktreeStatus>,
  git: GitRunner,
  isPrimary: boolean,
): WorktreeStatus {
  const path = partial.path as string;
  const missing = !existsSync(path);
  const base: WorktreeStatus = {
    path,
    headCommit: partial.headCommit ?? null,
    branch: partial.branch ?? null,
    detached: partial.detached ?? false,
    bare: partial.bare ?? false,
    locked: partial.locked ?? false,
    lockReason: partial.lockReason ?? null,
    prunable: (partial.prunable ?? false) || missing,
    prunableReason:
      partial.prunableReason ??
      (missing ? "worktree path no longer exists on disk" : null),
    missing,
    isPrimary,
    headReachableFromRef: null,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
    conflictedPaths: [],
    operations: [],
  };

  if (missing || base.bare) {
    return base;
  }

  if (base.detached && base.headCommit) {
    // Empty output means the commit is reachable from some branch or tag.
    // `--all` is wrong here: it includes HEAD, so the detached commit would
    // always appear to reach itself.
    const unreachable = git([
      "-C",
      path,
      "rev-list",
      "--no-walk",
      base.headCommit,
      "--not",
      "--branches",
      "--tags",
      "--remotes",
    ]);
    base.headReachableFromRef = unreachable.ok
      ? unreachable.stdout.trim() === ""
      : null;
  }

  const status = git([
    "-C",
    path,
    "status",
    "--porcelain=v2",
    "--untracked-files=all",
  ]);
  if (status.ok) {
    Object.assign(base, parseStatusCounts(status.stdout));
  }

  const gitDir = git(["-C", path, "rev-parse", "--absolute-git-dir"]);
  if (gitDir.ok) {
    base.operations = detectOperations(gitDir.stdout.trim());
  }

  return base;
}

function collectStashes(repoRoot: string, git: GitRunner): StashEntry[] {
  const exists = git([
    "-C",
    repoRoot,
    "rev-parse",
    "--verify",
    "--quiet",
    "refs/stash",
  ]);
  if (!exists.ok) {
    return [];
  }

  // `reflog show` rather than `stash list`: identical data, and it keeps every
  // command in this module inside the read-only allowlist.
  const result = git([
    "-C",
    repoRoot,
    "reflog",
    "show",
    "--format=%gD%x09%H%x09%cI%x09%gs",
    "refs/stash",
  ]);
  if (!result.ok) {
    return [];
  }

  return lines(result.stdout).map((line) => {
    const [ref, commit, date, ...message] = line.split("\t");
    return {
      ref: ref ?? "",
      commit: commit ?? "",
      date: date ?? "",
      message: message.join("\t"),
    };
  });
}

function countRange(
  repoRoot: string,
  git: GitRunner,
  left: string,
  right: string,
): { left: number; right: number } | null {
  const result = git([
    "-C",
    repoRoot,
    "rev-list",
    "--left-right",
    "--count",
    `${left}...${right}`,
  ]);
  if (!result.ok) {
    return null;
  }
  const [a, b] = result.stdout.trim().split(/\s+/);
  const leftCount = Number.parseInt(a ?? "", 10);
  const rightCount = Number.parseInt(b ?? "", 10);
  if (Number.isNaN(leftCount) || Number.isNaN(rightCount)) {
    return null;
  }
  return { left: leftCount, right: rightCount };
}

function collectBranches(
  repoRoot: string,
  git: GitRunner,
  defaultBranch: DefaultBranchInfo,
  errors: string[],
): BranchInfo[] {
  const result = git([
    "-C",
    repoRoot,
    "for-each-ref",
    "--format=%(refname:short)%09%(objectname)%09%(upstream:short)%09%(upstream:track)",
    "refs/heads",
  ]);
  if (!result.ok) {
    errors.push(`Unable to enumerate local branches: ${result.stderr.trim()}`);
    return [];
  }

  const defaultRef = defaultBranch.ref;
  const branches: BranchInfo[] = [];

  for (const line of lines(result.stdout)) {
    const [name, commit, upstream, track] = line.split("\t");
    if (!name || !commit) {
      continue;
    }

    const isDefault = defaultBranch.name === name;
    const upstreamName = upstream && upstream.length > 0 ? upstream : null;
    const upstreamGone = (track ?? "").includes("gone");

    const totalResult = git(["-C", repoRoot, "rev-list", "--count", name]);
    const totalCommits = totalResult.ok
      ? Number.parseInt(totalResult.stdout.trim(), 10) || 0
      : 0;

    let aheadOfDefault: number | null = null;
    let behindDefault: number | null = null;
    let sharesHistoryWithDefault = true;

    if (!isDefault && defaultRef) {
      const mergeBase = git(["-C", repoRoot, "merge-base", defaultRef, name]);
      if (!mergeBase.ok || mergeBase.stdout.trim() === "") {
        // No common ancestor. Ahead/behind counts here are just the two totals
        // and read as an enormous divergence, so we refuse to report them.
        sharesHistoryWithDefault = false;
      } else {
        const counts = countRange(repoRoot, git, defaultRef, name);
        if (counts) {
          behindDefault = counts.left;
          aheadOfDefault = counts.right;
        }
      }
    } else if (isDefault) {
      aheadOfDefault = 0;
      behindDefault = 0;
    }

    let aheadOfUpstream: number | null = null;
    let behindUpstream: number | null = null;
    if (upstreamName && !upstreamGone) {
      const counts = countRange(repoRoot, git, upstreamName, name);
      if (counts) {
        behindUpstream = counts.left;
        aheadOfUpstream = counts.right;
      }
    }

    branches.push({
      name,
      commit,
      upstream: upstreamName,
      upstreamGone,
      isDefault,
      aheadOfDefault,
      behindDefault,
      totalCommits,
      sharesHistoryWithDefault,
      aheadOfUpstream,
      behindUpstream,
    });
  }

  branches.sort((a, b) => a.name.localeCompare(b.name));
  return branches;
}

function collectReflogOnlyCommits(
  repoRoot: string,
  git: GitRunner,
  reflogDays: number,
  now: Date,
): ReflogOnlyCommit[] {
  if (reflogDays <= 0) {
    return [];
  }

  const refs = ["HEAD"];
  const headRefs = git([
    "-C",
    repoRoot,
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads",
  ]);
  if (headRefs.ok) {
    refs.push(...lines(headRefs.stdout));
  }

  const cutoff = now.getTime() - reflogDays * 86_400_000;
  const selectorsByCommit = new Map<string, string[]>();

  for (const ref of refs) {
    const result = git([
      "-C",
      repoRoot,
      "reflog",
      "show",
      "--format=%H%x09%gD%x09%cI",
      ref,
    ]);
    if (!result.ok) {
      continue;
    }
    for (const line of lines(result.stdout)) {
      const [commit, selector, iso] = line.split("\t");
      if (!commit || !selector) {
        continue;
      }
      const stamp = iso ? Date.parse(iso) : Number.NaN;
      if (!Number.isNaN(stamp) && stamp < cutoff) {
        continue;
      }
      const existing = selectorsByCommit.get(commit);
      if (existing) {
        if (!existing.includes(selector)) {
          existing.push(selector);
        }
      } else {
        selectorsByCommit.set(commit, [selector]);
      }
    }
  }

  if (selectorsByCommit.size === 0) {
    return [];
  }

  // Worktree HEADs are not refs under refs/, so `--all` alone would call a
  // detached worktree checkout "unreachable".
  const extraTips: string[] = [];
  const worktreeHeads = git([
    "-C",
    repoRoot,
    "worktree",
    "list",
    "--porcelain",
  ]);
  if (worktreeHeads.ok) {
    for (const line of lines(worktreeHeads.stdout)) {
      if (line.startsWith("HEAD ")) {
        extraTips.push(line.slice(5).trim());
      }
    }
  }

  const candidates = [...selectorsByCommit.keys()];
  const unreachable = git([
    "-C",
    repoRoot,
    "rev-list",
    "--no-walk",
    ...candidates,
    "--not",
    "--all",
    ...extraTips,
  ]);
  if (!unreachable.ok) {
    return [];
  }

  const unreachableShas = lines(unreachable.stdout);
  if (unreachableShas.length === 0) {
    return [];
  }

  const details = git([
    "-C",
    repoRoot,
    "log",
    "--no-walk",
    "--format=%H%x09%cI%x09%an%x09%s",
    ...unreachableShas,
  ]);
  if (!details.ok) {
    return [];
  }

  const commits: ReflogOnlyCommit[] = [];
  for (const line of lines(details.stdout)) {
    const [commit, date, author, ...subject] = line.split("\t");
    if (!commit) {
      continue;
    }
    commits.push({
      commit,
      date: date ?? "",
      author: author ?? "",
      subject: subject.join("\t"),
      // These were found via the reflog, so by construction they are recoverable.
      recoverableFromReflog: true,
      selectors: selectorsByCommit.get(commit) ?? [],
    });
  }

  commits.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.commit.localeCompare(b.commit);
  });

  return commits.slice(0, MAX_REFLOG_ONLY_REPORTED);
}

/** Every commit any reflog still names, with no time window applied. */
function collectAllReflogCommits(
  repoRoot: string,
  git: GitRunner,
): Set<string> {
  const named = new Set<string>();
  const refs = ["HEAD"];
  const headRefs = git([
    "-C",
    repoRoot,
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads",
  ]);
  if (headRefs.ok) {
    refs.push(...lines(headRefs.stdout));
  }

  for (const ref of refs) {
    const result = git(["-C", repoRoot, "reflog", "show", "--format=%H", ref]);
    if (!result.ok) {
      continue;
    }
    for (const sha of lines(result.stdout)) {
      named.add(sha);
    }
  }

  return named;
}

/**
 * Commits reachable from no branch, tag, or remote ref.
 *
 * `--no-reflogs` is deliberate: without it, fsck treats reflog entries as roots
 * and hides exactly the commits worth surfacing — including any that fall
 * outside the `--reflog-days` window, which is the gap between the two scans.
 * `--connectivity-only` skips object content verification, which is the slow
 * part of fsck and not the question being asked.
 */
function collectUnreachableCommits(
  repoRoot: string,
  git: GitRunner,
  alreadyReported: ReadonlySet<string>,
  reflogNamed: ReadonlySet<string>,
): OrphanCommit[] {
  const fsck = git([
    "-C",
    repoRoot,
    "fsck",
    "--dangling",
    "--no-progress",
    "--connectivity-only",
    "--no-reflogs",
  ]);
  if (!fsck.ok && fsck.stdout.trim() === "") {
    return [];
  }

  const shas: string[] = [];
  for (const line of lines(fsck.stdout)) {
    const match = /^dangling commit ([0-9a-f]{40})$/.exec(line);
    const sha = match?.[1];
    if (sha && !alreadyReported.has(sha)) {
      shas.push(sha);
    }
  }
  if (shas.length === 0) {
    return [];
  }

  const details = git([
    "-C",
    repoRoot,
    "log",
    "--no-walk",
    "--format=%H%x09%cI%x09%an%x09%s",
    ...shas,
  ]);
  if (!details.ok) {
    return [];
  }

  const commits: OrphanCommit[] = [];
  for (const line of lines(details.stdout)) {
    const [commit, date, author, ...subject] = line.split("\t");
    if (!commit) {
      continue;
    }
    commits.push({
      commit,
      date: date ?? "",
      author: author ?? "",
      subject: subject.join("\t"),
      recoverableFromReflog: reflogNamed.has(commit),
    });
  }

  commits.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.commit.localeCompare(b.commit);
  });

  return commits.slice(0, MAX_REFLOG_ONLY_REPORTED);
}

function collectSubmodules(
  repoRoot: string,
  git: GitRunner,
): { applicable: boolean; submodules: SubmoduleInfo[] } {
  if (!existsSync(join(repoRoot, ".gitmodules"))) {
    return { applicable: false, submodules: [] };
  }

  const result = git(["-C", repoRoot, "submodule", "status"]);
  if (!result.ok) {
    return { applicable: true, submodules: [] };
  }

  const submodules: SubmoduleInfo[] = [];
  for (const line of result.stdout.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const marker = line[0];
    const rest = line.slice(1).trim();
    const [commit, path, ...describe] = rest.split(" ");
    if (!commit || !path) {
      continue;
    }
    const state: SubmoduleInfo["state"] =
      marker === "-"
        ? "uninitialized"
        : marker === "+"
          ? "modified"
          : marker === "U"
            ? "conflicted"
            : "ok";
    submodules.push({
      path,
      commit,
      state,
      describe: describe.length > 0 ? describe.join(" ") : null,
    });
  }

  submodules.sort((a, b) => a.path.localeCompare(b.path));
  return { applicable: true, submodules };
}

function collectLfs(repoRoot: string, git: GitRunner): LfsInfo {
  const declaredIn: string[] = [];
  for (const candidate of [
    ".gitattributes",
    join(".git", "info", "attributes"),
  ]) {
    const path = join(repoRoot, candidate);
    if (!existsSync(path)) {
      continue;
    }
    try {
      if (readFileSync(path, "utf8").includes("filter=lfs")) {
        declaredIn.push(candidate);
      }
    } catch {
      // Unreadable attributes file: treated as no declaration.
    }
  }

  if (declaredIn.length === 0) {
    return { applicable: false, toolAvailable: false, declaredIn: [] };
  }

  const version = git(["-C", repoRoot, "lfs", "version"]);
  return {
    applicable: true,
    toolAvailable: version.ok,
    declaredIn,
  };
}

function collectRemotes(repoRoot: string, git: GitRunner): RemoteInfo[] {
  const result = git(["-C", repoRoot, "remote", "-v"]);
  if (!result.ok) {
    return [];
  }
  const remotes = new Map<string, string | null>();
  for (const line of lines(result.stdout)) {
    const [name, url, kind] = line.split(/\s+/);
    if (!name) {
      continue;
    }
    if (!remotes.has(name) || kind === "(fetch)") {
      remotes.set(name, url ?? null);
    }
  }
  return [...remotes.entries()]
    .map(([name, fetchUrl]) => ({ name, fetchUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function collectGitState(options: CollectOptions): GitState {
  const git = options.git ?? runGit;
  const now = options.now ?? new Date();
  const remote = options.remote ?? "origin";
  const reflogDays = options.reflogDays ?? DEFAULT_REFLOG_DAYS;
  const staleFetchHours = options.staleFetchHours ?? DEFAULT_STALE_FETCH_HOURS;
  const errors: string[] = [];

  const requestedRoot = resolve(options.repoRoot);
  const topLevel = git(["-C", requestedRoot, "rev-parse", "--show-toplevel"]);
  if (!topLevel.ok) {
    return {
      repoRoot: requestedRoot,
      gitDir: "",
      commonDir: "",
      isRepository: false,
      defaultBranch: {
        name: null,
        ref: null,
        source: "unresolved",
        verifiedAgainstRemote: false,
        remoteCacheAgeSeconds: null,
        caveat: null,
      },
      head: { detached: false, branch: null, commit: null },
      worktrees: [],
      stashes: [],
      branches: [],
      reflogOnlyCommits: [],
      unreachableCommits: [],
      unreachableScanned: false,
      submodules: [],
      submodulesApplicable: false,
      lfs: { applicable: false, toolAvailable: false, declaredIn: [] },
      remotes: [],
      collectionErrors: [`Not a git repository: ${requestedRoot}`],
    };
  }

  const repoRoot = resolve(topLevel.stdout.trim());
  const gitDirResult = git(["-C", repoRoot, "rev-parse", "--absolute-git-dir"]);
  const commonDirResult = git([
    "-C",
    repoRoot,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const gitDir = gitDirResult.ok ? gitDirResult.stdout.trim() : "";
  const commonDir = commonDirResult.ok ? commonDirResult.stdout.trim() : gitDir;

  const headCommitResult = git([
    "-C",
    repoRoot,
    "rev-parse",
    "--verify",
    "HEAD",
  ]);
  const headBranchResult = git([
    "-C",
    repoRoot,
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]);
  const head: HeadInfo = {
    detached: !headBranchResult.ok,
    branch: headBranchResult.ok ? headBranchResult.stdout.trim() : null,
    commit: headCommitResult.ok ? headCommitResult.stdout.trim() : null,
  };

  const remoteCacheAgeSeconds = newestFetchAgeSeconds(commonDir, now);
  const defaultBranch = resolveDefaultBranch(
    repoRoot,
    git,
    options,
    remote,
    remoteCacheAgeSeconds,
    staleFetchHours,
  );

  const { applicable: submodulesApplicable, submodules } = collectSubmodules(
    repoRoot,
    git,
  );

  const reflogOnlyCommits = collectReflogOnlyCommits(
    repoRoot,
    git,
    reflogDays,
    now,
  );
  const unreachableScanned = options.includeUnreachable === true;
  const unreachableCommits = unreachableScanned
    ? collectUnreachableCommits(
        repoRoot,
        git,
        new Set(reflogOnlyCommits.map((commit) => commit.commit)),
        collectAllReflogCommits(repoRoot, git),
      )
    : [];

  return {
    repoRoot,
    gitDir,
    commonDir,
    isRepository: true,
    defaultBranch,
    head,
    worktrees: collectWorktrees(repoRoot, git, errors),
    stashes: collectStashes(repoRoot, git),
    branches: collectBranches(repoRoot, git, defaultBranch, errors),
    reflogOnlyCommits,
    unreachableCommits,
    unreachableScanned,
    submodules,
    submodulesApplicable,
    lfs: collectLfs(repoRoot, git),
    remotes: collectRemotes(repoRoot, git),
    collectionErrors: errors,
  };
}
