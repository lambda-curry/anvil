# Saffron Starter alpha.5 proof packet — 2026-07-05

- Repo: `saffron-starter`
- Commit audited: `631f9845427613a2cd8dc17f5fc67f28cee4589b`
- Verdict: `PASS`
- Score pair: Structural `94/100`; Guardrail `19/35` (`Reliable`)

## Exact Command

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.5 audit --target . --ci --output ./anvil-audit.md
```

## First Fix Named

`Add Why sections to canonical rules`

## Owner Verdict

`generic`

Why: the suggestion is directionally correct, but on a repo that already passes at `94/100` it reads like maintenance polish rather than the first change the owner would reach for next.

## Saved Artifacts

- Report: [`artifacts/saffron-starter-2026-07-05/anvil-audit.md`](./artifacts/saffron-starter-2026-07-05/anvil-audit.md)
- Drift report: [`artifacts/saffron-starter-2026-07-05/drift-report.md`](./artifacts/saffron-starter-2026-07-05/drift-report.md)
- Bootstrap draft: [`artifacts/saffron-starter-2026-07-05/bootstrap-draft.md`](./artifacts/saffron-starter-2026-07-05/bootstrap-draft.md)
