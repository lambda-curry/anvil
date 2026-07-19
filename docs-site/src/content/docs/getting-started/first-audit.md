---
title: First Audit
description: Run your first Anvil audit and understand the output
---

## Recommended first run

If you want the first real Anvil report with the least setup, start here and keep the same launcher until you see a report:

```bash wrap
bunx @lambdacurry/anvil audit --target . --ci
```

If you are one directory above the target repo, swap `--target .` for `--target ./my-repo`.

> **Proof-lane note:** If you arrived here from [First User Proof](/anvil/guides/first-user-proof) or [First User Proof Packet](/anvil/guides/first-user-proof-packet), keep using the exact pinned `bunx @lambdacurry/anvil@<exact-version> ...` command from that outreach note. The unpinned examples below are for general public usage, not for pinned proof collection.

If you picked `npx` or the global `anvil` install on [Installation](/anvil/getting-started/installation), keep that same launcher here too. The audit flags stay the same; only the executable prefix changes.

Pick one launcher for this page and stick with it. The command should read like one trustworthy next action, not a comparison exercise.

<details>
<summary>Need the repo-parent, <code>npx</code>, or global <code>anvil</code> variants?</summary>

**`bunx` from one directory above the target repo:**

```bash wrap
bunx @lambdacurry/anvil audit \
  --target ./my-repo \
  --ci
```

**`npx` from the target repo root:**

```bash wrap
npx @lambdacurry/anvil audit \
  --target . \
  --ci
```

**`npx` from one directory above the target repo:**

```bash wrap
npx @lambdacurry/anvil audit \
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

- the terminal shows progress, then a concise score summary
- the final terminal line names the saved Markdown report: `Audit report written: <path>`
- without `--output`, the report is saved under `docs/audits/<repo>-audit-<date>.md` relative to the directory where you ran Anvil
- nothing leaves your machine

## If you already have a provider and want the richer report

Start with the full AI-backed audit so you see Anvil's best report on the first run:

**Primary lane (Bun recommended):**

If you are already in the target repo root:

```bash wrap
bunx @lambdacurry/anvil audit \
  --target .
```

If you are one directory above the target repo:

```bash wrap
bunx @lambdacurry/anvil audit \
  --target ./my-repo
```

<details>
<summary>Need the same AI-backed lane with `npx` or global `anvil` instead?</summary>

If Bun is already installed and you prefer a different launcher, keep the same audit path and swap only the executable prefix.

**`npx` from the target repo root:**

```bash wrap
npx @lambdacurry/anvil audit \
  --target .
```

**`npx` from one directory above the target repo:**

```bash wrap
npx @lambdacurry/anvil audit \
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
4. **Report** — the terminal prints a concise score summary and the full Markdown report is written to the path named by `Audit report written: <path>`; on the full AI-backed lane, the saved report includes synthesized improvement priorities when a provider is available

## Example terminal finish

```text wrap
✅ Structural Lint Score: 78/100 (3.9/5)
✅ Guardrail Readiness Score: 22/35 (Established)
✅ Audit report written: /path/to/my-repo/docs/audits/my-repo-audit-2026-07-19.md
```

Open the reported path to read the full Markdown audit, including coverage gaps, drift issues, and remediation guidance.

## After your first successful audit

### Choose the report path

```bash wrap
bunx @lambdacurry/anvil audit \
  --target ./my-repo \
  --output ./audit-report.md
```

Anvil always saves the full Markdown report. Use `--output` when you want to choose its path instead of the default `docs/audits/<repo>-audit-<date>.md`. Relative paths resolve from your current shell cwd.

### AI provider behavior

The full `audit` path expects a real AI synthesis provider:

```bash wrap
bunx @lambdacurry/anvil audit \
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
bunx @lambdacurry/anvil mine-pr owner/repo
```

Anvil fetches merged PR review comments, clusters them by theme, and highlights the highest-frequency patterns that lack rule coverage. See [Mine PR History](/anvil/guides/mine-pr) for full details.

## Troubleshooting

**"No rule files found"** — Your target repo doesn't have AI rule files yet. Use `anvil bootstrap` to generate a starter set.

**`bunx` not found** — Install Bun: `curl -fsSL https://bun.sh/install | bash`

**AI synthesis fails** — Confirm your provider login/key is set and the model name is valid. If you need a deterministic local-only pass, rerun with `--ci`.

## Found something?

Still stuck, hit a bug, or got a report that looks wrong? [Open a GitHub issue](https://github.com/lambda-curry/anvil/issues) — first-run feedback is exactly what the alpha needs.
