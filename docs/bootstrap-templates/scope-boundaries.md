# Bootstrap Template: Scope Boundaries

*Last validated: 2026-05-27 · Author: Scout/Anvil · Status: Active*
*Sources: Concentrix "12 Failure Patterns" (Nov 2025), 12-Factor Agents Factor 12, Gartner 2027 cancellation data*

---

## Why This Template Exists

**Failure mode prevented:** Scope creep — the #1 observed agentic failure mode. Agents default to being maximally helpful. Without explicit scope declarations, they modify adjacent files, refactor out-of-scope code, delete things that "seem related," and take actions the user never intended. This erodes trust faster than almost any other failure mode because it is *surprising*: the user expected X and the agent did X + several things they didn't ask for.

**Evidence:** Concentrix catalogued 12 production agentic failure patterns; scope creep was the most frequently observed. Gartner's 2027 cancellation prediction cites governance gaps (agents operating without declared scope) as a primary driver. **Scope boundary rules are missing from 90%+ of community rule files analyzed by Anvil** (block/ai-rules, 130+ PromptHub files, internal dogfood targets).

**Why this needs to be a rule:** Vague guidance like "be careful" or "stay focused" does not produce reliable scope discipline. The agent needs a concrete, project-specific list of what it may and may not do. The rule must be specific enough to be testable: can a human reviewer look at an agent action and say "that was in scope or out of scope" based on this rule?

---

## The Rule

**Title:** Agent Scope Boundaries  
**Loading tier:** `alwaysApply: true` (this must load on every session — scope failures happen on any task)  
**Size:** ~30–50 lines (lean; this is foundational)  

```markdown
## Agent Scope Boundaries

*Last validated: [DATE]*

### What I may do without asking

- Modify files explicitly mentioned in the user's request
- Create new files following this project's established conventions
- Run read-only commands: `bun run typecheck`, `bun run lint`, `bun test`, `bun run build`
- Update imports and types when they are a direct consequence of a change in scope
- Fix obvious syntax or type errors introduced by my own edits

### What I must confirm before doing

- Modifying, creating, or deleting any file NOT mentioned in the request
- Committing or pushing to git
- Modifying configuration files (package.json, tsconfig.json, vite.config.ts, etc.)
- Touching any file related to authentication, payments, or environment secrets
- Any operation in the High-Stakes list below

### What I must never do

- Modify rules files (AGENTS.md, TOOLS.md, CLAUDE.md, .cursor/rules/) without explicit instruction
- Modify production configuration without explicit task scope
- Delete fixtures, test data, or migration files without explicit instruction
- Bypass or modify safety checks (hooks, CI gates, lint rules)

### When in doubt

If an action feels out of scope but might help: *announce the intention first, wait for confirmation.* 
Do not ask about every small decision — only ask when the action would be surprising to the user.
```

---

## Customization by Project Type

The core template above is the minimum. Extend it based on what's true for the project:

### For projects with databases (Prisma, Drizzle, SQL)
Add to "Must confirm":
```markdown
- Running any migration against a live database
- Generating migrations that include `DROP` or destructive `ALTER` statements
- Modifying seed data or fixture files
```

### For projects with payment integrations (Stripe, etc.)
Add to "Must confirm":
```markdown
- Any code that creates, charges, or modifies payment records (even in tests that hit real APIs)
- Changes to price IDs, product IDs, or webhook endpoints
```

### For monorepos
Add to the "may do" and "confirm" sections, scoped to packages:
```markdown
### Package scope (monorepo)

**May touch freely:** packages/{name-of-package}/
**Must confirm before touching:** other packages, root config, shared libs  
**Never touch without explicit scope:** packages/billing/, packages/auth/
```

### For projects with live production environments
Add to "Must never":
```markdown
- Run commands targeting the production environment (prefix `--env=prod`, remote DB URLs)
- Modify deployed infrastructure configuration (terraform, k8s manifests for prod)
```

---

## Examples

### ✅ DO — explicit scope confirmation

User: "Add error handling to the `createUser` function in `src/services/user.ts`"

Agent (scope discipline): Modifies `src/services/user.ts`, updates error types if needed, adds tests in `src/services/user.test.ts`. Before touching `src/api/routes/user.ts` to update the error response format: "I see the `createUser` route in `src/api/routes/user.ts` will receive the new error types — should I update that too?"

### ❌ DON'T — silent scope expansion

User: "Add error handling to the `createUser` function in `src/services/user.ts`"

Agent (scope creep): Modifies `src/services/user.ts`, refactors error handling in `src/services/post.ts` and `src/services/comment.ts` because "the pattern was inconsistent," updates 3 route files, adds a custom error class the user never asked for.

### ✅ DO — honest uncertainty escalation

Agent encounters an ambiguous case: "I need to update the auth middleware to support the new token format. This touches `src/middleware/auth.ts` — which is in the 'must confirm' list. I'll make the change in `src/services/auth.ts` as requested, but before I touch the middleware, should I?"

### ❌ DON'T — silent git ops

Agent: completes task, then silently runs `git add -A && git commit -m "fix: error handling" && git push` because "the task seems complete."

---

## Scope

**Loading:** `alwaysApply: true`  
**Who needs this:** Any project with an active AI assistant that generates, edits, or deletes files. Priority: HIGH — scope creep failures are trust-destroying and often irreversible.  
**Framework-agnostic:** Yes. The template language adapts to any stack. The "must confirm" list adapts to what's sensitive in the specific project.

---

## Integration with High-Stakes Registry

Scope boundaries and high-stakes registries are complementary but distinct:

- **Scope boundaries** govern *what files/systems may be touched* (spatial constraint)
- **High-stakes registries** govern *which operations require confirmation* (operational constraint)

A scope boundary rule says "don't touch production config." A high-stakes registry says "if you're about to run a migration, show me the diff first." Both are needed.

Reference: `docs/patterns/high-stakes-registry.md` (Goal 66)

---

## Bootstrap Detection Signal

The bootstrap generator should include this template when:
- Any package is detected (`package.json` present with any dependencies)
- **Always** — every project with an AI assistant needs scope boundaries
- Increase priority if: payments deps (stripe, braintree), database deps (prisma, drizzle, pg), or infra config files detected

**This template has no stack signal requirement.** It should be generated for 100% of projects. The only variation is in the "must confirm" and "must never" sections, which expand based on stack signals.

---

## See Also

- `docs/rubric.md` §Part 6 — Scope Boundary Declarations
- `docs/rubric.md` §Part 9 — Reliability Lens
- `docs/patterns/high-stakes-registry.md` (pending Atticus gate)
- Research Digest #13 — Agentic Workflow Reliability
- Concentrix "12 Failure Patterns of Agentic AI Systems" (Nov 2025)
