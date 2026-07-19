# SFD-271 — first-run output contract recheck

**Date:** 2026-07-19 04:22 CT
**Package:** `@lambdacurry/anvil@0.1.0-alpha.6`
**Target:** current `lambda-curry/anvil` checkout at `5679390`

## Exact smoke command

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.6 audit \
  --target . \
  --ci \
  --output /tmp/sfd-271-anvil-audit.md
```

## Observed result

- Exit code: `0`
- Terminal output showed progress and ended with a concise score summary.
- The full Markdown report was written to the named path; it was not printed to stdout.
- The saved report contained 382 lines and began with `# Anvil Audit — repo`.

Terminal finish:

```text
✅ Structural Lint Score: 98/100 (4.9/5)
✅ Guardrail Readiness Score: 35/35 (Hardened)
✅ Audit report written: /tmp/sfd-271-anvil-audit.md
```

## Documentation disposition

The public First Audit page now describes the observed terminal summary plus saved-report behavior, names the default `docs/audits/<repo>-audit-<date>.md` path, and explains that `--output` selects a path rather than enabling report saving. The public proof packet now presents only the current pinned `0.1.0-alpha.6` story; the unqualified alpha.5 cue was removed.
