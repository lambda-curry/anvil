/**
 * Finding derivation and rendering for `anvil repo audit`.
 *
 * Finding codes are a public contract: they are what CI pipelines grep for and
 * what `--fail-on` thresholds are written against. Codes may be added, but an
 * existing code must never change meaning or spelling.
 *
 * This layer is intentionally generic Git hygiene. It has no concept of who owns
 * a branch, which session created a worktree, or what a fleet is — those belong
 * to the caller, not to the audit engine.
 */

import type { BranchInfo, GitState, WorktreeStatus } from "./git-state.ts";
import { formatAge } from "./git-state.ts";

export type Severity = "high" | "medium" | "low" | "info";

export const SEVERITY_ORDER: readonly Severity[] = [
  "high",
  "medium",
  "low",
  "info",
];

const SEVERITY_RANK: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/** Stable finding codes. Additive only — never repurpose one. */
export const FINDING_CODES = {
  defaultBranchUnresolved: "GIT_DEFAULT_BRANCH_UNRESOLVED",
  defaultBranchUnverified: "GIT_DEFAULT_BRANCH_UNVERIFIED",
  detachedHead: "GIT_DETACHED_HEAD",
  uncommittedChanges: "GIT_UNCOMMITTED_CHANGES",
  untrackedFiles: "GIT_UNTRACKED_FILES",
  mergeConflict: "GIT_MERGE_CONFLICT",
  operationInProgress: "GIT_OPERATION_IN_PROGRESS",
  stashEntries: "GIT_STASH_ENTRIES",
  worktreePrunable: "GIT_WORKTREE_PRUNABLE",
  worktreeLocked: "GIT_WORKTREE_LOCKED",
  branchNotOnDefault: "GIT_BRANCH_NOT_ON_DEFAULT",
  branchUnrelatedHistory: "GIT_BRANCH_UNRELATED_HISTORY",
  branchNoUpstream: "GIT_BRANCH_NO_UPSTREAM",
  branchUpstreamGone: "GIT_BRANCH_UPSTREAM_GONE",
  branchAheadOfUpstream: "GIT_BRANCH_AHEAD_OF_UPSTREAM",
  branchDivergedFromUpstream: "GIT_BRANCH_DIVERGED_FROM_UPSTREAM",
  reflogOnlyCommits: "GIT_REFLOG_ONLY_COMMITS",
  unreachableCommits: "GIT_UNREACHABLE_COMMITS",
  noRemote: "GIT_NO_REMOTE",
  submoduleUninitialized: "GIT_SUBMODULE_UNINITIALIZED",
  submoduleModified: "GIT_SUBMODULE_MODIFIED",
  submoduleConflicted: "GIT_SUBMODULE_CONFLICTED",
  lfsToolMissing: "GIT_LFS_TOOL_MISSING",
  collectionError: "GIT_COLLECTION_ERROR",
} as const;

export type FindingCode = (typeof FINDING_CODES)[keyof typeof FINDING_CODES];

export type Finding = {
  code: FindingCode;
  severity: Severity;
  /** What the finding is about: a worktree path, a branch name, or the repo. */
  subject: string;
  message: string;
  details: Record<string, unknown>;
};

export type RepoAuditReport = {
  schemaVersion: number;
  repoRoot: string;
  defaultBranch: {
    name: string | null;
    source: string;
    verifiedAgainstRemote: boolean;
    remoteCacheAge: string | null;
    caveat: string | null;
  };
  head: {
    detached: boolean;
    branch: string | null;
    commit: string | null;
  };
  worktreeCount: number;
  dimensions: {
    submodules: "applicable" | "not-applicable";
    lfs: "applicable" | "not-applicable";
    /** "skipped" means unreachable commits were not looked for, not that none exist. */
    unreachableScan: "scanned" | "skipped";
  };
  summary: {
    findingCount: number;
    bySeverity: Record<Severity, number>;
    failOn: Severity;
    passed: boolean;
  };
  findings: Finding[];
};

export const REPO_AUDIT_SCHEMA_VERSION = 1;

function describeWorktree(worktree: WorktreeStatus): string {
  return worktree.isPrimary ? `${worktree.path} (primary)` : worktree.path;
}

function branchLabel(branch: BranchInfo): string {
  return branch.name;
}

function evaluateWorktrees(state: GitState): Finding[] {
  const findings: Finding[] = [];

  for (const worktree of state.worktrees) {
    if (worktree.prunable) {
      findings.push({
        code: FINDING_CODES.worktreePrunable,
        severity: "low",
        subject: worktree.path,
        message: `Registered worktree is prunable: ${
          worktree.prunableReason ?? "git reports it as prunable"
        }.`,
        details: {
          path: worktree.path,
          missing: worktree.missing,
          reason: worktree.prunableReason,
        },
      });
      continue;
    }

    if (worktree.locked) {
      findings.push({
        code: FINDING_CODES.worktreeLocked,
        severity: "low",
        subject: worktree.path,
        message: `Worktree is locked${
          worktree.lockReason ? `: ${worktree.lockReason}` : ""
        }.`,
        details: { path: worktree.path, reason: worktree.lockReason },
      });
    }

    if (worktree.conflicted > 0) {
      findings.push({
        code: FINDING_CODES.mergeConflict,
        severity: "high",
        subject: worktree.path,
        message: `${worktree.conflicted} path(s) have unresolved merge conflicts in ${describeWorktree(
          worktree,
        )}.`,
        details: {
          path: worktree.path,
          conflicted: worktree.conflicted,
          paths: worktree.conflictedPaths,
        },
      });
    }

    if (worktree.operations.length > 0) {
      findings.push({
        code: FINDING_CODES.operationInProgress,
        severity: "high",
        subject: worktree.path,
        message: `Interrupted git operation in ${describeWorktree(worktree)}: ${worktree.operations
          .map((operation) => operation.kind)
          .join(", ")}.`,
        details: {
          path: worktree.path,
          operations: worktree.operations,
        },
      });
    }

    if (worktree.detached && !worktree.bare) {
      // A detached HEAD is not itself a problem — `actions/checkout` produces
      // one on every CI run, as does `git checkout <tag>`. It is a problem when
      // it holds work that exists nowhere else: uncommitted changes, or a
      // commit no branch or tag can reach.
      const hasLocalEdits =
        worktree.staged + worktree.unstaged + worktree.conflicted > 0;
      const orphanedCommit = worktree.headReachableFromRef === false;
      const atRisk = hasLocalEdits || orphanedCommit;
      const shortSha = worktree.headCommit?.slice(0, 12) ?? "an unknown commit";

      findings.push({
        code: FINDING_CODES.detachedHead,
        severity: atRisk ? "high" : "low",
        subject: worktree.path,
        message: atRisk
          ? `HEAD is detached at ${shortSha} in ${describeWorktree(worktree)} and holds work that exists nowhere else (${
              orphanedCommit
                ? "the commit is reachable from no branch or tag"
                : "there are uncommitted changes"
            }).`
          : `HEAD is detached at ${shortSha} in ${describeWorktree(worktree)}; the commit is reachable from a branch or tag and the tree is clean.`,
        details: {
          path: worktree.path,
          commit: worktree.headCommit,
          atRisk,
          reachableFromRef: worktree.headReachableFromRef,
          hasLocalEdits,
        },
      });
    }

    const tracked = worktree.staged + worktree.unstaged;
    if (tracked > 0) {
      findings.push({
        code: FINDING_CODES.uncommittedChanges,
        severity: "medium",
        subject: worktree.path,
        message: `${tracked} uncommitted change(s) in ${describeWorktree(worktree)} (${worktree.staged} staged, ${worktree.unstaged} unstaged).`,
        details: {
          path: worktree.path,
          staged: worktree.staged,
          unstaged: worktree.unstaged,
        },
      });
    }

    if (worktree.untracked > 0) {
      findings.push({
        code: FINDING_CODES.untrackedFiles,
        severity: "low",
        subject: worktree.path,
        message: `${worktree.untracked} untracked file(s) in ${describeWorktree(worktree)}.`,
        details: { path: worktree.path, untracked: worktree.untracked },
      });
    }
  }

  return findings;
}

function evaluateBranches(state: GitState): Finding[] {
  const findings: Finding[] = [];

  for (const branch of state.branches) {
    // Comparisons against the default are meaningless for the default itself,
    // but its upstream relationship still matters: unpushed commits on `main`
    // are exactly the work most likely to be assumed safe.
    if (!branch.isDefault && !branch.sharesHistoryWithDefault) {
      findings.push({
        code: FINDING_CODES.branchUnrelatedHistory,
        severity: "medium",
        subject: branchLabel(branch),
        message: `Branch \`${branch.name}\` shares no common ancestor with \`${state.defaultBranch.name}\`; ahead/behind counts are not meaningful and are omitted. It holds ${branch.totalCommits} commit(s) on an unrelated history.`,
        details: {
          branch: branch.name,
          commit: branch.commit,
          defaultBranch: state.defaultBranch.name,
          totalCommits: branch.totalCommits,
        },
      });
    } else if (
      !branch.isDefault &&
      (branch.aheadOfDefault ?? 0) > 0 &&
      // Ahead-of-default calls merged work unmerged forever once the merge
      // rewrote SHAs, which rebase and squash merges both do. Anvil's own repo
      // reported eight such branches, seven of them fully merged. Patch-id
      // equivalence is what separates them.
      branch.unappliedCommits !== 0
    ) {
      const unapplied = branch.unappliedCommits ?? branch.aheadOfDefault;
      findings.push({
        code: FINDING_CODES.branchNotOnDefault,
        severity: "low",
        subject: branchLabel(branch),
        message: `Branch \`${branch.name}\` has ${unapplied} commit(s) with no equivalent on \`${state.defaultBranch.name}\` (and is ${branch.behindDefault} behind).`,
        details: {
          branch: branch.name,
          ahead: branch.aheadOfDefault,
          unapplied: branch.unappliedCommits,
          behind: branch.behindDefault,
          defaultBranch: state.defaultBranch.name,
        },
      });
    }

    const hasLocalOnlyWork =
      !branch.isDefault &&
      (!branch.sharesHistoryWithDefault || (branch.aheadOfDefault ?? 0) > 0);

    if (!branch.upstream) {
      if (hasLocalOnlyWork) {
        findings.push({
          code: FINDING_CODES.branchNoUpstream,
          severity: "medium",
          subject: branchLabel(branch),
          message: `Branch \`${branch.name}\` has commits that are not on \`${state.defaultBranch.name}\` and has no upstream; that work exists only in this clone.`,
          details: { branch: branch.name, commit: branch.commit },
        });
      }
      continue;
    }

    if (branch.upstreamGone) {
      findings.push({
        code: FINDING_CODES.branchUpstreamGone,
        severity: "medium",
        subject: branchLabel(branch),
        message: `Upstream \`${branch.upstream}\` for branch \`${branch.name}\` no longer exists on the remote.`,
        details: { branch: branch.name, upstream: branch.upstream },
      });
      continue;
    }

    const ahead = branch.aheadOfUpstream ?? 0;
    const behind = branch.behindUpstream ?? 0;
    if (ahead > 0 && behind > 0) {
      findings.push({
        code: FINDING_CODES.branchDivergedFromUpstream,
        severity: "high",
        subject: branchLabel(branch),
        message: `Branch \`${branch.name}\` has diverged from \`${branch.upstream}\`: ${ahead} ahead, ${behind} behind.`,
        details: {
          branch: branch.name,
          upstream: branch.upstream,
          ahead,
          behind,
        },
      });
    } else if (ahead > 0) {
      findings.push({
        code: FINDING_CODES.branchAheadOfUpstream,
        severity: "medium",
        subject: branchLabel(branch),
        message: `Branch \`${branch.name}\` has ${ahead} commit(s) not pushed to \`${branch.upstream}\`.`,
        details: { branch: branch.name, upstream: branch.upstream, ahead },
      });
    }
  }

  return findings;
}

export function evaluateFindings(
  state: GitState,
  options: { staleFetchHours: number },
): Finding[] {
  const findings: Finding[] = [];

  for (const error of state.collectionErrors) {
    findings.push({
      code: FINDING_CODES.collectionError,
      severity: "low",
      subject: state.repoRoot,
      message: error,
      details: {},
    });
  }

  if (state.defaultBranch.source === "unresolved") {
    findings.push({
      code: FINDING_CODES.defaultBranchUnresolved,
      severity: "medium",
      subject: state.repoRoot,
      message:
        state.defaultBranch.caveat ??
        "The canonical default branch could not be determined.",
      details: { remotes: state.remotes.map((remote) => remote.name) },
    });
  } else if (!state.defaultBranch.verifiedAgainstRemote) {
    const age = state.defaultBranch.remoteCacheAgeSeconds;
    const stale = age === null || age / 3600 >= options.staleFetchHours;
    findings.push({
      code: FINDING_CODES.defaultBranchUnverified,
      severity: stale ? "low" : "info",
      subject: state.repoRoot,
      message:
        state.defaultBranch.caveat ??
        `Default branch \`${state.defaultBranch.name}\` was resolved from local state, not from the remote.`,
      details: {
        defaultBranch: state.defaultBranch.name,
        source: state.defaultBranch.source,
        remoteCacheAgeSeconds: age === null ? null : Math.floor(age),
        staleFetchHours: options.staleFetchHours,
      },
    });
  }

  if (state.remotes.length === 0) {
    findings.push({
      code: FINDING_CODES.noRemote,
      severity: "medium",
      subject: state.repoRoot,
      message:
        "No git remote is configured; every commit in this repository exists only on this machine.",
      details: {},
    });
  }

  findings.push(...evaluateWorktrees(state));
  findings.push(...evaluateBranches(state));

  if (state.stashes.length > 0) {
    findings.push({
      code: FINDING_CODES.stashEntries,
      severity: "medium",
      subject: state.repoRoot,
      message: `${state.stashes.length} stash entry/entries exist; stashes appear in no status, PR, or sync report and carry no author.`,
      details: {
        count: state.stashes.length,
        entries: state.stashes.map((stash) => ({
          ref: stash.ref,
          commit: stash.commit,
          message: stash.message,
        })),
      },
    });
  }

  if (state.reflogOnlyCommits.length > 0) {
    findings.push({
      code: FINDING_CODES.reflogOnlyCommits,
      severity: "medium",
      subject: state.repoRoot,
      message: `${state.reflogOnlyCommits.length} recent commit(s) are reachable only from the reflog and from no branch, tag, or worktree HEAD; a garbage collection will discard them.`,
      details: {
        count: state.reflogOnlyCommits.length,
        commits: state.reflogOnlyCommits.map((commit) => ({
          commit: commit.commit,
          subject: commit.subject,
          author: commit.author,
          date: commit.date,
          recoverableFromReflog: commit.recoverableFromReflog,
          selectors: commit.selectors,
        })),
      },
    });
  }

  if (state.unreachableCommits.length > 0) {
    const beyondReflog = state.unreachableCommits.filter(
      (commit) => !commit.recoverableFromReflog,
    ).length;
    findings.push({
      code: FINDING_CODES.unreachableCommits,
      severity: "medium",
      subject: state.repoRoot,
      message:
        `${state.unreachableCommits.length} commit(s) are reachable from no branch, tag, or remote ref` +
        (beyondReflog > 0
          ? `, and ${beyondReflog} of those are named by no reflog either — the next garbage collection discards them permanently.`
          : `; a reflog entry still names each of them, so \`git reflog\` can recover them until it expires.`),
      details: {
        count: state.unreachableCommits.length,
        beyondReflogRecovery: beyondReflog,
        commits: state.unreachableCommits,
      },
    });
  }

  for (const submodule of state.submodules) {
    if (submodule.state === "uninitialized") {
      findings.push({
        code: FINDING_CODES.submoduleUninitialized,
        severity: "medium",
        subject: submodule.path,
        message: `Submodule \`${submodule.path}\` is not initialized.`,
        details: { path: submodule.path, commit: submodule.commit },
      });
    } else if (submodule.state === "modified") {
      findings.push({
        code: FINDING_CODES.submoduleModified,
        severity: "medium",
        subject: submodule.path,
        message: `Submodule \`${submodule.path}\` is checked out at a commit that differs from the one recorded in the index.`,
        details: { path: submodule.path, commit: submodule.commit },
      });
    } else if (submodule.state === "conflicted") {
      findings.push({
        code: FINDING_CODES.submoduleConflicted,
        severity: "high",
        subject: submodule.path,
        message: `Submodule \`${submodule.path}\` has merge conflicts.`,
        details: { path: submodule.path, commit: submodule.commit },
      });
    }
  }

  if (state.lfs.applicable && !state.lfs.toolAvailable) {
    findings.push({
      code: FINDING_CODES.lfsToolMissing,
      severity: "high",
      subject: state.repoRoot,
      message: `This repository declares Git LFS filters (${state.lfs.declaredIn.join(", ")}) but git-lfs is not installed; tracked large files are pointer stubs, not content.`,
      details: { declaredIn: state.lfs.declaredIn },
    });
  }

  return sortFindings(findings);
}

/**
 * Total order over findings so that identical repository state always produces
 * byte-identical output.
 */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    if (a.code !== b.code) {
      return a.code.localeCompare(b.code);
    }
    if (a.subject !== b.subject) {
      return a.subject.localeCompare(b.subject);
    }
    return a.message.localeCompare(b.message);
  });
}

export function buildReport(
  state: GitState,
  findings: Finding[],
  options: { failOn: Severity },
): RepoAuditReport {
  const bySeverity: Record<Severity, number> = {
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const finding of findings) {
    bySeverity[finding.severity]++;
  }

  const age = state.defaultBranch.remoteCacheAgeSeconds;

  return {
    schemaVersion: REPO_AUDIT_SCHEMA_VERSION,
    repoRoot: state.repoRoot,
    defaultBranch: {
      name: state.defaultBranch.name,
      source: state.defaultBranch.source,
      verifiedAgainstRemote: state.defaultBranch.verifiedAgainstRemote,
      remoteCacheAge: age === null ? null : formatAge(age),
      caveat: state.defaultBranch.caveat,
    },
    head: {
      detached: state.head.detached,
      branch: state.head.branch,
      commit: state.head.commit,
    },
    worktreeCount: state.worktrees.length,
    dimensions: {
      submodules: state.submodulesApplicable ? "applicable" : "not-applicable",
      lfs: state.lfs.applicable ? "applicable" : "not-applicable",
      unreachableScan: state.unreachableScanned ? "scanned" : "skipped",
    },
    summary: {
      findingCount: findings.length,
      bySeverity,
      failOn: options.failOn,
      passed: !hasFindingAtOrAbove(findings, options.failOn),
    },
    findings,
  };
}

export function hasFindingAtOrAbove(
  findings: readonly Finding[],
  threshold: Severity,
): boolean {
  return findings.some(
    (finding) => SEVERITY_RANK[finding.severity] <= SEVERITY_RANK[threshold],
  );
}

/** Stable, sorted-key JSON so the same state always serializes identically. */
export function renderJson(report: RepoAuditReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  high: "HIGH",
  medium: "MED ",
  low: "LOW ",
  info: "INFO",
};

export function renderHuman(report: RepoAuditReport): string {
  const out: string[] = [];
  const head = report.head.detached
    ? `DETACHED at ${report.head.commit?.slice(0, 12) ?? "unknown"}`
    : (report.head.branch ?? "unknown");

  out.push(`Repo audit: ${report.repoRoot}`);
  out.push(
    `HEAD ${head} · default ${report.defaultBranch.name ?? "unresolved"} (${report.defaultBranch.source})` +
      ` · ${report.worktreeCount} worktree(s)`,
  );

  if (report.defaultBranch.caveat) {
    out.push(`Caveat: ${report.defaultBranch.caveat}`);
  }

  out.push("");

  if (report.findings.length === 0) {
    out.push("No findings. Working tree, branches, and worktrees are clean.");
  } else {
    for (const finding of report.findings) {
      out.push(
        `${SEVERITY_LABEL[finding.severity]}  ${finding.code}  ${finding.message}`,
      );
    }
    out.push("");
  }

  const counts = report.summary.bySeverity;
  out.push(
    `${report.summary.findingCount} finding(s): ` +
      `${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.info} info` +
      ` · fail-on ${report.summary.failOn} · ${report.summary.passed ? "PASS" : "FAIL"}`,
  );

  const skipped: string[] = [];
  if (report.dimensions.submodules === "not-applicable") {
    skipped.push("submodules");
  }
  if (report.dimensions.lfs === "not-applicable") {
    skipped.push("LFS");
  }
  if (skipped.length > 0) {
    out.push(`Not applicable to this repository: ${skipped.join(", ")}.`);
  }

  if (report.dimensions.unreachableScan === "skipped") {
    // Silence here would read as "no unreachable commits", which is a claim
    // this run did not make.
    out.push(
      "Not checked: commits unreachable from refs and reflogs (pass --include-unreachable).",
    );
  }

  return `${out.join("\n")}\n`;
}

export function isSeverity(value: string): value is Severity {
  return (SEVERITY_ORDER as readonly string[]).includes(value);
}
