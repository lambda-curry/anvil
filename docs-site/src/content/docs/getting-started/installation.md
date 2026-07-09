---
title: Installation
description: Install Anvil via bunx, npx, or global install
---

## Start here

If you want the fastest successful first run, start with one local-only command and read the variants below only if you need them:

```bash wrap
bunx @lambdacurry/anvil audit --target . --ci
```

If you are one directory above the repo you want to audit, use `--target ./my-repo` instead.

Need `npx`, global `anvil`, or the full AI-backed lane? The install options below keep those paths, but this is the first command Anvil wants a new user to trust.

> **Proof-lane note:** If you arrived here because someone sent you Anvil's external first-user proof packet, do not switch to the unpinned commands on this page; they track the latest build, not your pinned proof version. Keep using the exact pinned `bunx @lambdacurry/anvil@<exact-version> ...` command from that outreach note for the full proof run.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- Node.js ≥ 20 only if you want to launch the published package with `npx` instead of `bunx`
- A local repo you want to audit (any codebase with CLAUDE.md, AGENTS.md, `.cursor/rules/`, or similar AI rule files)

You do **not** need an AI provider for a successful first run if you use `--ci`. The full default `audit` path needs a working provider.

## Install options

### Zero-install local-only first pass

No install step, no provider setup required:

```bash wrap
bunx @lambdacurry/anvil audit \
  --target ./my-repo \
  --ci
```

### Zero-install full AI-backed audit

Use this when you already have Claude Code, Codex CLI, Gemini CLI, opencode, or `OPENAI_API_KEY` available:

```bash wrap
bunx @lambdacurry/anvil audit \
  --target ./my-repo
```

### npm launcher (Bun still required)

Use this only if Bun is already installed and you prefer `npx` as the launcher:

```bash wrap
npx @lambdacurry/anvil audit \
  --target ./my-repo
```

### Global install

```bash wrap
bun add -g @lambdacurry/anvil
anvil audit --target ./my-repo
```

## Verify the CLI

Use the same launcher you picked above:

### `bunx`

```bash wrap
bunx @lambdacurry/anvil --help
bunx @lambdacurry/anvil --version
```

### `npx` (still launches the Bun-native CLI)

```bash wrap
npx @lambdacurry/anvil --help
npx @lambdacurry/anvil --version
```

### Global install only

```bash wrap
anvil --help
anvil --version
```

## All commands

> **Note:** If you are using `bunx` or `npx`, keep your chosen launcher prefix when you run these commands. The list below uses the plain `anvil [subcommand]` form for readability.

- `anvil audit` — Full rule audit
- `anvil drift` — Detect drift in rule surfaces
- `anvil bootstrap` — Generate starter rules from tech stack
- `anvil mine-pr` — Mine PR review comments for rule candidates

## Recommended tooling

The published CLI is Bun-native. `npx` is an alternate launcher, not a Node-only compatibility lane. These optional tools unlock more of Anvil's capabilities:

### GitHub CLI (`gh`)

Used by `mine-pr` to fetch PR review comments and cluster recurring feedback into rule candidates.

```bash wrap
# install
brew install gh
gh auth login

# verify
gh auth status
```

Without `gh`: `mine-pr` falls back to the GitHub API via `GITHUB_TOKEN` environment variable. With `gh` installed and authenticated, you get a smoother auth flow and higher rate limits.

### AI synthesis (auto-detected)

The default `anvil audit` path is the full AI-backed report. Anvil scans the repo locally, then uses a working AI provider for repo-specific improvement suggestions, prioritization, and natural-language explanations.

Use `--ci` when you want deterministic local-only structural lint instead:

```bash wrap
bunx @lambdacurry/anvil audit --target ./my-repo --ci
```

You can also force a specific provider. Keep the same launcher you already chose:

```bash wrap
# bunx
bunx @lambdacurry/anvil audit \
  --target ./my-repo \
  --ai-provider openai

# npx (Bun still required)
npx @lambdacurry/anvil audit \
  --target ./my-repo \
  --ai-provider openai

# global install only
anvil audit \
  --target ./my-repo \
  --ai-provider openai
```

Swap `openai` for `claude-code`, `codex-cli`, `gemini-cli`, or `opencode` as needed.

**Any installed AI coding CLI works automatically.** If you already use Claude Code, Codex, Gemini CLI, or opencode, Anvil can pick it up with zero extra API-key setup.

### What you get at each level

#### Bun installed

`audit --ci`, drift detection, coverage scoring, and bootstrap all work locally with no keys.

#### Bun installed + `gh` CLI authenticated

`mine-pr` gets a smoother auth flow and higher rate limits.

#### Bun installed + any AI coding CLI on `PATH`

The full `audit` path can auto-detect AI synthesis, so you get smarter suggestions with no extra API-key setup.

#### Bun installed + `OPENAI_API_KEY`

The full `audit` path can run through OpenAI models directly.

## Next

Read [First Audit](/anvil/getting-started/first-audit) to run your first audit and understand the output. Keep the same launcher you chose above (`bunx`, `npx`, or global `anvil`) when you move to that page.
