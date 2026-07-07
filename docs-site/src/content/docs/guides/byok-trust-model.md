---
title: BYOK & Trust Model
description: What stays local and what is sent when using Anvil's optional AI synthesis
---

*Last validated: 2026-04-23*

## What BYOK means

BYOK = Bring Your Own Keys for the AI-backed synthesis step when you choose a provider that uses API credentials. If you want a fully local no-provider run, use `--ci`.

If you have not decided whether you trust provider-backed synthesis yet, start with `--ci` first. You still get a real report before adding a key or logging into a local AI CLI.

## Default trust boundary

By default, Anvil scans the repo locally, then expects a working AI provider for the final synthesis step:

- You choose the target repo
- Anvil reads the repo locally
- Anvil generates the audit locally
- On the default `audit` path, Anvil may send focused audit context to an auto-detected or explicitly selected provider

```bash
# privacy-first — zero outbound calls
bunx @lambdacurry/anvil@alpha audit --target ./my-repo --ci
```

## What stays local

- Source files in the target repo
- Rule files and agent-instruction files discovered during audit
- Generated audit artifacts and markdown output
- Your provider API keys and local environment configuration
- Git metadata not needed for the audit run

## What may be sent to a provider

Only on the full AI-backed path, Anvil may send a **focused subset of audit context** — relevant rule content, audit findings, and compact synthesized context. Not your entire repository.

## What is never sent

- Your API keys or provider credentials
- Unrelated project files outside audit context
- Arbitrary local secrets
- Git history as part of the normal synthesis flow

## At a glance

| Surface | Local-only (`--ci`) | AI-assisted default `audit` |
|---|---|---|
| Repo scanning | stays local | stays local |
| Drift / coverage scoring | stays local | stays local |
| Markdown output | stays local | stays local |
| Provider credentials | stay local | stay local |
| Synthesis context | not sent | may be sent (opt-in only) |

## FAQ

**Does Anvil require a provider key?** No. `--ci` works without one, and the full path can also use local AI coding CLIs.

**If I set an API key, will Anvil use it automatically?** On the default full `anvil audit` path, it can. Use `--ci` when you want to guarantee no provider involvement.

**Does `--no-ai` still produce a real audit?** Yes — it is a deprecated alias for `--ci`, so the local-only structural lint path still works while the compatibility flag remains.
