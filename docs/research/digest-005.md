# Research Digest #5 — Rule Lifecycle Automation & Memory Architecture

*Published: 2026-02-22 · Author: Scout/Anvil*

---

## Summary

Three high-signal findings this cycle: (1) Qodo 2.1 launched the first commercial "Continuous Learning Rules System" — automatic rule discovery from PR history, with conflict/decay detection baked in. This is Anvil's goals operationalized at enterprise scale, and worth studying for design patterns. (2) Anthropic published a new context engineering deep-dive covering context rot, compaction strategies, and the iterative curation loop — directly relevant to how Anvil should think about rule freshness as a context hygiene problem. (3) MIRIX introduced a 6-tier memory architecture for LLM agents — the memory taxonomy has implications for how LC agents should think about what gets persisted in rules vs. MEMORY.md vs. episodic state.

---

## Finding 1 — Qodo 2.1: The First Automated Rule Lifecycle System (Directly Relevant)

**Source:** Qodo, GlobeNewswire press release + product blog (Feb 17, 2026)  
**URL:** https://www.globenewswire.com/news-release/2026/02/17/3239368/0/en/Qodo-2-1-Introduces-First-Continuous-Learning-Rules-System-for-Enterprise-AI-Code-Review.html

### What they built

Qodo 2.1 ships a full rule lifecycle system with four components:

1. **Rules Discovery Agent** — Automatically generates standards from codebases and PR feedback (the "mine-pr-rules.ts" goal, but commercial-grade)
2. **Rules Expert Agent** — Identifies conflicts, duplicates, and outdated standards ("rule decay" detection — Anvil's drift-detect equivalent)
3. **Scalable Enforcement** — Rules enforced automatically during code review with fix suggestions
4. **Real-World Analytics** — Tracks adoption rates, violation trends, improvement metrics over time

Their framing: *"The system replaces static, manually maintained rule files with an intelligent governance layer that automatically generates rules from actual code patterns and past review decisions."* CEO Itamar Friedman: *"Engineering standards shouldn't be scattered across docs, linters, and engineer's heads."*

### Architectural patterns worth studying

**Two-agent model for rule work:** Discovery Agent (generates) + Expert Agent (maintains). Separation of concerns maps cleanly to Anvil's mine → audit → recommend pipeline. The discovery agent's job is to surface candidates; the expert's job is to evaluate health. These are different skills and shouldn't be conflated.

**"Sleep-time compute" for rule generation:** Qodo runs discovery asynchronously, not in the hot path. PR semantic index built at merge time; rule candidates generated offline. This is the right model — mining is expensive, should happen off-cycle.

**Rule analytics as a first-class concern:** Adoption rate, violation trends. Anvil currently has no measurement layer. Worth noting: rules without adoption data are just guesses about what the team actually follows.

### LC Action

Anvil's mine-pr-rules.ts script is the right direction. The Qodo architecture suggests:
- Keep mining async (run on a schedule, not per-PR)
- Separate candidate generation from candidate evaluation
- Long-term: track whether recommendations get adopted (adoption = signal, ignored = stale candidate)

**Priority:** High — directly validates the PR mining goal and provides architecture patterns for the script design.

---

## Finding 2 — Anthropic Context Engineering: Compaction as the First Lever

**Source:** Anthropic Engineering, "Effective context engineering for AI agents" (new post, Feb 2026)  
**URL:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

### What's new vs. Digest #4

Digest #4 covered the Sep 2025 Anthropic post (n² attention basis, altitude concept, iterative curation). This is a new Anthropic Engineering post that adds compaction and agent-specific context management strategies.

**Compaction as "the first lever":** When context grows too large, compaction distills message history into a high-fidelity summary, allowing the agent to continue with minimal performance degradation. Claude Code's implementation: pass message history to the model to summarize and compress critical details. Compaction preserves the essentials of what was decided, not the full transcript of how.

**Context rot is universal:** All models exhibit it; some more gracefully than others. Context must be treated as a finite resource with diminishing marginal returns — the attention budget framing from Digest #4, now with the compaction response built in.

**Context engineering is iterative:** Not a one-shot prompt design problem. Each turn of inference, the system decides what to pass. Rules files are one static component of this dynamic problem — they're the base layer that stays constant while conversation history and tool results change.

### LC Action / Rubric implication

The compaction concept maps to **rule file pruning**: when a rules file grows too large, compaction is the answer — distill to the essentials, not the history. The rubric's 150-line max and removal criteria (§Part 4) are compaction applied to rules files. Worth making this connection explicit in the rubric: *"Rule file bloat is the static equivalent of context window bloat — same problem, same solution (curate, compress, remove)."*

**Priority:** Medium — reinforces existing rubric direction, suggests a stronger framing rather than new content.

---

## Finding 3 — MIRIX: 6-Tier Memory Architecture for LLM Agents

**Source:** MIRIX AI, "MIRIX: Multi-Agent Memory System for LLM-Based Agents" (arxiv, July 2025)  
**URL:** https://arxiv.org/abs/2507.07957

### The 6 memory components

| Component | What it holds | Access |
|-----------|---------------|--------|
| Core Memory | Persistent agent + user identity (persona, preferences) | Always-in-context |
| Episodic Memory | Time-stamped events and interactions (what happened, when) | Query-retrieved |
| Semantic Memory | Abstract concepts, knowledge graphs, named entities | Query-retrieved |
| Procedural Memory | Workflows and task sequences as structured steps (JSON) | Query-retrieved |
| Resource Memory | References to external docs, images, links | Query-retrieved |
| Knowledge Vault | Verbatim facts, credentials, sensitive info with access controls | Controlled retrieval |

**Key architectural choice:** Core Memory is always-in-context (small, permanent). Everything else is query-retrieved (the progressive disclosure model).

**Meta Memory Manager:** Orchestrates the 6 specialized managers. Routes incoming information to the appropriate store. Routes retrieval queries to the right component. Prevents agents from having to know the memory architecture explicitly.

### How this maps to LC's current approach

LC agents currently have:
- AGENTS.md / TOOLS.md / MEMORY.md — equivalent to Core Memory (always-loaded)
- Skills system (codex-cli, bridge-communication, etc.) — equivalent to Procedural Memory (on-demand)
- memory_search / memory_get — equivalent to query-retrieved Semantic/Resource memory

**What LC is missing:**
- **Episodic memory:** LC's SCRATCHPAD is ephemeral per-cycle state — there's no structured log of what happened and when that an agent can query. The progress-log.md approximates this but isn't queryable.
- **Knowledge Vault:** No equivalent for sensitive/credential information with access controls separate from general memory

**Rubric implication:** Rules files belong in MIRIX's Core Memory tier — always-in-context, small, high-fidelity. If a rule belongs in the always-loaded tier, it must earn that position (size constraint, universal applicability). Rules that don't meet that bar should be in Procedural or Semantic — skills or on-demand reference docs.

The MIRIX taxonomy provides a vocabulary for answering "where should this live?" in LC's architecture:
- Universal behavior → Core (rules files)
- Workflows → Procedural (skills)
- Background knowledge → Semantic (memory_search index)
- Past events → Episodic (structured log, not yet in LC)

**Priority:** Medium-High — provides vocabulary and architecture for a future "memory taxonomy" rubric addition.

---

## Finding 4 — Qodo's "System Intelligence" vs. "Smart Linter" Framing

**Source:** Qodo Engineering Blog, "The Next Generation of AI Code Review: From Isolated to System Intelligence" (Feb 2026)  
**URL:** https://www.qodo.ai/blog/the-next-generation-of-ai-code-review-from-isolated-to-system-intelligence/

### The Mental Alignment concept

Before analyzing code, a senior engineer rebuilds context: Why is this change being made? What's the severity? What has the developer already tested? An AI reviewer that skips this step generates noise.

Qodo's "mental alignment" phase runs before code analysis — synthesizing PR description, change classification (bugfix/feature/refactor/hotfix), ticket context, and commit history into a structured mental model that calibrates all downstream analysis.

**Critical insight:** *"A comment about error handling reads differently on a production hotfix than on a feature branch. Context determines not just what to flag, but how to frame it."*

### Relevance to Anvil's rubric

Anvil's rubric says rules should have a failure mode orientation — they document why, not just what. The Qodo mental alignment concept extends this: a good rule reviewer (human or AI) needs to understand *which context applies* before applying the rule.

This maps to Anvil's **glob-matched rules tier**: rules loaded based on file context implicitly apply the right mental model. A rule for `*.test.ts` only fires when looking at tests. But the rule's "Why" section should make the context even more explicit: "When reviewing a test file, the reviewer's mental model is X, so this rule matters because Y."

**LC Action:** Consider adding to the rubric: rules that apply in different contexts (hotfix vs. feature, library vs. app code) should explicitly name the context in the "Why" section, not assume the reader has already set their mental model.

**Priority:** Low-Medium — subtle refinement to existing rubric, no new section needed.

---

## Summary Table

| Finding | Source | Priority | LC Action |
|---------|--------|----------|-----------|
| Qodo 2.1 Continuous Learning Rules System | Qodo (Feb 2026) | High | Architecture patterns for mine-pr-rules.ts; two-agent model, async mining, adoption tracking |
| Anthropic: Compaction as first lever | Anthropic Engineering (Feb 2026) | Medium | Strengthen rubric framing: rule bloat = context bloat, compaction = pruning |
| MIRIX 6-tier memory architecture | MIRIX AI arxiv (Jul 2025) | Medium-High | Memory taxonomy for "where should this live?" — rubric addition candidate |
| Qodo mental alignment concept | Qodo Engineering Blog (Feb 2026) | Low-Med | Rules should name their context in the "Why" section |

---

## Next Research Agenda

- **Rule adoption measurement:** How do teams track whether rules are actually followed? Metric design for rule effectiveness beyond "it exists."
- **Block/ai-rules community update:** Any new patterns or contributions since Digest #1?
- **Episodic memory for LC agents:** Is there a lightweight way to add structured event logging without a full memory infrastructure build?
- **Codex/Claude Code AGENTS.md patterns:** What's the community discovering about what makes AGENTS.md effective vs. ignored?
