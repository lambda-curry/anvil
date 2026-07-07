# Bootstrap Generator Design

*Author: Scout/Anvil · Created: 2026-02-22*

---

## Mission

Generate a project-appropriate starter rule set from tech stack analysis — so a new LC project doesn't start with blank AGENTS.md/TOOLS.md files, and a new agent doesn't need to hand-author rules from scratch.

**Output:** A set of draft rule files (or additions to existing files) tailored to the project's actual stack, not a generic template.

---

## The Problem

New projects get one of two bad starts:

1. **Blank slate** — no rules, model operates on defaults. Failure modes accumulate until someone writes rules reactively.
2. **Generic template** — rules copied from another project. They describe a different stack, become stale immediately, and teach the model wrong things.

The bootstrap generator addresses both: analyze the actual project, generate rules grounded in what's actually present.

---

## Design Goals

1. **Stack-grounded** — rules reference packages, frameworks, and patterns that actually exist in the project
2. **Failure-mode oriented** — each generated rule explains the failure mode it prevents, not just the behavior it mandates
3. **Right-sized** — generated rules follow the rubric: one concern, 50-150 lines max, appropriate loading tier
4. **Draft, not final** — output is clearly marked as AI-generated; requires human validation before adoption
5. **Idempotent** — can run on existing projects without clobbering hand-authored rules

---

## Input Analysis

The generator reads signals from these sources:

### Primary: `package.json`
| Field | What it signals | Rules generated |
|-------|----------------|-----------------|
| `dependencies.react` | React project | Component structure, hook rules, JSX patterns |
| `dependencies.next` | Next.js | App router vs. pages dir, server/client component boundary |
| `dependencies.express` / `fastify` | Node API | Route structure, error handling, middleware patterns |
| `dependencies.prisma` | Prisma ORM | Schema-first patterns, migration discipline |
| `dependencies.drizzle-orm` | Drizzle ORM | Query patterns, type-safe queries |
| `dependencies.zod` | Zod | Input validation standard, schema-first design |
| `devDependencies.vitest` / `jest` | Test framework | Test file conventions, mock patterns |
| `devDependencies.eslint` | Linting present | ESLint config reference, lint-before-commit |
| `devDependencies.prettier` | Formatting present | Don't configure formatting manually — defer to prettier |
| `scripts.build` / `scripts.test` | Verification commands | Populate TOOLS.md verification section |

### Secondary: `tsconfig.json`
| Field | Signal | Rule |
|-------|--------|------|
| `strict: true` | Strict TypeScript | No `any`, no unsafe assertions |
| `paths` configured | Path aliases present | Use aliases in imports, document them |
| `target` | Runtime target | Don't use features above target |
| `module: "ESNext"` | ESM project | No CommonJS require() |

### Tertiary: Config files present
| File | Signal | Rule |
|------|--------|------|
| `tailwind.config.*` | Tailwind CSS | Use Tailwind utilities, no inline styles |
| `.env.example` | Env var pattern | Document all env vars in .env.example |
| `docker-compose.yml` | Docker workflow | Development via Docker, not local node |
| `biome.json` | Biome (lint+format) | Use biome, not eslint+prettier separately |
| `bun.lockb` | Bun runtime | Use bun, not npm/yarn |
| `pnpm-lock.yaml` | pnpm | Use pnpm, not npm/yarn |

### Quaternary: Directory structure
| Pattern | Signal |
|---------|--------|
| `src/components/` | Component library structure |
| `src/app/` or `pages/` | Next.js routing pattern |
| `src/lib/` or `src/utils/` | Utility layer present |
| `src/server/` or `api/` | Backend layer present |
| `__tests__/` or `*.test.*` | Test pattern established |
| `scripts/` | Script layer present |

---

## Output Format

The generator produces a **draft additions file** at `data/bootstrap-draft-<date>.md`, not directly modifying existing files. Format:

```markdown
# Bootstrap Draft — <project-name>
*Generated: <date> · Stack: <detected stack summary> · Status: DRAFT — requires human review*

---

## Detected Stack

- Runtime: Bun 1.x
- Framework: Next.js 15 (App Router)
- UI: React 19 + Tailwind CSS 3
- ORM: Prisma 5
- Validation: Zod 3
- Testing: Vitest 2
- TypeScript: strict mode

---

## Suggested AGENTS.md Additions

### Rule: Component Responsibility Boundary
*Failure mode: Component props grow to 20+ fields and internal state mixes server/client concerns — becomes untestable.*
...

### Rule: Zod-First Input Validation
*Failure mode: Unvalidated inputs reach the database or API without schema checks.*
...

## Suggested TOOLS.md Additions

### Verification Commands
\`\`\`bash
bun run typecheck    # from package.json scripts.typecheck
bun run test         # from package.json scripts.test
bun run build        # from package.json scripts.build
\`\`\`

## Rules Not Generated (Requires Human Judgment)
- Project-specific business logic rules
- Team conventions not detectable from config
- Performance budgets (no baseline data available)
```

---

## Rule Generation Logic

For each detected stack signal, map to a rule template with three parts:

1. **Title** — short, descriptive
2. **Failure mode** — why this matters (the actual failure, not a hypothetical)
3. **The rule** — what to do, with examples if needed

The failure modes come from Anvil's pattern library and research digests — not invented. If there's no documented failure mode in the library for a stack signal, don't generate a rule for it.

### Rule templates (seed set)

**React + hooks:**
- Failure mode: Side effects in render, stale closures in effects → infinite re-renders or silent bugs
- Rule: Keep side effects in useEffect with explicit deps. If deps array feels wrong, the abstraction is wrong.

**Next.js App Router:**
- Failure mode: Server component accidentally uses browser APIs (localStorage, window) → runtime crash in production
- Rule: Server components: no browser APIs, no useState, no useEffect. Client components: mark with 'use client' at top of file.

**Prisma:**
- Failure mode: Schema changes made without migration → local works, CI/production broken
- Rule: All schema changes go through `prisma migrate dev`. Never edit the database directly.

**Zod:**
- Failure mode: API receives unvalidated input, assumes shape at runtime → crashes or silent data corruption
- Rule: Every API route and form handler validates input with a Zod schema before touching it.

**Vitest:**
- Failure mode: Tests written against implementation details → break on refactor even though behavior is correct
- Rule: Test observable behavior, not internal implementation. Assert on outputs, not mocks.

**Tailwind:**
- Failure mode: Inline styles or style tags created for edge cases → inconsistent design, hard to maintain
- Rule: Use Tailwind utilities. If a utility doesn't exist, extend the theme — don't bypass it.

**Bun (as runtime):**
- Failure mode: npm commands used in scripts → wrong lockfile, wrong runtime behavior
- Rule: Use `bun run`, `bun add`, `bun remove`. Never npm or yarn in this project.

**Strict TypeScript:**
- Failure mode: `any` spreads through the codebase → type errors found at runtime not compile time
- Rule: No `any`. If a type is unknown, use `unknown` and narrow it explicitly.

---

## Algorithm (Phase 1)

```
1. Read package.json → extract deps, devDeps, scripts
2. Read tsconfig.json if present → extract compilerOptions
3. Scan root for config files (tailwind, biome, docker-compose, etc.)
4. Scan directory structure (src/, pages/, __tests__, etc.)
5. For each signal detected, look up rule template
6. Deduplicate (some signals overlap — e.g., Next.js implies React)
7. Determine loading tier for each rule:
   - Universal behavior → suggest alwaysApply
   - File-type-specific → suggest glob pattern
8. Generate draft markdown file
9. Print summary: N rules generated, N stack signals detected, N signals without template
```

---

## Implementation Plan

### Phase 1a — Stack Reader (~1 hour with Codex)
`scripts/bootstrap-detect.ts` — reads project signals, outputs structured JSON:
```json
{
  "runtime": "bun",
  "framework": "nextjs",
  "frameworkVersion": "15",
  "routerType": "app",
  "ui": ["react", "tailwind"],
  "orm": "prisma",
  "validation": ["zod"],
  "testing": "vitest",
  "typescript": { "strict": true, "paths": true },
  "packageManager": "bun",
  "configFiles": ["tailwind.config.ts", "docker-compose.yml"],
  "scripts": { "build": "next build", "test": "vitest run", "typecheck": "tsc --noEmit" }
}
```

### Phase 1b — Rule Generator (~1.5 hours with Codex)
`scripts/bootstrap-generate.ts` — reads the JSON from Phase 1a, looks up templates, writes draft file.

CLI:
```bash
bun run scripts/bootstrap-generate.ts <project-path> [--output <file>]
```

### Phase 2 — Template Library
Expand `docs/bootstrap-templates/` — one `.md` template per signal, following the rubric format. Templates are the source of truth; the generator reads them, doesn't have rules hardcoded.

---

## False Positive Prevention

The generator should **not** generate rules for:
- Patterns it can't verify are actually used (just because lodash is in deps doesn't mean it's misused)
- Business logic or domain conventions
- Team-specific preferences not detectable from config
- Rules already covered by existing AGENTS.md content (requires diffing)

Each generated rule is marked with its **evidence**: `*Generated from: prisma in dependencies, prisma/ directory present*`. This makes it easy for a human reviewer to accept or reject.

---

## Integration with Anvil's Audit Pipeline

The bootstrap generator is the **onboarding leg** of the audit pipeline:

```
New project → bootstrap-generate → draft rules → human review → add to AGENTS.md
                                                              ↓
Existing project → drift-detect → stale/broken rules → recommendations
                → mine-pr-rules → recurring feedback → rule candidates
```

The three tools (bootstrap, drift-detect, mine-pr-rules) cover the full rule lifecycle:
- **Bootstrap:** Start with something grounded, not blank
- **Drift detect:** Keep existing rules fresh
- **PR mining:** Surface rules that should exist but don't

---

## Success Criteria

Phase 1 is done when:
- Script runs against a real Next.js project and produces a non-empty draft with ≥3 correct, stack-grounded rules
- Each rule in the draft includes a failure mode
- Draft is clearly marked as DRAFT and not auto-applied
- No rules generated for signals without documented failure modes
