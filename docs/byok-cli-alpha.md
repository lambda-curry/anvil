# BYOK CLI Alpha

## Purpose

`BYOK CLI Alpha` is the current outward-facing milestone tracked on PR #15. It should remain a small, shareable command-line artifact that external users can install, run locally, and understand without needing Scout-internal context.

This doc is now the review contract for that branch/PR: it defines what the alpha must prove before merge, not a future branch-planning note.

## Minimum artifact set

The alpha is only considered real when all of the following exist:

1. **Packaging / install path**
   - A documented way to install or run the CLI externally (`bunx`, npm-style install, or equivalent local install path).
   - Versioned entrypoint expectations that do not depend on private operator knowledge.

2. **User-facing CLI entrypoint flow**
   - A single obvious command users start with.
   - A minimal happy-path flow showing what the CLI expects, what it does locally, and what output a user should see.

3. **Getting-started docs**
   - README-quality setup and first-run instructions for an external operator.
   - Enough detail that a new user can get to a successful first command without reading project internals.

4. **BYOK trust-model docs**
   - A written explanation of which credentials stay local.
   - A written explanation of what Anvil sends, what it does not send, and what assumptions the alpha makes.
   - Explicit boundaries around user responsibility for key handling and local environment trust.

## Non-goals for this milestone

- Expanding charter-helper scope beyond this bounded CLI alpha.
- Turning Anvil into a broad framework before the CLI alpha is concrete.
- Shipping vague "CLI later" intent without an install path and trust-model document.

## Alpha work packages

PR #15 should stay legible by grouping the milestone into reviewable packages:

| Package | Deliverable | Minimum acceptance check |
|---|---|---|
| Packaging | external install/run path is documented and works in a clean environment | a new user can follow the install path without Scout-internal setup knowledge |
| Entrypoint | one obvious first command with a short happy-path example | first-run flow is visible in docs and matches the shipped CLI behavior |
| Getting started | README-quality setup + first successful command | external operator can reach a successful first command from repo docs alone |
| Trust model | explicit BYOK boundaries and credential-handling assumptions | docs clearly state what stays local, what is sent, and what is user-managed |
| First-run comparison evidence | paired local-only and AI-assisted example reports with a clear reading order | external evaluator can compare the baseline local report against the optional synthesis layer before enabling a provider |
| Paired-run interpretation rule | local-only and AI-assisted example runs preserve the same structural diagnosis; differences are explained as synthesis-layer additions | reviewer can tell what changed because AI was enabled vs. what was already true in the local audit baseline |

## Artifact layout

The alpha branch should produce a small outward-facing packet rather than scattered notes:

- `README.md` — install + first-run entrypoint for external users
- `docs/byok-cli-alpha.md` — milestone scope and review contract
- `docs/byok-trust-model.md` — explicit local-key / sent-data boundaries
- CLI entrypoint files/scripts needed to make the documented path real

## Paired-run review rule

The paired `--no-ai` and AI-assisted example reports should be reviewed in two passes:

1. **Structural pass:** confirm that the verdict, stage failures, score drivers, and remediation backbone are materially the same between the two runs.
2. **Synthesis pass:** treat recommendation differences as optional interpretation layered on top of the same local audit baseline.

Why this rule exists: the paired example audits showed that the high-signal structural findings stayed stable across both modes, while the main divergence appeared in the synthesized improvement section. External reviewers should be able to tell that enabling AI changes the recommendation layer, not the underlying local audit mechanics.

## Merge gate

BYOK CLI Alpha is ready to merge when PR #15 still satisfies the bounded artifact list above, the paired local-only / AI-assisted example packet remains reviewable, and the docs read like an external evaluator can complete a safe first run without Scout-internal context.

Practical reviewer questions:

- Can a new evaluator find one obvious first command from `README.md`?
- Does the packet keep the privacy-first `--no-ai` path legible before any provider setup?
- Do the trust-model and getting-started docs agree on what stays local vs what is optional provider traffic?
- Do the paired example reports make it clear what changed because AI was enabled versus what was already true in the local baseline?
- Is the milestone still a compact outward-facing deliverable rather than a pile of internal notes?
