/**
 * Synthetic Git repositories for `anvil repo audit` tests.
 *
 * Anvil's own checkout has no stashes, submodules, LFS, merge conflicts,
 * detached HEADs, or interrupted operations, so those dimensions cannot be
 * covered by self-audit. These builders create real repositories on disk with
 * the state each test needs.
 *
 * The mutating git commands here are deliberate test setup. They use spawnSync
 * directly and never go through `runGit`, whose allowlist would reject them —
 * which is exactly the boundary this file exists on the far side of.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AUTHOR_ENV = {
  GIT_AUTHOR_NAME: "Anvil Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Anvil Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

export type GitRun = {
  status: number;
  stdout: string;
  stderr: string;
};

/** Runs any git command, including mutating ones. Test setup only. */
export function git(cwd: string, args: string[]): GitRun {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...AUTHOR_ENV },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function gitOrThrow(cwd: string, args: string[]): string {
  const result = git(cwd, args);
  if (result.status !== 0) {
    throw new Error(
      `fixture setup failed: git ${args.join(" ")}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

const createdDirs: string[] = [];

export function makeTempDir(prefix = "anvil-repo-audit-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

export function cleanupFixtures(): void {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (!dir) {
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

export function writeFile(
  root: string,
  relPath: string,
  content: string,
): void {
  const full = join(root, relPath);
  const parent = full.slice(0, full.lastIndexOf("/"));
  mkdirSync(parent, { recursive: true });
  writeFileSync(full, content, "utf8");
}

export function commitFile(
  root: string,
  relPath: string,
  content: string,
  message: string,
): string {
  writeFile(root, relPath, content);
  gitOrThrow(root, ["add", "--", relPath]);
  gitOrThrow(root, ["commit", "-m", message]);
  return gitOrThrow(root, ["rev-parse", "HEAD"]).trim();
}

/**
 * A repository with one commit on `main`, no remote, and deterministic identity.
 */
export function makeRepo(options: { defaultBranch?: string } = {}): string {
  const branch = options.defaultBranch ?? "main";
  const root = makeTempDir();
  gitOrThrow(root, ["init", "--initial-branch", branch, "--quiet"]);
  gitOrThrow(root, ["config", "user.name", "Anvil Fixture"]);
  gitOrThrow(root, ["config", "user.email", "fixture@example.invalid"]);
  gitOrThrow(root, ["config", "commit.gpgsign", "false"]);
  commitFile(root, "README.md", "# fixture\n", "chore: initial commit");
  return root;
}

/**
 * A bare repository usable as a remote, plus a clone wired to it with
 * `refs/remotes/origin/HEAD` recorded — the shape real default detection sees.
 */
export function makeRepoWithRemote(options: { defaultBranch?: string } = {}): {
  root: string;
  remote: string;
} {
  const branch = options.defaultBranch ?? "main";
  const origin = makeTempDir("anvil-repo-audit-origin-");
  gitOrThrow(origin, ["init", "--bare", "--initial-branch", branch, "--quiet"]);

  const seed = makeRepo({ defaultBranch: branch });
  gitOrThrow(seed, ["remote", "add", "origin", origin]);
  gitOrThrow(seed, ["push", "--quiet", "-u", "origin", branch]);

  const clone = makeTempDir("anvil-repo-audit-clone-");
  gitOrThrow(clone, ["clone", "--quiet", origin, "."]);
  gitOrThrow(clone, ["config", "user.name", "Anvil Fixture"]);
  gitOrThrow(clone, ["config", "user.email", "fixture@example.invalid"]);
  gitOrThrow(clone, ["config", "commit.gpgsign", "false"]);

  return { root: clone, remote: origin };
}

/** Leaves the repository with a real, unresolved merge conflict. */
export function createMergeConflict(root: string): void {
  const base = gitOrThrow(root, ["rev-parse", "HEAD"]).trim();
  commitFile(root, "conflict.txt", "ours\n", "feat: ours");
  gitOrThrow(root, ["checkout", "--quiet", "-b", "theirs", base]);
  commitFile(root, "conflict.txt", "theirs\n", "feat: theirs");
  gitOrThrow(root, ["checkout", "--quiet", "-"]);
  // Expected to fail: that failure is the fixture.
  git(root, ["merge", "--no-edit", "theirs"]);
}

/** Creates an orphaned commit reachable only from the reflog. */
export function createReflogOnlyCommit(root: string): string {
  const start = gitOrThrow(root, ["rev-parse", "HEAD"]).trim();
  const orphan = commitFile(
    root,
    "orphan.txt",
    "work that will be abandoned\n",
    "feat: soon to be unreachable",
  );
  gitOrThrow(root, ["reset", "--hard", "--quiet", start]);
  return orphan;
}

/**
 * Creates a commit reachable from neither a ref nor the reflog — the shape only
 * fsck finds, and the one a `gc` discards outright.
 *
 * `commit-tree` writes the object without moving any ref, so no reflog entry is
 * ever recorded. That is exactly how such commits arise in the wild after a
 * reflog expiry.
 */
export function createFullyUnreachableCommit(root: string): string {
  const head = gitOrThrow(root, ["rev-parse", "HEAD"]).trim();
  const tree = gitOrThrow(root, ["rev-parse", "HEAD^{tree}"]).trim();
  return gitOrThrow(root, [
    "commit-tree",
    tree,
    "-p",
    head,
    "-m",
    "feat: orphaned beyond the reflog",
  ]).trim();
}

/** Adds a submodule pointing at a second local repository. */
export function addSubmodule(root: string, name = "vendor/dep"): string {
  const dep = makeRepo();
  gitOrThrow(root, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "--quiet",
    dep,
    name,
  ]);
  gitOrThrow(root, ["commit", "-m", `chore: add ${name} submodule`]);
  return dep;
}

/** Declares LFS filters without requiring git-lfs to be installed. */
export function declareLfs(root: string): void {
  writeFile(
    root,
    ".gitattributes",
    "*.psd filter=lfs diff=lfs merge=lfs -text\n",
  );
  gitOrThrow(root, ["add", "--", ".gitattributes"]);
  gitOrThrow(root, ["commit", "-m", "chore: track psd files with lfs"]);
}
