import { afterAll, expect, test } from "bun:test";

import { collectGitState } from "./lib/git-state.ts";
import {
  buildReport,
  evaluateFindings,
  FINDING_CODES,
  type Finding,
  hasFindingAtOrAbove,
  renderHuman,
  renderJson,
  sortFindings,
} from "./lib/repo-audit.ts";
import {
  addSubmodule,
  cleanupFixtures,
  commitFile,
  createFullyUnreachableCommit,
  createMergeConflict,
  createReflogOnlyCommit,
  declareLfs,
  gitOrThrow,
  makeRepo,
  makeRepoWithRemote,
  makeTempDir,
  writeFile,
} from "./__tests__/git-fixtures.ts";

afterAll(() => {
  cleanupFixtures();
});

const STALE = { staleFetchHours: 24 };

function auditCodes(root: string, now?: Date): string[] {
  const state = collectGitState({ repoRoot: root, now });
  return evaluateFindings(state, STALE).map((finding) => finding.code);
}

function findingFor(
  root: string,
  code: string,
  now?: Date,
): Finding | undefined {
  const state = collectGitState({ repoRoot: root, now });
  return evaluateFindings(state, STALE).find(
    (finding) => finding.code === code,
  );
}

// ─── Individual dimensions ──────────────────────────────────────────────────

test("a clean synced clone produces no actionable findings", () => {
  const { root } = makeRepoWithRemote();
  const state = collectGitState({ repoRoot: root, verifyRemote: true });
  const findings = evaluateFindings(state, STALE);

  expect(findings).toEqual([]);
});

test("dirty, staged, and untracked state produce their own codes", () => {
  const { root } = makeRepoWithRemote();
  writeFile(root, "staged.txt", "new\n");
  gitOrThrow(root, ["add", "--", "staged.txt"]);
  writeFile(root, "untracked.txt", "loose\n");

  const codes = auditCodes(root);

  expect(codes).toContain(FINDING_CODES.uncommittedChanges);
  expect(codes).toContain(FINDING_CODES.untrackedFiles);
});

test("a clean detached HEAD on a reachable commit is low, not high", () => {
  // This is what actions/checkout produces on every CI run. Failing a default
  // --ci gate here would make the command useless in CI.
  const root = makeRepo();
  const first = gitOrThrow(root, ["rev-parse", "HEAD"]).trim();
  commitFile(root, "second.txt", "second\n", "feat: second");
  gitOrThrow(root, ["checkout", "--quiet", first]);

  const finding = findingFor(root, FINDING_CODES.detachedHead);

  expect(finding?.severity).toBe("low");
  expect(finding?.details.atRisk).toBe(false);
  expect(finding?.message).toContain("reachable from a branch or tag");
});

test("a detached HEAD with uncommitted changes is high", () => {
  const root = makeRepo();
  const first = gitOrThrow(root, ["rev-parse", "HEAD"]).trim();
  commitFile(root, "second.txt", "second\n", "feat: second");
  gitOrThrow(root, ["checkout", "--quiet", first]);
  writeFile(root, "README.md", "# edited while detached\n");

  const finding = findingFor(root, FINDING_CODES.detachedHead);

  expect(finding?.severity).toBe("high");
  expect(finding?.details.atRisk).toBe(true);
  expect(finding?.message).toContain("uncommitted changes");
});

test("a detached HEAD on a commit no ref can reach is high", () => {
  const root = makeRepo();
  gitOrThrow(root, ["checkout", "--quiet", "--detach"]);
  commitFile(root, "orphan.txt", "only here\n", "feat: detached work");

  const finding = findingFor(root, FINDING_CODES.detachedHead);

  expect(finding?.severity).toBe("high");
  expect(finding?.details.reachableFromRef).toBe(false);
  expect(finding?.message).toContain("reachable from no branch or tag");
});

test("a CI-shaped checkout passes the default --ci gate", () => {
  // Reproduces actions/checkout: fetch, then check out the remote-tracking ref.
  const { root } = makeRepoWithRemote();
  gitOrThrow(root, [
    "checkout",
    "--quiet",
    "--force",
    "refs/remotes/origin/main",
  ]);
  const state = collectGitState({ repoRoot: root, verifyRemote: true });
  const report = buildReport(state, evaluateFindings(state, STALE), {
    failOn: "high",
  });

  expect(state.head.detached).toBe(true);
  expect(report.summary.bySeverity.high).toBe(0);
  expect(report.summary.passed).toBe(true);
});

test("merge conflicts and the interrupted operation are both reported", () => {
  const root = makeRepo();
  createMergeConflict(root);

  const codes = auditCodes(root);

  expect(codes).toContain(FINDING_CODES.mergeConflict);
  expect(codes).toContain(FINDING_CODES.operationInProgress);
  expect(findingFor(root, FINDING_CODES.mergeConflict)?.severity).toBe("high");
});

test("stashes are reported with their invisibility called out", () => {
  const root = makeRepo();
  commitFile(root, "file.txt", "v1\n", "feat: file");
  writeFile(root, "file.txt", "v2\n");
  gitOrThrow(root, ["stash", "push", "-m", "wip"]);

  const finding = findingFor(root, FINDING_CODES.stashEntries);

  expect(finding?.severity).toBe("medium");
  expect(finding?.message).toContain("no author");
  expect(finding?.details.count as number).toBe(1);
});

test("an unrelated-history branch reports totals, never ahead/behind", () => {
  const { root } = makeRepoWithRemote();
  gitOrThrow(root, ["checkout", "--quiet", "--orphan", "imported"]);
  gitOrThrow(root, ["rm", "-rf", "--quiet", "."]);
  commitFile(root, "imported.txt", "elsewhere\n", "feat: imported");
  gitOrThrow(root, ["checkout", "--quiet", "main"]);

  const finding = findingFor(root, FINDING_CODES.branchUnrelatedHistory);

  expect(finding).toBeDefined();
  expect(finding?.message).toContain("shares no common ancestor");
  expect(finding?.message).toContain("are not meaningful and are omitted");
  expect(finding?.details).not.toHaveProperty("ahead");
  expect(finding?.details).not.toHaveProperty("behind");
  // The message may name the concept, but must never state a count for it —
  // "519 ahead" on unrelated histories is the misleading output this avoids.
  expect(finding?.message).not.toMatch(/\d+\s+(ahead|behind)/);

  const codes = auditCodes(root);
  expect(codes).not.toContain(FINDING_CODES.branchNotOnDefault);
});

test("a local-only branch with no upstream is flagged as existing nowhere else", () => {
  const { root } = makeRepoWithRemote();
  gitOrThrow(root, ["checkout", "--quiet", "-b", "feature"]);
  commitFile(root, "feature.txt", "work\n", "feat: work");

  const finding = findingFor(root, FINDING_CODES.branchNoUpstream);

  expect(finding?.severity).toBe("medium");
  expect(finding?.message).toContain("only in this clone");
});

test("unpushed commits on a tracked branch are reported", () => {
  const { root } = makeRepoWithRemote();
  commitFile(root, "local.txt", "local\n", "feat: unpushed");

  const finding = findingFor(root, FINDING_CODES.branchAheadOfUpstream);

  expect(finding?.details.ahead).toBe(1);
});

test("reflog-only commits are reported as gc-prunable", () => {
  const root = makeRepo();
  const orphan = createReflogOnlyCommit(root);

  const finding = findingFor(root, FINDING_CODES.reflogOnlyCommits);

  expect(finding?.severity).toBe("medium");
  expect(finding?.message).toContain("garbage collection");
  expect(JSON.stringify(finding?.details)).toContain(orphan);
});

test("unreachable commits are found only when the scan is asked for", () => {
  const root = makeRepo();
  const orphan = createFullyUnreachableCommit(root);

  const withoutScan = collectGitState({ repoRoot: root });
  expect(withoutScan.unreachableScanned).toBe(false);
  expect(withoutScan.unreachableCommits).toEqual([]);
  expect(
    evaluateFindings(withoutScan, STALE).map((finding) => finding.code),
  ).not.toContain(FINDING_CODES.unreachableCommits);

  const withScan = collectGitState({
    repoRoot: root,
    includeUnreachable: true,
  });
  expect(withScan.unreachableScanned).toBe(true);
  expect(withScan.unreachableCommits.map((commit) => commit.commit)).toContain(
    orphan,
  );

  const finding = evaluateFindings(withScan, STALE).find(
    (item) => item.code === FINDING_CODES.unreachableCommits,
  );
  expect(finding?.severity).toBe("medium");
  expect(finding?.message).toContain("no branch, tag, or remote ref");
  // A commit written by commit-tree is named by no reflog either.
  expect(finding?.details.beyondReflogRecovery).toBe(1);
});

test("a commit outside the reflog window is still surfaced by the fsck scan", () => {
  // The gap that a reflog-window-only scan leaves: still named by a reflog, but
  // older than --reflog-days, so neither scan alone would report it.
  const root = makeRepo();
  const orphan = createReflogOnlyCommit(root);

  const narrow = collectGitState({
    repoRoot: root,
    reflogDays: 0,
    includeUnreachable: true,
  });

  expect(narrow.reflogOnlyCommits).toEqual([]);
  const found = narrow.unreachableCommits.find(
    (commit) => commit.commit === orphan,
  );
  expect(found).toBeDefined();
  expect(found?.recoverableFromReflog).toBe(true);
});

test("a skipped unreachable scan is disclosed, not silently omitted", () => {
  const { root } = makeRepoWithRemote();
  const state = collectGitState({ repoRoot: root });
  const report = buildReport(state, evaluateFindings(state, STALE), {
    failOn: "high",
  });

  expect(report.dimensions.unreachableScan).toBe("skipped");
  expect(renderHuman(report)).toContain("--include-unreachable");

  const scanned = collectGitState({ repoRoot: root, includeUnreachable: true });
  const scannedReport = buildReport(scanned, evaluateFindings(scanned, STALE), {
    failOn: "high",
  });
  expect(scannedReport.dimensions.unreachableScan).toBe("scanned");
  expect(renderHuman(scannedReport)).not.toContain("--include-unreachable");
});

test("reflog-recoverable commits are not double-reported as unreachable", () => {
  const root = makeRepo();
  const reflogOnly = createReflogOnlyCommit(root);

  const state = collectGitState({ repoRoot: root, includeUnreachable: true });

  expect(state.reflogOnlyCommits.map((commit) => commit.commit)).toContain(
    reflogOnly,
  );
  expect(state.unreachableCommits.map((commit) => commit.commit)).not.toContain(
    reflogOnly,
  );
});

test("a repository with no remote is flagged", () => {
  const root = makeRepo();
  expect(auditCodes(root)).toContain(FINDING_CODES.noRemote);
});

test("submodule and LFS findings appear only when those dimensions apply", () => {
  const { root: plain } = makeRepoWithRemote();
  const plainState = collectGitState({ repoRoot: plain });
  const plainReport = buildReport(
    plainState,
    evaluateFindings(plainState, STALE),
    { failOn: "high" },
  );

  expect(plainReport.dimensions.submodules).toBe("not-applicable");
  expect(plainReport.dimensions.lfs).toBe("not-applicable");

  const withSubmodule = makeRepo();
  addSubmodule(withSubmodule);
  const cloned = makeTempDir();
  gitOrThrow(cloned, [
    "-c",
    "protocol.file.allow=always",
    "clone",
    "--quiet",
    withSubmodule,
    ".",
  ]);

  expect(auditCodes(cloned)).toContain(FINDING_CODES.submoduleUninitialized);
});

test("declared LFS without the tool installed is a high finding", () => {
  const root = makeRepo();
  declareLfs(root);
  const state = collectGitState({ repoRoot: root });

  // Only assert the finding on machines without git-lfs; assert the dimension
  // is recognized either way.
  expect(state.lfs.applicable).toBe(true);
  const findings = evaluateFindings(state, STALE);
  const lfsFinding = findings.find(
    (finding) => finding.code === FINDING_CODES.lfsToolMissing,
  );
  if (state.lfs.toolAvailable) {
    expect(lfsFinding).toBeUndefined();
  } else {
    expect(lfsFinding?.severity).toBe("high");
  }
});

// ─── Default branch and freshness ───────────────────────────────────────────

test("an unverified default branch carries a freshness caveat", () => {
  const { root } = makeRepoWithRemote();
  const finding = findingFor(root, FINDING_CODES.defaultBranchUnverified);

  expect(finding).toBeDefined();
  expect(finding?.severity).toBe("info");
  expect(finding?.message).toContain("--verify-remote");
});

test("a stale remote cache raises the caveat above info", () => {
  const { root } = makeRepoWithRemote();
  const future = new Date(Date.now() + 72 * 3600 * 1000);

  const finding = findingFor(
    root,
    FINDING_CODES.defaultBranchUnverified,
    future,
  );

  expect(finding?.severity).toBe("low");
  expect(finding?.details.staleFetchHours).toBe(24);
});

test("--verify-remote removes the caveat finding entirely", () => {
  const { root } = makeRepoWithRemote();
  const state = collectGitState({ repoRoot: root, verifyRemote: true });
  const codes = evaluateFindings(state, STALE).map((finding) => finding.code);

  expect(codes).not.toContain(FINDING_CODES.defaultBranchUnverified);
});

test("an unresolvable default branch is a finding, not a crash", () => {
  const root = makeRepo({ defaultBranch: "release-line" });
  gitOrThrow(root, ["config", "init.defaultBranch", "no-such-branch"]);

  expect(auditCodes(root)).toContain(FINDING_CODES.defaultBranchUnresolved);
});

// ─── Output contracts ───────────────────────────────────────────────────────

test("JSON output is deterministic across runs on identical state", () => {
  const { root } = makeRepoWithRemote();
  writeFile(root, "untracked.txt", "loose\n");
  gitOrThrow(root, ["checkout", "--quiet", "-b", "feature"]);
  commitFile(root, "feature.txt", "work\n", "feat: work");
  gitOrThrow(root, ["checkout", "--quiet", "main"]);
  const now = new Date("2026-08-08T12:00:00Z");

  const render = (): string => {
    const state = collectGitState({ repoRoot: root, now });
    const findings = evaluateFindings(state, STALE);
    return renderJson(buildReport(state, findings, { failOn: "high" }));
  };

  expect(render()).toBe(render());
});

test("finding order is total and severity-major", () => {
  const findings: Finding[] = [
    {
      code: FINDING_CODES.untrackedFiles,
      severity: "low",
      subject: "b",
      message: "b",
      details: {},
    },
    {
      code: FINDING_CODES.mergeConflict,
      severity: "high",
      subject: "z",
      message: "z",
      details: {},
    },
    {
      code: FINDING_CODES.untrackedFiles,
      severity: "low",
      subject: "a",
      message: "a",
      details: {},
    },
    {
      code: FINDING_CODES.stashEntries,
      severity: "medium",
      subject: "m",
      message: "m",
      details: {},
    },
  ];

  const sorted = sortFindings(findings);
  expect(sorted.map((finding) => finding.severity)).toEqual([
    "high",
    "medium",
    "low",
    "low",
  ]);
  expect(sorted.slice(2).map((finding) => finding.subject)).toEqual(["a", "b"]);
  // Sorting must not mutate the input.
  expect(findings[0]?.subject).toBe("b");
});

test("the JSON report exposes the documented top-level shape", () => {
  const { root } = makeRepoWithRemote();
  const state = collectGitState({ repoRoot: root });
  const report = buildReport(state, evaluateFindings(state, STALE), {
    failOn: "high",
  });
  const parsed = JSON.parse(renderJson(report)) as Record<string, unknown>;

  expect(Object.keys(parsed)).toEqual([
    "schemaVersion",
    "repoRoot",
    "defaultBranch",
    "head",
    "worktreeCount",
    "dimensions",
    "summary",
    "findings",
  ]);
  expect(parsed.schemaVersion).toBe(1);
});

test("human output stays concise and names the codes", () => {
  const root = makeRepo();
  const state = collectGitState({ repoRoot: root });
  const findings = evaluateFindings(state, STALE);
  const text = renderHuman(buildReport(state, findings, { failOn: "high" }));

  expect(text).toContain("Repo audit:");
  expect(text).toContain(FINDING_CODES.noRemote);
  expect(text).toContain("Not applicable to this repository:");
  // One line per finding plus a small fixed frame — not a report document.
  expect(text.split("\n").length).toBeLessThan(findings.length + 12);
});

test("a clean repository says so in one line", () => {
  const { root } = makeRepoWithRemote();
  const state = collectGitState({ repoRoot: root, verifyRemote: true });
  const text = renderHuman(
    buildReport(state, evaluateFindings(state, STALE), { failOn: "high" }),
  );

  expect(text).toContain("No findings.");
});

// ─── CI threshold semantics ─────────────────────────────────────────────────

test("fail-on thresholds are inclusive and severity-ordered", () => {
  const medium: Finding[] = [
    {
      code: FINDING_CODES.stashEntries,
      severity: "medium",
      subject: "s",
      message: "m",
      details: {},
    },
  ];

  expect(hasFindingAtOrAbove(medium, "high")).toBe(false);
  expect(hasFindingAtOrAbove(medium, "medium")).toBe(true);
  expect(hasFindingAtOrAbove(medium, "low")).toBe(true);
  expect(hasFindingAtOrAbove([], "info")).toBe(false);
});

test("summary.passed tracks the configured threshold", () => {
  const root = makeRepo();
  commitFile(root, "file.txt", "v1\n", "feat: file");
  writeFile(root, "file.txt", "v2\n");
  gitOrThrow(root, ["stash", "push", "-m", "wip"]);
  const state = collectGitState({ repoRoot: root });
  const findings = evaluateFindings(state, STALE);

  expect(buildReport(state, findings, { failOn: "high" }).summary.passed).toBe(
    true,
  );
  expect(
    buildReport(state, findings, { failOn: "medium" }).summary.passed,
  ).toBe(false);
});

test("a rebase-merged branch is not reported as unmerged", () => {
  // Anvil's own repo reported eight branches as not-on-default; seven were
  // fully merged. A rebase or squash merge rewrites SHAs, so ancestry calls the
  // work unmerged forever while its patches sit on main.
  const { root } = makeRepoWithRemote();
  gitOrThrow(root, ["checkout", "--quiet", "-b", "feature"]);
  const sha = commitFile(root, "feature.txt", "work\n", "feat: the work");
  gitOrThrow(root, ["checkout", "--quiet", "main"]);
  // Move main first, so replaying the patch lands it under a NEW sha — without
  // this the cherry-pick reproduces the identical commit and nothing diverges.
  commitFile(root, "unrelated.txt", "other\n", "chore: unrelated");
  gitOrThrow(root, ["cherry-pick", sha]);

  const state = collectGitState({ repoRoot: root });
  const feature = state.branches.find((b) => b.name === "feature");

  expect(feature?.aheadOfDefault).toBeGreaterThan(0);
  expect(feature?.unappliedCommits).toBe(0);
  expect(evaluateFindings(state, STALE).map((f) => f.code)).not.toContain(
    FINDING_CODES.branchNotOnDefault,
  );
});

test("a genuinely unmerged branch is still reported", () => {
  // The guard against silencing the check entirely.
  const { root } = makeRepoWithRemote();
  gitOrThrow(root, ["checkout", "--quiet", "-b", "feature"]);
  commitFile(root, "feature.txt", "work\n", "feat: never landed");
  gitOrThrow(root, ["checkout", "--quiet", "main"]);

  const state = collectGitState({ repoRoot: root });
  const feature = state.branches.find((b) => b.name === "feature");

  expect(feature?.unappliedCommits).toBe(1);
  const finding = evaluateFindings(state, STALE).find(
    (f) => f.code === FINDING_CODES.branchNotOnDefault,
  );
  expect(finding?.message).toContain("no equivalent on");
});
