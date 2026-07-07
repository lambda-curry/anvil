# Anvil Rubric v2.2 — AI Rules + Guardrails Quality Standard

*Last validated: 2026-04-08 · Author: Scout/Anvil · Status: Active*
*v2.2 updates: measurable rule-effectiveness framework added (§Part 6), including minimum instrumentation, status buckets, and fixed-interval follow-up guidance*
*v2.1 updates: Freshness Evidence Checklist added (§Part 5, §Part 6); high-risk stale always-on guidance formalized for audits; drift resistance now scores lifecycle freshness evidence, not just dates*
*v2.0 updates: Stage C (Gap Coverage) + Stage D (Overkill/Noise) added to audit rubric; PR-derived recurrence coverage and noise pressure scoring now influence Rule Quality Score*
*v1.9 updates: Guardrail Readiness Score added as companion to Rule Quality Score (§Scoring); TypeScript-first scope declared; dual-score output format; links to guardrail-score-pack.md for full guardrail dimension details*
*v1.1 updates: Context engineering framing (§Part 1), Ball of Mud anti-pattern (§Part 5), Skill metadata audit (§Part 6)*
*v1.2 updates: n² attention explanation (§Part 1), Rule removal criteria (§Part 4), Altitude guidance (§Part 2)*
*v1.3 updates: Rule provenance hygiene (§Part 5), Rule effectiveness signal + structural validity (§Part 6), Scoring table updated (§Scoring)*
*v1.4 updates: Universal Applicability Test (§Part 2), 150-instruction ceiling detail + peripheral bias (§Part 1), Position matters hygiene (§Part 5)*
*v1.5 updates: IFScale degradation patterns + claude-sonnet-4 linear decay (§Part 1), Hooks as Enforcement — new §Part 8, IFScale citation for peripheral bias (§Part 5)*
*v1.6 updates: Hook Coverage scoring dimension added (§Scoring); 10-dimension scoring table now includes enforcement layer*
*v1.7 updates: Cursor official 500-line hard limit citation (§Part 1), "Apply Intelligently" as formal fourth loading tier (§Part 3), "Treat like production code" hygiene check (§Part 5)*
*v1.8 updates: Rules vs. capabilities split + 56% non-invocation finding (§Part 3), Vercel index compression pattern (§Part 3), .cursorrules+.mdc co-existence conflict flag (§Part 6), retrieval-led framing guidance (§Part 2)*
*v1.9 (cycle 13) updates: Enforcement Layer taxonomy + three-metric Qodo adoption framework (§Part 6); Cursor DiD empirical baseline (§Part 6); METR context gap signal (§Part 6)*

---

## What This Is

A rubric for evaluating AI rules **and engineering guardrails** in TypeScript repositories (monorepo and standalone). Optimized for helpfulness — rules that make agents measurably better at their jobs by preventing real failures, teaching the right patterns, and staying current. Guardrails catch what rules miss: CI gates, type safety, test coverage, review policies, and security boundaries.

Anvil audits produce two companion scores:
- **Rule Quality Score** (0–100): How good are the AI rules? (This rubric, §Scoring)
- **Guardrail Readiness Score** (0–35): How robust are the engineering guardrails? (See `docs/guardrail-score-pack.md`)

**v1 scope: TypeScript repositories.** Future versions will add language-specific packs for Python, Rust, Go, etc.

Covers: AGENTS.md, CLAUDE.md, TOOLS.md, Cursor `.mdc` files, SKILL.md, and any instruction file loaded into an agent's context window.

Rules taught well make agents faster and less error-prone. Rules taught poorly teach wrong things, create conflicts, or get silently ignored. This rubric exists to tell the difference and give concrete improvement paths.

**Quality gate — every rule must include:**
1. A clear **why** — the specific failure mode this rule prevents
2. A **concrete example** where relevant (DO/DON'T)
3. An **actionable instruction** — imperative, unambiguous, testable

---

## Part 1 — Rule Sizing

### Rules Files Are Context Engineering Artifacts

Rules files are not documentation. They are **context engineering artifacts** — they directly determine what information occupies the model's finite attention budget during every task.

Karpathy's definition (2025): "Context engineering is the delicate art and science of filling the context window with just the right information for the next step."

Anthropic's framing: "Context must be treated as a finite resource with diminishing marginal returns. Like humans with limited working memory, LLMs have an 'attention budget.' Every new token depletes it."

**Why context degrades — the n² architecture constraint:**
LLMs use transformer attention, where every token attends to every other token. This creates n² pairwise relationships for n tokens. Doubling context length quadruples attention relationships. Models also have less training experience with long sequences — they have fewer specialized parameters for context-wide dependencies. This is not a soft observation: it's structural. A bloated AGENTS.md doesn't just waste tokens — it *architecturally degrades* the model's ability to attend to what matters.

**Every line in a rules file costs attention budget.** Chroma Research documented "context rot": LLM performance degrades as context grows, even within the supported window. A bloated AGENTS.md doesn't just waste tokens — it actively degrades the model's performance on the task at hand.

The 12-Factor Agents principle (HumanLayer, 2025) states: "Even as models support longer and longer context windows, you'll ALWAYS get better results with a small, focused prompt and context."

This means: when writing or auditing a rules file, ask not just "is this correct?" but "does this earn its place in the context window?"

### The Core Principle: One Concern Per Rule

A well-sized rule covers exactly one failure mode, pattern, or constraint. If you can't summarize it in one sentence, it's two rules.

**Target size: 50–150 lines per file/section.** Above 200 lines: split it. Below 20 lines: consider whether it merits its own rule or belongs as a sub-point of another.

### The Instruction Budget

Based on IFScale benchmark research (arXiv 2507.11538, Distyl AI, Jul 2025) and HumanLayer analysis (2025), instruction-following accuracy degrades as instruction density increases. Claude Code's own system prompt consumes **~50 instructions before your rules load.**

**The three degradation patterns (IFScale, 20 models tested):**

| Pattern | Models | Behavior |
|---|---|---|
| **Threshold decay** | o3, gemini-2.5-pro (reasoning models) | Near-perfect until a density cliff, then sharp drop with rising variance |
| **Linear decay** | gpt-4.1, **claude-sonnet-4** (LC default) | Steady, predictable decline as instruction count increases |
| **Exponential decay** | gpt-4o, llama-4-scout | Rapid early collapse; severe degradation under moderate load |

**What linear decay means:** Every instruction you add costs a small, predictable fraction of compliance for all other instructions. There's no cliff — but there's no free lunch either.

**Estimated accuracy zones for claude-sonnet-4 (linear decay):**

| Instructions | Estimated reliability | Recommended use |
|---|---|---|
| ≤50 | ~95%+ | Safety-critical and always-mandatory rules |
| 50-100 | ~85-95% | Core conventions, high-priority patterns |
| 100-150 | ~75-85% | Supplemental guidance; accept some misses |
| >150 | <75% | Unreliable; consider hooks or splitting files |

**For critical rules** (security constraints, mandatory notifications, lockfile protection): treat **50 instructions as the high-reliability ceiling**. One in 20 invocations will miss at 50; one in 6 at 100. For critical rules, 1-in-20 is too high a miss rate without a hook backup.

**Peripheral bias (IFScale confirmed):** Instructions earlier in the prompt are followed more reliably. This bias is confirmed empirically across all 20 models in IFScale, not just an observation — it's a consistent finding.

**Tier budgets:**
- **alwaysApply rules:** Budget ~50 instructions for critical rules + ~30-50 more for conventions. Hard ceiling: 100.
- **Glob-matched rules:** Can be more generous — they only load when relevant files are touched.
- **On-demand/pull rules:** Effectively unlimited — loaded only when explicitly needed.
- **Hooks:** Deterministic enforcement outside the instruction budget entirely. For safety-critical rules, prefer hooks over AGENTS.md entries (see §Part 8).

**Implication:** If your alwaysApply rules exceed ~80 instructions, you're in the degraded-but-functional zone. Above 100, reliability drops below 85%. **Put the most critical rules at the top** (North Star, orientation, safety) — they have the highest attention weight due to peripheral bias. Move task-specific rules to glob or on-demand tiers.

### Official Size Limits by Tool

External tooling has hardened size limits that reinforce the principles above. When auditing a project, verify compliance with the limits for whichever tools it uses:

| Tool | Hard limit | Official source |
|------|-----------|----------------|
| **Cursor** | **500 lines per .mdc rule file** | Cursor official docs (2025) — this is a hard limit, not a suggestion |
| **Claude Code** | No hard line limit, but CLAUDE.md bloat triggers system-reminder skip (see Universal Applicability Test below) | Anthropic Claude Code docs |
| **GitHub Copilot** | 8,000 token limit for `.github/copilot-instructions.md` | GitHub Copilot docs |

**Cursor's 500-line limit in practice:** A rule file that exceeds 500 lines will be silently truncated or ignored. This means a 600-line Cursor rule file may have its last 100 lines — often the examples section — cut off. The model receives a structurally incomplete rule without any warning. **Keep Cursor .mdc files well under 500 lines; target 150 lines per file.**

**Implication for audits:** Any Cursor rules file in the 400+ line range is a flag. Recommend splitting it before it hits truncation silently.

### Size Anti-Patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| "Everything in CLAUDE.md" | Bloats always-on budget, triggers system-reminder to skip | Split into glob or on-demand rules |
| "Kitchen sink section" | 5 unrelated sub-rules under one heading | Split into 5 rules |
| "The novel" | >300 lines that nobody reads | Ruthlessly cut; pointer to docs for depth |
| "The stub" | One-liner rule with no why | Add failure mode + examples |

---

## Part 2 — Standard Format

Every rule should follow this structure. Not every section is required for every rule, but skipping one should be intentional.

```
# [Rule Title] — [Short Descriptor]

*Last validated: YYYY-MM-DD*

## Why (Failure Mode)

[1–3 sentences: what goes wrong without this rule. Be specific. "Agents tend to..." or "Without this, Claude will..."]

## The Rule

[The actual constraint or pattern. Short and direct. Use imperative voice.]

## Examples

### ✅ DO
[Concrete example of correct behavior/code/output]

### ❌ DON'T
[Concrete example of the failure mode]

## Scope

Globs: [if glob-matched] / alwaysApply: [true/false] / on-demand: [how to pull]

## See Also

- [Link to related rule]
- [Link to docs]
```

### Format Principles

**Why comes first.** Agents (and humans) follow rules better when they understand the failure mode. "Don't use `npm install`" is weaker than "Agents default to `npm` in this monorepo, which breaks the lockfile — always use `bun install`."

**Examples are load-bearing.** A rule without examples is a hypothesis. Examples demonstrate the failure mode in a form the model can pattern-match against.

**Imperative voice.** Rules give instructions. Use "Use X" not "X should be used." Use "Never modify Y" not "Y shouldn't be modified."

**No passive hedging.** "It may be useful to..." teaches nothing. Write the rule or don't.

**Retrieval-led framing for stale-framework projects (v1.8):** If the project uses a rapidly-evolving framework (TanStack Start, React Router 7, Drizzle ORM, Next.js 15+), include this instruction in AGENTS.md — it directly improved eval pass rates in Vercel's testing:

```markdown
## Framework Versions

This project uses [Framework] v[X.Y]. Prefer retrieval-led reasoning over pre-training-led reasoning — 
training data may reference older APIs. Check docs in [path] before generating framework-specific code.
```

One instruction, high impact. Agents tend to default to training knowledge for frameworks they've seen frequently — this instruction overrides that default when stakes are high.

---

## Part 3 — Loading Tiers

### Rules vs. Capabilities: The Fundamental Tier Decision (v1.8)

Before assigning a tier, answer this question: **Is this a rule (behavioral constraint) or a capability (a thing the agent can do)?**

**Rules** — behavioral constraints, conventions, safety requirements — belong in passive always-on or glob-matched context (Tiers 1–2). The agent must not decide whether to apply them.

**Capabilities** — tools, workflows, deep reference, on-demand domain knowledge — belong in skills/on-demand context (Tiers 3–4). The agent invokes them when needed.

**Why this matters — Vercel's 56% finding (Jan 2026):** Vercel published eval results showing AGENTS.md (passive context) achieved 100% pass rate on a Next.js 16 benchmark, while a skill (on-demand retrieval) achieved 53% — zero improvement over baseline with no docs. In 56% of cases, the agent never invoked the skill. The agent had access to the documentation and didn't use it.

The implication: **agents cannot reliably decide when to invoke retrieval.** For behavioral constraints you need applied consistently, passive always-on context beats on-demand retrieval by a substantial margin. On-demand retrieval is appropriate for reference material and complex capabilities — not for rules.

**The community mistake:** Many projects put behavioral rules in skills (on-demand) because they're large or domain-specific. They then wonder why the rules aren't followed. The answer is: the agent isn't invoking the skill for most tasks. Rules belong in context; capabilities belong in skills.

### Tier 1: alwaysApply — The Constitution

These rules load in every session, regardless of task. They are the non-negotiable foundation.

**What belongs here:**
- Identity, persona, and mission (who is this agent)
- Orientation ritual (how to start each cycle)
- Communication conventions (Slack format, notification requirements)
- Non-negotiable constraints (what the agent must never do)
- Tool invocation safety rules

**What does NOT belong here:**
- Framework-specific patterns (put in glob rules)
- Deep reference material (put in on-demand / linked files)
- "Nice to have" conventions — if it's optional, it's not always-on

**Budget: lean.** If your alwaysApply content exceeds 200 lines, it's probably carrying dead weight.

### Tier 2: Glob-Matched — Contextual

These rules load when the agent touches relevant files. They're specific but not universal.

**Glob pattern examples:**
```yaml
# Frontend patterns — only load when touching React/TS files
globs: apps/**/*.tsx, apps/**/*.ts
alwaysApply: false

# Testing conventions — only load in test files
globs: **/*.test.{ts,tsx}, **/*.spec.{ts,tsx}
alwaysApply: false

# Infra rules — only load with config files
globs: docker-compose.yml, *.dockerfile, k8s/**/*.yaml
alwaysApply: false
```

**Benefit:** These rules carry full detail without burning the always-on budget. A 150-line testing guide costs nothing when you're editing a React component.

### Tier 3: Apply Intelligently — Agent-Discretion (v1.7)

Some tools and frameworks support a fourth loading mode that falls between glob-matched and always-on: the rule is always *available* to the model, but the model decides whether it is relevant to the current task.

Cursor calls this mode **"Apply Intelligently"** — the model receives the rule in context but does not mechanically apply it; it reasons about whether the current task warrants it.

**When to use this tier:**
- Rules that are relevant to many but not all tasks in a workspace
- Cross-cutting concerns that have edge cases requiring judgment (e.g., "default to strict TypeScript, but relax for generated files")
- Rules that should inform but not override — agent reads them and decides relevance

**What makes a rule well-suited for Apply Intelligently:**
- The rule provides a strong heuristic, not an imperative
- Edge cases exist where the rule legitimately does not apply
- The model can recognize those edge cases without explicit enumeration

**What does NOT belong here:**
- Safety-critical rules (use hooks or always-on)
- Rules with zero exceptions ("never" rules belong in hooks)
- Rules that require consistent enforcement regardless of task

**LC equivalent (Claude Code):** Claude Code does not have a named "Apply Intelligently" mode, but the same effect is achieved by:
1. Adding the rule to the root CLAUDE.md/AGENTS.md with a `Note: apply when relevant to the current task` qualifier
2. Using `<user-hint>` or context-prefixing patterns to soft-suggest rather than mandate

**Audit note:** If a project uses Cursor and has rules that currently live in the always-on tier but have judgment-required edge cases — recommend moving them to Apply Intelligently to recover instruction budget.

### Tier 4: On-Demand — Deep Knowledge

These are linked from other rules or loaded explicitly. They may be large, reference-heavy, or niche.

**Patterns:**
- SKILL.md files (load metadata at startup; full content on trigger)
- `agent_docs/` referenced from CLAUDE.md
- Architecture deep-dives linked from overview rules
- Runbooks for specific failure scenarios

**Progressive disclosure principle (from Anthropic, 2025):** "Like a well-organized manual that starts with a table of contents, then specific chapters, and finally a detailed appendix, skills let Claude load information only as needed."

**Practical implementation for LC:**
- AGENTS.md / TOOLS.md: always-on
- SKILL.md files: metadata at startup, body on trigger
- `docs/` links: on-demand via explicit reference

### The Vercel Index Pattern — Hybrid Context Compression (v1.8)

For large reference material (framework docs, architecture overviews) that must be available but doesn't fit budget, use the Vercel-proven pipe-delimited index compression:

**Step 1:** Put a compact index in AGENTS.md / CLAUDE.md (always-on):
```
## Docs Index
IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning.
Docs root: ./agent_docs/
Available: 
|01-architecture:{overview.md,decisions.md,patterns.md}
|02-api:{endpoints.md,auth.md,errors.md}
|03-testing:{unit-guide.md,e2e-guide.md,fixtures.md}
```

**Step 2:** Keep full content in linked files (on-demand):
- `agent_docs/01-architecture/overview.md`, etc.

**Result:** The agent has a complete roadmap with minimal context overhead. It knows what exists and can pull specific files when needed. Vercel achieved 80% size reduction (40KB → 8KB) with zero performance loss — and maintained 100% eval pass rate.

**When to use:** Any project with substantial reference material (deep docs, runbooks, architecture guides) that would bloat the always-on budget. The index belongs in always-on; the content belongs on-demand.

---

### Tier Summary Table

| Tier | Name | When loaded | Budget | Best for |
|------|------|-------------|--------|----------|
| 1 | Always-On | Every session | Lean (~50-100 instructions) | Identity, orientation, safety |
| 2 | Glob-Matched | When relevant files touched | Generous | Framework patterns, testing conventions |
| 3 | Apply Intelligently | Always in context; agent decides relevance | Moderate | Cross-cutting heuristics with edge cases |
| 4 | On-Demand | Explicitly loaded | Effectively unlimited | Deep reference, runbooks, architecture |

---

## Part 4 — When to Write a Rule

### The Three-Occurrence Threshold

| Count | Action |
|---|---|
| 1 occurrence | Note it in SCRATCHPAD. Don't write a rule yet. |
| 3 occurrences | Rule candidate. Write a draft, validate against this rubric. |
| Cross-project | Archetype pattern. Consult Atticus before promoting network-wide. |

### When to Remove a Rule

Rules should be removed — not just added. A rule that no longer earns its place in the context window is actively harmful (uses attention budget for irrelevant content). Remove a rule when:

1. **The failure mode it addresses no longer occurs** — the codebase, tooling, or team practices changed such that the failure is no longer possible or relevant
2. **The behavior it enforces is now default** — the framework/runtime/tool now does this by default; the rule is teaching what the model already knows
3. **A more general rule now covers it** — a parent-level rule was added that supersedes this specific one; keeping both creates redundancy
4. **The rule was written for a one-time situation** — context that was temporarily relevant (migration, one-time refactor) should be removed when that situation resolves

**Anthropic's guidance:** "Context engineering is iterative and the curation phase happens each time we decide what to pass to the model." Rules files that only grow become balls of mud. Removal is as important as addition.

**Process:** At each audit cycle, for each rule ask: "If this rule weren't here, would the agent make a mistake in the current codebase?" If the answer is "probably not," the rule is a removal candidate.

### The Failure-Mode Test

A rule is justified when you can name a **specific, observed failure mode**. "Agents sometimes use the wrong package manager" is a failure mode. "Code quality" is not.

**Before writing a rule, ask:**
1. What exactly went wrong? (Specific incident, not vague concern)
2. Would a rule have prevented it? (Is it instruction-correctable?)
3. Is this likely to recur? (Pattern, not one-off)

If you can't answer all three: log it, don't rule it yet.

### Rule Altitude

Every rule operates at an "altitude" — a level of specificity. Rules at the wrong altitude are either brittle or useless. Anthropic's context engineering work names two failure modes:

**Too low altitude (brittle hardcoding):** The rule embeds complex if-else logic, specific file paths, or edge-case handling. It's highly specific but fragile — breaks on any variation not explicitly anticipated.
- ❌ "When the user asks about authentication, if the file is `src/auth/handlers.ts`, use `jwtVerify()`, unless the function starts with `handle` in which case use `authMiddleware()`"

**Too high altitude (vague signal):** The rule is so general it provides no concrete behavioral guidance. It assumes shared context that doesn't exist.
- ❌ "Write clean, maintainable code."

**Right altitude (strong heuristic):** Specific enough to guide behavior effectively, flexible enough to generalize across cases. Gives the model a pattern to match, not a case to execute.
- ✅ "Authentication in this codebase uses JWT middleware. When adding protected routes, look at how existing protected routes in `apps/api/routes/` handle auth and follow that pattern."

**When auditing rules, ask:** Is this at the right altitude? If a rule has more than one specific file path, it's probably too low. If a rule contains the word "always" or "good" without any concrete signal, it's probably too high.

### Universal Applicability Test (v1.4)

Before adding any rule to the **alwaysApply tier** (AGENTS.md, CLAUDE.md root), apply this test:

> **"Is this rule relevant to >80% of the tasks an agent will perform in this workspace?"**

If no → it belongs in a glob-matched or on-demand tier, not the root file.

**Why this matters:** Claude Code wraps AGENTS.md in a `<system-reminder>` block with the note: "this context may or may not be relevant to your tasks — you should not respond to this context unless it is highly relevant to your task." The model actively decides to skip the rules file if it deems it not relevant to the current task. A rules file filled with task-specific conventions triggers this skip — even for the universal rules it contains.

**Passing examples (>80% task relevance):**
- "Use bun, not npm" — relevant whenever any package operation is done ✅
- "Orientation ritual: read GOALS.md and SCRATCHPAD.md first" — relevant every cycle ✅
- "Post updates to #team-updates" — relevant whenever any output is produced ✅

**Failing examples (<80% task relevance → move to glob or on-demand):**
- "When adding a database schema, use..." — only relevant for DB work ❌
- "When creating React components, prefer..." — only relevant for frontend work ❌
- "The deploy process requires..." — only relevant for deployment tasks ❌

### Rules Are Not Documentation

Rules tell agents what to do. Documentation explains how things work. Don't collapse these:

- Rule: "Run `bun run typecheck` before committing."
- Documentation: "TypeScript configuration guide" (link from the rule)

If your rule is mostly explaining architecture: move the explanation to docs, keep the rule short.

---

## Part 5 — Hygiene

### The Ball of Mud Anti-Pattern

Named by the community (aihero.dev, Jan 2026), the "ball of mud" is the most common degradation mode for AGENTS.md files:

1. Agent does something wrong
2. Operator adds a rule to prevent it
3. Repeat hundreds of times over months
4. File becomes an unmaintainable mess

**Detection signals** — flag any file showing 3+ of these:
- Over 200 lines (alwaysApply files)
- Multiple unrelated rule sections without clear taxonomy
- Contradictions between sections
- No "last validated" dates
- Rules that start with "Also remember to..."
- Sections that were clearly written at different times (inconsistent voice, format variation)

**The auto-generation trap:** Auto-generated rules files (from scaffolding scripts or comprehensive templates) front-load too much content. They are "useful for most scenarios" but those scenarios never apply simultaneously. Start lean; add rules only when failure modes are observed.

**Prevention:** Before adding a rule, ask: "Is this a new concern or does an existing rule already cover it?" Append-only rules files become balls of mud. Every addition should be paired with a staleness review of what's already there.

### Position Matters — Critical Rules at Top (v1.4)

**Peripheral bias:** The IFScale benchmark (arXiv 2507.11538, Distyl AI, 20 models tested) empirically confirmed that LLMs attend most strongly to instructions at the **beginning** of context. Instructions presented earlier in the prompt are followed more reliably — consistently, across all model families. This isn't a soft observation; it's a quantified finding.

**For AGENTS.md / CLAUDE.md authoring:**

| File position | Attention weight | What to put here |
|---|---|---|
| Top of file | 🔴 Highest | North Star, identity, orientation ritual, override hook |
| Middle sections | 🟡 Lower | Conventions, workflow, reference material |
| End of file | 🟠 Medium | Reminders, "see also" pointers, lower-priority hygiene |

**Audit check:** If your North Star or safety constraints are buried on page 2 of the AGENTS.md — move them to the top. Every audit should verify critical rules appear in the first 20 lines.

### Staleness Is Active Harm

A stale rule teaches the model wrong things — confidently. This is worse than no rule. Every rule needs a `Last validated` date.

**Validation cadence:**
- **High-traffic rules** (alwaysApply, frequently triggered): validate monthly
- **Medium-traffic rules** (glob-matched): validate quarterly
- **On-demand rules**: validate when the underlying system changes

**Staleness signals:**
- The tool version referenced no longer exists
- The file path in the glob no longer matches project structure
- The example uses an API that's been deprecated
- The "don't do X" warning is no longer relevant — X now works fine

### Freshness Evidence Checklist (v2.1)

`Last validated` is necessary but not sufficient. A healthy rule shows **freshness evidence** — signals that it still matches the repo's current architecture, tooling, and workflow.

Score freshness by asking:

- **Validation evidence:** Does the rule include a recent `Last validated` date appropriate to its traffic level?
- **Reference integrity:** Do linked files, commands, package names, and globs still resolve in the repo?
- **Example integrity:** Do DO/DON'T examples still reflect the current stack and APIs instead of preserved historical snippets?
- **Scope containment:** Is the rule narrow enough that one architecture change won't stale the whole file?
- **Context cost:** If the rule went stale today, how expensive would it be because it is always-on or frequently loaded?
- **Workflow proximity:** Does the rule live close enough to the code/change flow that engineers will update it when the implementation changes?
- **Observed provenance:** Is the rule traceable to an observed failure mode, recurring PR feedback, or active workflow rather than a speculative edge case?

**High-risk stale always-on rule:** treat a rule as a priority remediation target when multiple signals combine:
1. missing or old validation evidence
2. always-on / root-loaded context
3. oversized or multi-topic content
4. stale references or examples
5. no clear observed-failure provenance

This is the most dangerous stale-rule shape because it is both wrong **and** expensive: it consumes attention budget on every task while teaching outdated behavior.

### Conflict Detection

Two rules conflict when they give contradictory instructions for the same situation. Conflicts are silent — the agent will follow one arbitrarily.

**Common conflict patterns:**
- Glob rule contradicts always-on rule on the same topic
- New rule added without checking existing coverage
- Rule migrated from one file to another, original not removed

**Prevention:** Before adding a rule, search existing rules for the same keyword/topic.

### Rule Provenance — New Security Dimension (v1.3)

Rules files are not just config — they are executed instructions. Pillar Security (Mar 2025) documented the "Rules File Backdoor" attack: hidden unicode characters embedded in rule files can silently inject malicious instructions that are invisible to human reviewers but executed by AI agents.

**Risk surface:** Any rule file from an external source — community repositories (cursor.directory, awesome-cursorrules), AI-generated content, templates copied from the internet.

**Provenance hygiene rules:**
1. **Track origin:** Note where each rule came from (e.g., `Source: internal / from cursor.directory 2026-01-12 / adapted from block/ai-rules`)
2. **Treat external rules as untrusted code:** Review them with the same rigor as a third-party npm package before installing
3. **Validate character encoding:** Rules copied from external sources can contain hidden unicode characters (zero-width spaces, direction overrides) that are invisible in most editors but active in AI context
4. **No auto-import of community rules** without explicit review — even "harmless" style guides from shared repositories

**Detection for audits:**
- Does the file contain any non-ASCII characters outside of code examples?
- Is the origin of each rule tracked?
- Were any rules mass-imported from a template or scaffolding tool without review?

**LC implication:** LC agents auto-load AGENTS.md, TOOLS.md, and SKILL.md files. If these files are compromised, every generation in that context is compromised. Skills pulled from external sources require source verification before installation.

### Treat Rules Files Like Production Code (v1.7)

Anthropic's Claude Code documentation (2025) states: "The best CLAUDE.md files are treated like production code — they're reviewed, maintained, and improved over time."

This is a governance statement, not just a quality note. It has concrete implications:

**Review before merge:** Rule additions should be reviewed by a human (or Atticus) before being activated. Unreviewed rules carry the same risks as unreviewed code — bugs, conflicts, and security issues (see Rule Provenance, above).

**Version control with history:** Rules files should be tracked in git with meaningful commit messages. "Added bun rule" is not meaningful. "Added bun rule to prevent lockfile corruption in CI (observed 2× in Feb)" is.

**Deprecation over deletion:** When removing a rule, note why it was removed (behavior now default in framework / failure mode no longer observed / superseded by broader rule). This prevents re-adding removed rules and makes the audit trail legible.

**No orphaned rules:** Every active rule should be traceable to a failure mode that was observed. If you can't find the failure mode origin for a rule, it's an orphan — removal candidate.

**Audit check:** When auditing, check the git log for the rules files. A long history of "fixed typo" or "reorganized" commits with no substantive change = rules file has become documentation theater. A history of rule additions tied to specific incidents = well-governed.

### Coverage Gaps

A coverage gap is when a known failure mode exists but no rule covers it. Regular audits should surface these by comparing observed failures against the rule set.

---

## Part 6 — Rule Quality Checklist

Before promoting any rule to active status:

- [ ] **Single concern** — one failure mode, one rule
- [ ] **Clear why** — specific, observed failure mode documented (not "best practice" or "code quality")
- [ ] **Concrete example** — DO/DON'T examples present for any non-trivial rule
- [ ] **Actionable instruction** — imperative voice, unambiguous, a reviewer could verify compliance
- [ ] **Appropriate tier** — alwaysApply, glob, or on-demand
- [ ] **Size check** — under 150 lines for atomic rules (maintainability hygiene)
- [ ] **No conflicts** — searched existing rules for contradictions
- [ ] **Last validated date** set
- [ ] **Freshness evidence** present — references resolve, examples still match the current stack, and context cost is justified
- [ ] **Scope/globs** accurate and tested against real file paths
- [ ] **Drift-resistant** — no hardcoded paths that will break, references verified current

### Rule Effectiveness Signal (v1.3)

A rule exists to prevent a failure mode. If the failure mode keeps occurring after the rule is in place, the rule is not working — and is wasting context budget.

**The Confidence Flywheel** (Qodo, 2025): Teams where AI has fewer hallucinations are 2.5× more likely to trust the output without review. This means rule effectiveness has a measurable proxy: reduction in correction frequency for the rule's governed domain.

**Effectiveness signals to track:**

| Signal | Measurement | Threshold |
|--------|-------------|-----------|
| PR comment recurrence | Re-run mine-pr-rules.ts quarterly | Same cluster at same frequency → rule not working |
| Review override rate | Count times humans undo AI output in rule's domain | Still high after 90 days → rule failing |
| Anti-pattern presence | Code search for the pattern the rule forbids | Pattern still widely present → rule not effective |
| Context budget ROI | Does the rule trigger only when needed? | Always-apply rule that rarely applies → move to glob |

**Audit trigger:** If a rule has been active for >90 days and its target failure mode still appears regularly in PRs or code, flag it for:
- Rewriting (is the rule at the right altitude? Too vague? Too specific?)
- Splitting (is it covering too many concerns?)
- Removal (is the failure mode it was preventing no longer a real failure?)

**The simplest proxy Anvil already has:** Run `scripts/mine-pr-rules.ts` quarterly. A cluster that appeared in a previous run but still appears at the same frequency after a rule was added = rule not working. Frequency drop = rule working.

#### Qodo's Three-Metric Adoption Framework (v1.9)

Qodo 2.1 (Feb 2026) operationalized rule adoption measurement across enterprises. The three dimensions are actionable and complement Anvil's Confidence Flywheel signals:

| Metric | What It Measures | How to Check |
|--------|-----------------|--------------|
| **Adoption rate** | % of developers/sessions following the rule in practice | PR mining — does the anti-pattern frequency drop? |
| **Violation trend** | Is violation count going up, down, or stable over time? | Static analysis warnings trend; lint violation count over rolling 30-day window |
| **Improvement rate** | Is code quality improving in rule-covered areas? | Before/after anti-pattern search in git log; code complexity trend |

All three metrics require a *baseline measurement before the rule is applied*. A rule introduced without a baseline cannot prove it works.

#### Minimum Effectiveness Instrumentation (v2.2)

For a rule to count as **measurably effective**, the project should be able to answer four questions:

| Question | Minimum acceptable answer |
|---|---|
| **What failure mode is this rule trying to reduce?** | Name the recurring mistake in plain language |
| **What was the baseline before the rule?** | PR recurrence count, violation count, quality metric, or an explicit `baseline missing` note |
| **What signal will show improvement?** | Pick one primary signal: review recurrence, violation trend, quality metric, or cleanup burden |
| **When will you check again?** | Set a fixed review interval, e.g. next quarterly PR-mining pass or next audit cycle |

This is intentionally small. Not every repo has analytics infrastructure, but every serious rule should still have a named failure mode, one observable signal, and a follow-up point.

**Preferred primary signals, in order:**

1. **Review recurrence** — same PR comment cluster appears less often over time
2. **Violation trend** — lint/static-analysis/test failures in the governed domain trend down
3. **Quality trend** — complexity, maintainability, or code-health signal improves or holds steady
4. **Cleanup burden** — reviewers report spending less time fixing AI output in that domain

**Status buckets:**

| Status | Meaning | Expected action |
|---|---|---|
| **Unmeasured** | No baseline and no follow-up signal | Do not claim effectiveness yet |
| **Instrumented** | Baseline + signal chosen, waiting for follow-up | Leave rule in place, gather evidence |
| **Improving** | Signal is moving in the intended direction | Keep; optionally tighten examples/enforcement |
| **Flat** | No meaningful change after the review interval | Rewrite, retier, or escalate to hook/CI |
| **Regressing** | Violations/cleanup/quality got worse | Treat as failing rule; revise immediately |

**Audit action:** If a rule is older than one review interval and still sits in `Unmeasured` or `Flat`, flag it for explicit follow-up. A rule that cannot show a baseline, a signal, or a review point is governance theater.

#### Enforcement Layer Taxonomy (v1.9)

Rules without a feedback mechanism cannot be measured. Assign every critical rule an enforcement layer:

| Layer | Description | Example |
|-------|-------------|---------|
| **None** | Text instruction only — agent may comply or ignore | "Always add error handling" |
| **Hook** | Stop/PostToolUse hook enforces the rule deterministically | Stop hook: run typecheck before completing |
| **CI Gate** | Required CI check blocks merge on violation | `tsc --noEmit` as required status check |
| **MCP Tool** | Agent self-corrects via tool feedback loop | CodeScene `code_health_review` — agent refactors on quality regression |

**Flag:** Rules at Layer "None" that govern critical behaviors (security, required processes, quality gates) should be escalated to Hook or CI Gate. Text-only rules for critical concerns are not governance — they're aspiration.

#### The "Implicit Rules" Decay Signal (v1.9)

METR (July 2025) studied experienced developers (avg. 5 years, 1,500 commits in their codebase) using current AI tools. Result: **19% slower with AI than without.** The top explanatory factor the study identified: *"The repositories are large, with a lot of implicit rules."*

AI isn't at its best when operating on large codebases with patterns that are nowhere written down. Developers then spend time cleaning up AI-generated code that violated implicit conventions.

**The measurement signal:** Developer time spent cleaning up AI output is an observable proxy for "missing or stale rules." If developers regularly report spending significant time fixing AI code in a specific domain (routing, auth, error handling), that domain has an implicit rules gap.

**Audit action:** If AI-generated code regularly violates a pattern but no rule covers it explicitly, write the rule. Implicit conventions that experienced developers "just know" are exactly where AI fails — and exactly what rules exist to prevent.

#### Cursor DiD Baseline: Why Code Quality Rules Exist (v1.9)

*Source: "Speed at the Cost of Quality" — arXiv 2511.04427, CMU, Nov 2025*

A difference-in-differences study of 807 Cursor-adopting GitHub projects found:
1. **Short-term**: Significant velocity increase immediately after adoption
2. **Persistent**: Significant increase in static analysis warnings and code complexity
3. **Long-term**: The quality degradation *causes* velocity to slow back down

**The causal mechanism:** AI-generated code ships fast but with lower code health. Debt accumulates. The codebase becomes harder to maintain. Long-term velocity suffers.

This is the empirical motivation for code-quality rules. Rules that target complexity, test coverage, and static analysis warnings are the mechanism that preserves the initial velocity gain. Without them, teams get a short-term bump followed by a long-term regression.

**The measurement implication:** If a project tracks static analysis warning count before and after introducing AI-assisted coding, a flat or declining trend in warnings = rules are working. A rising trend = rules covering code quality are missing or ineffective.

### Structural Validity (v1.3)

Rules can be structurally broken in ways that cause silent failures — the file exists but the agent ignores it entirely. The community tool `cursor-lint` (Feb 2026) documented the failure taxonomy for Cursor `.mdc` rules; the same classes of failure apply to any rules format.

**Structural validity checklist:**

| Failure type | What breaks | How to detect |
|---|---|---|
| Missing required fields | Agent skips rule | Check AGENTS.md for required sections (Identity, Orientation, etc.) |
| Empty sections | Section header exists, no content | Search for `##` headers followed immediately by next `##` |
| Broken references | Linked file/path doesn't exist | Run drift-detect.ts |
| Invalid glob patterns | Rule never triggers | Test glob against actual file tree |
| Duplicate coverage | Two rules govern same pattern | Grep for overlapping keywords |
| `.cursorrules` + `.mdc` co-existence | `.cursorrules` is silently ignored | Check for both files in root; if both exist, `.mdc` wins, `.cursorrules` is dead |

**Note on `.cursorrules` + `.mdc` co-existence (v1.8):** If a Cursor project has both `.cursorrules` (legacy format) and `.mdc` files (current format), the `.mdc` files take precedence silently — no error, no warning. The `.cursorrules` file is effectively ignored. This is a common source of "my rules aren't sticking" debugging sessions. **Audit action:** If both exist, migrate `.cursorrules` content to `.mdc` and delete `.cursorrules`.

**For Cursor `.mdc` files specifically:** Missing `alwaysApply` field causes agent mode to silently skip the rule — no error, no warning. Run `npx cursor-lint` as part of any Cursor project audit.

### Skill Metadata Audit

For agents with multiple installed skills, audit the cumulative startup metadata cost:

1. Count installed skills (directories in `skills/`)
2. For each skill, count tokens in YAML frontmatter description (≈ characters ÷ 4)
3. Sum all skill description tokens
4. **Flag if total exceeds 500 tokens** — this is the point where skill proliferation starts competing with task context

Signs of skill metadata bloat:
- Descriptions longer than one sentence
- Multiple "Use when..." conditions in one description
- Skills whose descriptions overlap significantly (similar trigger conditions)

**Prevention:** YAML frontmatter descriptions must be one sentence. If two skills have similar trigger conditions, consider merging them or making one a sub-section of the other.

---

## Part 7 — LC-Specific Standards

### AGENTS.md Structure for LC Projects

LC AGENTS.md files should contain, in order:

1. **Identity** (who is this agent, mission statement)
2. **Orientation ritual** (how to start every cycle — what to read, in what order)
3. **Cycle structure** (research → act → notify loop or equivalent)
4. **Constraints** (hard limits, what the agent must never do)
5. **File map** (what key files exist and their purpose)

### TOOLS.md for LC Projects

TOOLS.md is the operational playbook — "how to do the things." It should contain:

1. **Timezone/environment** — Container quirks, UTC vs. CT
2. **Docker/networking** — Port mapping, `0.0.0.0` binding, host resolution
3. **Key tool invocations** — Scripts, CLIs, verification commands
4. **Tool limits** — Codex rolling window, rate limits
5. **Bridge protocol** — How to reach other agents

### The North Star Pattern

LC projects follow the North Star convention — a single mission sentence that's immutable unless set by a named person. This is an identity anchor, not just branding.

Format: `"[Mission statement]"` followed by `*Set by [person] on [date]. Immutable unless [person] changes it.*`

Purpose: Prevents scope creep in autonomous agents. When an agent drifts, the North Star is the correction.

---

## Scoring Guide (for Audits)

When auditing a rule set, score each dimension 1–5:

| Dimension | 1 (Poor) | 3 (Adequate) | 5 (Excellent) |
|---|---|---|---|
| **Helpfulness** | Rules address imagined concerns; no observed failure modes | Most rules tied to real failures; some speculative | Every rule makes the agent measurably better; traces to observed failure modes |
| **Clarity & Actionability** | Rules lack why/examples; vague instructions | Most rules have why sections; some examples | Every rule has clear why, concrete example, actionable instruction |
| **Consistency** | Multiple contradictions between rules | One or two minor overlaps | No conflicts found; cross-rule coherence verified |
| **Maintainability** | Bloated or stub-level; monolithic files | Mostly right-sized; some oversized sections | Every rule tight to its concern; progressive disclosure used |
| **Drift Resistance** | No dates; stale references; broken globs; no freshness evidence | Some dates and partial freshness evidence; partially current | All rules dated; recently validated; freshness evidence present; globs verified; critical rules at top. Drift detection serves helpfulness — stale rules teach wrong things. |
| **Trust Boundaries** | No origin tracking; rules from unknown sources | Some rules have origin notes | All rules have origin; external rules reviewed for safety |
| **Coverage** | Major failure modes unaddressed | Core patterns covered, gaps at edges | Comprehensive; no known gaps |
| **Gap Coverage (Stage C)** | Recurring PR failure themes mostly uncovered | Core recurring themes covered; some high-severity gaps remain | PR-derived recurring themes covered, including high-severity themes and critical baseline categories |
| **Overkill / Noise Control (Stage D)** | Rule noise high (redundancy/conflicts/context bloat) | Some redundant or low-yield rules; manageable context load | Lean rule surface, low redundancy/conflict pressure, high signal-to-noise |
| **Tier Use** | Everything always-on | Some glob use; no on-demand | Correct tier for every rule; universal-applicability test passed |
| **Effectiveness** | No signal rules are working; failure modes recurring | Some evidence rules reducing failure modes | PR mining confirms target patterns declining |
| **Hook Coverage** | Critical "always/never" rules exist with no hook enforcement; no `.claude/settings.json` | Some hooks exist; Stop loop guard missing or critical rules unhooked | All safety-critical and mandatory rules backed by hooks; Stop hooks use loop guard; SessionStart compact hook protects against compaction drift |

**Note on sizing:** Maintainability includes size guidance (~50–150 lines per rule, split above 200) as hygiene to keep rules focused and helpful — not as a cost-optimization metric. Well-sized rules are easier to maintain, review, and validate.

**Cost as optional diagnostic only:** Token count and cost impact may be tracked as an optional diagnostic signal but are never a core success criterion. The question is always "does this rule make the agent more helpful?" — not "does this rule cost too many tokens?" If a rule is helpful and well-sized, its cost is justified.

**Minimum acceptable score for production use: 3 across all dimensions.**

### v2.0 Scoring Composition

Anvil now computes Rule Quality using eight normalized dimensions:

1. Presence
2. Format
3. Tier assignment
4. Hygiene
5. Baseline coverage
6. Enforcement layer
7. Gap coverage (Stage C)
8. Overkill/noise control (Stage D)

Stage C inputs:
- PR-recurring theme coverage (weighted by recurrence)
- Comment-to-rule alignment against sampled PR review comments
- Critical baseline coverage (TypeScript, error handling, testing, security)
- High-severity theme coverage
- Freshness coverage (`Last validated`)

Stage D inputs:
- Redundancy pressure (accidental duplication)
- Conflict pressure (mirror drift/orphans + keyword conflict heuristics)
- Context load pressure (always-on line budget)
- Low-yield pressure (rules missing Why/Examples)

Rule Quality Score is the average of the eight normalized dimensions and reported as `0–100` and `0–5`.

### Guardrail Readiness Score (companion)

In addition to the Rule Quality Score above, every audit now produces a **Guardrail Readiness Score** (0–35) across 7 engineering dimensions. See `docs/guardrail-score-pack.md` for full scoring criteria, maturity bands, and TypeScript-specific checks.

| Dimension | What it measures |
|-----------|-----------------|
| CI discipline | Branch hygiene, required checks, green build |
| Type safety guardrails | tsconfig strictness, `tsc --noEmit` gate, type-aware lint |
| Test relevance/depth | Real scenario coverage, flaky test handling |
| Code quality policy | Lint/complexity/duplication + CI enforcement |
| Review/ownership | Human review for AI-authored critical changes |
| Security guardrails | Permission boundaries, secret/dep scanning, prompt-injection defenses |
| Drift resilience | Docs/rules aligned to real commands/paths; stale refs auto-flagged |

**Maturity bands:** Novice (0–10) · Emerging (11–18) · Reliable (19–27) · Hardened (28–35)

### Dual-Score Audit Output

Every Anvil audit report includes both scores with prioritized recommendations:

```
Rule Quality Score:        72/100
Guardrail Readiness Score: 21/35 (Reliable)

Top Recommendations:
1. [Security] Add secret scanning — Impact: Security 1→3
2. [Review] Add CODEOWNERS for critical paths — Impact: Review 2→4
3. [Rules] Split testing.md (280 lines) — Impact: Maintainability 3→4
```

See `docs/guardrail-score-pack.md` for full sample output and recommendation engine details.

---

## Part 8 — Hooks as Enforcement (v1.5)

*This section is specific to Claude Code / OpenClaw agent setups with hooks support.*

### Rules vs. Hooks: The Fundamental Difference

Rules in AGENTS.md and CLAUDE.md are **requests** — the LLM decides whether to comply based on context, relevance, and instruction budget. Hooks are **enforcement** — they execute deterministically, regardless of what the LLM chose.

> "Hooks provide **deterministic control** over Claude Code's behavior, ensuring certain actions always happen rather than relying on the LLM to choose to run them." — Anthropic Claude Code docs

**The design implication:** Safety-critical and always-mandatory behaviors belong in hooks — not rules files. Rules describe policy and conventions. Hooks enforce non-negotiable actions.

### The AGENTS.md / Hooks Split

| Rule type | Put in | Reason |
|---|---|---|
| "Always run typecheck after editing TS" | Hook (PostToolUse) | Deterministic; must not be skippable |
| "Never commit without lint passing" | Hook (Stop) | Enforcement gate; critical |
| "Post Slack notification at cycle end" | Hook (Stop) | Must always run; LLM forgets |
| "Never edit .env files" | Hook (PreToolUse, exit 2) | Blocking enforcement |
| "Use bun, not npm" | AGENTS.md | Preference; needs judgment in edge cases |
| "Test observable behavior" | AGENTS.md | Convention; requires contextual judgment |
| "Follow Handoff Packet format" | AGENTS.md | Pattern; requires interpretation |

**The "always/never" test:** If a rule uses "always" or "never" and the behavior is deterministic (no judgment needed), ask: "Would a missed compliance be harmful?" If yes — put it in a hook, not just AGENTS.md. Both can coexist: AGENTS.md for the policy statement, hook for the enforcement.

### Hook Handler Selection

| Need | Handler | Example |
|---|---|---|
| Deterministic check or action | `command` | Run lint, format, notify, git add |
| Judgment based on hook input | `prompt` | "Is this Bash command dangerous?" |
| Judgment requiring codebase state | `agent` | "Do tests cover the changed files?" |

Always prefer `command` — it's the fastest and most predictable. Escalate to `prompt`/`agent` only when context is needed.

### LC Hook Patterns

**Pattern 1: Mandatory Slack notification on Stop**
```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "bun run scripts/slack-notify.ts 'Cycle complete'",
        "async": true
      }]
    }]
  }
}
```
*When to use:* Any LC project where the agent posts cycle summaries. Async so it doesn't block Claude from stopping.

**Pattern 2: Block .env file edits**
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [{
        "type": "command",
        "command": "if echo '$CLAUDE_TOOL_INPUT_FILE_PATH' | grep -q '\\.env'; then echo 'Blocked: do not edit .env files directly'; exit 2; fi"
      }]
    }]
  }
}
```
*When to use:* Any project with .env files containing secrets.

**Pattern 3: Auto-typecheck after TypeScript edits**
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "if echo '$CLAUDE_TOOL_INPUT_FILE_PATH' | grep -qE '\\.(ts|tsx)$'; then bun run typecheck 2>&1 | tail -20; fi"
      }]
    }]
  }
}
```
*When to use:* TypeScript projects where typecheck is not part of the test suite.

### What NOT to Put in Hooks

- Rules requiring contextual interpretation ("be concise" — no hook can enforce that)
- Policies that change frequently (harder to update than AGENTS.md)
- Complex multi-step workflows (use skills instead)
- Rules that only apply to some tasks (use glob-matched rules instead)

### Hooks in Audits

When auditing an LC project's rules:

1. **Identify "always/never" rules in AGENTS.md.** For each one: is it deterministic? Is missed compliance harmful?
2. **Check whether a hook exists for critical rules.** If "post Slack notification" is in AGENTS.md but no Stop hook exists — flag it. The notification is LLM-optional.
3. **Check settings.json for existing hooks.** Are any hooks contradicting AGENTS.md rules? Are hooks stale (referencing scripts that no longer exist)?
4. **Score the project on "Hook Coverage"** — add to audit dimensions: are safety-critical rules backed by hooks?

### The Rule-Hook Duality

For the most critical rules, document both the policy and the hook:

```markdown
## Rule: Always post cycle summary to #team-updates

**Policy (AGENTS.md):** At the end of every cycle, post a summary to #team-updates using the team's notify script.

**Enforcement (settings.json Stop hook):** A Stop hook runs `slack-notify.ts` automatically when the agent completes. This is the backstop for cases where the agent forgot to post.
```

The AGENTS.md entry teaches the agent what to do and when. The hook ensures it happens even if the model didn't attend to the instruction.

### See Also

- Claude Code hooks documentation: code.claude.com/docs/en/hooks-guide
- Digest #8: hooks-as-enforcement pattern (2026-02-23)
- §Part 3 — Loading Tiers (AGENTS.md tier model)
- `docs/patterns/hooks-as-enforcement.md` (planned)
