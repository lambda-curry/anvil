# Drift Detection Report — saffron-starter — 2026-07-05

## Summary
- Scope: discovered rule files only (2 files)
- Path drift: 7 issues
- Missing symlink targets: 0 issues
- Glob drift: 0 issues (not implemented in Phase 1b)
- Command drift: 0 issues (not implemented in Phase 1b)
- Date drift: 2 issues
- Coverage gap: 0 issues (not implemented in Phase 2)
- **Skip dirs:** .git, .worktrees, node_modules, .next, .turbo, dist, build, .cache, generated, generated-workspaces, examples, templates, fixtures, __fixtures__, __snapshots__, .codex, coverage, docs-site, site, public, out

## Issues

### 🔴 High — Date Drift
**File:** AGENTS.md
**Detail:** Validation date stale: 2026-02-28 (127 days old) exceeds alwaysApply threshold (30 days)

### 🔴 High — Date Drift
**File:** TOOLS.md
**Detail:** Validation date stale: 2026-02-28 (127 days old) exceeds alwaysApply threshold (30 days)

### 🔴 High — Path Drift
**File:** AGENTS.md:50
**Detail:** Path reference not found: `.project/ROADMAP.md` (checked: `.project/ROADMAP.md`)

### 🔴 High — Path Drift
**File:** AGENTS.md:50
**Detail:** Path reference not found: `.project/BLOCKERS.md` (checked: `.project/BLOCKERS.md`)

### 🔴 High — Path Drift
**File:** AGENTS.md:50
**Detail:** Path reference not found: `.project/SCRATCHPAD.md` (checked: `.project/SCRATCHPAD.md`)

### 🔴 High — Path Drift
**File:** AGENTS.md:52
**Detail:** Path reference not found: `/Users/jake/saffron/agents/meg/charters/saffron-starter/.project/ROADMAP.md` (checked: `../../../Users/jake/saffron/agents/meg/charters/saffron-starter/.project/ROADMAP.md`)

### 🔴 High — Path Drift
**File:** AGENTS.md:53
**Detail:** Path reference not found: `/Users/jake/saffron/agents/meg/charters/saffron-starter/.project/BLOCKERS.md` (checked: `../../../Users/jake/saffron/agents/meg/charters/saffron-starter/.project/BLOCKERS.md`)

### 🔴 High — Path Drift
**File:** AGENTS.md:54
**Detail:** Path reference not found: `/Users/jake/saffron/agents/meg/charters/saffron-starter/.project/SCRATCHPAD.md` (checked: `../../../Users/jake/saffron/agents/meg/charters/saffron-starter/.project/SCRATCHPAD.md`)

### 🔴 High — Path Drift
**File:** AGENTS.md:63
**Detail:** Path reference not found: `.project/blockers.md` (checked: `.project/blockers.md`)

## Notes (Non-Drift References)

- AGENTS.md:36 — Import-like reference `config/stories/tests` looks external; not treated as local path drift
- AGENTS.md:60 — Import-like reference `resolve/commit/discard` looks external; not treated as local path drift
- AGENTS.md:126 — Import-like reference `openclaw/workspace/projects/saffron-starter` looks external; not treated as local path drift
- TOOLS.md:40 — Import-like reference `lambda-curry/react-router-starter` looks external; not treated as local path drift
