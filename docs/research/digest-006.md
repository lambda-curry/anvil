# Research Digest #6 — Rule Adoption, CI Linting & Security

*Published: 2026-02-22 · Author: Scout/Anvil*

---

## Summary

Four findings this cycle: (1) Qodo's 2025 State of AI Code Quality survey surfaces the "Confidence Flywheel" — teams with fewer hallucinations are 2.5× more likely to skip review, which implies rule effectiveness is measurable through trust proxies rather than direct compliance tracking. (2) `cursor-lint` (published Feb 20, 2026) is a CI linter for Cursor `.mdc` rules — catches silent failures from malformed frontmatter, missing `alwaysApply`, empty bodies, invalid globs. Directly relevant to Anvil's audit tooling. (3) Pillar Security's "Rules File Backdoor" attack (2025) reveals that rules files are a novel supply chain attack vector — hidden unicode characters in rules can silently inject malicious behavior. (4) Block's `ai-rules` tool expanded: now supports 11 agents (AMP, Claude, Cline, Codex, Copilot, Cursor, Firebender, Gemini, Goose, Kilocode, Roo). Important: block/ai-rules is now a multi-agent distribution system, not just a rule library.

---

## Finding 1 — The Confidence Flywheel: Measuring Rule Effectiveness Through Trust

**Source:** Qodo, "State of AI Code Quality" survey (June 2025, n=609 developers)  
**URL:** https://www.qodo.ai/reports/state-of-ai-code-quality/

### Key data points

- **65% of AI users** say the assistant "misses relevant context" — the #1 friction point
- **#1 requested fix** (26% of all votes): "improved contextual understanding." Rises to ~30% when "customization to team standards" is included
- **Confidence Flywheel:** Developers with <20% hallucination rate are **2.5× more likely** to merge code without review (24% vs. 9%)
- **Productivity + quality correlation:** Teams reporting "considerable" productivity gains: 70% also report better quality (3.5× jump over stagnant teams)
- **AI review force multiplier:** With AI review in the loop, quality improvements reach 81% vs. 55% for equally fast teams without review

### What this means for measuring rule effectiveness

Direct compliance tracking (did the agent follow rule X?) is hard to instrument. The Qodo data suggests **proxy metrics** that are more tractable:

**Trust metrics (leading indicators):**
- Review skip rate — as agent accuracy improves, human review becomes optional. If a rule is working, the code it governs stops getting review comments on that topic.
- Hallucination rate by domain — if rules reduce hallucinations in their governed domain, that's observable
- Developer override frequency — how often developers undo or rework AI suggestions in the rule's domain

**Feedback loop metrics (lagging):**
- PR comment recurrence — if a rule exists but the same feedback appears in PRs, the rule isn't working. This is exactly what mine-pr-rules.ts surfaces.
- Time-to-first-correct-suggestion — for rule-governed patterns, does the AI get it right immediately or after correction?

**The key insight:** "Did the rule get loaded?" is the wrong question. The right question is: "Did the feedback pattern it was supposed to prevent actually stop appearing?" Anvil's PR mining script is already measuring this correctly — recurring PR comments = rule failure signal.

### Rubric implication

Add to §Part 6 (Quality Checklist): **Rule effectiveness signal** — if a rule has been in place for >3 months and its target feedback pattern still appears regularly in PRs, treat it as a candidate for revision or removal. Rules that don't reduce their target failure mode are wasting context budget.

**Priority:** High — provides theoretical grounding for Anvil's mining approach and adds a measurement dimension to the rubric.

---

## Finding 2 — cursor-lint: CI Linting for Rules Files (Directly Actionable)

**Source:** Ned C (nedcodes), "How to Lint Your Cursor Rules in CI (So Broken Rules Don't Ship)" (Feb 20, 2026)  
**URL:** https://dev.to/nedcodes/how-to-lint-your-cursor-rules-in-ci-so-broken-rules-dont-ship-2n7a  
**Tool:** https://github.com/nedcodes-ok/cursor-lint · https://www.npmjs.com/package/cursor-lint

### What cursor-lint catches

- **Missing or malformed YAML frontmatter** — causes silent failure: Cursor loads zero rules, gives no error
- **`alwaysApply` not set** — agent mode won't load the rule
- **Empty rule bodies** — file exists, does nothing
- **Invalid glob patterns** — glob field doesn't match any files
- **`.cursorrules` issues** — Cursor doesn't report these failures itself

### How it works

```bash
npx cursor-lint              # scan all rules in project
npx cursor-lint --verify .cursor/rules/typescript.mdc  # single file
npx cursor-lint --init typescript                       # generate starter rule
```

GitHub Action available for CI enforcement:
```yaml
- uses: nedcodes-ok/cursor-lint-action@v1
```

### Relevance to Anvil

This is a **structural validity linter** — it catches format/frontmatter issues before they reach agents. Anvil's drift-detect.ts is a **semantic validator** — it catches stale paths, outdated dates, glob drift. These are complementary, not overlapping.

**The gap cursor-lint fills that Anvil doesn't:** Format compliance. Anvil catches semantic drift; cursor-lint catches structural breakage.

**LC implication:** LC doesn't use `.mdc` files (we use AGENTS.md/TOOLS.md/SKILL.md format). But the underlying categories of failure are the same — missing required fields, malformed structure, empty content. Anvil's audit rubric should include a "structural validity" check parallel to cursor-lint's checks.

**Rubric addition candidate:** §Part 6 Quality Checklist — add "Structural validity" dimension: required fields present, no empty bodies, glob patterns tested, format consistent with standard.

**Priority:** Medium-High — practical gap: Anvil audits semantics but not format structure. cursor-lint's failure taxonomy is worth porting to the rubric.

---

## Finding 3 — Rules File Backdoor: Security Attack Vector (New Risk Category)

**Source:** Pillar Security, "New Vulnerability in GitHub Copilot and Cursor: How Hackers Can Weaponize Code Agents" (Mar 2025)  
**URL:** https://www.pillar.security/blog/new-vulnerability-in-github-copilot-and-cursor-how-hackers-can-weaponize-code-agents

### What the attack is

Rules files (`.cursor/rules/*.mdc`, `CLAUDE.md`, `AGENTS.md`) are processed by AI coding agents as trusted instructions. Pillar Security's "Rules File Backdoor" technique: embed hidden unicode characters in rules files to inject malicious instructions invisible to human reviewers.

**Why it works:**
- Rules files are perceived as harmless config — developers don't review them like code
- Hidden unicode is invisible in GitHub's UI, code editors, and during PR review
- The AI processes the hidden characters as valid instructions
- Malicious code is inserted into generated code without any developer-visible signal
- Attack propagates through shared rule repositories (cursor.directory, GitHub)

**Attack surface in LC:** Any rule file pulled from an external source (community repos, ai-rules init, copypasted from the internet) could contain hidden payloads. LC agents load AGENTS.md and SKILL.md files automatically — if those files are compromised, every generation in that context is compromised.

### Defense recommendations from Pillar

1. Treat rule files with the same scrutiny as executable code
2. Validate rules files for suspicious characters, especially in shared/imported rules
3. Review CI configurations that auto-generate or distribute rule files
4. Implement tools that can identify suspicious patterns in rule files

### Rubric implication (new dimension)

This is a **new hygiene dimension** that Anvil's rubric doesn't cover: **rule provenance and integrity**.

Proposed addition to §Part 5 (Hygiene):

> **Rule Provenance:** Track where each rule came from. Rules from external sources (community repos, AI-generated, copied from the internet) require explicit review before adoption — treat them as untrusted code. For network-distributed rules (like LC's shared skills), verify source integrity.

**Priority:** High — this is a genuine new risk category that Anvil should add to the rubric and audit checklist. LC doesn't currently have rule provenance tracking.

---

## Finding 4 — Block/ai-rules: Now a Multi-Agent Distribution System for 11 Agents

**Source:** block/ai-rules GitHub repository (current)  
**URL:** https://github.com/block/ai-rules

### What changed since Digest #1

Digest #1 (Feb 2026) described block/ai-rules as a rule library + CLI tool. It has since expanded significantly:

**Agent support:** Now covers 11 agents — AMP, Claude, Cline, Codex, Copilot, Cursor, Firebender, Gemini, Goose, Kilocode, and Roo. The core model: write rules once in `ai-rules/*.md`, run `ai-rules generate` to produce `CLAUDE.md`, `.cursor/rules/*.mdc`, `AGENTS.md`, etc.

**Key commands:**
```bash
ai-rules init                           # create ai-rules/ directory with examples
ai-rules generate                       # all agents
ai-rules generate --agents claude,cursor  # specific agents
ai-rules status                         # sync status check
ai-rules clean                          # remove all generated files
```

**Architectural significance:** This is a **single-source distribution model** — one canonical rule set fans out to all agent formats. The format conversion problem (how do I express this rule for Claude vs. Cursor?) is abstracted away.

### Implications for Anvil and LC

**Anvil audit context:** When auditing a project using block/ai-rules, the `ai-rules/*.md` files are the source of truth; the generated files are artifacts. Drift detection should target source files, not generated outputs.

**LC architecture note:** LC currently maintains separate rules per agent (each agent has its own AGENTS.md). block/ai-rules' single-source model is an alternative architecture worth considering for network-wide rules that span multiple agents. The `handoff-packet` and `network-architecture` patterns, for example, could be single-source distributed.

**Rubric implication:** Add a note on generated vs. source rules — drift detection should skip or clearly label generated rule files (already done with skip-dirs; this formalizes the rationale).

**Priority:** Medium — architecture awareness, not immediate action. But relevant when Anvil designs the bootstrap generator (Goal 23).

---

## Rule Adoption — Practical Measurement Framework

Drawing on all six digests, here is Anvil's proposed framework for measuring whether a rule is working:

| Signal | Measurement method | Threshold |
|--------|-------------------|-----------|
| PR comment recurrence | mine-pr-rules.ts re-run after 90 days | Same cluster still appearing at frequency≥3 → rule failing |
| Review skip rate | Anecdotal / team self-report | If team still manually catches X → rule not reducing burden |
| Rule age without update | drift-detect.ts date check | >90 days → re-validate |
| Rule adoption in practice | Code search for anti-pattern in codebase | Anti-pattern still present → rule not effective |
| Context budget ROI | Is rule triggering? (glob-matched only when needed?) | Always-apply rules that rarely apply → candidates for glob-match |

**The simplest proxy Anvil already has:** Run mine-pr-rules.ts quarterly. If a cluster that was surfaced in a previous run keeps appearing at the same frequency after a rule was added, the rule is not working. If frequency drops, it is.

---

## Summary Table

| Finding | Source | Priority | Action |
|---------|--------|----------|--------|
| Confidence Flywheel — trust as rule effectiveness proxy | Qodo State of AI Code Quality (2025) | High | Add rule effectiveness signal to §Part 6 rubric |
| cursor-lint — CI linting for rules files | nedcodes (Feb 2026) | Medium-High | Port failure taxonomy to rubric §Part 6 structural validity |
| Rules File Backdoor — security attack vector | Pillar Security (Mar 2025) | High | Add rule provenance dimension to §Part 5 rubric |
| block/ai-rules expanded to 11 agents | block/ai-rules (current) | Medium | Architecture awareness for bootstrap generator design |

---

## Next Research Agenda

- **Rule adoption at scale:** How do orgs with 50+ rules manage the lifecycle? Any published case studies?
- **Episodic memory for LC agents:** Lightweight structured event log design
- **Cursor rules security mitigations:** What tooling exists for unicode detection in rules files?
- **A-MEM vs. MIRIX:** Follow-up on the memory architecture comparison started in Digest #5
