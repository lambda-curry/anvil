# Drift Detection Report — watchtower — 2026-07-05

## Summary
- Scope: discovered rule files only (5 files)
- Path drift: 10 issues
- Missing symlink targets: 0 issues
- Glob drift: 0 issues (not implemented in Phase 1b)
- Command drift: 0 issues (not implemented in Phase 1b)
- Date drift: 4 issues
- Coverage gap: 0 issues (not implemented in Phase 2)
- **Skip dirs:** .git, .worktrees, node_modules, .next, .turbo, dist, build, .cache, generated, generated-workspaces, examples, templates, fixtures, __fixtures__, __snapshots__, .codex, coverage, docs-site, site, public, out

## Issues

### 🔴 High — Date Drift
**File:** .devagent/core/AGENTS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: alwaysApply, threshold: 30 days)

### 🔴 High — Date Drift
**File:** .devagent/plugins/ralph/AGENTS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: alwaysApply, threshold: 30 days)

### 🔴 High — Date Drift
**File:** AGENTS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: alwaysApply, threshold: 30 days)

### 🔴 High — Path Drift
**File:** .cursorrules/CLAUDE.md:36
**Detail:** Path reference not found: `@watchtower/ui` (checked: `@watchtower/ui`)

### 🔴 High — Path Drift
**File:** .cursorrules/CLAUDE.md:36
**Detail:** Path reference not found: `@watchtower/utils` (checked: `@watchtower/utils`)

### 🔴 High — Path Drift
**File:** .devagent/plugins/ralph/AGENTS.md:32
**Detail:** Path reference not found: `.devagent/plugins/ralph/skills/beads-integration/SKILL.md` (checked: `.devagent/plugins/ralph/skills/beads-integration/SKILL.md`)

### 🔴 High — Path Drift
**File:** .devagent/plugins/ralph/AGENTS.md:152
**Detail:** Path reference not found: `.devagent/plugins/ralph/skills/agent-browser/SKILL.md` (checked: `.devagent/plugins/ralph/skills/agent-browser/SKILL.md`)

### 🔴 High — Path Drift
**File:** AGENTS.md:27
**Detail:** Path reference not found: `/Users/jake/saffron/agents/scout/charters/watchtower/.project/ROADMAP.md` (checked: `../../../Users/jake/saffron/agents/scout/charters/watchtower/.project/ROADMAP.md`)

### 🔴 High — Path Drift
**File:** AGENTS.md:28
**Detail:** Path reference not found: `/Users/jake/saffron/agents/scout/charters/watchtower/.project/BLOCKERS.md` (checked: `../../../Users/jake/saffron/agents/scout/charters/watchtower/.project/BLOCKERS.md`)

### 🔴 High — Path Drift
**File:** AGENTS.md:29
**Detail:** Path reference not found: `/Users/jake/saffron/agents/scout/charters/watchtower/.project/SCRATCHPAD.md` (checked: `../../../Users/jake/saffron/agents/scout/charters/watchtower/.project/SCRATCHPAD.md`)

### 🔴 High — Path Drift
**File:** CLAUDE.md:40
**Detail:** Path reference not found: `@watchtower/ui` (checked: `@watchtower/ui`)

### 🔴 High — Path Drift
**File:** CLAUDE.md:40
**Detail:** Path reference not found: `@watchtower/utils` (checked: `@watchtower/utils`)

### 🔴 High — Path Drift
**File:** CLAUDE.md:52
**Detail:** Path reference not found: `app/lib/openobserve-client.ts` (checked: `app/lib/openobserve-client.ts`)

### 🟡 Medium — Date Drift
**File:** .cursorrules/CLAUDE.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

## Notes (Non-Drift References)

- CLAUDE.md:14 — Import-like reference `@vitejs/plugin-react` looks external; not treated as local path drift
- CLAUDE.md:14 — Import-like reference `@react-router/dev/vite` looks external; not treated as local path drift
- CLAUDE.md:46 — Import-like reference `@tailwindcss/vite` looks external; not treated as local path drift
- .cursorrules/CLAUDE.md:11 — Import-like reference `@vitejs/plugin-react` looks external; not treated as local path drift
- .cursorrules/CLAUDE.md:11 — Import-like reference `@react-router/dev/vite` looks external; not treated as local path drift
- .cursorrules/CLAUDE.md:42 — Import-like reference `@tailwindcss/vite` looks external; not treated as local path drift
- .cursorrules/CLAUDE.md:48 — Import-like reference `/api/obs` looks external; not treated as local path drift
- AGENTS.md:25 — Import-like reference `resolve/commit/discard` looks external; not treated as local path drift
- .devagent/plugins/ralph/AGENTS.md:9 — URL-like reference `github.com/steveyegge/beads` looks external; not treated as local path drift
- .devagent/plugins/ralph/AGENTS.md:15 — Import-like reference `issues/tasks/bugs` looks external; not treated as local path drift
- .devagent/plugins/ralph/AGENTS.md:111 — Import-like reference `test/lint/typecheck` looks external; not treated as local path drift
- .devagent/plugins/ralph/AGENTS.md:150 — Import-like reference `UI/frontend/visual` looks external; not treated as local path drift
- .devagent/plugins/ralph/AGENTS.md:268 — URL-like reference `www.conventionalcommits.org/en/v1.0.0` looks external; not treated as local path drift
