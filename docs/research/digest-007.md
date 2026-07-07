# Research Digest #7 — Rule Reliability, Memory Evolution, and the system-reminder Problem

*Date: 2026-02-23 · Anvil Cycle 8 · Researcher: Scout*

---

## Summary Table

| Finding | Source | Priority | LC Action |
|---|---|---|---|
| System-reminder wraps CLAUDE.md — rules can be silently ignored | HumanLayer, Nov 2025 | 🔴 High | Rubric: add "universal applicability" test to rule writing |
| 150-instruction ceiling — and it's already half-spent | HumanLayer/arXiv 2507.11538 | 🔴 High | Rubric: explicit budget constraint |
| MemRL: self-evolving via episodic RL — decouples reasoning from memory | arXiv 2601.03192, Jan 2026 | 🟡 Medium | Pattern: episodic decay policy for LC agents |
| A-MEM: Zettelkasten-style dynamic memory linking | arXiv 2502.12110, NeurIPS 2025 | 🟡 Medium | Pattern: connected notes > isolated MEMORY.md entries |
| block/ai-rules now covers 11 agents + MCP config | block/ai-rules, Feb 2026 | 🟢 Low | Monitor: Anvil should track block/ai-rules as community benchmark |

---

## Finding 1: The system-reminder Problem — Rules Can Be Silently Ignored

**Source:** HumanLayer — "Writing a good CLAUDE.md" (Nov 2025). URL: humanlayer.dev/blog/writing-a-good-claude-md

**What it says:**

Claude Code wraps CLAUDE.md/AGENTS.md in a `<system-reminder>` block with the following header:

```xml
<system-reminder>
 IMPORTANT: this context may or may not be relevant to your tasks.
 You should not respond to this context unless it is highly relevant to your task.
</system-reminder>
```

This means Claude **actively decides** whether to attend to your rules file based on perceived relevance to the current task. Rules that are not "universally applicable" to the kind of work being requested are likely to be silently ignored — not just de-prioritized, but skipped entirely.

**Why it matters:**

Most CLAUDE.md/AGENTS.md files mix universal rules (e.g., "use bun not npm") with task-specific conventions (e.g., "when adding a database schema, do X"). The task-specific rules dilute the file's perceived relevance, causing the model to discount the whole file — including the universal rules that should always apply.

HumanLayer suspects Anthropic added the system-reminder because most rules files they observed had low-relevance content, and filtering improved overall results. The implication: **a bloated rules file is worse than a focused one, even for the universal rules it contains.**

**LC implication:**

This is the strongest external validation of Anvil's core thesis:
- Small, sharp rules outperform comprehensive ones
- Rules should pass a "universal applicability" test before going into AGENTS.md
- Task-specific rules should use glob-matched files (Cursor .mdc, per-directory CLAUDE.md), not the root AGENTS.md

**Rubric addition (§Part 2 — Rule Sizing):**
> **Universal applicability test:** Before adding a rule to AGENTS.md/TOOLS.md (alwaysApply tier), ask: "Is this rule relevant to >80% of the tasks an agent will perform in this workspace?" If no, it belongs in a glob-matched or on-demand tier — not the root file.

---

## Finding 2: The 150-Instruction Ceiling — Half Already Spent

**Source:** HumanLayer citing arXiv 2507.11538 (instruction-following research). HumanLayer analysis of Claude Code system prompt.

**What it says:**

- Frontier thinking LLMs can reliably follow ~150-200 instructions. Smaller/non-thinking models decay much faster.
- The decay pattern is asymmetric: smaller models show exponential decay (each new instruction dramatically hurts), larger models show linear decay.
- Instructions at the **peripheries** (beginning + end of context) are followed most reliably. Middle instructions are most likely to be ignored.
- Claude Code's system prompt alone contains **~50 instructions** — consuming ~25-33% of the instruction budget before any user rules are loaded.

**Why it matters:**

If Claude Code's system prompt takes ~50 slots, and the model can reliably follow ~150 total, that leaves ~100 instructions for AGENTS.md + TOOLS.md + any skill files + user messages. Most LC workspace files probably consume another 30-50 instructions (counting each bullet, rule, or directive as one). This leaves a thin margin for actual task-relevant instructions.

**The peripheral bias** is also actionable: put the most critical rules at the *top* of AGENTS.md, not buried in the middle. The model attends to the beginning (high) and the most recent user message (high). Middle-of-file sections have the lowest attention weight.

**LC implication:**

1. **Instruction budgeting is real.** Anvil's rubric already acknowledges the instruction budget (§Part 1, n² attention), but the 50-already-spent finding makes this concrete.
2. **Position matters.** Most critical rules (North Star, override hook, Slack notification) should be at the top of AGENTS.md.
3. **Smaller models need smaller files.** If Jake ever runs an LC agent on a lighter model (flash-tier), rule file size matters even more.

**Rubric addition (§Part 1 — Why Rules Files Are Hard):**
> **The 150-instruction ceiling:** Research suggests frontier models reliably follow ~150-200 instructions total. Claude Code's system prompt consumes ~50. Your AGENTS.md + TOOLS.md + skills must fit in the remaining ~100-150 — and quality degrades linearly as you approach the ceiling. Most-critical rules should be at the **top** of the file (peripheral bias).

---

## Finding 3: MemRL — Self-Evolving via Episodic Reinforcement Learning

**Source:** arXiv 2601.03192 (Jan 2026, v2 Feb 2026). MemRL: Self-Evolving Agents via Runtime Reinforcement Learning on Episodic Memory. Code: github.com/MemTensor/MemRL

**What it says:**

MemRL proposes a non-parametric approach to agent self-evolution: instead of fine-tuning weights (expensive, catastrophic forgetting) or semantic matching (retrieves noise), it applies reinforcement learning **directly on episodic memory** at runtime.

Key design insight: **decouple stable reasoning from plastic memory.** The base LLM is frozen (stable cognitive reasoning). The episodic memory is the plastic component — it evolves via environmental feedback, selecting which past strategies were high-utility.

Their "Two-Phase Retrieval" mechanism:
1. **Phase 1:** Retrieve candidate memories via similarity
2. **Phase 2:** Filter for high-utility strategies via environmental reward signal — discards noise even if semantically similar

Results: outperforms SOTA on HLE, BigCodeBench, ALFWorld, Lifelong Agent Bench. Importantly, improves **without weight updates** — continuous runtime improvement from memory alone.

**LC implication:**

The stability-plasticity framing maps directly to LC's architecture:
- **Stable reasoning** = the agent's model weights (fixed)
- **Plastic memory** = MEMORY.md, skills, SCRATCHPAD — the mutable layer

The high-utility filtering insight is the key takeaway: **not all past experiences are worth remembering.** Currently, LC agents accumulate MEMORY.md entries without a reward/utility signal. MemRL's approach suggests adding a quality gate to episodic memory writes — only store experiences that produced useful outcomes (equivalent to "promoted to Semantic" in the Memory Taxonomy pattern).

**Pattern implication (Memory Taxonomy):**
The Episodic tier in the Memory Taxonomy pattern needs a **decay/filtering policy** — not just "time-ordered" but "utility-weighted." Low-utility episodic entries should decay or not be promoted to Semantic. This amends the existing pattern.

---

## Finding 4: A-MEM — Zettelkasten Memory Linking

**Source:** arXiv 2502.12110, NeurIPS 2025. A-MEM: Agentic Memory for LLM Agents. Code: github.com/WujiangXu/A-mem

**What it says:**

A-MEM applies the Zettelkasten note-linking methodology to agent memory. Instead of isolated memory entries (current MEMORY.md paradigm), each new memory:

1. Generates a structured note (contextual description, keywords, tags)
2. Analyzes existing memories for meaningful connections
3. Establishes links where similarities exist
4. **Triggers evolution of existing memories** — new information can update contextual representations of older memories

The linked network is more than a retrieval optimization — it enables "memory evolution" where past knowledge is actively refined as new knowledge arrives.

**LC implication:**

Current LC MEMORY.md files are flat lists. Important patterns get buried. Related memories don't reference each other. The Zettelkasten insight is that **connected notes > isolated notes** even with the same raw content.

This is aspirational for LC's current implementation (no memory tooling beyond text files), but it suggests a concrete improvement: when writing to MEMORY.md, explicitly link related entries. E.g.:
```
- Anvil rubric v1.3 added Provenance dimension (2026-02-22). Relates to: Rules File Backdoor finding (digest-006).
```

The memory-taxonomy pattern (Episodic/Semantic tiers) provides the structure; Zettelkasten cross-linking provides the density. Together, they make MEMORY.md searches much more effective.

**Near-term LC action:** Add a linking convention to the Memory Taxonomy pattern — when writing a Semantic memory, explicitly reference related entries by date or label.

---

## Finding 5: block/ai-rules — Now 11 Agents + MCP Support

**Source:** block/ai-rules GitHub (Feb 2026). URL: github.com/block/ai-rules

**Current state (as of Feb 2026):**

- 11 supported agents: AMP, Claude Code, Cline, Codex, Copilot, Cursor, Firebender, Gemini, Goose, Kilocode, Roo
- New: MCP (Model Context Protocol) config generation from the same source
- CLI commands: `init`, `generate`, `status`, `clean`, `list-agents`
- Config: `ai-rules/ai-rules-config.yaml` with per-project agent selection, nested depth, gitignore settings
- Rule format: standard markdown files in `ai-rules/*.md` → distributed to agent-specific formats

**What's notable:**

The single-source distribution model now spans MCP configuration — meaning the same rules that go into CLAUDE.md and AGENTS.md can also be served as MCP resources. This is significant: MCP is increasingly the integration point for agent tooling, and having rules available as MCP context enables on-demand loading vs. always-in-context loading.

**LC implication:**

Anvil tracks block/ai-rules as the community benchmark for multi-agent rule distribution. Their progression (11 agents, MCP) confirms the market is moving toward:
1. Single-source rules authoring
2. Multi-format distribution
3. On-demand loading via MCP

LC's current approach (per-project AGENTS.md, skills/bridge-communication) is architecturally sound but single-agent. If LC expands to external tooling integrations, block/ai-rules-style distribution becomes relevant.

---

## Agenda for Digest #8

1. **Instruction-following research** — Read arXiv 2507.11538 directly. Get the exact instruction count data and failure modes.
2. **MCP as rule delivery mechanism** — How are teams using MCP to deliver on-demand rules? Any community patterns?
3. **Claude Code hooks as rule enforcement** — Hooks in `settings.json` can enforce behaviors that AGENTS.md cannot (e.g., run lint before commit). How does this change the rules design space?
4. **MemRL practical implementation** — The frozen-LLM + plastic episodic memory model is the most practical memory architecture for LC. Look for implementation patterns.

---

## Rubric Amendments (v1.4 candidates)

*Based on Findings 1 and 2 — to be incorporated in next rubric update:*

**§Part 2 — Rule Sizing:** Add "Universal Applicability Test" (Finding 1)  
**§Part 1 — Why Rules Files Are Hard:** Add "The 150-Instruction Ceiling" with peripheral bias note (Finding 2)  
**§Part 5 — Hygiene:** Add "Position matters — critical rules at top of file" note (Finding 2)
