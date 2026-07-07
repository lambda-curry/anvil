# SFE-513 — clean report action-path collapse proof

## Why this task existed

The saved clean PASS artifact [`docs/audits/anvil-audit-2026-05-27.md`](../audits/anvil-audit-2026-05-27.md) still rendered:

- `## Remediation Pack`
- `No remediation tasks generated.`
- `## Process Issue Queue`
- `No process issues queued.`

That forced readers through two empty action headings before the useful diagnostics, which weakens Anvil's "report as decision tool" goal when the correct outcome is simply "no formal action path."

## Change

- `scripts/audit.ts` now renders `Remediation Pack` only when remediation tasks exist.
- `scripts/audit.ts` now renders `Process Issue Queue` only when process issues exist.
- When both are empty, `### Diagnostic Navigation` carries one compact note instead:
  - `Action path: none generated for this run; use the supporting diagnostics below if you need the evidence behind the pass verdict.`
- `scripts/audit-report-format.test.ts` now locks that clean-report behavior in with explicit assertions for the missing headings and nav links.

## Verification

### Focused formatter coverage

```bash
bun test scripts/audit-report-format.test.ts scripts/__tests__/golden.test.ts
```

Result: pass.

### Real clean audit rerun

```bash
bun run ./scripts/audit.ts --target . --ci --output /tmp/anvil-sfe-513-clean-report.md
rg -n "^## Remediation Pack$|^## Process Issue Queue$|^### Diagnostic Navigation$|Action path: none generated|No remediation tasks generated|No process issues queued" /tmp/anvil-sfe-513-clean-report.md
```

Observed after the change:

- `### Diagnostic Navigation`
- `Action path: none generated for this run; use the supporting diagnostics below if you need the evidence behind the pass verdict.`

Observed absent after the change:

- `## Remediation Pack`
- `## Process Issue Queue`
- `No remediation tasks generated.`
- `No process issues queued.`
