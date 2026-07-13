# Drift Detection Report — atlas — 2026-07-05

## Summary
- Scope: discovered rule files only (25 files)
- Path drift: 17 issues
- Missing symlink targets: 0 issues
- Glob drift: 0 issues (not implemented in Phase 1b)
- Command drift: 0 issues (not implemented in Phase 1b)
- Date drift: 25 issues
- Coverage gap: 0 issues (not implemented in Phase 2)
- **Skip dirs:** .git, .worktrees, node_modules, .next, .turbo, dist, build, .cache, generated, generated-workspaces, examples, templates, fixtures, __fixtures__, __snapshots__, .codex, coverage, docs-site, site, public, out

## Issues

### 🔴 High — Date Drift
**File:** .devagent/core/AGENTS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: alwaysApply, threshold: 30 days)

### 🔴 High — Date Drift
**File:** .devagent/plugins/ralph/AGENTS.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: alwaysApply, threshold: 30 days)

### 🔴 High — Path Drift
**File:** .cursor/rules/ai-rules-generated-00-project-context.mdc:37
**Detail:** Path reference not found: `apps/todo-app/package.json` (checked: `apps/todo-app/package.json`)

### 🔴 High — Path Drift
**File:** .cursor/rules/ai-rules-generated-00-project-context.mdc:45
**Detail:** Path reference not found: `apps/todo-app` (checked: `apps/todo-app`)

### 🔴 High — Path Drift
**File:** .cursor/rules/ai-rules-generated-00-project-context.mdc:51
**Detail:** Path reference not found: `apps/todo-app/TESTING.md` (checked: `apps/todo-app/TESTING.md`)

### 🔴 High — Path Drift
**File:** .cursor/rules/ai-rules-generated-testing-best-practices.mdc:11
**Detail:** Path reference not found: `test/setup.ts` (checked: `test/setup.ts`)

### 🔴 High — Path Drift
**File:** .cursor/rules/ai-rules-generated-testing-best-practices.mdc:23
**Detail:** Path reference not found: `test/test-utils.tsx` (checked: `test/test-utils.tsx`)

### 🔴 High — Path Drift
**File:** .devagent/plugins/ralph/AGENTS.md:32
**Detail:** Path reference not found: `.devagent/plugins/ralph/skills/beads-integration/SKILL.md` (checked: `.devagent/plugins/ralph/skills/beads-integration/SKILL.md`)

### 🔴 High — Path Drift
**File:** .devagent/plugins/ralph/AGENTS.md:152
**Detail:** Path reference not found: `.devagent/plugins/ralph/skills/agent-browser/SKILL.md` (checked: `.devagent/plugins/ralph/skills/agent-browser/SKILL.md`)

### 🔴 High — Path Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-00-project-context.md:31
**Detail:** Path reference not found: `apps/todo-app/package.json` (checked: `apps/todo-app/package.json`)

### 🔴 High — Path Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-00-project-context.md:39
**Detail:** Path reference not found: `apps/todo-app` (checked: `apps/todo-app`)

### 🔴 High — Path Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-00-project-context.md:45
**Detail:** Path reference not found: `apps/todo-app/TESTING.md` (checked: `apps/todo-app/TESTING.md`)

### 🔴 High — Path Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-testing-best-practices.md:5
**Detail:** Path reference not found: `test/setup.ts` (checked: `test/setup.ts`)

### 🔴 High — Path Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-testing-best-practices.md:17
**Detail:** Path reference not found: `test/test-utils.tsx` (checked: `test/test-utils.tsx`)

### 🔴 High — Path Drift
**File:** ai-rules/00-project-context.md:37
**Detail:** Path reference not found: `apps/todo-app/package.json` (checked: `apps/todo-app/package.json`)

### 🔴 High — Path Drift
**File:** ai-rules/00-project-context.md:45
**Detail:** Path reference not found: `apps/todo-app` (checked: `apps/todo-app`)

### 🔴 High — Path Drift
**File:** ai-rules/00-project-context.md:51
**Detail:** Path reference not found: `apps/todo-app/TESTING.md` (checked: `apps/todo-app/TESTING.md`)

### 🔴 High — Path Drift
**File:** ai-rules/testing-best-practices.md:11
**Detail:** Path reference not found: `test/setup.ts` (checked: `test/setup.ts`)

### 🔴 High — Path Drift
**File:** ai-rules/testing-best-practices.md:23
**Detail:** Path reference not found: `test/test-utils.tsx` (checked: `test/test-utils.tsx`)

### 🟡 Medium — Date Drift
**File:** .cursor/rules/ai-rules-generated-00-project-context.mdc
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** .cursor/rules/ai-rules-generated-lambda-curry-forms.mdc
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** .cursor/rules/ai-rules-generated-monorepo.mdc
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** .cursor/rules/ai-rules-generated-react-router.mdc
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** .cursor/rules/ai-rules-generated-storybook.mdc
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** .cursor/rules/ai-rules-generated-testing-best-practices.mdc
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** .cursor/rules/ai-rules-generated-ui-components.mdc
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-00-project-context.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-lambda-curry-forms.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-monorepo.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-optional.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-react-router.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-storybook.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-testing-best-practices.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/.generated-ai-rules/ai-rules-generated-ui-components.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/00-project-context.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/lambda-curry-forms.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/monorepo.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/react-router.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/storybook.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/testing-best-practices.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** ai-rules/ui-components.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

### 🟡 Medium — Date Drift
**File:** CLAUDE.md
**Detail:** No validation date found. Expected pattern: `Last validated: YYYY-MM-DD` (cadence: pattern/doc, threshold: 90 days)

## Notes (Non-Drift References)

- .devagent/plugins/ralph/AGENTS.md:9 — URL-like reference `github.com/steveyegge/beads` looks external; not treated as local path drift
- .devagent/plugins/ralph/AGENTS.md:15 — Import-like reference `issues/tasks/bugs` looks external; not treated as local path drift
- .devagent/plugins/ralph/AGENTS.md:111 — Import-like reference `test/lint/typecheck` looks external; not treated as local path drift
- .devagent/plugins/ralph/AGENTS.md:150 — Import-like reference `UI/frontend/visual` looks external; not treated as local path drift
- .devagent/plugins/ralph/AGENTS.md:268 — URL-like reference `www.conventionalcommits.org/en/v1.0.0` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-00-project-context.mdc:16 — Import-like reference `@todo-starter/ui` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-00-project-context.mdc:16 — Import-like reference `@todo-starter/utils` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-lambda-curry-forms.mdc:8 — Import-like reference `@lambdacurry/forms` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-lambda-curry-forms.mdc:10 — URL-like reference `raw.githubusercontent.com/lambda-curry/forms/refs/heads/main/llms.txt` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-lambda-curry-forms.mdc:18 — Import-like reference `hookform/resolvers/zod` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-lambda-curry-forms.mdc:23 — Import-like reference `lambdacurry/forms/ui` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-monorepo.mdc:31 — Import-like reference `@todo-starter/package-name` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-storybook.mdc:11 — Import-like reference `@storybook/react-vite` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-storybook.mdc:13 — Import-like reference `@storybook/addon-essentials` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-storybook.mdc:13 — Import-like reference `@storybook/addon-links` looks external; not treated as local path drift
- .cursor/rules/ai-rules-generated-testing-best-practices.mdc:63 — Import-like reference `@testing-library/jest-dom` looks external; not treated as local path drift
- ai-rules/00-project-context.md:16 — Import-like reference `@todo-starter/ui` looks external; not treated as local path drift
- ai-rules/00-project-context.md:16 — Import-like reference `@todo-starter/utils` looks external; not treated as local path drift
- ai-rules/lambda-curry-forms.md:8 — Import-like reference `@lambdacurry/forms` looks external; not treated as local path drift
- ai-rules/lambda-curry-forms.md:10 — URL-like reference `raw.githubusercontent.com/lambda-curry/forms/refs/heads/main/llms.txt` looks external; not treated as local path drift
- ai-rules/lambda-curry-forms.md:18 — Import-like reference `hookform/resolvers/zod` looks external; not treated as local path drift
- ai-rules/lambda-curry-forms.md:23 — Import-like reference `lambdacurry/forms/ui` looks external; not treated as local path drift
- ai-rules/monorepo.md:31 — Import-like reference `@todo-starter/package-name` looks external; not treated as local path drift
- ai-rules/storybook.md:11 — Import-like reference `@storybook/react-vite` looks external; not treated as local path drift
- ai-rules/storybook.md:13 — Import-like reference `@storybook/addon-essentials` looks external; not treated as local path drift
- ai-rules/storybook.md:13 — Import-like reference `@storybook/addon-links` looks external; not treated as local path drift
- ai-rules/testing-best-practices.md:63 — Import-like reference `@testing-library/jest-dom` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-00-project-context.md:10 — Import-like reference `@todo-starter/ui` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-00-project-context.md:10 — Import-like reference `@todo-starter/utils` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-lambda-curry-forms.md:2 — Import-like reference `@lambdacurry/forms` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-lambda-curry-forms.md:4 — URL-like reference `raw.githubusercontent.com/lambda-curry/forms/refs/heads/main/llms.txt` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-lambda-curry-forms.md:12 — Import-like reference `hookform/resolvers/zod` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-lambda-curry-forms.md:17 — Import-like reference `lambdacurry/forms/ui` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-monorepo.md:25 — Import-like reference `@todo-starter/package-name` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-optional.md:8 — Import-like reference `topic/tool/framework` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-storybook.md:5 — Import-like reference `@storybook/react-vite` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-storybook.md:7 — Import-like reference `@storybook/addon-essentials` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-storybook.md:7 — Import-like reference `@storybook/addon-links` looks external; not treated as local path drift
- ai-rules/.generated-ai-rules/ai-rules-generated-testing-best-practices.md:57 — Import-like reference `@testing-library/jest-dom` looks external; not treated as local path drift
