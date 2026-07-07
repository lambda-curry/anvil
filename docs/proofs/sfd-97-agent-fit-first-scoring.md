# SFD-97 proof fixture — agent-fit-first scoring

## Fixture

- Repo: `scripts/__fixtures__/tool-native-cursor-repo`
- Surface: two authored `.cursor/rules/*.mdc` files only
- Intent: model a repo that is genuinely tool-native and scoped for Cursor without pretending it also uses cross-agent governance files

## Commands

Baseline:

```bash
bun run scripts/audit.ts --target scripts/__fixtures__/tool-native-cursor-repo --ci --output docs/audits/tool-native-cursor-repo-audit-2026-05-10.md --artifacts-dir docs/audits/artifacts/tool-native-cursor-repo-2026-05-10
```

Implementation proof:

```bash
bun run scripts/audit.ts --target scripts/__fixtures__/tool-native-cursor-repo --ci --output docs/audits/tool-native-cursor-repo-audit-2026-05-11.md --artifacts-dir docs/audits/artifacts/tool-native-cursor-repo-2026-05-11
```

## Before vs after artifacts

- Baseline report: [`docs/audits/tool-native-cursor-repo-audit-2026-05-10.md`](../audits/tool-native-cursor-repo-audit-2026-05-10.md)
- Shipped report: [`docs/audits/tool-native-cursor-repo-audit-2026-05-11.md`](../audits/tool-native-cursor-repo-audit-2026-05-11.md)
- Shipped artifacts: [`docs/audits/artifacts/tool-native-cursor-repo-2026-05-11/`](../audits/artifacts/tool-native-cursor-repo-2026-05-11)

| Surface | 2026-05-10 baseline | 2026-05-11 shipped behavior |
|---|---|---|
| Stage B label | `Canonical Rule Helpfulness (Why/Examples/Size) | 0.4/1` | `Agent-Fit / Canonical Clarity | 0.8/1` |
| Stage D low-yield | `❌ fail | 2/2 scoring files miss Why or Examples` | `⚠️ warn | 2/2 scoring files miss Why or Examples; tool-native-first surface keeps this advisory while duplication/conflict/load stay healthy` |
| Action path tone | `Rewrite or retire low-yield scoring rules` | `Add rationale/examples to improve cross-tool portability` |

This is the intended change: not "no advice," but **different weighting and tone** for a repo whose real scoring surface is already tool-native and healthy.

## What changed

- `surfacePosture` now detects the fixture as `tool-native-first`
- Stage B weights agent-fit evidence ahead of governance-style clarity for that posture
- Stage D keeps missing `Why` / examples advisory when duplication, conflict, and context load stay healthy
- the remediation path now frames missing rationale/examples as portability uplift instead of a failure-first rewrite signal

## Why this fixture is enough

The fixture isolates the exact open question from GitHub issue `#48` and Linear issue `SFD-97`:

- not a nested discovery problem
- not an AI-default problem
- not a full-rubric redesign

It gives Anvil one concrete repo where the current model over-penalizes governance-style clarity and one concrete target report shape for the follow-up implementation.
