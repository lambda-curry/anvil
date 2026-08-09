---
title: Repository Audit
description: Report uncommitted work, stray worktrees, stashes, and interrupted Git operations before they cost you work
---

## What it is

`anvil repo audit` reports the Git state of a repository: what is uncommitted, what exists only on this machine, what is mid-operation, and what is about to be garbage collected. It answers "is it safe to act on this repo?" before you branch, merge, migrate, or hand the checkout to someone else.

It is **strictly read-only**. It never merges, resets, checks out, stashes, drops, deletes branches, removes worktrees, prunes, pushes, or reconciles anything. It tells you what it found and stops.

## Why it matters

The work that gets lost is rarely the work anyone was watching. It is a stash nobody remembers making, a branch that was never pushed, an orphaned commit left by a `reset --hard`, a half-finished rebase in a worktree you forgot you created. None of these appear in `git status` in the directory you happen to be standing in, and none of them appear in a pull request.

On a long-lived or shared checkout — a build host, a shared dev box, a machine running agents — that state accumulates silently until something destructive runs on top of it.

## Running it

```bash
# audit the current repo
bunx @lambdacurry/anvil repo audit

# audit somewhere else, and confirm the default branch against the remote
bunx @lambdacurry/anvil repo audit --target ./my-repo --verify-remote

# machine-readable, deterministic output
bunx @lambdacurry/anvil repo audit --json

# also hunt for commits that no ref and no reflog can reach (slower)
bunx @lambdacurry/anvil repo audit --include-unreachable
```

Full flag list: [CLI Reference](/anvil/reference/cli/#anvil-repo-audit).

## Reading the output

```
Repo audit: /path/to/repo
HEAD main · default main (remote-head-ref) · 2 worktree(s)
Caveat: Default branch was read from cached remote-tracking refs, not from the
remote; re-run with --verify-remote to confirm.

MED   GIT_STASH_ENTRIES  2 stash entry/entries exist; stashes appear in no
      status, PR, or sync report and carry no author.
LOW   GIT_UNTRACKED_FILES  7 untracked file(s) in /path/to/repo.

2 finding(s): 0 high, 1 medium, 1 low, 0 info · fail-on high · PASS
Not applicable to this repository: submodules, LFS.
```

Each line is one finding: severity, a stable code, and what was found. Codes are a contract — `GIT_STASH_ENTRIES` means the same thing in every version — so they are safe to grep for or alert on.

Dimensions that do not apply to the repository are named explicitly rather than silently passing. A repository with no submodules reports `not-applicable`, not "clean".

## Using it in CI

Without `--ci`, the command reports findings and exits `0` — it is a report, not a gate. Add `--ci` to make it a gate:

```bash
# fail the job on high-severity findings only (default)
anvil repo audit --ci

# stricter: any uncommitted work, stash, or unpushed branch fails
anvil repo audit --ci --fail-on medium
```

Exit codes are `0` clean, `1` findings at or above `--fail-on`, `2` usage error or unreadable repository. Because `2` is distinct, a broken invocation never looks like a clean repository.

## Finding the work that is actually about to be lost

A commit left behind by `git reset --hard` is still named by the reflog, so `git reflog` can get it back — until the reflog entry expires, at which point only the object store holds it and the next `gc` is final.

The audit scans for these two ways, because one scan cannot see everything:

- `GIT_REFLOG_ONLY_COMMITS` walks the reflog and reports what no ref can reach within the last `--reflog-days` (default 30). On by default, cheap.
- `GIT_UNREACHABLE_COMMITS` runs `git fsck` and reports everything no branch, tag, or remote ref can reach, **at any age**. Needs `--include-unreachable`.

The age limit on the first scan is the whole reason the second exists. Anvil's own repository holds an orphaned commit from July that the default scan does not surface, simply because it is older than 30 days. Each reported commit carries `recoverableFromReflog`, so you can tell "recoverable with `git reflog`" apart from "one `gc` away from gone".

Because the scan is opt-in, a run without it says so explicitly rather than letting a clean report imply there is nothing there:

```
Not checked: commits unreachable from refs and reflogs (pass --include-unreachable).
```

## Why a detached HEAD is usually fine

Every `actions/checkout` run leaves the runner on a detached HEAD, as does `git checkout v1.2.0`. Treating that as an error would make `--ci` useless.

What matters is whether the detachment is holding work that exists nowhere else. The audit reports `high` when the worktree has uncommitted changes or when HEAD's commit is reachable from no branch or tag, and `low` when the tree is clean and the commit is reachable from a ref.

## The default-branch caveat

Detecting "the default branch" offline is a guess dressed as a fact. A cached `origin/HEAD` can be stale, and `init.defaultBranch` describes what new repositories get, not what this one uses.

So the command reports *how* it resolved the default (`remote-query`, `remote-head-ref`, `config`, `heuristic`) and attaches a caveat naming the age of the cached refs whenever it did not ask the remote. `--verify-remote` makes one read-only `ls-remote` call and clears the caveat.

## Unrelated histories

If a branch shares no merge base with the default branch — a repository that was re-cut, an imported history, a squashed public release of a private tree — then ahead/behind counts collapse into the two branches' totals. You get "519 ahead, 78 behind", which reads like a disaster and means nothing.

`anvil repo audit` detects this and reports `GIT_BRANCH_UNRELATED_HISTORY` with the branch's own commit count, and deliberately omits the ahead/behind pair rather than printing numbers that would mislead you.
