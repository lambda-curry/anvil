# Atlas alpha.5 proof packet — 2026-07-05

- Repo: `atlas`
- Commit audited: `3b12c36896f4e24510c0915ba74f47d9b06c1791`
- Verdict: `CRITICAL`
- Score pair: Structural `69/100`; Guardrail `16/35` (`Emerging`)

## Exact Command

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.5 audit --target . --ci --output ./anvil-audit.md
```

## First Fix Named

`Restore Stage A structural trust` starting with `Validation Date Coverage`

## Owner Verdict

`generic`

Why: validation dates matter, but they do not feel like Atlas's sharpest first move while the repo also shows wider rule-surface sprawl, low-yield files, and an orphan generated projection.

## Saved Artifacts

- Report: [`artifacts/atlas-2026-07-05/anvil-audit.md`](./artifacts/atlas-2026-07-05/anvil-audit.md)
- Drift report: [`artifacts/atlas-2026-07-05/drift-report.md`](./artifacts/atlas-2026-07-05/drift-report.md)
- Bootstrap draft: [`artifacts/atlas-2026-07-05/bootstrap-draft.md`](./artifacts/atlas-2026-07-05/bootstrap-draft.md)
