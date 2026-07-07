# Research Digest #1 — AI Rules Landscape

*Published: 2026-02-20 · Author: Scout/Anvil*

---

## Summary

Survey of the external landscape for AI rules tooling, patterns, and community thinking as of February 2026. Sources: block/ai-rules, Anthropic engineering blog, HumanLayer blog, community repos, Cursor docs.

---

## Finding 1 — The Instruction Budget Is Real and Finite

**Source:** HumanLayer, "Writing a good CLAUDE.md" (Nov 2025). Citing arxiv research (2507.11538).

**What they found:**
- Frontier thinking models can follow ~150–200 instructions with reasonable consistency.
- Non-thinking models degrade faster and more sharply.
- Claude Code's own system prompt consumes ~50 instructions before your rules load.
- As instruction count increases, degradation is *uniform* — the model doesn't just skip the later instructions, it starts ignoring all of them.

**Key quote:** "That's nearly a third of the instructions your agent can reliably follow already — and that's before rules, plugins, skills, or user messages."

**Practical implication for LC:**
The alwaysApply budget for any LC agent is roughly 80–100 instructions before we hit diminishing returns. Our AGENTS.md files tend to be long. This is a real risk — not theoretical. Anvil should flag any always-on file that crosses ~100 instructions.

**Actionable finding:** Add an instruction-count heuristic to the rubric and audit pass. (Done: rubric v1 §Part 1 addresses this.)

---

## Finding 2 — Progressive Disclosure is the Organizing Principle

**Sources:** Anthropic Engineering Blog, "Equipping agents for the real world with Agent Skills" (Oct 2025); HumanLayer blog; leehanchung.github.io deep dive.

**What they found:**
Anthropic formalized "progressive disclosure" as the core design principle for Agent Skills:

- **Level 1:** YAML frontmatter metadata (name + description) — loaded at startup for every installed skill
- **Level 2:** Full SKILL.md body — loaded when Claude decides the skill is relevant
- **Level 3:** Linked files within the skill directory — loaded only when the specific sub-task triggers them

**Key quote from Anthropic:** "Like a well-organized manual that starts with a table of contents, then specific chapters, and finally a detailed appendix, skills let Claude load information only as needed."

**What this means for LC:**
LC's 3-tier system (alwaysApply → glob → on-demand) maps well to this principle. The gap is that LC doesn't yet use linked files within SKILL.md files to defer deep context. Our skills tend to pack everything into SKILL.md directly.

**Actionable finding:** Recommend splitting heavy SKILL.md files (>200 lines) into a SKILL.md + linked reference files. Propose this pattern in the pattern library.

---

## Finding 3 — block/ai-rules: The Cross-Agent Rule Sync Tool

**Source:** github.com/block/ai-rules (Block/Square open-source project)

**What it is:**
A CLI tool that generates agent-specific rule files from a single `ai-rules/` source directory. Supports 11 agents: AMP, Claude Code, Cline, Codex, Copilot, Cursor, Firebender, Gemini, Goose, Kilocode, Roo.

**How it works:**
```
ai-rules/         ← canonical source (you edit these)
  ├── context.md
  ├── typescript.md
  └── testing.md

→ ai-rules generate

CLAUDE.md         ← generated
.cursor/rules/    ← generated
AGENTS.md         ← generated
```

**Relevance to LC:**
This is exactly what Forge's docs-site does for the react-router-starter — the `ai-rules/` → `.cursor/rules/` pipeline is the same concept. block/ai-rules just packages it as a standalone CLI.

**Notable observations:**
1. block uses "standard mode" (concatenation) vs "symlink mode" (symlinks to source) — the symlink mode is cleverer for monorepos.
2. The tool normalizes rule format across agents — good model for Forge's generator.
3. Their rule format is plain markdown without strong structure requirements. LC's format is more opinionated (and better for it).

**Actionable finding:** Monitor block/ai-rules for new agent targets. Potential: contribute LC's AGENTS.md format conventions upstream.

---

## Finding 4 — The System Reminder Problem

**Source:** HumanLayer blog, "Writing a good CLAUDE.md"

**What they found:**
Claude Code injects a `<system-reminder>` tag alongside CLAUDE.md content that tells Claude: "this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task."

**Why this matters:**
This is why bloated CLAUDE.md files get ignored — Claude is literally instructed to skip content it deems irrelevant to the current task. The more irrelevant content in your rules file, the more the model treats the whole file as low-relevance.

**Implication for LC:**
Rules that are always-on but only conditionally relevant are actively counterproductive. They don't just fail to help — they increase the chance that the always-on rules that *do* matter get ignored.

**Actionable finding:** This validates the rubric's guidance on "what belongs in alwaysApply." Add a specific audit check: flag any always-on rule that is conditional ("only do X when Y") — it should be a glob rule instead.

---

## Finding 5 — Agent Skills as an Open Standard

**Source:** Anthropic Engineering Blog; agentskills.io (published Dec 2025)

**What they did:**
Anthropic published Agent Skills as an open standard for cross-platform portability. The SKILL.md format (with YAML frontmatter) is now documented at agentskills.io.

**Current LC alignment:**
LC's skills already follow the SKILL.md format (YAML frontmatter + markdown body). This is good — we're aligned with the emerging standard.

**Gap:**
LC skills don't consistently link to supplementary files for depth. The skills we have tend to be monolithic. This is a minor gap but worth noting.

**Actionable finding:** When writing new skills, follow the progressive disclosure pattern — SKILL.md as entry point, linked files for depth. Update skills guidance in TOOLS.md network-wide.

---

## Findings Summary Table

| Finding | Source | Priority | LC Action |
|---|---|---|---|
| Instruction budget is finite (~150-200 instructions) | HumanLayer/arxiv | 🔴 High | Add budget check to audit pass |
| Progressive disclosure is the key design principle | Anthropic | 🔴 High | Pattern in library; update SKILL.md guidance |
| block/ai-rules: cross-agent sync tool | block/Square | 🟡 Medium | Monitor; potential contribution |
| System-reminder makes irrelevant rules actively harmful | HumanLayer | 🔴 High | Audit flag: conditional rules in alwaysApply |
| Agent Skills is now an open standard | Anthropic | 🟢 Low | LC already aligned; note for future |

---

## What to Research Next (Digest #2)

1. **PR history mining patterns** — How teams extract rule candidates from review comments. GitHub search for "recurring review feedback" tooling.
2. **Cursor rule community repos** — awesome-cursorrules and similar; which patterns are most referenced.
3. **Agent memory architectures** — claude-mem, mem0, and others. How do they handle progressive disclosure of long-running context?
4. **Staleness detection approaches** — Any tooling for detecting when rules become stale (e.g., file-watch based, date-based CI checks).
