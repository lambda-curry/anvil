---
title: CLI Reference
description: Complete Anvil CLI command reference
---

## Global flags

| Flag | Description |
|---|---|
| `--help` | Show usage information |
| `--version` | Print current version |

## `anvil audit`

Run a full rule audit against a target repo.

```bash
anvil audit --target ./my-repo [options]
```

| Option | Description |
|---|---|
| `--target <path>` | Path to the repo to audit (required) |
| `--output <path>` | Save report to a file |
| `--ci` | Deterministic local-only structural lint mode (skips AI synthesis) |
| `--ai-provider <provider>` | AI provider: `auto` \| `openai` \| `codex-cli` \| `claude-code` \| `gemini-cli` \| `opencode` \| `heuristic` |
| hidden alias: `--no-ai` | Deprecated compatibility alias for `--ci` |
| `--ai-model <model>` | Model to use for synthesis (e.g., `gpt-4o`) |

Relative `--target` paths resolve from your current shell cwd.

If you arrived here from the external first-user proof docs, use the exact pinned command from that packet. The current `0.1.0-alpha.6` packet uses the public `--ci` spelling; `--no-ai` remains only as a deprecated compatibility alias.

## `anvil drift`

Detect drift in rule surfaces.

```bash
anvil drift --target ./my-repo
```

Checks glob resolution, path existence, validation dates, and coverage gaps.
The positional form `anvil drift ./my-repo` remains supported for compatibility.

## `anvil bootstrap`

Generate starter rule sets from tech stack analysis.

```bash
anvil bootstrap --target ./my-repo --output ./bootstrap-draft.md
```

Reads `package.json`, `tsconfig.json`, and framework configs to generate tailored starter rules.
The positional form `anvil bootstrap ./my-repo` remains supported for compatibility.

## `anvil mine-pr`

Mine GitHub PR review comments for rule candidates.

```bash
anvil mine-pr owner/repo
```

Requires the GitHub CLI (`gh`) installed and authenticated. A `GITHUB_TOKEN` environment variable alone is not a supported fallback.

## Install methods

```bash
# Zero-install
bunx @lambdacurry/anvil <command>

# npm fallback
npx @lambdacurry/anvil <command>

# Global install
bun add -g @lambdacurry/anvil
anvil <command>
```
