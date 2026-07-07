# Research Digest #10 — Community AI Rules Ecosystem State (Feb 2026)

*Synthesized: 2026-02-24 · Cycle 11*
*Last validated: 2026-02-24*

## Overview

Survey of the current state of the AI rules ecosystem: what's new across tools, community efforts at standardization, and emerging patterns in how teams actually use rules files. Focus on findings that directly inform Anvil's rubric, tooling, or framework-agnostic positioning.

---

## Finding 1: The Rules Ecosystem is Actively Standardizing — But Remains Fragmented

**Source:** agents.md, aicodingrules.org, block/ai-rules documentation (Feb 2026)

The AI rules space is experiencing simultaneous standardization pressure from multiple directions:

**agents.md format** (adopted by OpenAI Codex, Amp, Google Jules, Cursor, Factory): AGENTS.md at repo root as cross-agent standard. As of Feb 2026, 60,000+ open-source projects have adopted it. OpenAI's main repo alone has 88 AGENTS.md files. The format is intentionally minimal — no frontmatter required, just plain markdown with sections for setup, style, and testing.

**block/ai-rules** (Block Inc.): Single-source distribution to 11 agents (AMP, Claude Code, Cline, Codex, Copilot, Cursor, Firebender, Gemini, Goose, Kilocode, Roo). Two modes: Standard Mode (YAML frontmatter + per-rule scope control) and Symlink Mode (single AGENTS.md → symlinked everywhere). Standard Mode generates `.mdc` files for Cursor, a `firebender.json` for Firebender, and a single inlined `ai-rules-generated-AGENTS.md` symlinked to most others.

**aicodingrules.org**: New initiative (observed Feb 2026) proposing an open vendor-agnostic standard — YAML for machine-readable structure, embedded Markdown for human readability. Maps fragmentation: Cursor (`.cursor/rules`), Windsurf (`global_rules.md + .windsurf/rules`), Copilot (`.github/copilot-instructions.md`), Augment Code (`.augment/rules`). Four rule types emerging as cross-tool consensus: Always, Auto/Agent-Decided, Glob-scoped, Manual/@mention.

**Anvil implication:** Anvil's audit pipeline must recognize all major rule file locations across tools. Current drift-detect.ts focuses on AGENTS.md, TOOLS.md, SKILL.md — needs extension to `.cursor/rules/`, `.github/copilot-instructions.md`, `CLAUDE.md`, and `ai-rules/*.md`. The bootstrap generator should emit rules in the canonical `ai-rules/` directory format as the most future-proof target.

**Priority: High** — Core to Anvil's framework-agnostic mission.

---

## Finding 2: Cursor Best Practices Convergence — "Rules Only for Observed Failure Modes"

**Source:** Cursor official docs (Jan 2026), cursor.com/blog/agent-best-practices (Jan 2026)

Cursor's official guidance has crystallized into a coherent philosophy:

- **"Start simple. Add rules only when you notice Agent making the same mistake repeatedly."** — Direct confirmation of Anvil's rubric §Part 4 (one occurrence → note, three → candidate).
- **500-line hard maximum** per rule file (confirmed). Split large rules into multiple composable rules.
- **Four rule application types:** Always Apply, Apply Intelligently (agent-decided), Apply to Specific Files (glob), Apply Manually (@mention). This matches Anvil's three-tier loading model but adds "Apply Intelligently" as a distinct middle tier.
- **What to avoid:** Copying entire style guides (use a linter instead). Documenting every possible command. Edge cases that rarely apply. Duplicating codebase content.
- **Plan Mode workflow:** Plan → Explore → Implement → Commit is the recommended four-phase pattern. Plans saved to `.cursor/plans/` for reuse.
- **Context window degradation:** Cursor documentation explicitly acknowledges "long conversations can cause agent to lose focus" — confirms IFScale peripheral bias (Digest #8).

**Anvil implication:** Rubric §Part 1 can cite Cursor's official 500-line limit as external validation. The "Apply Intelligently" tier (agent-decides based on description) is the equivalent of Anvil's "on-demand" tier — both rely on good descriptions. Quality of description text is underscored as critical for this tier to function.

**Priority: Medium** — Validates existing rubric, minor update to add Cursor's 500-line external citation.

---

## Finding 3: PromptHub/Cursor Community Analysis — Top 7 Rule Categories Across 130+ Files

**Source:** PromptHub blog, analysis of awesome-cursorrules (130+ rule files, Feb 2026)

Analysis of 130+ community cursor rule files reveals consistent top categories:

1. **Functional programming & code structure** — Strong preference for declarative over OO patterns; modular, minimal duplication
2. **Naming conventions & formatting** — Nearly universal; directory naming (lowercase-dashes), function definition style
3. **TypeScript everywhere** — Strong type safety; interfaces over types; strict mode; avoid `any`; avoid `enum` (use `const` objects)
4. **Error handling & validation** — Guard clauses; early returns; happy path last; custom error types for APIs
5. **Testing as standard** — Not optional; meaningful automated tests; CI/CD enforcement; pre-commit hooks
6. **Performance optimization** — Code splitting; image optimization; Core Web Vitals; efficient queries
7. **Security best practices** — Especially in API and blockchain contexts; input validation; auth patterns

**Cross-tool signals:** These seven categories appear regardless of framework. Community is converging on them organically.

**Anvil implication:** Bootstrap generator should expand template library to cover all seven categories, not just TypeScript/framework specifics. Error handling and security templates are missing from current 12 templates. The community data validates that these three (currently absent) categories — error handling, security, naming conventions — are as important as TypeScript strict mode.

**Priority: High** — Drives bootstrap template expansion (post-Goal 49 work).

---

## Finding 4: Claude Code Official Guidance — CLAUDE.md as Context Engineering Artifact

**Source:** code.claude.com/docs/en/best-practices (Feb 2026), aiorg.dev blog (Feb 2026)

Anthropic's official Claude Code best practices documentation has consolidated around a key insight: **"Most best practices are based on one constraint: Claude's context window fills up fast, and performance degrades as it fills."**

Key additions to official guidance:
- **CLAUDE.md is the single highest-impact step.** 10 minutes to write; saves hours of repeated context. This is the "10-minute ROI" framing that validates Anvil's bootstrap generator value proposition.
- **Context window = the most important resource.** Track it continuously; compact regularly; one task per session.
- **`.claude/rules/` directory** for domain-specific rules — loaded when relevant files are open. Parallels Cursor's `.cursor/rules/` but simpler (no frontmatter required).
- **`.claudeignore`** — like `.gitignore` for Claude Code; reduces noise, keeps context focused. Equivalent pattern exists for Cursor (`.cursorignore`).
- **Hooks for automation** — auto-lint, auto-format on every file write. Confirms Digest #8 hooks-as-enforcement finding.
- **Plan Mode / Explore before code** — separation of planning from implementation; prevents solving the wrong problem. Matches Anvil's research→ground→act cycle pattern.
- **Treat CLAUDE.md like code**: review when things go wrong, prune regularly, test changes by observing behavior shifts.

**Notable quote from community (aiorg.dev):** *"If Claude keeps doing something you don't want despite having a rule against it, the file is probably too long and the rule is getting lost."* — direct empirical confirmation of IFScale peripheral bias.

**Anvil implication:** Rubric §Part 5 (Hygiene) should explicitly add "CLAUDE.md/AGENTS.md should be treated like production code — reviewed at failure, pruned regularly, changes validated." This is the operationalization of the theoretical budget model. Also: Anvil's bootstrap generator should emit `.claudeignore` scaffold as part of output.

**Priority: Medium** — Rubric v1.7 update + bootstrap generator `.claudeignore` template.

---

## Rubric Impact

**Rubric v1.7 updates queued:**
1. **§Part 1:** Add Cursor 500-line official external citation alongside Anvil's 50-150 line guidance
2. **§Part 5:** Add "Treat rules files like production code" hygiene check — review at failure, prune regularly, test behavior changes
3. **§Part 3 (Loading Tiers):** Formalize "Apply Intelligently" as distinct from "On-demand" — agent-decided (description quality matters) vs. explicit @mention

**Bootstrap Generator expansion queued (post-Goal 49):**
1. Error handling template (guard clauses, early returns, custom error types)
2. Security template (input validation, auth patterns)
3. Naming conventions template (functional, declarative, directory naming)
4. `.claudeignore` scaffold template

---

## Action Items

| Action | Goal | Priority |
|--------|------|----------|
| Extend drift-detect to scan `.cursor/rules/`, `.github/copilot-instructions.md`, `CLAUDE.md`, `ai-rules/*.md` | Goal 49 scope | High |
| Add error handling + security bootstrap templates | Post-49 | High |
| Rubric v1.7: 500-line external citation + "treat like code" hygiene | Next cycle | Medium |
| Bootstrap generator: emit `.claudeignore` scaffold | Post-49 | Low |
