---
title: Bootstrap Rules
description: Generate starter AI rule sets from your tech stack
---

## When to use bootstrap

If your repo has no AI rule files yet (no CLAUDE.md, AGENTS.md, `.cursor/rules/`, etc.), bootstrap generates a starter set tailored to your stack.

## Usage

```bash
bunx @lambdacurry/anvil bootstrap ./my-repo \
  --output ./bootstrap-draft.md
```

## What it detects

Anvil reads signals from your project to determine the tech stack:

- `package.json` — dependencies and scripts
- `tsconfig.json` — TypeScript configuration
- Framework configs — Next.js, Remix, Vite, etc.
- Tool configs — ESLint, Prettier, Tailwind, etc.

## Output

The bootstrap draft includes:

- **Project context rules** — tech stack, build commands, test commands
- **Coding conventions** — patterns inferred from your tooling
- **Common guardrails** — based on the detected framework and language
- **Placeholder sections** — for you to fill in project-specific knowledge

## After bootstrapping

1. Review the generated draft
2. Fill in project-specific sections (architecture decisions, gotchas, etc.)
3. Place the final rules in the appropriate locations (CLAUDE.md, AGENTS.md, `.cursor/rules/`)
4. Run `anvil audit` to score your new rule set
