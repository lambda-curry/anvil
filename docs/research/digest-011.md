# Research Digest #11 — Passive Context vs. On-Demand Retrieval

*Date: 2026-02-24 · Researcher: Scout/Anvil · Status: Active*

---

## Overview

This digest covers two significant findings: Vercel's empirical proof that static AGENTS.md context beats on-demand skill retrieval by 21 percentage points, and a community analysis of why Cursor rules underperform relative to Claude's skill system despite identical surface-level goals. Both findings have direct implications for the Anvil rubric and the LC pattern library.

---

## Finding 1: Vercel Eval — AGENTS.md 100% vs. Skills 79% (Next.js 16 Benchmark)

**Source:** Serenities AI, citing Vercel published eval results, January 2026.

### What Happened

Vercel ran a hardened evaluation suite against Next.js 16 APIs not present in current model training data (`use cache`, `connection()`, `forbidden()`). They tested four configurations:

| Configuration | Pass Rate | vs. Baseline |
|---|---|---|
| Baseline (no docs) | 53% | — |
| Skill (default behavior) | 53% | +0pp |
| Skill + explicit instructions | 79% | +26pp |
| AGENTS.md docs index | **100%** | **+47pp** |

Build/Lint/Test breakdown for AGENTS.md: **100% / 100% / 100%** (perfect across all three).

### Why Skills Failed

In **56% of eval cases, the skill was never invoked.** The agent had access to the documentation but didn't use it. Adding the skill produced zero improvement over baseline — and actually performed worse on test metrics (58% vs. 63%), suggesting unused skills introduce noise or distraction.

Even when explicit instructions were added, wording mattered dramatically: "You MUST invoke the skill" caused over-anchoring on docs; "Explore project first, then invoke skill" performed better. This fragility is the key failure signal.

### Why Passive Context Won

Three factors per Vercel's analysis:
1. **No decision point.** AGENTS.md content is in context on every turn — the agent doesn't decide whether to load it.
2. **Consistent availability.** Skills load asynchronously and only when invoked. Passive context is always present.
3. **No ordering issues.** Skills create sequencing problems (read docs first vs. explore first). Passive context avoids this.

### The Compression Technique

Vercel compressed 40KB of docs to 8KB using pipe-delimited directory index notation — while maintaining 100% pass rate. The format:

```
[Next.js Docs Index]|root: ./.next-docs
|IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning
|01-app/01-getting-started:{01-installation.mdx,02-project-structure.mdx,...}
|01-app/02-building-your-application/01-routing:{01-defining-routes.mdx,...}
```

Each line maps a directory to its doc files. The agent gets a roadmap without full content — and pulls specific files on demand when needed. 80% size reduction with zero performance loss.

### Anvil Rubric Implications

**This is a major finding for the Tier 3 (Apply Intelligently) and Tier 4 (On-Demand) debate in Rubric §Part 3.**

The Vercel result shows: for domain knowledge that agents must apply consistently (framework APIs, project conventions), **passive always-on context beats retrieval**, even when retrieval is available. The agent's decision to invoke retrieval is itself unreliable.

**Updated guidance for LC:**
- For critical project conventions that must apply consistently: put them in AGENTS.md (always-on), not skills (on-demand).
- For large reference material: use Vercel's compression technique — pipe-delimited index in AGENTS.md + full content in linked files. This is the right hybrid: minimal context overhead, maximum discoverability.
- **Re-evaluate skill placement:** If a skill is about consistent behavioral constraints (formatting, security, package manager), it should be in AGENTS.md, not a skill. Skills are for capabilities (running tools, complex workflows) — not rules.

**The key reframe:** Rules = AGENTS.md. Capabilities = skills. These are different things. The community has been conflating them.

---

## Finding 2: Why Cursor Rules Underperform vs. Claude Skills (Position and Provider Matters)

**Source:** Lellansin blog, January 2026.

### The Observation

Cursor rules and Claude skills appear identical in form — both package reusable behavioral constraints for context injection. But Cursor rules have a long history of community frustration (inconsistent following, debugging overhead, fragile wording). Claude skills are adopted more consistently and generate less community friction.

### The Root Cause: Upstream vs. Downstream

Cursor is a downstream application — it controls model behavior through prompt concatenation and runtime conventions. Rules remain "external constraints" rather than first-class model capabilities. This creates two problems:

1. **Cross-model inconsistency:** Cursor works with many LLM providers. The same rule performs differently across Claude, GPT-4o, and Gemini because each model interprets prompt constraints differently. This makes universal best practices impossible.

2. **Model quality gap:** Cursor's own model (Cursor small) prioritizes latency over reasoning. Deep rule compliance requires reasoning capacity it doesn't have.

Anthropic, as an upstream provider, can integrate Skill semantics into training and alignment — making skills first-class model reasoning, not prompt hacks.

### The `.cursorrules` → `.mdc` Precedence Issue (Community Finding)

From a developer in the Cursor vs. Claude Code comparison thread (Dev.to, Feb 2026): if a project has both `.cursorrules` and `.mdc` files, the `.mdc` files take precedence and silently override `.cursorrules`. This causes rules to appear to "not stick" — no error, no warning. The developer spent significant time debugging this.

**Audit implication:** When auditing a Cursor project, check for both `.cursorrules` and `.mdc` files. If both exist, the `.cursorrules` file is likely being ignored. Flag for cleanup.

### Anvil Rubric Implications

- Add to §Part 6 Structural Validity: check for `.cursorrules` + `.mdc` co-existence (silent precedence conflict)
- The upstream/downstream distinction reinforces why AGENTS.md works better than Cursor rules for consistent enforcement — Claude Code is the consumer of AGENTS.md directly, not through a downstream adapter

---

## Finding 3: Retrieval-Led vs. Pre-Training-Led Reasoning

**Source:** Vercel / Serenities AI analysis.

A subtle but important reframe from the Vercel experiment: the instruction embedded in their AGENTS.md that made the biggest behavioral difference was:

> "IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning."

This one instruction told the agent to check the docs index rather than rely on training knowledge. In the context of fast-moving frameworks (Next.js 16 APIs, TanStack v5 changes, React 19 patterns), this is a generalizable rule.

**LC application:** For projects using frameworks where the agent's training data may be stale (TanStack Start, React Router 7, Drizzle ORM), add this instruction to AGENTS.md:

```markdown
## Framework Versions

This project uses [Framework] vX.Y. Prefer reading docs in [path] over pre-training knowledge — training data may reference older APIs.
```

This is low-cost (one instruction) and potentially high-impact for projects with framework-version drift.

---

## Rubric Changes from This Digest

**Rubric v1.8 (queued):**

1. **§Part 3 — Tier guidance update:** Add explicit guidance: "For consistent behavioral constraints (not capabilities), prefer always-on context over on-demand retrieval. The agent's decision to invoke retrieval is unreliable." Cite Vercel's 56% non-invocation finding.

2. **§Part 3 — Compression technique:** Add "Vercel index pattern" as a named technique for hybrid contexts — pipe-delimited file index in AGENTS.md + full content in linked files. 80% size reduction with zero performance loss.

3. **§Part 6 — Structural Validity:** Add `.cursorrules` + `.mdc` co-existence as a conflict flag (silent precedence, no warning).

4. **§Part 2 — Format:** Add "retrieval-led framing" as a recommended pattern for stale-framework projects.

---

## Pattern Library Candidates

- **Retrieval-Led Instruction** — single-instruction pattern for stale-framework projects. "Prefer retrieval-led over pre-training-led reasoning." Low-cost, high-impact for rapidly-evolving stacks.
- **Vercel Index Pattern** — pipe-delimited doc index compression for large reference material. Enables 80% size reduction while maintaining discoverability.

---

## See Also

- Digest #7 — System-reminder problem (why AGENTS.md can be skipped)
- Digest #8 — IFScale degradation patterns
- Rubric §Part 3 — Loading Tiers
- `docs/patterns/progressive-disclosure-skills.md`
