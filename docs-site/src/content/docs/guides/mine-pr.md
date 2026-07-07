---
title: Mine PR History
description: Surface recurring review feedback that should become AI rules
---

## What it does

Surfaces recurring PR review feedback that lacks rule coverage. Anvil fetches merged PR review comments, clusters them by theme, and highlights the highest-frequency patterns.

## Usage

```bash
bunx @lambdacurry/anvil@alpha mine-pr owner/repo
```

Requires `GITHUB_TOKEN` in your environment:

```bash
export GITHUB_TOKEN=ghp_...
bunx @lambdacurry/anvil@alpha mine-pr my-org/my-repo
```

## How it works

1. **Fetch** — retrieves merged PR review comments via GitHub API
2. **Cluster** — groups comments by theme (error handling, naming, security, etc.)
3. **Score** — ranks clusters by frequency and recurrence
4. **Cross-reference** — checks which clusters lack rule coverage
5. **Report** — outputs candidates with frequency, examples, and suggested rule text

## Output

Each rule candidate includes:

- **Theme** — what pattern keeps coming up in reviews
- **Frequency** — how often this feedback appears
- **Example quotes** — representative review comments
- **Suggested rule** — draft rule text you can adapt
- **Coverage status** — whether any existing rule already covers this

## When to use

- **After onboarding** — mine recent PRs to capture institutional knowledge as rules
- **Periodically** — surface new patterns as the codebase evolves
- **Before audits** — use mined candidates to fill coverage gaps before running a full audit
