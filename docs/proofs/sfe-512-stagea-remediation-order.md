# SFE-512 — Stage A remediation ordering proof

Date: 2026-06-01

## Observed defect before the fix

The saved Forge audit at [`docs/audits/openclaw-forge-audit-2026-05-27.md`](../audits/openclaw-forge-audit-2026-05-27.md) already said:

- `Fix first: restore Stage A structural trust before treating later scores as decision-grade.`

But its remediation pack still led with a later Stage D task:

1. `Rewrite or retire low-yield scoring rules`
2. `Validate or split stale always-on rules`
3. `Add Last validated dates to governance rules`

That contradicted the report's own first-action cue.

## Verification command

```bash
bun run scripts/audit.ts \
  --target /home/node/.openclaw/workspace/projects/openclaw-forge \
  --ci \
  --output /tmp/openclaw-forge-stagea-order-2026-06-01.md \
  --artifacts-dir /tmp/openclaw-forge-stagea-order-2026-06-01-artifacts
```

## Observed result after the fix

The regenerated report now aligns the remediation path with the Stage A fix-first cue:

- `Fix first: restore Stage A structural trust before treating later scores as decision-grade.`

Top actions:

1. `Restore Stage A structural trust`
2. `Add Last validated dates to governance rules`
3. `Rewrite or retire low-yield scoring rules`

Remediation pack:

1. `Add Last validated dates to governance rules`
2. `Rewrite or retire low-yield scoring rules`
3. `Validate or split stale always-on rules`

## Regression coverage

- `bun run scripts/audit-report-format.test.ts`
- `bun run scripts/audit-summary-layer.test.ts`
