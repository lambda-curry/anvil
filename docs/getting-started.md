# Getting Started with Anvil

Anvil audits AI rules in any codebase — scoring coverage gaps, detecting drift, and surfacing PR-derived rule candidates. This guide gets you from zero to a successful first audit in under five minutes.

---

## Start here

If you want the fastest successful first run, start with one local-only command:

```bash
bunx @lambdacurry/anvil audit --target . --ci
```

If you are one directory above the repo you want to audit, use `--target ./my-repo` instead.

Need `npx`, global install, or the full AI-backed lane? The install and first-run sections below keep those paths, but this is the first command Anvil wants a new user to trust.

> **Proof-lane note:** If you arrived here from `docs/first-user-proof.md` or `docs/first-user-proof-packet.md`, keep using the exact pinned `bunx @lambdacurry/anvil@<exact-version> ...` command from that outreach packet. The unpinned examples below are for general usage, not for pinned proof collection. If you are collecting outside-tester proof, do not switch versions or launchers mid-run.

---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- Node.js ≥ 20 only if you want to launch the published package with `npx` instead of `bunx`
- A local repo you want to audit (any codebase that has CLAUDE.md, AGENTS.md, `.cursor/rules/`, or similar AI rule files)

---

## Install

**Zero-install (recommended for a one-off run):**

```bash
bunx @lambdacurry/anvil audit --target ./my-repo
```

**Global install:**

```bash
bun add -g @lambdacurry/anvil
anvil audit --target ./my-repo
```

**npm launcher fallback (Bun still required):**

```bash
npx @lambdacurry/anvil audit --target ./my-repo
```

---

## Verify the CLI surface first (optional, 10 seconds)

Before you point Anvil at a real repo, you can confirm the packaged entrypoint responds as expected.

```bash
# after global install
anvil --help
anvil --version
```

What you should see in the current alpha:

- `--help` lists the four shipped commands: `audit`, `drift`, `bootstrap`, `mine-pr`
- `--version` prints `0.1.0-alpha.6`

If you are validating Anvil from a cloned checkout instead of a global install, run:

```bash
bun run ./bin/anvil.ts --help
bun run ./bin/anvil.ts --version
```

---

## First run — the happy path

If you are using the zero-install path, keep using `bunx` in the command examples below. Use `npx` only when Bun is already installed and you intentionally prefer the Node launcher. Use `anvil ...` only after you installed the CLI globally.

Point `audit` at a repo that contains AI rule files:

```bash
# zero-install
bunx @lambdacurry/anvil audit --target ./my-repo

# npm launcher fallback (Bun still required)
npx @lambdacurry/anvil audit --target ./my-repo

# or, if installed globally with Bun
anvil audit --target ./my-repo
```

Relative `--target` paths resolve from your current shell cwd. If you are already in the target repo root, use `--target .` instead. If you are one directory above the target repo, use `--target ./my-repo`.

What happens:

1. Anvil discovers the rule surface files the repo actually uses (CLAUDE.md, AGENTS.md, `.cursor/rules/`, `ai-rules/`, etc.)
2. Runs drift detection — stale globs, missing path references, date-stale entries
3. Checks coverage against a community baseline of common rule categories
4. Produces a scored report to stdout

You do **not** need every surface. A repo with well-scoped tool-native files can score well without also adding AGENTS.md / CLAUDE.md just to satisfy Anvil.

Expected output (abbreviated):

```text
Anvil Audit — /path/to/my-repo
Rule files found: 3
Guardrail score: 22/35

Coverage gaps:
  • No rule covers: error handling patterns
  • No rule covers: security/secrets hygiene

Drift issues (2):
  • CLAUDE.md:14 — glob 'src/legacy/**' matches 0 files (medium)
  • AGENTS.md:8 — referenced path 'docs/arch.md' not found (low)

Top 5 improvements:
```

---

## Save the report to a file

> **Current alpha note:** The published `0.1.0-alpha.6` proof packet uses one canonical repo-root `bunx` command with `--ci --output ./anvil-audit.md`, while the packaged CLI still resolves relative `--target` and `--output` paths from your shell cwd on `bunx`, `npx`, and Bun global install. Normal relative-path examples are honest when you use the unpinned command (it tracks the latest published build).

```bash
# zero-install with bunx
bunx @lambdacurry/anvil audit --target ./my-repo \
  --output ./audit-report.md

# zero-install with npx (Bun still required)
npx @lambdacurry/anvil audit --target ./my-repo \
  --output ./audit-report.md

# or, if installed globally with Bun
anvil audit --target ./my-repo \
  --output ./audit-report.md
```

Relative `--output` paths follow the same rule. If you run from the target repo root, `--output ./audit-report.md` saves the report inside that repo. If you run from the parent directory with `--target ./my-repo`, use `--output ./my-repo/audit-report.md` when you want the saved report to land inside the target repo instead of beside it.

Anvil writes the full markdown report to the path you specified.

---

## Optional: tune guardrail expectations with `.anvil/config.yml`

If your repo is a prototype, library, internal tool, or production app, you can make the guardrail score match that reality.

Create `.anvil/config.yml` in the target repo:

```yaml
version: 1
profile: internal-tool
hardGates:
  dimensions:
    ciDiscipline:
      minScore: 3
```

Then run `audit` normally. The report will show the active profile, apply the profile's weighted scoring, and fail with a non-zero exit code if an enabled hard gate misses its minimum score.

Use [`docs/config-examples.md`](https://lambda-curry.github.io/anvil/guides/configuration) for copy-paste starting points, or the public [Configuration guide](https://lambda-curry.github.io/anvil/guides/configuration) for the full schema and built-in profiles.

---

## Real example — end-to-end audit on a non-toy repo

To validate the alpha flow on a real codebase, Anvil was run end to end against a representative TypeScript application repo.

Use the same pattern on your own repository:

```bash
# zero-install
bunx @lambdacurry/anvil audit --target ./my-repo

# or, if installed globally with Bun
anvil audit --target ./my-repo
```

Example report artifact:

- [`docs/audits/lc-classic-starter-audit-2026-03-27.md`](./audits/lc-classic-starter-audit-2026-03-27.md)

A few concrete findings from that example run:

- Verdict: **CRITICAL**
- Rule Quality Score: **48/100**
- Guardrail Readiness Score: **8/35**
- First fix: restore structural trust by adding validation dates / freshness metadata

This gives external reviewers one full report example they can inspect before running Anvil on their own repo, while keeping the focus on Anvil's audit flow rather than on the example target itself.

---

## Run without any AI calls

Use `--ci` when you want deterministic local-only structural lint mode:

If you are already in the target repo root:

```bash
bunx @lambdacurry/anvil audit \
  --target . \
  --ci
```

If you are one directory above the target repo:

```bash
bunx @lambdacurry/anvil audit \
  --target ./my-repo \
  --ci
```

If you prefer the npm launcher fallback instead:

```bash
npx @lambdacurry/anvil audit \
  --target ./my-repo \
  --ci
```

If you prefer the global `anvil` launcher instead:

```bash
anvil audit \
  --target ./my-repo \
  --ci
```

`--ci` keeps discovery, drift detection, coverage scoring, and markdown output local. The report headline becomes `Structural Lint Score`, and the improvement section is generated from repo-local heuristics instead of a provider.

`--no-ai` still works as a deprecated compatibility alias for the same mode. The current external first-user proof packet stays pinned to `0.1.0-alpha.6` and uses `--ci` for the local-only lane.

Privacy-first example artifact from the same example target:

- [`docs/audits/lc-classic-starter-audit-no-ai-2026-03-27.md`](./audits/lc-classic-starter-audit-no-ai-2026-03-27.md)

That gives reviewers a concrete local-only report they can inspect alongside the optional AI-assisted example above.

### Compare the two example outputs before you opt in

If you are evaluating the trust/cost tradeoff, inspect the paired example reports side by side:

- AI-assisted example: [`docs/audits/lc-classic-starter-audit-2026-03-27.md`](./audits/lc-classic-starter-audit-2026-03-27.md)
- Local-only example: [`docs/audits/lc-classic-starter-audit-no-ai-2026-03-27.md`](./audits/lc-classic-starter-audit-no-ai-2026-03-27.md)

Practical reading order:

1. Read the local-only report first to see the fully local baseline
2. Read the AI-assisted example second to see what extra synthesis was added
3. Decide whether that extra interpretation is worth enabling for your own repo

What to compare first:

- **Structural diagnosis should stay stable:** verdict, stage failures, core score drivers, and remediation backbone should read substantially the same across both runs
- **Recommendation wording may differ:** the AI-assisted run can sharpen or reorder improvement suggestions because the synthesis layer is optional and additive

This makes the provider decision evidence-backed: compare the baseline local report to the optional synthesis layer before you turn anything on for your own codebase.

### Which mode should I choose?

- Choose the default **`anvil audit`** path if you want Anvil's full product output and already have a supported AI provider available.
- Choose **`--ci`** if you need a fully local run with no provider calls.
- Good evaluation order: run the default path first when a provider is already connected; otherwise run `--ci` first, then come back to the AI-backed path after installing or logging into a provider.

In short: default `audit` is the full AI-backed path; `--ci` is the deterministic local-only baseline.

### Common starting points by repo type

If you already know what kind of repo you are auditing, start from one of these:

- **Internal tool / agent workspace:** [`docs/config-examples.md#internal-tool`](https://lambda-curry.github.io/anvil/guides/configuration)
- **Library / SDK:** [`docs/config-examples.md#library`](https://lambda-curry.github.io/anvil/guides/configuration)
- **Production app / service:** [`docs/config-examples.md#production-app`](https://lambda-curry.github.io/anvil/guides/configuration)
- **Prototype / spike:** [`docs/config-examples.md#prototype`](https://lambda-curry.github.io/anvil/guides/configuration)

This keeps the first config choice concrete instead of making new users reverse-engineer the profile names from the full design doc.

### First-run trust-boundary FAQ

**Will Anvil upload my whole repo by default?**  
No. Anvil scans the repo locally either way. On the default `audit` path it may send a focused subset of audit context to an auto-detected or explicitly selected provider for the final synthesis step. Use `--ci` when you want the entire run to stay local.

**What is the safest first run if I just want to inspect output locally?**  
Run `bunx @lambdacurry/anvil audit --target . --ci` first if you are already in the target repo root, or `bunx @lambdacurry/anvil audit --target ./my-repo --ci` if you are running from its parent directory (and `anvil ...` works after global install; `npx ...` also works once Bun is installed). That keeps the run local and still gives you a real markdown report.

**If I do enable AI-assisted mode, should I assume everything gets sent?**  
No. Anvil is intended to send only focused audit context for the optional synthesis step, not your entire repo as a blind dump. See [BYOK trust model](https://lambda-curry.github.io/anvil/guides/byok-trust-model) for the exact boundary.

### Safe-first-run checklist

Use this if you are evaluating Anvil on a real repo for the first time:

1. Start with `bunx @lambdacurry/anvil audit --target . --ci` if you are already in the target repo root, or `bunx @lambdacurry/anvil audit --target ./my-repo --ci` if you are one directory above it (and `anvil ...` works after global install; `npx ...` also works once Bun is installed)
2. Review the local markdown report before enabling or troubleshooting any provider
3. If you want the full AI-backed report, rerun without `--ci` after connecting a supported provider
4. Re-check the [BYOK trust model](https://lambda-curry.github.io/anvil/guides/byok-trust-model) if the repo contains sensitive code or data

This keeps the first run fully local, then makes the AI-backed upgrade an explicit second step.

## If you are validating Anvil with an external tester

Use [First User Proof](https://lambda-curry.github.io/anvil/guides/first-user-proof) to capture one clean outside-Lambda-Curry first run against one specific published Anvil build. It keeps the evidence packet small: exact command, pinned CLI version, first-try success or failure, one report artifact, and one short usefulness/friction quote.

For that outside-proof lane, default the shared command to `bunx @lambdacurry/anvil@<exact-version> audit --target . --ci --output ./anvil-audit.md` and ask the tester to paste it from the target repo root. Replace `<exact-version>` before sending. If the tester needs a different launcher or shell layout, record that as a deviation in the returned proof packet instead of sending multiple choices up front.

Do not swap that tester onto the unpinned examples elsewhere in this guide. Those examples are for general public usage; the proof lane stays pinned to one exact published build from outreach through returned artifact.

If you want a copy-paste outreach note plus a fill-in evidence template, use [First User Proof Packet](https://lambda-curry.github.io/anvil/guides/first-user-proof-packet).

---

## Use a specific AI provider (optional)

The default `anvil audit` path requires AI synthesis for the final repo-specific improvement suggestions. If you already have a supported provider available, Anvil can auto-detect it. Use `--ai-provider` only when you want to force a specific provider/model pair. See [BYOK trust model](https://lambda-curry.github.io/anvil/guides/byok-trust-model) for exactly what is (and is not) sent.

```bash
# Example: use OpenAI via zero-install
bunx @lambdacurry/anvil audit --target ./my-repo \
  --ai-provider openai \
  --ai-model gpt-4o

# or, if installed globally with Bun
anvil audit --target ./my-repo \
  --ai-provider openai \
  --ai-model gpt-4o
```

Set your key in the environment:

```bash
export OPENAI_API_KEY=sk-...
bunx @lambdacurry/anvil audit --target ./my-repo --ai-provider openai
```

> **Security note:** Never commit API keys to version control or include them in shell scripts. Use environment variables or a secure credential manager.

---

## Detect drift only

If you only want to check for stale globs and broken path references:

```bash
# zero-install
bunx @lambdacurry/anvil drift ./my-repo

# or, if installed globally
anvil drift ./my-repo
```

---

## Bootstrap starter rules for a new repo

If your repo has no AI rule files yet, bootstrap a starter set from your tech stack:

```bash
# zero-install
bunx @lambdacurry/anvil bootstrap ./my-repo \
  --output ./bootstrap-draft.md

# or, if installed globally
anvil bootstrap ./my-repo \
  --output ./bootstrap-draft.md
```

Anvil reads `package.json`, `tsconfig.json`, framework configs, and similar signals, then generates a starter rule file tailored to your stack.

---

## Mine PR history for rule candidates

Surface recurring review feedback that should become rules:

```bash
# zero-install
bunx @lambdacurry/anvil mine-pr owner/repo

# or, if installed globally
anvil mine-pr owner/repo
```

Requires `GITHUB_TOKEN` in the environment. Anvil fetches merged PR review comments, clusters them by theme, and highlights the highest-frequency patterns that lack rule coverage.

---

## All commands

```text
anvil audit      Run full rule audit
anvil drift      Detect drift in rule surfaces
anvil bootstrap  Generate bootstrap rule draft from tech stack
anvil mine-pr    Mine PR review comments for rule candidates

anvil --help     Show usage
anvil --version  Show version
```

---

## What Anvil does not do

- It does not modify any files in your target repo (audit is read-only by default)
- It does not send credentials, git history, or unrelated project files to any provider
- It does not auto-select repos — you direct it to a specific target

---

## Troubleshooting

### First-run quick checks

If the first run does not match the examples, check these before assuming Anvil is broken:

- **You pointed at a repo without AI rule files.** Anvil looks for CLAUDE.md, AGENTS.md, `.cursor/rules/`, `ai-rules/`, and similar locations. A clean "no rule files found" result usually means the target repo simply does not have an AI-rules surface yet.
- **Your fully local run will not include AI-written improvement suggestions.** `--ci` is the local baseline. Compare that output to the AI-assisted example only if you intentionally run the default full path.
- **The install path matters.** If `anvil` is not found, use the zero-install path first: `bunx @lambdacurry/anvil audit --target ./my-repo`.
- **The default full path now requires a working AI provider.** If Anvil says no provider was detected, either install/login to Claude Code, Codex CLI, Gemini CLI, or opencode, set `OPENAI_API_KEY`, or rerun with `--ci`.

**No rule files found**
Anvil looks for CLAUDE.md, AGENTS.md, `.cursor/rules/`, `ai-rules/`, and similar locations. If your repo uses a different convention, check `docs/rubric.md` for the full discovery list.

**`bunx` not found**
Install Bun: `curl -fsSL https://bun.sh/install | bash`

**AI synthesis step fails**
Confirm your provider key or local AI CLI is available and the model name is valid. Use `--ci` to skip provider-backed synthesis entirely.

### Provider auth quick check

If a first AI-assisted run fails immediately, check these before assuming Anvil is at fault:

- **The provider flag and the key must match.** Example: `--ai-provider openai` expects `OPENAI_API_KEY` in your environment.
- **Verify the shell actually has the key.** Run `echo ${OPENAI_API_KEY:+set}` (or the equivalent for your provider) before retrying.
- **Try the local baseline first.** If `bunx @lambdacurry/anvil audit --target ./my-repo --ci` (or `anvil ...` after global install, or `npx ...` once Bun is installed) works but the default full run fails, the issue is usually provider auth or model selection, not the local audit pipeline.
- **Sanity-check the model name.** A bad model identifier can look like an auth/config problem on first run.

---

## Next steps

- Full scoring rubric: [`docs/rubric.md`](https://lambda-curry.github.io/anvil/reference/rubric)
- Trust model (what stays local, what is sent): [`docs/byok-trust-model.md`](https://lambda-curry.github.io/anvil/guides/byok-trust-model)
- Milestone scope and review contract: [`docs/byok-cli-alpha.md`](./byok-cli-alpha.md)
