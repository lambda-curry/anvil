# Alpha.5 Internal Proof Pass — 2026-07-05

## Scope

This pass dogfooded the published `@lambdacurry/anvil@0.1.0-alpha.5` CLI across five Lambda Curry-owned repos:

- `saffron-starter`
- `watchtower`
- `atlas`
- `openclaw-forge`
- `podcast-platform`

Arbor was not mounted in this workspace, and `lc-classic-starter` was not available locally, so neither repo is included in this packet.

## Method

- Each repo ran from an isolated `/tmp/anvil-internal-proof-2026-07-05/<repo>` clone.
- Before the audit rerun, each temp clone's `origin` was reset to the repo's real GitHub URL so PR-derived theme mining stayed active.
- Exact audit command for every repo:

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.5 audit --target . --ci --output ./anvil-audit.md
```

## Repo Summary

| Repo | Commit | Score | First fix named | Verdict |
|------|--------|-------|-----------------|---------|
| `saffron-starter` | `631f984` | Structural `94/100`, Guardrail `19/35` | Add Why sections to canonical rules | `generic` |
| `watchtower` | `a0ec21c` | Structural `61/100`, Guardrail `16/35` | Restore Stage A structural trust → Mirror Sync Health | `real` |
| `atlas` | `3b12c36` | Structural `69/100`, Guardrail `16/35` | Restore Stage A structural trust → Validation Date Coverage | `generic` |
| `openclaw-forge` | `1f65e59` | Structural `50/100`, Guardrail `6/35` | Restore Stage A structural trust → Validation Date Coverage | `wrong` |
| `podcast-platform` | `73405e0` | Structural `65/100`, Guardrail `19/35` | Restore Stage A structural trust → Mirror Sync Health | `real` |

## Synthesis

The published alpha.5 build held up across all five repos: every run completed, produced a saved `./anvil-audit.md`, and kept Stage C's PR-derived theme checks active once the temp clone `origin` was restored.

The first-fix ranking looks strongest when Anvil points at concrete structural trust failures that can change agent behavior immediately. That showed up clearly on Watchtower and Podcast Platform, where mirror drift between agent instruction surfaces makes "fix the split source of truth first" feel like the right call.

The packet is less convincing when Stage A date hygiene outranks other sharper failures. Atlas feels only directionally right because the repo's broader rule-surface sprawl and orphaned generated surface are the more distinctive problems. OpenClaw Forge is the clearest miss: a repo with no enforcement layer should not lead with validation-date hygiene ahead of adding any hooks or CI guardrails.

Saffron Starter shows the other edge case: once a repo already passes strongly, the top recommendation degrades into hygiene polish. That is useful evidence for report quality because it shows where "first fix" starts sounding generic instead of outcome-linked.

## Next Move

- Return this packet and the SFE issue link to the Arbor decision thread.
- If this internal pass should feed product work, the sharpest follow-on appears to be improving first-fix ordering so missing enforcement can outrank freshness hygiene when the repo is still text-only.

## Packet Links

- [`2026-07-05-saffron-starter-alpha5-proof.md`](./2026-07-05-saffron-starter-alpha5-proof.md)
- [`2026-07-05-watchtower-alpha5-proof.md`](./2026-07-05-watchtower-alpha5-proof.md)
- [`2026-07-05-atlas-alpha5-proof.md`](./2026-07-05-atlas-alpha5-proof.md)
- [`2026-07-05-openclaw-forge-alpha5-proof.md`](./2026-07-05-openclaw-forge-alpha5-proof.md)
- [`2026-07-05-podcast-platform-alpha5-proof.md`](./2026-07-05-podcast-platform-alpha5-proof.md)
