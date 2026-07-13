# Watchtower alpha.5 proof packet — 2026-07-05

- Repo: `watchtower`
- Commit audited: `a0ec21ce416c09acb8aa051838903db2ee829d08`
- Verdict: `CRITICAL`
- Score pair: Structural `61/100`; Guardrail `16/35` (`Emerging`)

## Exact Command

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.5 audit --target . --ci --output ./anvil-audit.md
```

## First Fix Named

`Restore Stage A structural trust` starting with `Mirror Sync Health`

## Owner Verdict

`real`

Why: the repo is carrying a drifted `AGENTS.md` / `CLAUDE.md` mirror family, so fixing the split instruction surface is the highest-trust move before deeper rule or report work.

## Saved Artifacts

- Report: [`artifacts/watchtower-2026-07-05/anvil-audit.md`](./artifacts/watchtower-2026-07-05/anvil-audit.md)
- Drift report: [`artifacts/watchtower-2026-07-05/drift-report.md`](./artifacts/watchtower-2026-07-05/drift-report.md)
- Bootstrap draft: [`artifacts/watchtower-2026-07-05/bootstrap-draft.md`](./artifacts/watchtower-2026-07-05/bootstrap-draft.md)
