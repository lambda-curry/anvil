# BYOK Trust Model

*Last validated: 2026-04-23*

## What BYOK means in Anvil

BYOK means Bring Your Own Keys for the AI-backed synthesis step in Anvil when you choose a provider that uses API credentials.

Anvil also works with local AI coding CLIs such as Claude Code, Codex CLI, Gemini CLI, and opencode. If you want a fully local no-provider run, use `--ci`.

## Default trust boundary

By default, Anvil scans your repo locally, then expects a working AI provider for the final synthesis step:
- you choose the target repo
- Anvil reads the repo locally
- Anvil generates the audit locally
- on the default `audit` path, Anvil may send focused audit context to an auto-detected or explicitly selected provider for the final suggestions section

If you want the privacy-first path, run:

> **Current alpha note:** The published `0.1.0-alpha.5` proof packet uses one canonical repo-root `bunx` command with `--ci --output ./anvil-audit.md`. Packaged relative `--target` and `--output` paths still resolve from your shell cwd, so normal repo-relative first-run commands are honest when you use `@alpha`.

```bash
# zero-install
bunx @lambdacurry/anvil@alpha audit --target ./my-repo --ci

# npm launcher fallback (Bun still required)
npx @lambdacurry/anvil@alpha audit --target ./my-repo --ci

# or, if installed globally
bun add -g @lambdacurry/anvil@alpha
anvil audit --target ./my-repo --ci
```

That mode performs no external AI calls. `--no-ai` still works as a deprecated compatibility alias for the same local-only path.

## What stays local

The following stays local to your machine and repo by default:
- source files in the target repo
- rule files and agent-instruction files discovered during the audit
- generated audit artifacts and markdown output
- your provider API keys and local environment configuration
- git metadata that is not explicitly needed for a local audit run

## What may be sent to an AI provider

On the default full `audit` path — or whenever you explicitly select a provider such as `--ai-provider openai` — Anvil may send a **focused subset of audit context** needed to generate repo-specific improvement suggestions.

This may include:
- relevant rule content
- focused audit findings
- compact synthesized context from the current audit run

The intent is to send only what is needed for the optional interpretation/synthesis step, not your entire repository as a blind dump.

## Local vs. optional-provider boundary at a glance

| Surface | Local-only run (`--ci`) | AI-assisted default `audit` run |
|---|---|---|
| Target repo scanning | stays local | stays local before any optional synthesis step |
| Drift / coverage scoring | stays local | stays local |
| Markdown audit output | stays local unless you choose where to save/share it | stays local unless you choose where to save/share it |
| Provider credentials | stay local | stay local |
| Focused audit context for synthesis | not sent | may be sent only after explicit opt-in |

This table is the practical rule: use `--ci` when you need a fully local boundary; use the default `audit` path when you want the full AI-backed product output.

## What is never sent

Anvil never sends:
- your API keys or provider credentials
- unrelated project files outside the audit context
- arbitrary local secrets just because they exist in your environment
- git history as part of the normal BYOK synthesis flow

## Operator responsibilities

BYOK shifts provider trust decisions to the operator. You are responsible for:
- choosing whether to enable provider-backed synthesis at all
- selecting the provider and model you trust
- supplying provider credentials through your local environment
- deciding whether the target repo is appropriate for external synthesis

If the repo is sensitive or the trust boundary is unclear, use `--ci`.

## Provider and model control

You control provider/model selection with flags such as:
- `--ai-provider`
- `--ai-model`

That means the operator, not Anvil, chooses whether any external provider is involved.

## Practical decision rule

- Use **`--ci`** when you need a fully local audit with no provider calls.
- Use the default **`anvil audit`** path when you want the full repo-specific synthesis layer.
- Good first run for your own evaluation: if a provider is already available, start with the default `audit` path; if you want the local-only baseline first, run `bunx @lambdacurry/anvil@alpha audit --target ./my-repo --ci` (or `anvil ...` after global install, or `npx ...` once Bun is installed) and then upgrade to the full path later.
- For an external first-user proof, default to one exact pinned `bunx @lambdacurry/anvil@<exact-version> audit ... --no-ai` command. If the tester already has both Bun and Node and explicitly prefers `npx`, the same command shape works there too; use [First User Proof](https://lambda-curry.github.io/anvil/guides/first-user-proof) for the exact repo-root vs parent-directory command to send.

## Quick FAQ

### Does Anvil require a provider key to work?

No. `--ci` works without one. The default full `audit` path still requires a working AI provider, which can be a local CLI or OpenAI.

### If I set an API key in my shell, will Anvil use it automatically?

If you run the default full `anvil audit` path, yes — Anvil may auto-detect an available provider. Use `--ci` when you want to guarantee no provider involvement.

### Does `--no-ai` still produce a real audit?

Yes. It is a deprecated alias for `--ci`, so you still get discovery, drift detection, coverage scoring, and a full markdown report without provider-backed synthesis.

### Should I assume all repo contents are safe to send once AI mode is enabled?

No. Treat provider-backed synthesis as an explicit trust decision. If you are unsure, stay on the local-only path.
