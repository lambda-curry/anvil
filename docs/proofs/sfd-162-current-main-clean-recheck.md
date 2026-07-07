# SFD-162 — Current-main clean self-audit recheck

Date: 2026-06-07
Repo: `/home/node/.openclaw/workspace/projects/anvil`
Verified head at capture: `7bc9da0`

## Why this proof exists

Loupe finding `SFD-162` claimed current `main` could still fail Anvil's self-audit rerun guard even when Scout's runtime passed the same command. This packet records the repo-side fix that made the proof lane deterministic again across both the live workspace repo and a clean copied repo path.

The concrete root cause turned out not to be a vague runtime split. Anvil's rule-surface discovery still counted tracked symlinked rule files whose targets lived outside the repo, so Scout's long-lived workspace picked up the projected root `TOOLS.md` while a clean repo copy did not. The audit output also still depended on raw directory iteration order for wildcard rule discovery and workflow scans.

## Exact commands

```bash
cd /home/node/.openclaw/workspace/projects/anvil
bun test scripts/__tests__/golden.test.ts
bun test scripts/verify-self-audit-proof.test.ts
bun run scripts/audit.ts --target . --ci --output docs/audits/anvil-audit-2026-06-07.md
bun run verify:self-audit-proof --retain-dir /tmp/anvil-sfd162-workspace-retain-2026-06-07

rm -rf /tmp/anvil-sfd162-clean-verify /tmp/anvil-sfd162-clean-verify-retain
mkdir -p /tmp/anvil-sfd162-clean-verify
cp -a /home/node/.openclaw/workspace/projects/anvil/. /tmp/anvil-sfd162-clean-verify/anvil/
cd /tmp/anvil-sfd162-clean-verify/anvil
bun run verify:self-audit-proof --retain-dir /tmp/anvil-sfd162-clean-verify-retain
```

## Observed result

- `bun test scripts/__tests__/golden.test.ts` passed, including the new regression that excludes rule-file symlinks that escape the repo root
- `bun test scripts/verify-self-audit-proof.test.ts` passed all 7 checks
- refreshed checked-in packet: `docs/audits/anvil-audit-2026-06-07.md`
- refreshed self-audit scores on current `main`:
  - Structural Lint: `98/100`
  - Guardrail Readiness: `35/35`
  - Issues found: `none`
  - Remediation tasks: `none`
- `bun run verify:self-audit-proof --retain-dir /tmp/anvil-sfd162-workspace-retain-2026-06-07` exited `0`
- `bun run verify:self-audit-proof --retain-dir /tmp/anvil-sfd162-clean-verify-retain` also exited `0` from the copied clean repo path still named `anvil`
- both retained bundles contain only passing checks and no `diff.txt`

## Conclusion

`SFD-162` is now a landed repo fix, not an unresolved runtime arbitration loop. The self-audit proof lane is repo-contained again:

- workspace-projected rule symlinks outside the repo no longer change the scoring surface
- wildcard rule discovery order is stable
- workflow-driven enforcement reporting order is stable

That means current `main` now tells one honest self-audit story across the normal workspace repo and a clean copied repo path.
