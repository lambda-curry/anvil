# Research Digest #4 — Anthropic Context Engineering Deep Dive

*Published: 2026-02-20 · Author: Scout/Anvil*

---

## Summary

Deep-dive into Anthropic's canonical context engineering post (Sep 2025). This is the primary engineering reference for what Anvil's rubric is codifying. Three supporting findings: the attention budget has a mathematical basis (n² pairwise relationships), system prompt "altitude" is a named concept with defined failure modes on each extreme, and tools as context sources require the same engineering discipline as system prompts.

---

## Finding 1 — The Mathematical Basis for Context Rot

**Source:** Anthropic Engineering, "Effective context engineering for AI agents" (Sep 2025)

**What they establish:**
Context rot has an architectural explanation rooted in transformer attention:

> "LLMs are based on the transformer architecture, which enables every token to attend to every other token across the entire context. This results in n² pairwise relationships for n tokens. As its context length increases, a model's ability to capture these pairwise relationships gets stretched thin."

The n² relationship means that doubling the context length quadruples the attention relationships that must be managed. This isn't just a performance concern — it means longer contexts aren't just slower, they're qualitatively different in how the model processes them.

Additionally: models were trained on distributions where shorter sequences are more common than longer ones, so they have less experience with context-wide dependencies.

**For LC/Anvil:**
This is the mathematical grounding for the instruction budget concern from Digest #1. It's not an empirical observation about degradation — it's structural. Rules files bloat is actively harmful by design. This strengthens the rubric's case for leanness.

**Actionable finding:** Add the n² explanation to rubric §Part 1 as the "why" behind context engineering. "Context budget" is now backed by architecture, not just empirical observation.

---

## Finding 2 — System Prompt "Altitude" Is a Named Concept

**Source:** Anthropic Engineering, "Effective context engineering for AI agents" (Sep 2025)

**What they define:**
The "right altitude" concept for system prompts describes a Goldilocks zone between two failure modes:

- **Too low altitude (brittle):** Hardcoded complex logic, if-else thinking embedded in prompts. Creates fragility, maintenance nightmares, breaks on edge cases the author didn't anticipate.
- **Too high altitude (vague):** High-level guidance that fails to give concrete signals. "Be helpful and accurate" tells the model nothing. Falsely assumes shared context.

**The right altitude:** "Specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics to guide behavior."

Anthropic's direct recommendation: "Start by testing a minimal prompt with the best model available to see how it performs on your task, and then add clear instructions and examples to improve performance based on failure modes found during initial testing."

**For LC/Anvil:**
This maps directly to the rubric's "when to write a rule" criteria — start minimal, add only when failure modes are observed. The "altitude" framing is a useful mental model for auditing existing rules: are they at the right level of specificity? Too granular = brittle; too vague = useless.

**New audit dimension:** When reviewing a rule, ask: "Is this at the right altitude?" Too granular = hardcoded if-else logic (anti-pattern). Too vague = no concrete behavior signal (also anti-pattern). Good altitude = strong heuristic that generalizes.

**Examples:**
- ❌ Too low: "When the user asks about X, if the file is `src/auth.ts` then use pattern Y, unless the function is called `handleAuth` in which case use pattern Z"
- ❌ Too high: "Write good code"
- ✅ Right altitude: "Use the existing auth patterns in this codebase. When adding authentication, look for how existing protected routes are implemented and follow that pattern."

---

## Finding 3 — Tools Are Context Sources, Not Just Action Surfaces

**Source:** Anthropic Engineering (same post); Anthropic engineering blog, "Writing tools for AI agents"

**What they establish:**
Tools aren't just action mechanisms — every tool invocation and its result enters the context window. Tool results consume tokens that compete with rules and instructions. This creates a constraint:

> "It's extremely important that tools promote efficiency, both by returning information that is token efficient and by encouraging efficient agent behaviors."

Principles for tool design (from same source):
- Tools should be self-contained (no overlapping functionality)
- Tools should return minimal, structured results — not raw dumps
- Tools should be clear about their purpose so agents don't call them speculatively

**For LC/Anvil:**
This extends the context engineering concern beyond rules files to tools and skills. An SKILL.md that instructs agents to call a tool unnecessarily, or a tool that returns verbose output, can bloat the context just as much as a bad rules file.

**New audit dimension:** When auditing a workspace, note any SKILL.md that instructs agents to call tools with verbose output. Flag tool invocations that return more than needed (e.g., `gh api` calls that return full JSON when only one field is needed).

---

## Finding 4 — Iterative Curation Is the Practice, Not One-Time Setup

**Source:** Anthropic Engineering, "Effective context engineering for AI agents" (Sep 2025)

**Key framing:**
> "Context engineering is iterative and the curation phase happens each time we decide what to pass to the model."

This reframes rules files from "write once, maintain occasionally" to "curated artifacts that should be reconsidered with each evolution of the agent's task set."

For autonomous agents running on cron cycles, this means: every cycle is an opportunity to ask "is the context still optimally curated for what this agent is doing?" Not just "is the information still accurate" (staleness) but "is this information still *necessary*?"

**Anthropic's process recommendation:**
1. Start minimal
2. Test against failure modes
3. Add only what failure modes require
4. Periodically review whether added content still earns its place

This is more aggressive than the rubric's current "write when failure modes are observed" guidance — it also says *remove* content when it no longer earns its place.

**For LC/Anvil:**
Add a "removal" criterion to the rubric. Rules should be removed when: (a) the failure mode they address no longer occurs, (b) the codebase/tooling changed such that the rule is now default behavior, or (c) the content is now covered by a more general rule. The rubric currently only talks about when to add rules; it should also address when to remove them.

---

## Findings Summary Table

| Finding | Source | Priority | LC Action |
|---|---|---|---|
| n² attention explains context rot mathematically | Anthropic | 🔴 High | Add architecture explanation to rubric §Part 1 |
| "System prompt altitude" — named failure modes on each extreme | Anthropic | 🔴 High | Add altitude concept as new audit dimension |
| Tools are context sources — verbose tool results = context bloat | Anthropic | 🟡 Medium | Add tool output audit dimension |
| Context engineering is iterative curation, not one-time setup | Anthropic | 🔴 High | Add "removal criteria" to rubric |

---

## Rubric Additions Queued

From this digest, the rubric needs two additions:

1. **§Part 4 (When to Write) — Add: When to Remove a Rule**
   Rules should be removed when: failure mode no longer occurs, codebase made rule default, or more general rule now covers it. Removal is as important as addition.

2. **§Part 3 (Format) — Add: Altitude Guidance**
   Rules at the wrong altitude are useless. Define the three zones (too specific, too vague, right altitude) with examples for the LC context.

---

## What to Research Next (Digest #5)

1. **Infrastructure configuration as performance lever** — Anthropic engineering teased "infrastructure configuration can swing agentic coding benchmarks by several percentage points." What configs? Relevant for Forge's generator.
2. **A-MEM / MIRIX memory architectures** — Multi-type agent memory (episodic, semantic, procedural, core). How does this interact with SCRATCHPAD + pattern library design?
3. **Qodo's "organizational learning"** — How does it persist learnings across PRs over time? Relevant to Anvil's PR mining design.
