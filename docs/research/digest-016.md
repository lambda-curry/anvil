# Digest #16 — Rule Freshness, Lifecycle, and Staleness Control

**Date:** 2026-03-16
**Research thread:** How should AI rule systems stay fresh as projects, tools, and context windows evolve?
**Goal:** Extract practical lifecycle guidance Anvil can encode into the rubric and audits so stale rules become visible before they become harmful.

---

## Why This Matters for Anvil

Anvil already treats drift resistance as a core rubric dimension, but the current framing is still mostly static: check globs, validate references, flag old files. The deeper question is **how mature rule systems prevent staleness in the first place**.

This research thread looked at official guidance from Claude Code and Cursor, plus adjacent documentation-practice guidance, to answer:

1. What signals do upstream tools expose about rule freshness?
2. What maintenance behaviors do they recommend?
3. What should Anvil score or surface beyond simple "last validated" dates?

---

## Key Findings

### Finding 1: Both major rule systems now explicitly frame rules as context budget, not just documentation

The strongest shared pattern across Claude Code and Cursor is that rule files are treated as **live prompt context** with real opportunity cost:

- **Claude Code memory docs [1]:** CLAUDE.md files are loaded into the context window; Anthropic recommends keeping each file under **200 lines**, splitting large instruction sets into scoped rules, and reviewing contradictions periodically.
- **Cursor rules docs [2]:** rules are included at the start of model context; Cursor recommends keeping rules under **500 lines**, splitting large rules into composable units, and referencing files instead of copying content.

This matters because stale rules are not merely inaccurate docs sitting on disk — they actively **consume scarce context** while teaching outdated patterns.

**Anvil implication:** freshness cannot be scored only as "is the file old?" The audit must also ask whether a stale rule is **expensive** because it is always-on or frequently loaded.

---

### Finding 2: Official guidance converges on modularity as the anti-staleness mechanism

Both tool ecosystems recommend the same anti-entropy move: **break rules into smaller, scoped modules**.

- **Claude Code [1]:** split growing CLAUDE.md files using imports or `.claude/rules/`; keep project instructions lean and move narrower knowledge into scoped rules or skills.
- **Cursor [2]:** split large rules into multiple composable rules; use globs, intelligent application, or manual invocation rather than loading everything all the time.

The maintenance insight is important: modularity is not just for readability. It reduces the blast radius when one part of the project changes. Smaller rule files age more locally, making stale fragments easier to spot and replace.

**Anvil implication:** the rubric should treat oversized, multi-topic rule files as a **freshness risk**, not just a maintainability smell.

---

### Finding 3: "Observed failure modes only" is also a lifecycle governance rule

Cursor's official recommendation is explicit: **add rules only when you notice Agent making the same mistake repeatedly** [2]. This sounds like rule-authoring advice, but it is also lifecycle guidance.

Why? Because speculative rules are more likely to go stale than observed-failure rules:

- imagined edge-case rules rarely get exercised
- rarely exercised rules rarely get corrected
- uncorrected rules silently drift out of sync with real practice

By contrast, rules grounded in repeated failures have a built-in maintenance loop: failure → correction → rule update.

**Anvil implication:** provenance matters. A rule tied to an observed failure mode, PR comment pattern, or recurring review issue should score higher on trust and likely remain fresher than a hypothetical "just in case" rule.

---

### Finding 4: Upstream systems are starting to expose freshness metadata directly

Claude Code's March 2026 changelog added **last-modified timestamps to memory files** so Claude can reason about which memories are fresh vs. stale [3]. This is a notable shift: freshness is becoming a first-class signal inside agent tooling, not just a human documentation concern.

This suggests a broader direction for Anvil: audits should not stop at file age. They should surface **freshness evidence** such as:

- last validated date
- last modified date
- whether referenced files still exist
- whether examples still match current code patterns
- whether the rule still corresponds to active architecture/tooling

**Anvil implication:** rubric language should evolve from simple date hygiene to a fuller **freshness evidence model**.

---

### Finding 5: Documentation best practice reinforces Anvil's "why + close to code + updated with change" philosophy

Adjacent documentation guidance reinforces three ideas that map cleanly onto AI rules:

- explain the **why**, not just the what [4]
- keep docs **close to code** in the same repo [4]
- treat docs as part of the same change process so they update with implementation changes [4]

For Anvil, this means a rule is healthier when it:

1. explains the failure mode it prevents
2. points to canonical examples instead of duplicating volatile details
3. lives close enough to the codebase that updates happen in normal review flow

**Anvil implication:** freshness is not just a date problem. It is a **workflow integration** problem.

---

## Synthesis: Freshness Should Be Scored as Lifecycle Maturity

The research suggests Anvil should think about staleness in three layers:

### Layer 1: Surface freshness signals
Basic evidence that a rule may be stale.

- last validated date present
- file age / last modified age
- broken glob or broken reference
- examples pointing at missing files or old APIs

### Layer 2: Context cost of staleness
How harmful stale guidance is if it remains wrong.

- always-on vs scoped/on-demand
- file length / token footprint
- frequency of likely loading
- number of concerns bundled into one file

### Layer 3: Maintenance loop quality
Whether the team has a realistic path to keeping the rule current.

- rule tied to an observed failure mode
- examples reference canonical files instead of copied snippets
- likely owner / provenance is clear
- rule updates can happen in the same PR/review flow as code changes

This produces a more useful distinction:

- **Low-risk stale rule:** old but narrow, manually invoked, low context cost
- **High-risk stale rule:** old, always-on, large, multi-topic, disconnected from code, no provenance

That is the kind of ranking users actually need.

---

## Proposed Anvil Follow-Ons

### Rubric candidate: Freshness Evidence Checklist
Add a checklist under drift resistance / maintainability:

- Has `last validated` date
- References still resolve
- Globs still match real files
- Examples still reflect current stack or architecture
- Rule is scoped narrowly enough that one change does not stale the whole file
- Context cost is proportional to usefulness
- Provenance ties to observed failure mode, review feedback, or active workflow

### Audit candidate: High-Risk Staleness heuristic
Flag a rule as **high-risk stale** when multiple signals combine, e.g.:

- old validation date or no validation date
- alwaysApply / always-on
- large file size
- multi-topic content
- copied examples rather than references
- references to missing files, packages, or commands

### Report candidate: Freshness debt summary
In the executive summary or drift section, add a compact rollup such as:

- 2 high-risk stale always-on rules
- 3 rules with missing validation dates
- 1 broken example reference
- 4 oversized files likely to age poorly

This would turn "drift" from a binary check into a more decision-ready maintenance view.

---

## Recommendation for Current Phase

The cleanest next implementation step is **not** a full lifecycle engine. It is a smaller rubric/report upgrade:

1. extend the rubric from `last validated` to **freshness evidence**
2. add a **high-risk stale always-on rule** warning to the audit output
3. keep deeper provenance/workflow checks queued for a later phase

That preserves Anvil's helpfulness-first posture: surface the most dangerous stale guidance first.

---

## Sources

1. Anthropic Claude Code docs — "How Claude remembers your project" (`code.claude.com/docs/en/memory`)
2. Cursor docs — "Rules" (`cursor.com/docs/context/rules` → `cursor.com/docs/rules`)
3. Claude Code changelog — v2.1.75, "Added last-modified timestamps to memory files" (`code.claude.com/docs/en/changelog`)
4. DeepDocs — "8 Code Documentation Best Practices for 2025" (`deepdocs.dev/code-documentation-best-practices`)

---

*Digest #16 of the Anvil research library. Queues a rubric/report upgrade from simple date hygiene toward lifecycle-based freshness scoring.*
