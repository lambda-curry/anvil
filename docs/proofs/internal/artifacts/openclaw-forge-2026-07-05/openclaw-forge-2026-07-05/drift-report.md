# Drift Detection Report — openclaw-forge — 2026-07-05

## Summary
- Scope: discovered rule files only (8 files)
- Path drift: 17 issues
- Missing symlink targets: 0 issues
- Glob drift: 0 issues (not implemented in Phase 1b)
- Command drift: 0 issues (not implemented in Phase 1b)
- Date drift: 8 issues
- Coverage gap: 0 issues (not implemented in Phase 2)
- **Skip dirs:** .git, .worktrees, node_modules, .next, .turbo, dist, build, .cache, generated, generated-workspaces, examples, templates, fixtures, __fixtures__, __snapshots__, .codex, coverage, docs-site, site, public, out

## Issues

### 🔴 High — Date Drift
**File:** AGENTS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: alwaysApply, threshold: 30 days)

### 🔴 High — Date Drift
**File:** docs-site/.devagent/core/AGENTS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: alwaysApply, threshold: 30 days)

### 🔴 High — Date Drift
**File:** docs-site/.devagent/plugins/ralph/AGENTS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: alwaysApply, threshold: 30 days)

### 🔴 High — Date Drift
**File:** docs-site/AGENTS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: alwaysApply, threshold: 30 days)

### 🔴 High — Path Drift
**File:** docs-site/.devagent/core/AGENTS.md:5
**Detail:** Path reference not found: `.devagent/plugins/ralph/AGENTS.md` (checked: `.devagent/plugins/ralph/AGENTS.md`)

### 🔴 High — Path Drift
**File:** docs-site/.devagent/plugins/ralph/AGENTS.md:32
**Detail:** Path reference not found: `.devagent/plugins/ralph/skills/beads-integration/SKILL.md` (checked: `.devagent/plugins/ralph/skills/beads-integration/SKILL.md`)

### 🔴 High — Path Drift
**File:** docs-site/.devagent/plugins/ralph/AGENTS.md:71
**Detail:** Path reference not found: `.devagent/plugins/ralph/workflows/setup-ralph-loop.md` (checked: `.devagent/plugins/ralph/workflows/setup-ralph-loop.md`)

### 🔴 High — Path Drift
**File:** docs-site/.devagent/plugins/ralph/AGENTS.md:72
**Detail:** Path reference not found: `.devagent/plugins/ralph/workflows/task-setup-handoff.md` (checked: `.devagent/plugins/ralph/workflows/task-setup-handoff.md`)

### 🔴 High — Path Drift
**File:** docs-site/.devagent/plugins/ralph/AGENTS.md:73
**Detail:** Path reference not found: `.devagent/plugins/ralph/workflows/start-ralph-execution.md` (checked: `.devagent/plugins/ralph/workflows/start-ralph-execution.md`)

### 🔴 High — Path Drift
**File:** docs-site/.devagent/plugins/ralph/AGENTS.md:74
**Detail:** Path reference not found: `.devagent/plugins/ralph/workflows/setup-workspace.md` (checked: `.devagent/plugins/ralph/workflows/setup-workspace.md`)

### 🔴 High — Path Drift
**File:** docs-site/.devagent/plugins/ralph/AGENTS.md:75
**Detail:** Path reference not found: `.devagent/plugins/ralph/workflows/final-review.md` (checked: `.devagent/plugins/ralph/workflows/final-review.md`)

### 🔴 High — Path Drift
**File:** docs-site/.devagent/plugins/ralph/AGENTS.md:76
**Detail:** Path reference not found: `.devagent/plugins/ralph/workflows/generate-revise-report.md` (checked: `.devagent/plugins/ralph/workflows/generate-revise-report.md`)

### 🔴 High — Path Drift
**File:** docs-site/.devagent/plugins/ralph/AGENTS.md:152
**Detail:** Path reference not found: `.devagent/plugins/ralph/skills/agent-browser/SKILL.md` (checked: `.devagent/plugins/ralph/skills/agent-browser/SKILL.md`)

### 🔴 High — Path Drift
**File:** docs-site/.devagent/plugins/ralph/AGENTS.md:269
**Detail:** Path reference not found: `.devagent/plugins/ralph/tools/ralph.sh` (checked: `.devagent/plugins/ralph/tools/ralph.sh`)

### 🔴 High — Path Drift
**File:** docs-site/CLAUDE.md:1
**Detail:** Path reference not found: `ai-rules/.generated-ai-rules/ai-rules-generated-00-project-context.md` (checked: `ai-rules/.generated-ai-rules/ai-rules-generated-00-project-context.md`)

### 🔴 High — Path Drift
**File:** docs-site/CLAUDE.md:2
**Detail:** Path reference not found: `ai-rules/.generated-ai-rules/ai-rules-generated-lambda-curry-forms.md` (checked: `ai-rules/.generated-ai-rules/ai-rules-generated-lambda-curry-forms.md`)

### 🔴 High — Path Drift
**File:** docs-site/CLAUDE.md:3
**Detail:** Path reference not found: `ai-rules/.generated-ai-rules/ai-rules-generated-monorepo.md` (checked: `ai-rules/.generated-ai-rules/ai-rules-generated-monorepo.md`)

### 🔴 High — Path Drift
**File:** docs-site/CLAUDE.md:4
**Detail:** Path reference not found: `ai-rules/.generated-ai-rules/ai-rules-generated-react-router.md` (checked: `ai-rules/.generated-ai-rules/ai-rules-generated-react-router.md`)

### 🔴 High — Path Drift
**File:** docs-site/CLAUDE.md:5
**Detail:** Path reference not found: `ai-rules/.generated-ai-rules/ai-rules-generated-ui-components.md` (checked: `ai-rules/.generated-ai-rules/ai-rules-generated-ui-components.md`)

### 🔴 High — Path Drift
**File:** docs-site/CLAUDE.md:7
**Detail:** Path reference not found: `ai-rules/.generated-ai-rules/ai-rules-generated-optional.md` (checked: `ai-rules/.generated-ai-rules/ai-rules-generated-optional.md`)

### 🔴 High — Path Drift
**File:** docs/patterns/auditable-autonomy.md:62
**Detail:** Path reference not found: `data/action-log.md` (checked: `data/action-log.md`)

### 🟡 Medium — Date Drift
**File:** docs-site/CLAUDE.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** docs/patterns/auditable-autonomy.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** docs/patterns/governed-charter-cycle.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** docs/patterns/observation-memory-crons.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

## Notes (Non-Drift References)

- docs-site/.devagent/plugins/ralph/AGENTS.md:9 — URL-like reference `github.com/steveyegge/beads` looks external; not treated as local path drift
- docs-site/.devagent/plugins/ralph/AGENTS.md:15 — Import-like reference `issues/tasks/bugs` looks external; not treated as local path drift
- docs-site/.devagent/plugins/ralph/AGENTS.md:111 — Import-like reference `test/lint/typecheck` looks external; not treated as local path drift
- docs-site/.devagent/plugins/ralph/AGENTS.md:150 — Import-like reference `UI/frontend/visual` looks external; not treated as local path drift
- docs-site/.devagent/plugins/ralph/AGENTS.md:268 — URL-like reference `www.conventionalcommits.org/en/v1.0.0` looks external; not treated as local path drift
- docs/patterns/observation-memory-crons.md:39 — Example/template reference `memory/YYYY-MM-DD.md` uses placeholder segments; not treated as local path drift
- docs/patterns/observation-memory-crons.md:71 — Example/template reference `memory/weekly/YYYY-WNN.md` targets a cross-project path surface; not treated as local path drift
