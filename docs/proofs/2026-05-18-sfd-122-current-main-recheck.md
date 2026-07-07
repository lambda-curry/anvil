# 2026-05-18 proof fixture - SFD-122 current main still does not reproduce

## Fixture

- Repo: . (current main of lambda-curry/anvil)
- Commit under test: 51d8bbe189d70838ceb078da52747ac03269a01a
- Intent: verify whether SFD-122 still reproduces on today's live main, and check whether Loupe's claimed contradictory saved artifact is visible from this container
- Related issue: SFD-122

## Recheck command

    bun run scripts/audit.ts --target . --ci --output /tmp/anvil-cycle-2026-05-18-current/self-audit.md --artifacts-dir /tmp/anvil-cycle-2026-05-18-current/artifacts

Saved artifact:

- /tmp/anvil-cycle-2026-05-18-current/self-audit.md

## Observed summary-path lines

- ### ✅ Verdict: PASS
- | Issues found | none |
- | Remediation tasks | none |
- No remediation tasks generated.
- No process issues queued.

Absent from the report:

- no Fix first: line
- no Top 3 Actions section
- no split TOOLS.md cleanup lane in the summary path

## Contradictory artifact visibility

Checked from this same container:

- /tmp/anvil-cycle-2026-05-17-recheck-2/self-audit.md -> not present
- /tmp/anvil-cycle-2026-05-17-recheck/self-audit.md -> present and still clean
- /tmp/anvil-dc0a2b8-worktree/self-audit.md -> present and still clean

## Why this matters

The live product surface on current main still does not match the fan-out described in SFD-122. That means there is still no honest repo-side implementation lane to pick up from evidence visible in this container. The remaining gap is artifact reconciliation or principle-level arbitration, not another speculative report-generation pass.

## Supporting verification

- git rev-parse HEAD -> 51d8bbe189d70838ceb078da52747ac03269a01a
- find /tmp -maxdepth 3 \( -path '/tmp/anvil-cycle-2026-05-17-recheck-2/self-audit.md' -o -path '/tmp/anvil-cycle-2026-05-17-recheck/self-audit.md' -o -path '/tmp/anvil-dc0a2b8-worktree/self-audit.md' -o -path '/tmp/anvil-cycle-2026-05-17-current/self-audit.md' \) -type f | sort
