---
title: First Audit
description: Run your first Anvil audit and understand the output
---

## Recommended first run

If you want the first real Anvil report with the least setup, start here and keep the same launcher until you see a report:

```bash wrap
bunx @lambdacurry/anvil@alpha audit --target . --ci
```

If you are one directory above the target repo, swap `--target .` for `--target ./my-repo`.

> **Proof-lane note:** If you arrived here from [First User Proof](/anvil/guides/first-user-proof) or [First User Proof Packet](/anvil/guides/first-user-proof-packet), keep using the exact pinned `bunx @lambdacurry/anvil@<exact-version> ...` command from that outreach note. The `@alpha` examples below are for general public usage, not for Milestone 3 proof collection.

If you picked `npx` or the global `anvil` install on [Installation](/anvil/getting-started/installation), keep that same launcher here too. The audit flags stay the same; only the executable prefix changes.

Pick one launcher for this page and stick with it. The command should read like one trustworthy next action, not a comparison exercise.

<details>
<summary>Need the repo-parent, <code>npx</code>, or global <code>anvil</code> variants?</summary>

**`bunx` from one directory above the target repo:**

```bash wrap
bunx @lambdacurry/anvil@alpha audit \
  --target ./my-repo \
  --ci
```

**`npx` from the target repo root:**

```bash wrap
npx @lambdacurry/anvil@alpha audit \
  --target . \
  --ci
```

**`npx` from one directory above the target repo:**

```bash wrap
npx @lambdacurry/anvil@alpha audit \
  --target ./my-repo \
  --ci
```

**Global `anvil` from the target repo root:**

```bash wrap
anvil audit \
  --target . \
  --ci
```

**Global `anvil` from one directory above the target repo:**

```bash wrap
anvil audit \
  --target ./my-repo \
  --ci
```

</details>

**Success looks like this:**

- Anvil prints a markdown report right away
- you see rule files found, coverage gaps, and drift issues
- nothing leaves your machine

## If you already have a provider and want the richer report

Start with the full AI-backed audit so you see Anvil's best report on the first run:

**Primary lane (Bun recommended):**

If you are already in the target repo root:

```bash wrap
bunx @lambdacurry/anvil@alpha audit \
  --target .
```

If you are one directory above the target repo:

```bash wrap
bunx @lambdacurry/anvil@alpha audit \
  --target ./my-repo
```

<details>
<summary>Need the same AI-backed lane with `npx` or global `anvil` instead?</summary>

If Bun is already installed and you prefer a different launcher, keep the same audit path and swap only the executable prefix.

**`npx` from the target repo root:**

```bash wrap
npx @lambdacurry/anvil@alpha audit \
  --target .
```

**`npx` from one directory above the target repo:**

```bash wrap
npx @lambdacurry/anvil@alpha audit \
  --target ./my-repo
```

**Global `anvil` from the target repo root:**

```bash wrap
anvil audit \
  --target .
```

**Global `anvil` from one directory above the target repo:**

```bash wrap
anvil audit \
  --target ./my-repo
```

</details>

If no provider is available, rerun the recommended first run above.

## What happens

1. **Discovery** — Anvil finds all rule surface files (CLAUDE.md, AGENTS.md, `.cursor/rules/`, `ai-rules/`, etc.)
2. **Drift detection** — stale globs, missing path references, date-stale entries
3. **Coverage scoring** — gaps against a community baseline of common rule categories
4. **Report** — scored markdown output to stdout; on the full AI-backed lane, this includes synthesized improvement priorities when a provider is available

## Example output

```text wrap
Anvil Audit — /path/to/my-repo
Rule files found: 3
Guardrail score: 22/35

Coverage gaps:
  • No rule covers: error handling patterns
  • No rule covers: security/secrets hygiene

Drift issues (2):
  • CLAUDE.md:14 — glob 'src/legacy/**' matches 0 files (medium)
  • AGENTS.md:8 — referenced path 'docs/arch.md' not found (low)
```

## After your first successful audit

### Save the report

```bash wrap
bunx @lambdacurry/anvil@alpha audit \
  --target ./my-repo \
  --output ./audit-report.md
```

The `--output` flag writes the full markdown report to the specified path. Relative paths resolve from your current shell cwd.

### AI provider behavior

The full `audit` path expects a real AI synthesis provider:

```bash wrap
bunx @lambdacurry/anvil@alpha audit \
  --target ./my-repo
```

If you have Claude Code, Codex CLI, Gemini CLI, or opencode installed, Anvil uses it automatically. If `OPENAI_API_KEY` is set, it uses OpenAI. If no provider is available, Anvil tells you how to connect one and points you back to `--ci` for the deterministic local-only path.

If you want provider-specific setup details or trust-boundary guidance, see [BYOK & Trust Model](/anvil/guides/byok-trust-model).

### Tune expectations with config

If your repo is a prototype, library, internal tool, or production app, create `.anvil/config.yml` to match:

```yaml wrap
version: 1
profile: internal-tool
hardGates:
  dimensions:
    ciDiscipline:
      minScore: 3
```

See [Configuration](/anvil/guides/configuration) for copy-paste starting points by repo type.

## Level up: mine PR history

If you have the [GitHub CLI](https://cli.github.com) installed and authenticated, you can surface recurring review feedback that should become rules:

```bash wrap
bunx @lambdacurry/anvil@alpha mine-pr owner/repo
```

Anvil fetches merged PR review comments, clusters them by theme, and highlights the highest-frequency patterns that lack rule coverage. See [Mine PR History](/anvil/guides/mine-pr) for full details.

## Troubleshooting

**"No rule files found"** — Your target repo doesn't have AI rule files yet. Use `anvil bootstrap` to generate a starter set.

**`bunx` not found** — Install Bun: `curl -fsSL https://bun.sh/install | bash`

**AI synthesis fails** — Confirm your provider login/key is set and the model name is valid. If you need a deterministic local-only pass, rerun with `--ci`.
