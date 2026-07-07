# SFE-403 proof — stale TOOLS cleanup collapses to one primary packet

## Why this exists

SFD-122 was stuck because Scout could not inspect Loupe's contradictory runtime artifact, while the current-main self-audit did not reproduce the claimed stale-TOOLS fan-out. This proof captures a shared-visible synthetic baseline for the exact one-file stale-rule case inside the repo itself.

## Repro shape

The regression test constructs one canonical TOOLS.md file with all four sibling hygiene symptoms on the same file:

- missing Last validated
- oversized always-on file
- missing Why section
- missing examples

Run:

```bash
bun test scripts/audit-report-format.test.ts scripts/audit-summary-layer.test.ts
```

## Observed summary-path result after the fix

The single stale-file case now collapses to one primary work packet instead of multiple pseudo-independent rows:

- Fix first: validate or split TOOLS.md so stale always-on guidance stops dominating the remediation path.
- | Issues found | 1 🟠 |
- | Remediation tasks | 1 🟠 |
- | 1 | Validate or split stale always-on rules | 🟠 hygiene | rules-maintainers | 2026-04-05 | +5 | +3 | TOOLS.md — missing Last validated + oversized always-on file + missing Why/failure mode + missing examples |

The report no longer emits separate remediation rows for:

- Add examples (DO/DON'T) to canonical rules
- Add Last validated dates
- Add Why sections to canonical rules
- Split oversized rules into focused files

## What changed

- scripts/audit.ts now suppresses sibling hygiene issues when a high-risk stale always-on packet already covers the same file-level cleanup lane.
- scripts/audit-report-format.test.ts now locks the one-stale-file PASS case so the summary, remediation pack, and process issue queue stay collapsed.

## Interpretation

This does not prove Loupe's historical tmp artifact byte-for-byte, but it does prove the disputed fan-out behavior was still reachable in Anvil's report logic on current main before SFE-403. The product now has a shared-visible regression harness and a landed fix for that one-file decision-surface failure mode.
