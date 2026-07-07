# 2026-05-17 proof fixture — clean audit no-work summary fix

## Fixture

- Repo: `.` (current `main` of `lambda-curry/anvil`)
- Intent: prove the clean-audit path no longer frames a no-work PASS report as a repo-side fix-first action
- Related issue: `SFE-359`

## Before

```bash
bun run scripts/audit.ts --target . --ci --output /tmp/anvil-cycle-2026-05-17/self-audit.md --artifacts-dir /tmp/anvil-cycle-2026-05-17/artifacts
```

Saved artifact:

- `/tmp/anvil-cycle-2026-05-17/self-audit.md`

Key summary-path lines before the fix:

- `### ✅ Verdict: PASS`
- `Structural Lint Score: **96/100** · Guardrail Score: **31/35** (Hardened)`
- `Fix first: Verify the remaining score delta is actionable.`
- `| Issues found | none |`
- `| Remediation tasks | none |`
- `No remediation tasks generated.`
- `No process issues queued.`

## After

```bash
bun run scripts/audit.ts --target . --ci --output /tmp/anvil-cycle-2026-05-17-fix/self-audit.md --artifacts-dir /tmp/anvil-cycle-2026-05-17-fix/artifacts
```

Saved artifact:

- `/tmp/anvil-cycle-2026-05-17-fix/self-audit.md`

Key summary-path lines after the fix:

- `### ✅ Verdict: PASS`
- `Structural Lint Score: **96/100** · Guardrail Score: **31/35** (Hardened)`
- no `Fix first:` line in the summary
- no `Top 3 Actions` section in the summary
- `| Issues found | none |`
- `| Remediation tasks | none |`
- `No remediation tasks generated.`
- `No process issues queued.`

## Why this closes the defect

The clean PASS path is internally consistent again:

- no repo-side work packet is reported
- the summary no longer invents a fix-first action
- the deeper report still keeps diagnostics and optional improvement context without pretending there is immediate repo-side remediation to do

## Regression coverage

- `bun run scripts/ai-synthesis.test.ts`
- `bun run scripts/audit-summary-layer.test.ts`
