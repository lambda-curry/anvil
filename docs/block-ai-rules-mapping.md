# block/ai-rules → Anvil Rubric Mapping

*Version: 1.0 · Created: 2026-02-24*
*Last validated: 2026-02-24*

## Purpose

This document maps the `block/ai-rules` community standard to Anvil's rubric dimensions. When Anvil audits a project, `block/ai-rules` serves as the **community baseline** — the rubric is the scoring engine, block/ai-rules is the reference library scored against.

A project using `block/ai-rules` correctly demonstrates community-baseline compliance. Gaps in block/ai-rules adoption surface as Anvil recommendations.

---

## block/ai-rules at a Glance

**Repository:** github.com/block/ai-rules  
**Tagline:** Manage AI rules across 11 coding agents from a single source  
**Supported agents:** AMP, Claude Code, Cline, Codex, Copilot, Cursor, Firebender, Gemini, Goose, Kilocode, Roo  
**Distribution model:** Single `ai-rules/` directory → `ai-rules generate` → agent-specific files

### Two Operation Modes

| Mode | When to use | Output |
|------|-------------|--------|
| **Standard Mode** | Fine-grained control; multiple rules; per-rule scope | `ai-rules/.generated-ai-rules/ai-rules-generated-AGENTS.md` (symlinked to most agents); `.mdc` files for Cursor; `firebender.json` for Firebender |
| **Symlink Mode** | Simple setup; single `ai-rules/AGENTS.md` | All agents symlink directly to `ai-rules/AGENTS.md` |

### Standard Mode Frontmatter

```markdown
---
description: Context description (for agent-decided loading)
alwaysApply: true/false
fileMatching: "**/*.ts"
---
```

---

## Rubric Dimension Mapping

### Part 1 — Rule Sizing & Budget

| Anvil Rubric | block/ai-rules Alignment |
|---|---|
| One concern per rule (~50-150 lines) | Standard Mode: each `.md` file = one rule. Enforced naturally by file-per-rule structure. |
| n² attention cost | Acknowledged implicitly — Standard Mode inlines all rules; total size is the budget concern |
| 150-instruction ceiling | Not explicitly addressed; Anvil adds this constraint on top of block/ai-rules |

**Gap:** block/ai-rules does not enforce or measure rule size. Anvil drift-detect + rubric scoring fills this gap.

### Part 2 — Format Standard

| Anvil Rubric | block/ai-rules Alignment |
|---|---|
| Title + Why + Rule + Examples + Scope | No enforced format. Content is free-form markdown. |
| Rule altitude (capability vs. path) | Not addressed |
| `alwaysApply` tier assignment | `alwaysApply: true/false` frontmatter — direct mapping |
| Glob scope | `fileMatching` frontmatter — direct mapping (Cursor only currently) |

**Gap:** block/ai-rules leaves format to each author. Anvil's format standard is additive — teams using block/ai-rules should follow Anvil's format within their rule files.

### Part 3 — Loading Tiers

| Anvil Tier | block/ai-rules Equivalent |
|---|---|
| `alwaysApply` (foundational) | `alwaysApply: true` |
| Glob-matched (contextual) | `fileMatching: "**/*.ts"` in frontmatter (Cursor only) |
| On-demand (explicit @mention) | `alwaysApply: false` + no `fileMatching` → agent-decided via description |
| Agent-decided (Apply Intelligently) | `alwaysApply: false` with `description` field — agent decides based on description quality |

**Note:** block/ai-rules has four effective loading modes (always / glob-matched / agent-decided / manual). Anvil's three-tier model collapses agent-decided and manual into "on-demand." Rubric v1.7 will formalize "Apply Intelligently" as a distinct tier to align with community terminology.

### Part 4 — When to Write Rules

| Anvil Rubric | block/ai-rules Alignment |
|---|---|
| Observed failure mode, not imagined | Not addressed (content concern, not tool concern) |
| 1 occurrence → note, 3 → candidate | Not addressed |
| PR history mining | Not addressed |

**Gap:** block/ai-rules is a distribution tool, not a lifecycle tool. Anvil's mine-pr-rules.ts fills the "when to write" gap entirely.

### Part 5 — Hygiene

| Anvil Rubric | block/ai-rules Alignment |
|---|---|
| `Last validated` date | Not enforced or checked |
| Stale globs | `ai-rules status` command checks sync status of generated files, not staleness of globs |
| Rule provenance (security) | Not addressed — Rules File Backdoor risk (Digest #6) applies |
| Position matters | Not addressed |

**Key hygiene feature:** `ai-rules status` — checks whether generated files are in sync with source rules. This is an Anvil-equivalent drift signal for the distribution layer. Audit reports should check for `ai-rules status` showing drift.

### Part 6 — Quality & Effectiveness

| Anvil Rubric | block/ai-rules Alignment |
|---|---|
| Structural validity (cursor-lint) | cursor-lint (Digest #6) works on the `.mdc` files that block/ai-rules generates — complementary |
| Rule effectiveness signal (PR mining) | Not addressed |
| Confidence Flywheel measurement | Not addressed |

### Part 7 — LC-Specific Standards

Not applicable to block/ai-rules (community standard is framework-agnostic).

### Part 8 — Hooks as Enforcement

| Anvil Rubric | block/ai-rules Alignment |
|---|---|
| Stop hook for mandatory rules | block/ai-rules `commands/` subdirectory — custom commands (not hooks) |
| Claude Code hooks (`.claude/settings.json`) | Not in scope for block/ai-rules — agent-specific config |

**Gap:** block/ai-rules distributes rules, not hooks. Hooks remain agent-specific config that Anvil scores separately.

---

## Audit Integration: How to Use This Mapping

When Anvil audits a project:

### Step 1 — Rule File Discovery (extended for block/ai-rules)

In addition to current discovery (AGENTS.md, TOOLS.md, CLAUDE.md, .cursor/rules/), check:
- `ai-rules/` directory (block/ai-rules source directory)
- `ai-rules/.generated-ai-rules/ai-rules-generated-AGENTS.md` (generated inlined file)
- `ai-rules/ai-rules-config.yaml` (distribution config)

### Step 2 — Distribution Health Check

If `ai-rules/` directory found:
- Run `ai-rules status` (if installed) to check sync state
- Check if generated files exist (CLAUDE.md, AGENTS.md, .cursor/rules/*)
- Flag if generated files are present but source rules missing (inverted drift — generated without source)

### Step 3 — Per-Rule Scoring

Score each rule in `ai-rules/*.md` against Anvil rubric dimensions:
- Format compliance (Why/Rule/Examples/Scope)
- Rule altitude (capability vs. path)
- alwaysApply tier assignment appropriate?
- fileMatching glob valid and non-stale?
- `Last validated` date present?

### Step 4 — Coverage Gap Analysis

Compare discovered rules against community baseline categories (Digest #10 Finding 3):
1. Code structure / functional patterns
2. Naming conventions
3. Type safety
4. Error handling & validation
5. Testing
6. Performance
7. Security

Flag missing categories as coverage gaps.

---

## Audit Report Template Addition

When block/ai-rules is detected in an audited project, add this section to audit reports:

```markdown
## block/ai-rules Distribution Layer

**Status:** [Detected / Not detected]
**Mode:** [Standard / Symlink / Not configured]
**Sync status:** [In sync / N rules drifted / Not checked]
**Source rules:** N files in ai-rules/
**Generated agents:** [list]

### Distribution Health
| Check | Status | Notes |
|-------|--------|-------|
| ai-rules/ directory exists | ✅/❌ | |
| Generated files in sync | ✅/❌/❓ | |
| Config file present | ✅/❌ | |
```

---

## LC Recommendation

**Projects NOT using block/ai-rules:** Consider adopting it if you have rules targeting multiple AI tools (Claude Code + Cursor + Codex). The single-source distribution model eliminates the drift problem for the distribution layer. Anvil's drift-detect handles the content layer.

**Projects using block/ai-rules:** Still need Anvil scoring. block/ai-rules handles distribution; Anvil handles content quality, lifecycle, and effectiveness. They are complementary, not alternatives.

**Dogfood targets:** none of the initial audit targets used block/ai-rules. Given multi-tool usage (Claude Code + Cursor), adoption is worth considering. Anvil can bootstrap the `ai-rules/` seed from existing CLAUDE.md/AGENTS.md content.

---

## See Also

- `docs/rubric.md` — Full rubric with scoring dimensions
- `docs/patterns/` — Pattern library (network-wide patterns)
- `scripts/drift-detect.ts` — Drift detection (content layer)
- `scripts/mine-pr-rules.ts` — PR mining for rule candidates
- `docs/research/digest-010.md` — Community ecosystem survey (Feb 2026)
