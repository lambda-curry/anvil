---
title: Agent Skill
description: Copy-paste skill for AI agents to run Anvil audits. Add to CLAUDE.md, .cursor/rules, or any agent instruction file.
---

Copy the skill below into your agent's instruction file — `CLAUDE.md`, `.cursor/rules/anvil.mdc`, `AGENTS.md`, or any context file your agent reads.

````markdown
---
name: anvil
description: Audit AI rule files for coverage gaps, drift, conflicts, and format compliance. Use Anvil when you need to evaluate or improve the quality of AI instructions in a codebase.
---

# Anvil — AI Rules Audit

## When to use

- Starting work in a new repo — audit the existing AI rules to understand what's covered and what's missing
- After modifying AI rule files — verify the changes didn't introduce drift or conflicts
- Periodically — catch stale globs, broken references, and coverage gaps before they cause problems
- When onboarding — bootstrap starter rules for a repo that has none

## Install

Zero-install. The default audit path expects either a local AI CLI login or an `OPENAI_API_KEY`; use `--ci` when you specifically want the local-only path.

## Quick audit

`bunx @lambdacurry/anvil audit --target .`

This runs the full product path: discovers rule files, detects drift, scores coverage, and adds AI-synthesized improvement priorities to the markdown report.

## Save the report

`bunx @lambdacurry/anvil audit --target . --output ./audit-report.md`

## CI / local-only mode

If you want a deterministic local-only structural lint pass:

`bunx @lambdacurry/anvil audit --target . --ci`

Auto-detects available local AI CLIs (Claude Code, Codex, Gemini CLI, opencode) or OpenAI by default when you omit `--ci`.

Force a specific provider: `--ai-provider claude-code|codex-cli|gemini-cli|opencode|openai|heuristic`

## Other commands

- `bunx @lambdacurry/anvil drift .` — detect drift only
- `bunx @lambdacurry/anvil bootstrap . --output ./bootstrap-draft.md` — generate starter rules
- `bunx @lambdacurry/anvil mine-pr owner/repo` — mine PR history for missing rules (requires gh CLI)

## What to look for in the report

- **Rule Quality Score (0–100)** — overall health of AI rules on the full AI-backed path
- **Structural Lint Score (0–100)** — local-only score label when you run with `--ci`
- **Guardrail Readiness Score (0–35)** — engineering guardrail coverage
- **Coverage gaps** — patterns with no rule protection
- **Drift issues** — stale globs, broken paths, outdated references
- **Recommendations** — prioritized improvements

## Trust model

- `--ci` = fully local, zero outbound calls, no data leaves the machine
- Default `audit` path = auto-detects local AI CLIs first, then OpenAI if API key is set
- `--no-ai` = hidden deprecated alias for `--ci`
- Anvil never modifies files in the target repo (read-only audit)

## Repo config

Create `.anvil/config.yml` in the target repo to tune scoring:

```yaml
version: 1
profile: internal-tool  # or: library, production-app, prototype
hardGates:
  dimensions:
    ciDiscipline:
      minScore: 3
```
````

## Full docs for agents

If you want an agent to have access to the complete Anvil documentation (all guides, reference, and configuration), fetch the combined markdown bundle:

```bash
curl -s https://lambda-curry.github.io/anvil/llms-full.txt
```

For a concise index with links to individual pages:

```bash
curl -s https://lambda-curry.github.io/anvil/llms.txt
```

Both follow the [llms.txt convention](https://llmstxt.org) — a standard way for AI agents to discover and consume documentation.
