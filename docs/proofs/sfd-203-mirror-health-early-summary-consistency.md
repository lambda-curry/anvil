# SFD-203 — Mirror health early-summary consistency proof

## What changed

Aligned Anvil's first mirror-health story across the live CLI segmentation log and the Stage A summary so `source-only` no longer appears as a surprise extra count later in the run.

## Reproduction

```bash
bun run scripts/audit.ts \
  --target scripts/__fixtures__/sample-cli-repo \
  --ci \
  --output /tmp/anvil-sample-audit-20260624-fixed.md
```

## Before

- Live CLI segmentation log: `Mirror sync: healthy=0, drifted=0, orphan projections=0`
- Stage A summary: `Mirror Sync Health: healthy=0, drifted=0, orphan projections=0, source-only=1`

That forced the operator to infer why Stage A suddenly had a wider mirror-health count than the earlier live output.

## After

- Live CLI segmentation log: `Mirror sync: healthy=0, drifted=0, orphan projections=0, source-only=1 (informational: detected source family without a matching copy)`
- Stage A summary: `Mirror Sync Health: healthy=0, drifted=0, orphan projections=0, source-only=1 (informational: detected source family without a matching copy)`

The early mirror-health story is now consistent, and the first read explicitly frames `source-only` as informational context rather than a newly detected sync failure.

## Verification

- `bun test scripts/audit-cli-mode.test.ts`
- `bun run scripts/audit-report-format.test.ts`
- `bun run scripts/audit.ts --target scripts/__fixtures__/sample-cli-repo --ci --output /tmp/anvil-sample-audit-20260624-fixed.md`
