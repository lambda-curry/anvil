# Drift Detection Report — sample-cli-repo — <DATE>

## Summary
- Path drift: 1 issues
- Missing symlink targets: 0 issues
- Glob drift: 0 issues (not implemented in Phase 1b)
- Command drift: 0 issues (not implemented in Phase 1b)
- Date drift: 1 issues
- Coverage gap: 0 issues (not implemented in Phase 2)
- **Skip dirs:** .git, .worktrees, node_modules, .next, .turbo, dist, build, .cache, generated, generated-workspaces, examples, templates, fixtures, __fixtures__, __snapshots__, .codex, coverage, docs-site, site, public, out

## Issues

### 🔴 High — Path Drift
**File:** AGENTS.md:12
**Detail:** Path reference not found: `docs/missing.md`

### 🟡 Medium — Date Drift
**File:** TOOLS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD`

## Notes (Non-Drift References)

No non-drift reference notes.
