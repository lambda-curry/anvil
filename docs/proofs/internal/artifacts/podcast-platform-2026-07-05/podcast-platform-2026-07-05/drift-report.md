# Drift Detection Report — podcast-platform — 2026-07-05

## Summary
- Scope: discovered rule files only (2 files)
- Path drift: 0 issues
- Missing symlink targets: 0 issues
- Glob drift: 0 issues (not implemented in Phase 1b)
- Command drift: 0 issues (not implemented in Phase 1b)
- Date drift: 2 issues
- Coverage gap: 0 issues (not implemented in Phase 2)
- **Skip dirs:** .git, .worktrees, node_modules, .next, .turbo, dist, build, .cache, generated, generated-workspaces, examples, templates, fixtures, __fixtures__, __snapshots__, .codex, coverage, docs-site, site, public, out

## Issues

### 🔴 High — Date Drift
**File:** AGENTS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: alwaysApply, threshold: 30 days)

### 🟡 Medium — Date Drift
**File:** CLAUDE.md
**Detail:** Validation date stale: 2026-03-09 (118 days old) exceeds pattern/doc threshold (90 days)

## Notes (Non-Drift References)

- AGENTS.md:29 — URL-like reference `github.com/lambda-curry/podcast-platform` looks external; not treated as local path drift
