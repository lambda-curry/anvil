---
title: CLI Reference
description: Complete Anvil CLI command reference
---

## Global flags

| Flag | Description |
|---|---|
| `--help` | Show usage information |
| `--version` | Print current version |

## `anvil audit`

Run a full rule audit against a target repo.

```bash
anvil audit --target ./my-repo [options]
```

| Option | Description |
|---|---|
| `--target <path>` | Path to the repo to audit (required) |
| `--output <path>` | Save report to a file |
| `--artifacts-dir <dir>` | Write drift and bootstrap artifacts to this directory |
| `--json` | Output JSON instead of a markdown report |
| `--ci` | Deterministic local-only structural lint mode (skips AI synthesis) |
| `--ai-provider <provider>` | AI provider: `auto` \| `openai` \| `codex-cli` \| `claude-code` \| `gemini-cli` \| `opencode` \| `heuristic` |
| hidden alias: `--no-ai` | Deprecated compatibility alias for `--ci` |
| `--ai-model <model>` | Model to use for synthesis (e.g., `gpt-4o`) |
| `--ai-timeout-ms <ms>` | Set the AI synthesis timeout in milliseconds |

Relative `--target` paths resolve from your current shell cwd.

If you arrived here from the external first-user proof docs, use the exact pinned command from that packet. The current `0.1.0-alpha.15` packet uses the public `--ci` spelling; `--no-ai` remains only as a deprecated compatibility alias.

## `anvil drift`

Detect drift in rule surfaces.

```bash
anvil drift --target ./my-repo [options]
```

| Option | Description |
|---|---|
| `--target <path>` | Path to the repo to scan (required) |
| `--output <file>` | Write report to a specific path |
| `--skip-dirs <dir1,dir2,...>` | Comma-separated directory names to exclude from scanning |

Checks path existence, glob pattern resolution, broken symlinks, validation dates, and command availability.
The positional form `anvil drift ./my-repo` remains supported for compatibility.

## `anvil bootstrap`

Generate starter rule sets from tech stack analysis.

```bash
anvil bootstrap --target ./my-repo --output ./bootstrap-draft.md
```

Reads `package.json`, `tsconfig.json`, and framework configs to generate tailored starter rules.
The positional form `anvil bootstrap ./my-repo` remains supported for compatibility.

## `anvil repo audit`

Report the Git state of a repository. Strictly read-only.

```bash
anvil repo audit --target ./my-repo [options]
```

| Option | Description |
|---|---|
| `--target <path>` | Repository to audit (default: current directory) |
| `--json` | Emit the deterministic JSON report instead of human output |
| `--ci` | Exit non-zero when findings reach the `--fail-on` level |
| `--fail-on <level>` | `high`, `medium`, `low`, or `info` (default: `high`) |
| `--verify-remote` | Query the remote to confirm the canonical default branch |
| `--include-unreachable` | Also fsck for commits reachable from no ref or reflog (slower) |
| `--remote <name>` | Remote to resolve the default branch from (default: `origin`) |
| `--default-branch <name>` | Skip detection and treat this branch as the default |
| `--reflog-days <n>` | Reflog window for unreachable commits (default: `30`) |
| `--stale-fetch-hours <n>` | Age at which cached remote refs are called stale (default: `24`) |
| `--output <file>` | Also write the report to this path |

**This command never writes to the repository it inspects.** It does not merge, reset, check out, stash, drop, delete branches, remove worktrees, prune, push, or reconcile anything. Every git invocation passes through an allowlist that refuses mutating subcommands, and `--no-optional-locks` keeps even `status` from refreshing the index.

Exit codes: `0` clean, or findings without `--ci`; `1` findings at or above `--fail-on` with `--ci`; `2` usage error or unreadable repository.

### What it reports

| Finding code | Meaning | Severity |
|---|---|---|
| `GIT_MERGE_CONFLICT` | Unresolved conflicts in a worktree | high |
| `GIT_OPERATION_IN_PROGRESS` | Interrupted merge, rebase, am, cherry-pick, revert, or bisect | high |
| `GIT_DETACHED_HEAD` | HEAD is detached (see below) | high when at risk, else low |
| `GIT_BRANCH_DIVERGED_FROM_UPSTREAM` | Branch is both ahead of and behind its upstream | high |
| `GIT_SUBMODULE_CONFLICTED` | Submodule has merge conflicts | high |
| `GIT_LFS_TOOL_MISSING` | LFS filters are declared but `git-lfs` is absent | high |
| `GIT_UNCOMMITTED_CHANGES` | Staged or unstaged modifications | medium |
| `GIT_STASH_ENTRIES` | Stashes exist — invisible in status, PRs, and sync reports | medium |
| `GIT_REFLOG_ONLY_COMMITS` | Recent commits reachable only from the reflog; recoverable by selector until the reflog expires | medium |
| `GIT_UNREACHABLE_COMMITS` | Commits reachable from no branch, tag, or remote ref (requires `--include-unreachable`) | medium |
| `GIT_BRANCH_UNRELATED_HISTORY` | Branch shares no merge base with the default branch | medium |
| `GIT_BRANCH_NO_UPSTREAM` | Branch holds commits that exist only in this clone | medium |
| `GIT_BRANCH_UPSTREAM_GONE` | Tracked upstream no longer exists on the remote | medium |
| `GIT_BRANCH_AHEAD_OF_UPSTREAM` | Unpushed commits | medium |
| `GIT_NO_REMOTE` | No remote configured | medium |
| `GIT_SUBMODULE_UNINITIALIZED` / `GIT_SUBMODULE_MODIFIED` | Submodule not initialized, or checked out off-index | medium |
| `GIT_DEFAULT_BRANCH_UNRESOLVED` | The canonical default could not be determined | medium |
| `GIT_BRANCH_NOT_ON_DEFAULT` | Branch has commits not reachable from the default branch | low |
| `GIT_UNTRACKED_FILES` | Untracked files present | low |
| `GIT_WORKTREE_PRUNABLE` / `GIT_WORKTREE_LOCKED` | Worktree registration is stale or locked | low |
| `GIT_DEFAULT_BRANCH_UNVERIFIED` | Default branch came from local state, not the remote | info, or low when stale |

Finding codes are a stable contract. New codes may be added; an existing code never changes meaning or spelling.

All worktrees are inspected, not just the one you invoked from — dirty state, detached HEADs, conflicts, and interrupted operations are reported per worktree.

### Detached HEAD is graded, not flagged

A detached HEAD is not itself a problem — `actions/checkout` produces one on every CI run, and so does `git checkout <tag>`. Reporting it as high severity would fail a default `--ci` gate on a healthy CI checkout.

So the severity depends on whether work is actually at risk. `high` when the worktree has uncommitted changes, or when HEAD's commit is reachable from no branch or tag; `low` when the tree is clean and the commit is reachable. The `details.atRisk` field carries the same distinction in JSON.

### Two populations of orphaned commits

The two codes answer different questions, and neither subsumes the other:

- **`GIT_REFLOG_ONLY_COMMITS`** — walks the reflog and reports commits within the `--reflog-days` window (default 30) that no ref can reach. Scanned by default, and cheap.
- **`GIT_UNREACHABLE_COMMITS`** — runs `git fsck --no-reflogs` and reports every commit no branch, tag, or remote ref can reach, *regardless of age*. Requires `--include-unreachable` because the fsck is slower.

The second is a strict superset by commit age, which matters: a commit older than `--reflog-days` is invisible to the first scan even though its reflog entry still exists. That gap is real — Anvil's own clone holds a July commit that the default scan does not surface.

Each reported commit carries `recoverableFromReflog`. `true` means `git reflog` can still retrieve it until the reflog expires (`gc.reflogExpire`, 90 days by default); `false` means the object store is the only thing holding it and the next `gc` is final. `details.beyondReflogRecovery` counts the `false` ones.

When the scan is skipped, both outputs say so — `dimensions.unreachableScan: "skipped"` in JSON and an explicit line in human output — so a clean report never silently implies that no unreachable commits exist.

### Default branch detection and its caveat

Detection runs offline by default and reports how it got its answer, in descending order of confidence: `remote-query` (only with `--verify-remote`), `remote-head-ref` (cached `refs/remotes/<remote>/HEAD`), `config` (`init.defaultBranch`, when it names a real branch), then `heuristic` (`main`, `master`, `trunk`, `develop`). Anything resolved without touching the remote carries a caveat naming the age of the cached refs, because a cached default can be stale or simply wrong. `--verify-remote` performs one read-only `ls-remote` and clears the caveat.

### Unrelated histories

When a branch shares no merge base with the default branch, ahead/behind counts degenerate into the two branches' total commit counts — a repository whose history was re-cut will report something like "519 ahead, 78 behind" and read as catastrophic divergence when nothing is wrong. This command detects that case and reports `GIT_BRANCH_UNRELATED_HISTORY` with the branch's own commit total instead, never a misleading ahead/behind pair.

### Submodules and LFS

Both dimensions are evaluated only when they apply — a repository with no `.gitmodules` and no `filter=lfs` declaration reports them as `not-applicable` rather than as passing checks.

## `anvil mine-pr`

Mine GitHub PR review comments for rule candidates.

```bash
anvil mine-pr owner/repo
```

Requires the GitHub CLI (`gh`) installed and authenticated. A `GITHUB_TOKEN` environment variable alone is not a supported fallback.

## Install methods

```bash
# Zero-install
bunx @lambdacurry/anvil <command>

# npm fallback
npx @lambdacurry/anvil <command>

# Global install
bun add -g @lambdacurry/anvil
anvil <command>
```
