# OpenClaw Forge alpha.5 proof packet — 2026-07-05

- Repo: `openclaw-forge`
- Commit audited: `1f65e590d370db63a4ffc68c54ce7b0a4f5b0eae`
- Verdict: `CRITICAL`
- Score pair: Structural `50/100`; Guardrail `6/35` (`Novice`)

## Exact Command

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.5 audit --target . --ci --output ./anvil-audit.md
```

## First Fix Named

`Restore Stage A structural trust` starting with `Validation Date Coverage`

## Owner Verdict

`wrong`

Why: this repo has no detected enforcement layer at all, so text-only rules without hooks or CI guardrails should outrank missing validation dates in the first-fix slot.

## Saved Artifacts

- Report: [`artifacts/openclaw-forge-2026-07-05/anvil-audit.md`](./artifacts/openclaw-forge-2026-07-05/anvil-audit.md)
- Drift report: [`artifacts/openclaw-forge-2026-07-05/drift-report.md`](./artifacts/openclaw-forge-2026-07-05/drift-report.md)
- Bootstrap draft: [`artifacts/openclaw-forge-2026-07-05/bootstrap-draft.md`](./artifacts/openclaw-forge-2026-07-05/bootstrap-draft.md)
