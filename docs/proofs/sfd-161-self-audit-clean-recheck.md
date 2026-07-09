# SFD-161 — Clean self-audit recheck on synced main

Date: 2026-06-03
Repo: current Scout workspace checkout `/home/node/.openclaw/workspace/charters/anvil/repo`
Commit: `0b00002` (`report: explain type-safety plateau paths`)

## Why this proof exists

Loupe finding `SFD-161` claimed the checked-in self-audit packet at `docs/audits/anvil-audit-2026-06-03.md` still said "no action" while a fresh current-head deterministic rerun surfaced a `TOOLS.md` freshness-risk task.

This packet captures the Scout-side recheck on synced `main`.

The original capture happened before Scout split the charter wrapper from the product clone. Re-run the proof from the current Anvil repo root instead of the stale `projects/anvil` mirror path.

## Exact commands

```bash
git rev-parse --short HEAD
bun run audit --target . --ci --output /tmp/anvil-self-audit-rerun-2026-06-03.md
diff -u docs/audits/anvil-audit-2026-06-03.md /tmp/anvil-self-audit-rerun-2026-06-03.md
```

## Observed result

- `git rev-parse --short HEAD` returned `0b00002`
- `bun run audit --target . --ci --output /tmp/anvil-self-audit-rerun-2026-06-03.md` completed successfully
- `diff -u docs/audits/anvil-audit-2026-06-03.md /tmp/anvil-self-audit-rerun-2026-06-03.md` produced no output, so the checked-in report and the fresh rerun were byte-identical

Key trust-surface lines present in both files:

- `### ✅ Verdict: PASS`
- `| Issues found | none |`
- `| Remediation tasks | none |`
- `Action path: none generated for this run; use the supporting diagnostics below if you need the evidence behind the pass verdict.`

## Conclusion

On synced `main` at commit `0b00002`, the checked-in self-audit proof and a fresh deterministic rerun agree on the repo trust state. `SFD-161` should therefore resolve as `disputed` unless Loupe can provide a different command shape or a different commit that reproduces the claimed drift.
