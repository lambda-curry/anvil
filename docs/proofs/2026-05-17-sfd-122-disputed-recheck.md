# 2026-05-17 proof fixture — SFD-122 same-commit rechecks stay clean

## Fixture

- Repo: `.` (current `main` of `lambda-curry/anvil`)
- Commit under test: `dc0a2b8` (`fix: suppress synthetic clean-audit backlog`)
- Intent: verify whether `SFD-122` still reproduces on the exact commit Loupe cited in the 2026-05-17 signoff-withheld comment
- Related issue: `SFD-122`

## Recheck command

```bash
bun run scripts/audit.ts --target . --ci --output /tmp/anvil-cycle-2026-05-17-recheck/self-audit.md --artifacts-dir /tmp/anvil-cycle-2026-05-17-recheck/artifacts
```

Saved artifact:

- `/tmp/anvil-cycle-2026-05-17-recheck/self-audit.md`

## Observed summary-path lines

- `### ✅ Verdict: PASS`
- `Structural Lint Score: **96/100** · Guardrail Score: **31/35** (Hardened)`
- no `Fix first:` line in the summary
- no `Top 3 Actions` section in the summary
- `| Issues found | none |`
- `| Remediation tasks | none |`
- `No remediation tasks generated.`
- `No process issues queued.`

## Why this matters

This exact re-run does not show the fan-out Loupe reported at the same commit. The current repo state therefore does not present an honest implementation lane for `SFD-122`; the next step is reviewer reconciliation or artifact comparison, not more report-generation churn.

## Supporting verification

- `git rev-parse HEAD` → `dc0a2b82e40accd33a5cd878a48adf5a1809bbca`
- `bun test scripts/audit-summary-layer.test.ts scripts/ai-synthesis.test.ts scripts/first-user-proof-docs.test.ts`

## Follow-up: fair same-commit worktree repro preserving GitHub origin

The first clean-room retry needs one extra control: preserve the repo's real Git remote. A plain local-path clone rewrites `origin` to a filesystem path, which makes PR mining unavailable and injects a fake Stage C hygiene task unrelated to `SFD-122`.

Use a detached worktree from the original repo instead:

```bash
git -C /home/node/.openclaw/workspace/projects/anvil worktree add --detach /tmp/anvil-dc0a2b8-worktree dc0a2b82e40accd33a5cd878a48adf5a1809bbca
cd /tmp/anvil-dc0a2b8-worktree
git remote get-url origin
bun run scripts/audit.ts --target . --ci --output /tmp/anvil-dc0a2b8-worktree/self-audit.md --artifacts-dir /tmp/anvil-dc0a2b8-worktree/artifacts
```

Observed controls:

- `git rev-parse HEAD` → `dc0a2b82e40accd33a5cd878a48adf5a1809bbca`
- `git remote get-url origin` → `git@github.com:lambda-curry/anvil.git`

Observed summary-path lines from `/tmp/anvil-dc0a2b8-worktree/self-audit.md`:

- `### ✅ Verdict: PASS`
- `Structural Lint Score: **98/100** · Guardrail Score: **30/35** (Hardened)`
- `Fix first: Treat drift findings as active maintenance backlog.`
- `| Issues found | none |`
- `| Remediation tasks | none |`
- `No remediation tasks generated.`
- `No process issues queued.`

This same-commit, same-remote repro still does not show the four-way stale-`TOOLS.md` fan-out Loupe reported. The honest next move stays reviewer reconciliation or artifact comparison, not more repo-side implementation churn.
