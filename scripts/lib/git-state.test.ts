import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertReadOnlyGitArgs,
  collectGitState,
  MutatingGitCommandError,
  READ_ONLY_GIT_COMMANDS,
  runGit,
} from "./git-state.ts";
import {
  addSubmodule,
  cleanupFixtures,
  commitFile,
  createMergeConflict,
  createReflogOnlyCommit,
  declareLfs,
  git,
  gitOrThrow,
  makeRepo,
  makeRepoWithRemote,
  makeTempDir,
  writeFile,
} from "../__tests__/git-fixtures.ts";

afterAll(() => {
  cleanupFixtures();
});

// ─── Read-only contract ─────────────────────────────────────────────────────

test("every mutating git subcommand is refused by the allowlist", () => {
  const mutating = [
    ["merge", "other"],
    ["reset", "--hard", "HEAD~1"],
    ["checkout", "main"],
    ["switch", "main"],
    ["restore", "."],
    ["cherry-pick", "abc123"],
    ["revert", "abc123"],
    ["commit", "-m", "no"],
    ["push", "origin", "main"],
    ["fetch", "origin"],
    ["pull", "--rebase"],
    ["rebase", "main"],
    ["clean", "-fd"],
    ["gc", "--prune=now"],
    ["prune"],
    ["repack", "-ad"],
    ["update-ref", "refs/heads/main", "abc123"],
    ["branch", "-D", "feature"],
    ["tag", "-a", "v1", "-m", "v1"],
    ["add", "."],
    ["rm", "-r", "src"],
    ["apply", "patch.diff"],
    ["filter-branch"],
  ];

  for (const args of mutating) {
    expect(() => assertReadOnlyGitArgs(args)).toThrow(MutatingGitCommandError);
  }
});

test("dangerous subverbs of allowlisted commands are refused", () => {
  const refused = [
    ["worktree", "remove", "/tmp/wt"],
    ["worktree", "prune"],
    ["worktree", "add", "/tmp/wt"],
    ["stash", "pop"],
    ["stash", "drop"],
    ["stash", "clear"],
    ["stash", "push"],
    ["submodule", "update", "--init"],
    ["reflog", "expire", "--all"],
    ["reflog", "delete", "HEAD@{0}"],
    ["remote", "add", "origin", "url"],
    ["remote", "set-url", "origin", "url"],
    ["config", "user.name", "someone"],
    ["lfs", "prune"],
    ["lfs", "pull"],
  ];

  for (const args of refused) {
    expect(() => assertReadOnlyGitArgs(args)).toThrow(MutatingGitCommandError);
  }
});

test("fsck is readable but refused in its object-writing form", () => {
  expect(() =>
    assertReadOnlyGitArgs(["fsck", "--dangling", "--connectivity-only"]),
  ).not.toThrow();
  // --lost-found writes recovered objects into .git/lost-found/.
  expect(() => assertReadOnlyGitArgs(["fsck", "--lost-found"])).toThrow(
    MutatingGitCommandError,
  );
  expect(() =>
    assertReadOnlyGitArgs(["fsck", "--lost-found=/tmp/out"]),
  ).toThrow(MutatingGitCommandError);
});

test("symbolic-ref is readable but refused in its writing form", () => {
  expect(() =>
    assertReadOnlyGitArgs([
      "symbolic-ref",
      "--quiet",
      "refs/remotes/origin/HEAD",
    ]),
  ).not.toThrow();
  expect(() =>
    assertReadOnlyGitArgs([
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/main",
    ]),
  ).toThrow(MutatingGitCommandError);
});

test("the read-only commands the collector needs are allowlisted", () => {
  const used = [
    ["-C", "/repo", "rev-parse", "--show-toplevel"],
    ["-C", "/repo", "status", "--porcelain=v2", "--untracked-files=all"],
    ["-C", "/repo", "worktree", "list", "--porcelain"],
    ["-C", "/repo", "reflog", "show", "refs/stash"],
    ["-C", "/repo", "for-each-ref", "refs/heads"],
    ["-C", "/repo", "rev-list", "--count", "main"],
    ["-C", "/repo", "merge-base", "main", "feature"],
    ["-C", "/repo", "submodule", "status"],
    ["-C", "/repo", "remote", "-v"],
    ["-C", "/repo", "config", "--get", "init.defaultBranch"],
    ["-C", "/repo", "ls-remote", "--symref", "origin", "HEAD"],
    ["-C", "/repo", "lfs", "version"],
    ["-C", "/repo", "log", "--no-walk", "--format=%H"],
  ];

  for (const args of used) {
    expect(() => assertReadOnlyGitArgs(args)).not.toThrow();
  }
});

test("runGit refuses to execute a mutating command", () => {
  const repo = makeRepo();
  expect(() =>
    runGit(["-C", repo, "commit", "--allow-empty", "-m", "nope"]),
  ).toThrow(MutatingGitCommandError);
  // The refusal must be a refusal, not a warning: nothing was committed.
  const count = gitOrThrow(repo, ["rev-list", "--count", "HEAD"]).trim();
  expect(count).toBe("1");
});

test("the guarded runner is the only path from the audit to a subprocess", () => {
  // The read-only guarantee rests on every git call passing through runGit().
  // A second spawn site anywhere in the command path would bypass the allowlist,
  // so the structural invariant is: exactly one spawn, and it is inside runGit.
  const repoRoot = resolve(import.meta.dir, "..", "..");
  // Call sites only — the `import { spawnSync }` line is not an invocation.
  const spawnPattern = /(?:spawnSync|execSync|spawn)\s*\(|Bun\.spawn/g;

  const engine = readFileSync(
    resolve(repoRoot, "scripts/lib/git-state.ts"),
    "utf8",
  );
  const spawnSites = engine.match(spawnPattern) ?? [];
  expect(spawnSites).toHaveLength(1);

  const runGitBody =
    /export function runGit\([\s\S]*?\n\}/.exec(engine)?.[0] ?? "";
  expect(runGitBody).toContain("assertReadOnlyGitArgs(args)");
  expect(runGitBody).toContain("spawnSync");
  // The assertion must precede the spawn, not merely coexist with it.
  expect(runGitBody.indexOf("assertReadOnlyGitArgs")).toBeLessThan(
    runGitBody.indexOf("spawnSync"),
  );

  for (const source of ["scripts/lib/repo-audit.ts", "scripts/repo-audit.ts"]) {
    const text = readFileSync(resolve(repoRoot, source), "utf8");
    expect(`${source} spawns: ${(text.match(spawnPattern) ?? []).length}`).toBe(
      `${source} spawns: 0`,
    );
    expect(
      `${source} imports child_process: ${text.includes("child_process")}`,
    ).toBe(`${source} imports child_process: false`);
  }
});

test("auditing a repository leaves its git state byte-identical", () => {
  const { root } = makeRepoWithRemote();
  writeFile(root, "dirty.txt", "uncommitted\n");
  gitOrThrow(root, ["add", "--", "dirty.txt"]);
  writeFile(root, "untracked.txt", "untracked\n");

  const before = gitOrThrow(root, ["status", "--porcelain=v2", "--branch"]);
  const refsBefore = gitOrThrow(root, ["for-each-ref"]);
  const reflogBefore = gitOrThrow(root, ["reflog", "show", "HEAD"]);

  collectGitState({ repoRoot: root });

  expect(gitOrThrow(root, ["status", "--porcelain=v2", "--branch"])).toBe(
    before,
  );
  expect(gitOrThrow(root, ["for-each-ref"])).toBe(refsBefore);
  expect(gitOrThrow(root, ["reflog", "show", "HEAD"])).toBe(reflogBefore);
});

// ─── Collection ─────────────────────────────────────────────────────────────

test("a non-repository directory is reported, not thrown", () => {
  const dir = makeTempDir();
  const state = collectGitState({ repoRoot: dir });
  expect(state.isRepository).toBe(false);
  expect(state.collectionErrors[0]).toContain("Not a git repository");
});

test("default branch resolves from the recorded remote HEAD with a caveat", () => {
  const { root } = makeRepoWithRemote();
  const state = collectGitState({ repoRoot: root });

  expect(state.defaultBranch.name).toBe("main");
  expect(state.defaultBranch.source).toBe("remote-head-ref");
  expect(state.defaultBranch.verifiedAgainstRemote).toBe(false);
  expect(state.defaultBranch.caveat).toContain("--verify-remote");
});

test("--verify-remote confirms the default branch against the remote", () => {
  const { root } = makeRepoWithRemote({ defaultBranch: "trunk" });
  const state = collectGitState({ repoRoot: root, verifyRemote: true });

  expect(state.defaultBranch.name).toBe("trunk");
  expect(state.defaultBranch.source).toBe("remote-query");
  expect(state.defaultBranch.verifiedAgainstRemote).toBe(true);
  expect(state.defaultBranch.caveat).toBeNull();
});

test("init.defaultBranch resolves the default when it names a real branch", () => {
  const root = makeRepo({ defaultBranch: "mainline" });
  gitOrThrow(root, ["config", "init.defaultBranch", "mainline"]);

  const state = collectGitState({ repoRoot: root });

  expect(state.defaultBranch.name).toBe("mainline");
  expect(state.defaultBranch.source).toBe("config");
  expect(state.defaultBranch.caveat).toContain("init.defaultBranch");
});

test("a remoteless repository falls back to a named heuristic", () => {
  const root = makeRepo();
  // Pin the local value so the result cannot depend on the developer's global config.
  gitOrThrow(root, ["config", "init.defaultBranch", "no-such-branch"]);

  const state = collectGitState({ repoRoot: root });

  expect(state.defaultBranch.name).toBe("main");
  expect(state.defaultBranch.source).toBe("heuristic");
  expect(state.defaultBranch.caveat).toContain("guessed");
  expect(state.remotes).toEqual([]);
});

test("an unconventional default with no remote is reported as unresolved", () => {
  const root = makeRepo({ defaultBranch: "release-line" });
  gitOrThrow(root, ["config", "init.defaultBranch", "no-such-branch"]);

  const state = collectGitState({ repoRoot: root });

  expect(state.defaultBranch.name).toBeNull();
  expect(state.defaultBranch.source).toBe("unresolved");
});

test("dirty, staged, and untracked state is counted separately", () => {
  const root = makeRepo();
  commitFile(root, "tracked.txt", "v1\n", "feat: tracked");
  writeFile(root, "tracked.txt", "v2\n");
  writeFile(root, "staged.txt", "new\n");
  gitOrThrow(root, ["add", "--", "staged.txt"]);
  writeFile(root, "untracked.txt", "loose\n");

  const state = collectGitState({ repoRoot: root });
  const primary = state.worktrees[0];

  expect(primary?.staged).toBe(1);
  expect(primary?.unstaged).toBe(1);
  expect(primary?.untracked).toBe(1);
});

test("a detached HEAD is detected", () => {
  const root = makeRepo();
  const first = gitOrThrow(root, ["rev-parse", "HEAD"]).trim();
  commitFile(root, "second.txt", "second\n", "feat: second");
  gitOrThrow(root, ["checkout", "--quiet", first]);

  const state = collectGitState({ repoRoot: root });

  expect(state.head.detached).toBe(true);
  expect(state.head.branch).toBeNull();
  expect(state.head.commit).toBe(first);
  expect(state.worktrees[0]?.detached).toBe(true);
});

test("linked worktrees are enumerated with their own dirty state", () => {
  const root = makeRepo();
  const linked = `${makeTempDir()}/linked`;
  gitOrThrow(root, ["worktree", "add", "--quiet", "-b", "side", linked]);
  writeFile(linked, "side-work.txt", "in progress\n");

  const state = collectGitState({ repoRoot: root });

  expect(state.worktrees).toHaveLength(2);
  const side = state.worktrees.find((worktree) => worktree.branch === "side");
  expect(side?.untracked).toBe(1);
  expect(side?.isPrimary).toBe(false);
  expect(state.worktrees[0]?.isPrimary).toBe(true);
});

test("stashes are enumerated without invoking the stash command", () => {
  const root = makeRepo();
  commitFile(root, "file.txt", "v1\n", "feat: file");
  writeFile(root, "file.txt", "v2\n");
  gitOrThrow(root, ["stash", "push", "-m", "work in progress"]);

  const state = collectGitState({ repoRoot: root });

  expect(state.stashes).toHaveLength(1);
  expect(state.stashes[0]?.message).toContain("work in progress");
});

test("merge conflicts and the in-progress operation are both detected", () => {
  const root = makeRepo();
  createMergeConflict(root);

  const state = collectGitState({ repoRoot: root });
  const primary = state.worktrees[0];

  expect(primary?.conflicted).toBeGreaterThan(0);
  expect(primary?.operations.map((operation) => operation.kind)).toContain(
    "merge",
  );
});

test("an unrelated-history branch is flagged without ahead/behind counts", () => {
  const { root } = makeRepoWithRemote();
  gitOrThrow(root, ["checkout", "--quiet", "--orphan", "imported"]);
  gitOrThrow(root, ["rm", "-rf", "--quiet", "."]);
  commitFile(
    root,
    "imported.txt",
    "from elsewhere\n",
    "feat: imported history",
  );
  gitOrThrow(root, ["checkout", "--quiet", "main"]);

  const state = collectGitState({ repoRoot: root });
  const imported = state.branches.find((branch) => branch.name === "imported");

  expect(imported?.sharesHistoryWithDefault).toBe(false);
  expect(imported?.aheadOfDefault).toBeNull();
  expect(imported?.behindDefault).toBeNull();
  expect(imported?.totalCommits).toBeGreaterThan(0);
});

test("branch ahead/behind is measured against both default and upstream", () => {
  const { root } = makeRepoWithRemote();
  gitOrThrow(root, ["checkout", "--quiet", "-b", "feature"]);
  commitFile(root, "feature.txt", "work\n", "feat: feature work");

  const state = collectGitState({ repoRoot: root });
  const feature = state.branches.find((branch) => branch.name === "feature");

  expect(feature?.sharesHistoryWithDefault).toBe(true);
  expect(feature?.aheadOfDefault).toBe(1);
  expect(feature?.behindDefault).toBe(0);
  expect(feature?.upstream).toBeNull();
});

test("reflog-only commits are found and reachable commits are not", () => {
  const root = makeRepo();
  const orphan = createReflogOnlyCommit(root);
  const reachable = gitOrThrow(root, ["rev-parse", "HEAD"]).trim();

  const state = collectGitState({ repoRoot: root });
  const found = state.reflogOnlyCommits.map((commit) => commit.commit);

  expect(found).toContain(orphan);
  expect(found).not.toContain(reachable);
});

test("the reflog window bounds what is reported", () => {
  const root = makeRepo();
  createReflogOnlyCommit(root);

  expect(
    collectGitState({ repoRoot: root, reflogDays: 0 }).reflogOnlyCommits,
  ).toHaveLength(0);
  expect(
    collectGitState({ repoRoot: root, reflogDays: 30 }).reflogOnlyCommits
      .length,
  ).toBeGreaterThan(0);
});

test("a commit checked out only in a detached worktree is not called unreachable", () => {
  const root = makeRepo();
  const target = commitFile(root, "pinned.txt", "pinned\n", "feat: pinned");
  commitFile(root, "later.txt", "later\n", "feat: later");
  const linked = `${makeTempDir()}/detached`;
  gitOrThrow(root, ["worktree", "add", "--quiet", "--detach", linked, target]);

  const state = collectGitState({ repoRoot: root });

  expect(state.reflogOnlyCommits.map((commit) => commit.commit)).not.toContain(
    target,
  );
});

test("submodules are collected only when the repository has them", () => {
  const plain = makeRepo();
  expect(collectGitState({ repoRoot: plain }).submodulesApplicable).toBe(false);

  const withSubmodule = makeRepo();
  addSubmodule(withSubmodule);
  const state = collectGitState({ repoRoot: withSubmodule });

  expect(state.submodulesApplicable).toBe(true);
  expect(state.submodules[0]?.path).toBe("vendor/dep");
});

test("an uninitialized submodule is reported as uninitialized", () => {
  const root = makeRepo();
  addSubmodule(root);
  const clone = makeTempDir();
  gitOrThrow(clone, [
    "-c",
    "protocol.file.allow=always",
    "clone",
    "--quiet",
    root,
    ".",
  ]);

  const state = collectGitState({ repoRoot: clone });

  expect(state.submodules[0]?.state).toBe("uninitialized");
});

test("LFS is applicable only when filters are declared", () => {
  const plain = makeRepo();
  expect(collectGitState({ repoRoot: plain }).lfs.applicable).toBe(false);

  const lfsRepo = makeRepo();
  declareLfs(lfsRepo);
  const state = collectGitState({ repoRoot: lfsRepo });

  expect(state.lfs.applicable).toBe(true);
  expect(state.lfs.declaredIn).toContain(".gitattributes");
});

test("the collector reports a stale remote cache age", () => {
  const { root } = makeRepoWithRemote();
  const future = new Date(Date.now() + 72 * 3600 * 1000);

  const state = collectGitState({ repoRoot: root, now: future });

  expect(state.defaultBranch.remoteCacheAgeSeconds).toBeGreaterThan(48 * 3600);
  expect(state.defaultBranch.caveat).toContain("ago");
});

test("git subcommands the allowlist covers are spelled the way git accepts them", () => {
  // Guards against a typo'd allowlist key silently disabling a whole dimension.
  const repo = makeRepo();
  for (const subcommand of Object.keys(READ_ONLY_GIT_COMMANDS)) {
    if (subcommand === "lfs" || subcommand === "ls-remote") {
      continue; // needs an external tool / network
    }
    const probe = git(repo, [subcommand, "--help"]);
    expect(`${subcommand}:${probe.status === 0}`).toBe(`${subcommand}:true`);
  }
});
