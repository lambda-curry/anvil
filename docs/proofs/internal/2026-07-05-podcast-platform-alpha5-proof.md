# Podcast Platform alpha.5 proof packet — 2026-07-05

- Repo: `podcast-platform`
- Commit audited: `73405e08f63f7e3d758fd191b7be324b0e1841ef`
- Verdict: `CRITICAL`
- Score pair: Structural `65/100`; Guardrail `19/35` (`Reliable`)

## Exact Command

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.5 audit --target . --ci --output ./anvil-audit.md
```

## First Fix Named

`Restore Stage A structural trust` starting with `Mirror Sync Health`

## Owner Verdict

`real`

Why: the repo has a real drifted `AGENTS.md` / `CLAUDE.md` split, so repairing that source-of-truth break is more decision-useful than tuning later-stage rubric items first.

## Saved Artifacts

- Report: [`artifacts/podcast-platform-2026-07-05/anvil-audit.md`](./artifacts/podcast-platform-2026-07-05/anvil-audit.md)
- Drift report: [`artifacts/podcast-platform-2026-07-05/drift-report.md`](./artifacts/podcast-platform-2026-07-05/drift-report.md)
- Bootstrap draft: [`artifacts/podcast-platform-2026-07-05/bootstrap-draft.md`](./artifacts/podcast-platform-2026-07-05/bootstrap-draft.md)
