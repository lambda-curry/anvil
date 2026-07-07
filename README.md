# Anvil — AI Rules + Engineering Guardrails Audit Engine

AI rules and engineering guardrails audit engine. Anvil optimizes project outcomes — quality, reliability, and maintainability — by auditing what exists, detecting drift, scoring guardrail readiness, and giving concrete improvement paths grounded in observed failure modes.

> **Charter:** Scout/Anvil | **Status:** Active — Report as Decision Tool shipped · Current: collect outside-Lambda-Curry first-run proof on pinned `0.1.0-alpha.5`
> **Verification:** CI artifact (audit report) + downstream observed impact in rule quality

Anvil is not primarily a UI project. Its real proof surface is whether downstream outputs and consumers reflect the intended rule behavior correctly.

## What Anvil Does

Rules and guardrails in AI-assisted codebases accumulate organically. Contradictions emerge. Patterns go stale. Safety nets drift. Repeated PR feedback never becomes a durable standard. Anvil closes that loop.

- **Audit existing rules** — score for coverage gaps, stale references, conflicts, sizing issues, and format compliance
- **Score engineering guardrails** — measure readiness across CI, type safety, test depth, code quality, review ownership, security, and drift resilience
- **Bootstrap from scratch** — generate starter rule sets from tech stack analysis (package.json, tsconfig, framework config)
- **Mine PR history** — surface recurring review feedback that should become rules
- **Drift detection** — flag rules whose globs no longer match, patterns with no rule or guardrail coverage
- **Shape report-quality outputs** — make audit results easier to act on and safer for downstream consumers
- **Community intelligence** — track public ai-rules repos and relevant upstream findings

**Framework-agnostic.** Works on any AI-assisted codebase, not just OpenClaw workspaces.  
**User-directed.** Users select which repos to evaluate — Anvil scores and recommends, does not self-select targets.

## Current delivery posture

Anvil now follows the shared exploration delivery model.

- **Cycle mode** still comes from the charter (`explore` / `align`)
- **Delivery policy** lives in the registry under `deliveryPolicy`
- **Verification defaults** live in the registry under `verificationDefaults`

Current Anvil verification posture:

- `previewExpected: never`
- default proof: `downstreamObserved`
- additional proof: `ciArtifact`

## Current execution focus

- **Milestone 3 proof lane:** the remaining unchecked gate is one outside-Lambda-Curry first run on pinned `@lambdacurry/anvil@0.1.0-alpha.5`
- **Active repo-side lane while Milestone 3 stays external:** keep the first-user proof packet sharp, capture returned evidence under `docs/proofs/`, and keep the public repo-facing contract honest
- **Current checked-in self-audit:** `docs/audits/anvil-audit-2026-07-02.md` reports `98/100` Structural Lint, `35/35` Guardrail Readiness, `0` issues, and `0` remediation tasks on current `main`, and now names `AGENTS.md` as the single informational `source-only` mirror family
- **Recently shipped:** `.anvil/config.yml` profile + hard-gate support is live in the audit pipeline, with config validation, profile-aware scoring, report rendering, and non-zero hard-gate exits
- **Milestone 3 posture:** the publish refresh is done; the honest remaining path is one pinned outside-user run plus a retained evidence packet
- **Current proof packet:** `@lambdacurry/anvil@0.1.0-alpha.5` uses one canonical repo-root command, saves `./anvil-audit.md`, and stays on the public `--ci` local-only spelling. The external proof lane should stay pinned to this exact version.
- **Cycle policy:** keep unchanged external dependencies honest, but do not spend repeat cycles re-proving the same published-package behavior unless the build changes

Why:

- the meaningful proof is usually a produced report, rule output, or downstream consumer seeing the intended result
- visual review is not the primary correctness surface here

Shared contracts:


## Project structure

```
scripts/
  audit.ts                # run a rules audit against a target repo
  drift-detect.ts         # flag stale globs and uncovered patterns
  bootstrap-generate.ts   # generate starter rule sets from tech stack
  mine-pr-rules.ts        # mine GitHub PR review comments for rule candidates
  bootstrap-detect.ts     # tech stack detection for bootstrap
  share-audit-bundle.ts   # package audit output for sharing
  cycle-mode.ts           # project-local charter entrypoint
  bootstrap-cycle-memory.ts
  verify-cycle-memory.ts
  verify-cycle-handoff.ts
data/
  goals.md                # active goal and queued backlog
  progress-log.md         # shipped cycle log and validation trail
docs/
  rubric.md               # scoring rubric — the Anvil evaluation standard
  audit-config-design.md  # `.anvil/config.yml` schema, profiles, and merge logic
  audits/                 # audit outputs and artifacts
.project/
  setup.md                # local bootstrap and repo structure notes
```

## Project-local charter tooling

This repo includes local helper scripts for Scout's charter flow. They are useful, but they are not the project's identity.

Run the local selector from this directory:

```bash
bun run ./scripts/cycle-mode.ts
```

Verify the helper path:

```bash
bun run ./scripts/verify-cycle-memory.ts
bun run ./scripts/verify-cycle-memory.ts --handoff
bun run ./scripts/verify-cycle-memory.ts --all
bun run ./scripts/verify-cycle-handoff.ts
```

Use `verify-cycle-handoff.ts` when you want the handoff-only check as a stable one-command alias in CI or a task runner. It is equivalent to `bun run ./scripts/verify-cycle-memory.ts --handoff`.

## Install

> **Proof-lane note:** If you are here because someone sent you Anvil's external first-user proof packet, keep using the exact pinned `bunx @lambdacurry/anvil@<exact-version> ...` command from that packet. The floating `@alpha` commands below are for general public usage, not for the pinned proof flow.

Bun is the runtime requirement for the published CLI. Node is optional and only matters if you prefer `npx` as the launcher instead of `bunx`.

```bash
# Zero-install
bunx @lambdacurry/anvil@alpha audit --target ./my-repo

# Global install
bun add -g @lambdacurry/anvil@alpha
anvil audit --target ./my-repo

# npm launcher fallback (Bun still required)
npx @lambdacurry/anvil@alpha audit --target ./my-repo
```

Relative `--target` paths resolve from your current shell cwd. If you are already in the target repo root, use `--target .` instead. If you are one directory above the target repo, use `--target ./my-repo`.

## Fastest first run

Choose the lane that matches your setup before your first run.

If you are collecting the outside-user proof for Milestone 3, stay on the exact pinned version and launcher from [First User Proof](https://lambda-curry.github.io/anvil/guides/first-user-proof) instead of switching to the floating `@alpha` examples in this README. The current pinned `0.1.0-alpha.5` proof packet uses one repo-root `bunx` command with `--ci --output ./anvil-audit.md` so the saved report comes back from the first run.

### Local-only first pass (no provider required)

If you want to see a real report before wiring provider access, start here:

```bash
# already in the target repo root
bunx @lambdacurry/anvil@alpha audit --target . --ci

# one directory above the target repo
bunx @lambdacurry/anvil@alpha audit --target ./my-repo --ci
```

This path stays on your machine, skips AI synthesis, and still produces a real structural lint report on the first try.

### Full AI-backed audit (provider required)

Use this when you already have Claude Code, Codex CLI, Gemini CLI, opencode, or `OPENAI_API_KEY` configured:

```bash
# already in the target repo root
bunx @lambdacurry/anvil@alpha audit --target .

# one directory above the target repo
bunx @lambdacurry/anvil@alpha audit --target ./my-repo
```

(`npx ...` follows the same relative-target rule if Bun and Node are both installed, and `anvil ...` follows it after global install.)

Before you run a real audit, you can sanity-check the packaged CLI surface itself:

```bash
# Global install path
anvil --help
anvil --version

# Repo-local verification while developing Anvil itself
bun run ./bin/anvil.ts --help
bun run ./bin/anvil.ts --version
```

Verified on the current alpha packet:

- `--help` prints the four shipped entry commands: `audit`, `drift`, `bootstrap`, `mine-pr`
- `--version` prints `0.1.0-alpha.5`

Why you might choose this lane:

- shows the full product path, including repo-specific improvement synthesis
- auto-detects local AI CLIs first, then OpenAI if `OPENAI_API_KEY` is set
- gives new users the most decision-useful report instead of the thinner heuristic fallback

`--no-ai` still works as a backwards-compatible alias for `--ci` during the transition.

For first-run setup and CI/lint guidance, see:

- [`docs/getting-started.md`](https://lambda-curry.github.io/anvil/getting-started/first-audit) — first-run walkthrough, troubleshooting, local-vs-AI comparison
- [`docs/config-examples.md`](https://lambda-curry.github.io/anvil/guides/configuration) — copy-paste `.anvil/config.yml` starting points for internal tools, libraries, production apps, and prototypes
- [`docs/byok-trust-model.md`](https://lambda-curry.github.io/anvil/guides/byok-trust-model) — what stays local vs what is sent in AI-assisted mode
- [First User Proof](https://lambda-curry.github.io/anvil/guides/first-user-proof) — lightweight checklist for capturing the first real external success case against one pinned published package version
- [First User Proof Packet](https://lambda-curry.github.io/anvil/guides/first-user-proof-packet) — copy-paste outreach note plus a compact evidence template for that first external run

## Using Anvil

```bash
# Audit a repo's rules
bun run scripts/audit.ts --target /path/to/repo

# Detect drift (stale globs, uncovered patterns)
bun run scripts/drift-detect.ts /path/to/repo

# Bootstrap starter rules from tech stack
bun run scripts/bootstrap-generate.ts /path/to/repo

# Mine PR history for rule candidates
bun run scripts/mine-pr-rules.ts owner/repo
```

## Rubric summary

Full rubric: `docs/rubric.md`.

Quality gate for every rule:

1. **Helpfulness** — Does it prevent a real, observed failure mode?
2. **Clarity & actionability** — Clear why, concrete example, actionable instruction
3. **Consistency** — No conflicts with other rules
4. **Maintainability** — One concern per rule, about 50–150 lines as hygiene guidance
5. **Drift resistance** — Globs match real files; references are current
6. **Trust boundaries** — Rule provenance tracked, external rules reviewed

A rule that doesn't make the agent measurably better doesn't pass.

## Verification guidance

For most Anvil changes:

- prefer proof from produced rule/report outputs
- prefer proof that a downstream consumer or artifact reflects the intended change
- use CI artifact presence as supporting evidence when downstream observation is not yet available
- write merge / verification receipts at threshold crossings, not for every internal step

## Local guardrail hook

Anvil now ships a repo-local `.pre-commit-config.yaml` with lint, typecheck, and test hooks.

If you use `pre-commit`, install it once and enable the hooks:

```bash
pre-commit install
```

This does not replace CI. It makes the local path catch the same core regressions before they reach a commit.

## Notes

Keep this project legible as a product/project first.

Local helper scripts and charter tooling belong here because they support the work, but they should remain secondary to the actual project mission and proof surfaces.
