# SFE-538 — Self-audit proof guard

Date: 2026-07-03
Repo: `/home/node/.openclaw/workspace/projects/anvil`
Checked-in audit packet: `docs/audits/anvil-audit-2026-07-02.md`

## Why this proof exists

`SFE-538` adds a repo-native reproducibility guard for Anvil's checked-in self-audit packet. The point is to prove one deterministic contract:

- a fresh `bun run audit --target . --ci` rerun still matches `docs/audits/anvil-audit-2026-07-02.md` after normalizing expected date-stamped metadata
- the checked-in packet still carries the trust-summary markers needed to compare it honestly
- the checked-in packet filename date matches the embedded `*Date:*` header instead of silently drifting
- a seeded mismatch fails loudly instead of silently drifting

## Exact commands

```bash
git rev-parse --short HEAD
bun test scripts/verify-self-audit-proof.test.ts
bun run verify:self-audit-proof
```

When a review dispute needs durable artifacts instead of terminal output, keep the fresh rerun packet and summary bundle:

```bash
bun run verify:self-audit-proof --retain-dir /tmp/anvil-self-audit-proof-bundle
```

## Observed result

- `git rev-parse --short HEAD` returned the merged-main head that already includes PR #58
- `bun test scripts/verify-self-audit-proof.test.ts` passed all 9 checks:
  - identical reports pass
  - day-over-day date/artifact-path changes normalize away
  - PR-mining summary count drift normalizes away
  - a changed `Issues found` row fails
  - a missing `Verdict` marker fails
  - a checked-in filename/date mismatch fails
  - `--retain-dir` resolves to an absolute bundle path
  - `--retain-dir` without a value fails fast
  - the proof guard doc stays pinned to the verifier's checked-in packet path
- `bun run verify:self-audit-proof --retain-dir /tmp/anvil-sfd162-workspace-retain-2026-06-07` passed on the live workspace copy
- a copied clean repo path still named `anvil` also passed the same verifier command with a retained bundle at `/tmp/anvil-sfd162-clean-verify-retain`
- the June 7 refresh also proves the verifier is no longer coupled to the workspace-only `TOOLS.md` projection or raw directory iteration order; the checked-in packet now stays stable across both the normal workspace repo and a clean copied repo path
- the June 8 report-text refresh kept that determinism intact: after updating the checked-in packet so tied `35/35` guardrail passes no longer name the same strongest and weakest lane, `bun run verify:self-audit-proof` still exited `0` on the live workspace copy
- the June 19 refresh caught two fresh trust drifts at once: this proof guard doc had fallen back to the older `anvil-audit-2026-06-04.md` packet name, and `docs/patterns/subagent-boundary-declaration.md` had aged past the 90-day validation threshold. After correcting both, the retained packet moved to `docs/audits/anvil-audit-2026-06-19.md` and `bun run verify:self-audit-proof` returned to exit `0`.
- the June 26 refresh closed a new continuity hole in the same proof surface: the retained packet contents had advanced to `*Date: 2026-06-24*` and `./artifacts/anvil-2026-06-24`, but the verifier still pointed at `anvil-audit-2026-06-19.md`. The retained packet now moves forward to `docs/audits/anvil-audit-2026-06-26.md`, and the verifier fails if a future checked-in packet's filename date no longer matches its embedded report date.
- the July 2 refresh moved the retained packet and verifier forward to `docs/audits/anvil-audit-2026-07-02.md` after the mirror-health formatter started naming the live `source-only` family directly. `bun run verify:self-audit-proof` now passes again against that packet, so the retained proof lane and the live formatter wording are back in sync.
- the July 3 recheck caught fresh same-head date drift on a clean repo copy still named `anvil`: `AGENTS.md` had aged past its 30-day validation threshold, which dropped the fresh rerun to `34/35` Guardrail Readiness with `Drift backlog | 1` even though the checked-in packet still advertised `35/35`. Refreshing `AGENTS.md` to `Last validated: 2026-07-03` returned `bun run verify:self-audit-proof --retain-dir /tmp/sfd-232-proof-refresh-retain` to exit `0`, so the retained July 2 packet stays truthful without needing to move forward again.

## Contract going forward

Use `bun run verify:self-audit-proof` as the narrow reproducibility check before claiming Anvil's checked-in self-audit packet is still current. The verifier now requires the checked-in packet filename date to match its embedded `*Date:*` header, then ignores only the rerun-vs-packet date stamp plus dated artifact-link paths for the substantive content compare. Every other diff still fails the proof lane. If it fails, treat the diff as the proof surface and either regenerate the checked-in packet or fix the repo drift it exposed. When another agent needs to inspect the exact same-head evidence, append `--retain-dir <path>` so the command leaves behind the checked-in packet, fresh rerun packet, verification summary, and any diff instead of deleting the temporary rerun on exit.
