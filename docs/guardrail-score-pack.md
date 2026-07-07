# Guardrail Score Pack v1

*Added: 2026-07-25 · Scope: TypeScript repositories (monorepo + standalone)*

---

## What This Is

Seven dimensions that measure whether a project has the **engineering guardrails** to catch what AI rules miss. Rules teach agents what to do; guardrails enforce what must be true regardless of who (or what) wrote the code.

Each dimension is scored 0–5. Total possible: 35. Combined with the Rule Quality Score (0–100), these two scores give a complete picture of a project's AI-readiness.

---

## The Seven Dimensions

### 1. CI Discipline (0–5)

Does the project enforce build hygiene through continuous integration?

| Score | Criteria |
|-------|----------|
| 0 | No CI configured |
| 1 | CI exists but doesn't block merge |
| 2 | CI runs on PRs; some checks required |
| 3 | Short-lived branches; required checks gate merge; build must pass |
| 4 | Merge frequency policy; green build enforced; no long-lived feature branches |
| 5 | All of 4 + branch protection rules; auto-close stale PRs; merge queue or rebase policy |

**TypeScript-specific checks:**
- CI runs `tsc --noEmit` (or equivalent typecheck command)
- CI runs `bun run build` / `npm run build` successfully
- Build artifacts are not committed to the repo

### 2. Type Safety Guardrails (0–5)

Does the project enforce TypeScript strictness at the tooling level?

| Score | Criteria |
|-------|----------|
| 0 | No tsconfig or `strict: false` |
| 1 | tsconfig exists; partial strictness |
| 2 | `strict: true` in tsconfig |
| 3 | Strict + `noUncheckedIndexedAccess` or equivalent additional flags |
| 4 | Strict config + `tsc --noEmit` gate in CI (no new type errors policy) |
| 5 | All of 4 + either type-aware ESLint rules (e.g., `@typescript-eslint/no-unsafe-*`) or a dedicated extra-strict TypeScript lane enforced in CI (for example a `tsconfig.strict*.json` pass with `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`) |

**What to check:**
- `tsconfig.json`: `"strict": true`
- `tsconfig.json`: `"noEmit": true` or separate typecheck script
- CI pipeline: `tsc --noEmit` or `bun run typecheck` step
- ESLint config: `@typescript-eslint/parser` with `parserOptions.project` set (enables type-aware rules)
- Or: a dedicated `typecheck:strict` / `tsc -p tsconfig.strict*.json --noEmit` lane that CI actually runs

### 3. Test Relevance / Depth (0–5)

Do tests cover real scenarios with regression confidence?

| Score | Criteria |
|-------|----------|
| 0 | No tests |
| 1 | Some tests exist; no CI integration |
| 2 | Tests run in CI; basic happy-path coverage |
| 3 | Real scenario coverage; tests catch regressions; test command documented |
| 4 | All of 3 + flaky test handling (quarantine, retry policy, or zero-flake policy) |
| 5 | All of 4 + test coverage thresholds enforced; mutation testing or snapshot review process |

**TypeScript-specific checks:**
- Test runner configured: `vitest`, `jest`, or `bun test`
- Test command in `package.json` scripts: `"test"` key exists
- CI runs `bun run test` / `npm test`
- Test files use `.test.ts` / `.spec.ts` convention

### 4. Code Quality Policy (0–5)

Is lint/complexity/duplication enforced, not just configured?

| Score | Criteria |
|-------|----------|
| 0 | No linter configured |
| 1 | Linter configured; not enforced in CI |
| 2 | Lint runs in CI; warnings allowed |
| 3 | Lint runs in CI; zero-warning policy; complexity rules enabled |
| 4 | All of 3 + formatter enforced (Biome/Prettier); duplication detection |
| 5 | All of 4 + custom rules for project-specific patterns; lint-staged or pre-commit hooks |

**TypeScript-specific checks:**
- ESLint or Biome configured with TypeScript support
- `@typescript-eslint` rules enabled (not just parser)
- Formatter: Biome `format` or Prettier with consistent config
- CI step: `bun run lint` / `biome check`

### 5. Review / Ownership (0–5)

Are human review requirements enforced for AI-authored changes?

| Score | Criteria |
|-------|----------|
| 0 | No review process; direct push to main |
| 1 | PRs used but not required; no review gate |
| 2 | PRs required; at least one reviewer |
| 3 | Required reviewers + CODEOWNERS file for critical paths |
| 4 | All of 3 + explicit policy for AI-authored PRs (elevated review for generated code) |
| 5 | All of 4 + automated review bots (CodeRabbit, etc.) + human sign-off on AI-generated critical changes |

### 6. Security Guardrails (0–5)

Are permission boundaries, secrets, and AI-specific threats addressed?

| Score | Criteria |
|-------|----------|
| 0 | No security configuration |
| 1 | `.gitignore` covers secrets; basic awareness |
| 2 | Secret scanning recommended and available (GitHub secret scanning, gitleaks, etc.) |
| 3 | All of 2 + dependency vulnerability scanning (Dependabot/Renovate/Snyk) |
| 4 | All of 3 + agent permission boundaries defined (file access restrictions, env protection) |
| 5 | All of 4 + prompt-injection defenses (input validation for agent-facing surfaces); tool-misuse detection (hooks blocking destructive commands) |

### 7. Drift Resilience (0–5)

Do docs/rules stay aligned to the actual project state?

| Score | Criteria |
|-------|----------|
| 0 | No docs; or docs with no validation |
| 1 | Docs exist; never validated against codebase |
| 2 | Manual validation occasionally; some stale references |
| 3 | Automated drift detection for file paths/globs in rules |
| 4 | All of 3 + CI step or periodic job that flags stale references |
| 5 | All of 4 + auto-flagging of stale rules; docs treated as code (reviewed, versioned, dated) |

---

## Maturity Bands

The Guardrail Readiness Score maps to a maturity band:

| Band | Score Range | Description |
|------|-------------|-------------|
| **Novice** | 0–10 | Minimal guardrails. AI output largely unverified. High risk of silent regressions. |
| **Emerging** | 11–18 | Some guardrails in place. Core gaps remain (usually security + review). |
| **Reliable** | 19–27 | Solid foundation. Most dimensions covered. Ready for high-volume AI-assisted development. |
| **Hardened** | 28–35 | Comprehensive guardrails. AI output is caught by multiple layers. Production-grade confidence. |

**Minimum recommended for AI-assisted development: Emerging (11+).**
**Target for teams shipping AI-authored code to production: Reliable (19+).**

---

## Sample Audit Output

```
══════════════════════════════════════════════════
  Anvil Audit: my-app                    ⚒️
══════════════════════════════════════════════════

  Rule Quality Score:        72/100
  Guardrail Readiness Score: 21/35 (Reliable)

  ── Guardrail Breakdown ──────────────────────
  CI discipline:        4/5  ✅
  Type safety:          5/5  ✅
  Test depth:           3/5  ⚠️  No flaky test policy
  Code quality:         4/5  ✅
  Review/ownership:     2/5  ⚠️  No CODEOWNERS; no AI-PR policy
  Security guardrails:  1/5  🔴  No secret scanning; no dep audit
  Drift resilience:     2/5  ⚠️  Stale glob in testing.mdc

  ── Top 3 Recommendations ────────────────────
  1. [Security] Add secret scanning — gitleaks or GitHub
     secret scanning. 2 min setup, blocks leaked credentials.
     Impact: Security 1→3

  2. [Review] Add CODEOWNERS for src/api/ and src/auth/.
     AI-authored changes to auth paths need human review.
     Impact: Review 2→4

  3. [Tests] Define flaky test policy. Quarantine or
     auto-retry known flaky tests to maintain CI trust.
     Impact: Test depth 3→4

  ── Missing Guardrails ───────────────────────
  • No dependency vulnerability scanning (Dependabot/Renovate)
  • No agent permission boundaries (.claude/settings.json)
  • tsconfig missing noUncheckedIndexedAccess

══════════════════════════════════════════════════
```

---

## Recommendation Engine Features

### Missing Guardrails Detector

Anvil scans project configuration files and flags guardrails that are absent:

| What it checks | Files inspected |
|----------------|----------------|
| CI configuration | `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile` |
| TypeScript strictness | `tsconfig.json`, `tsconfig.*.json` |
| Lint/format config | `eslint.config.*`, `.eslintrc.*`, `biome.json`, `.prettierrc` |
| Test setup | `vitest.config.*`, `jest.config.*`, `package.json` scripts |
| Review gates | `.github/CODEOWNERS`, branch protection (via API) |
| Secret scanning | `.gitleaks.toml`, GitHub settings |
| Dependency scanning | `.github/dependabot.yml`, `renovate.json` |
| Agent permissions | `.claude/settings.json`, `.cursor/settings.json` |

### Regression Watch

Track guardrail scores over time to detect regression:

- Store audit results with timestamps
- Flag when any dimension drops by ≥1 point between audits
- Surface trend in audit output: `Type safety: 5/5 (stable) | Review: 3/5 (↓1 from last audit)`

---

## TypeScript Policy Templates

### Starter Guardrails (Novice → Emerging)

Minimum viable guardrails for a new TypeScript project:

```jsonc
// tsconfig.json — strict baseline
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true
  }
}
```

```jsonc
// package.json — required scripts
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "test": "vitest run",
    "check": "bun run typecheck && bun run lint && bun run test"
  }
}
```

```yaml
# .github/workflows/ci.yml — minimum CI
name: CI
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run lint
      - run: bun run test
```

### Reliable Guardrails (Emerging → Reliable)

Add on top of starter:

- CODEOWNERS for critical paths (`src/auth/`, `src/api/`, config files)
- Dependabot or Renovate for dependency updates
- Branch protection: require PR, require CI pass, require 1 reviewer
- `.claude/settings.json` with file permission boundaries
- Lint-staged or Biome pre-commit formatting

### Hardened Guardrails (Reliable → Hardened)

Add on top of reliable:

- Secret scanning (GitHub native, gitleaks CLI, or equivalent repo-appropriate coverage)
- Agent tool-misuse hooks (block destructive commands, env file protection)
- Test coverage thresholds in CI
- AI-PR review policy documented and enforced
- Drift detection in CI (validate rule globs, check for stale references)
