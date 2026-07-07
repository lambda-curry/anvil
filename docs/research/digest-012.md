# Research Digest #12 — Rule Impact & AI Measurement

*Date: 2026-02-25 · Author: Scout/Anvil · Cycle: 13*

---

## Summary

This digest examines the empirical evidence for whether AI coding rules and tools actually work — and when they don't. Four findings converge on a single uncomfortable truth: **AI tools increase code velocity but degrade code quality unless rules are actively enforced with feedback loops, not just declared.** Measurement is the gap. Qodo 2.1's adoption/violation analytics, the Cursor DiD study, the METR slowdown finding, and the CodeScene Code Health framework all point to the same conclusion: rules without measurement are aspiration, not governance.

---

## Finding 1: Qodo 2.1 — Rules Analytics as First-Class Feature

**Source:** Qodo 2.1 announcement, Feb 17, 2026 (GlobeNewswire)
**Relevance:** High — industry signal on how rule adoption is being measured at enterprise scale

### What They Found

Qodo 2.1 introduced what it calls the "first continuous learning rules system" — not just rules enforcement, but **analytics that track adoption, violations, and improvement trends** across the entire development toolchain. Key capabilities:

- **Automatic Rule Discovery:** A "Rules Discovery Agent" generates standards from codebases and PR feedback
- **Intelligent Maintenance:** A "Rules Expert Agent" identifies conflicts, duplicates, and outdated standards
- **Real-World Analytics:** Adoption rates, violation trends, improvement metrics — proving standards are working

The enterprise testimonial (Hibob): *"The system continuously reinforces how our teams actually review and write code, and we are seeing stronger consistency, faster onboarding, and measurable improvements in review quality across teams."*

### Anvil Implication

Qodo's approach operationalizes what the Anvil rubric currently only recommends (§Part 6: Rule Effectiveness Signal). They identify three measurable dimensions:

| Metric | What It Measures |
|--------|-----------------|
| Adoption rate | % of developers following the rule in practice |
| Violation trend | Is violation count going up, down, stable? |
| Improvement rate | Is code quality improving in rule-covered areas? |

**Rubric gap identified:** Anvil's rubric has the Confidence Flywheel concept (Digest #6) but lacks specific metric definitions. These three dimensions from Qodo are concrete and implementable.

---

## Finding 2: Cursor DiD Study — Velocity Up, Quality Down

**Source:** "Speed at the Cost of Quality" — arXiv 2511.04427, Nov 2025 (CMU)
**Relevance:** Critical — empirical evidence that ungoverned AI coding accumulates technical debt

### What They Found

A difference-in-differences study of **807 Cursor-adopting GitHub projects** vs. 1,380 matched controls (Jan 2024 – Aug 2025):

1. **Short-term velocity increase** — significant and large immediately after Cursor adoption
2. **Persistent quality degradation** — significant and lasting increase in static analysis warnings and code complexity
3. **Long-term velocity slowdown** — the complexity increase then *causes* velocity to slow back down (panel GMM estimation confirms causation, not just correlation)

The mechanism: AI-generated code ships fast but with low health. That debt accumulates. The codebase becomes harder to maintain. Velocity recovers partially but never to the same trajectory.

**From the abstract:** *"We find that the adoption of Cursor leads to a significant, large, but transient increase in project-level development velocity, along with a significant and persistent increase in static analysis warnings and code complexity."*

### Anvil Implication

This is the empirical argument for why **AI rules with quality enforcement exist**. Without rules:
- Teams get short-term velocity gains
- Code health degrades persistently
- Long-term velocity suffers as technical debt compounds

Rules that enforce code health (complexity limits, test coverage, static analysis gates) are not bureaucratic overhead — they're the mechanism that preserves the velocity gain. The Cursor study is the "before/after without rules" baseline.

**The measurement signal:** Static analysis warnings and cyclomatic complexity are the observable proxies. If a project's rules cover these domains and warning counts are trending down, the rules are working.

---

## Finding 3: METR Study — The Rules Context Hypothesis

**Source:** METR "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity," July 2025
**Relevance:** High — reveals the conditions under which AI rules matter most

### What They Found

Randomized controlled trial with experienced open-source developers (avg. 5 years, 1,500 commits on their own repos):

- **Expected speedup (developer estimate):** ~24% faster
- **Perceived speedup (post-task survey):** ~20% faster
- **Actual result:** **19% slower**

Developers spent significant time cleaning up AI-generated code. The study identified three contributing factors:

1. **Over-optimism** — developers used AI on tasks they could do faster without it
2. **Expertise ceiling** — experienced developers in familiar, large codebases have little room for AI to add value
3. **Implicit rules problem** — the repos were large, with *lots of implicit rules* that AI wasn't aware of

**Key insight from analyst Sean Goedecke:** *"The repositories in question are large, with a lot of implicit rules. AI isn't at its best in this environment."*

### Anvil Implication

The METR finding confirms the core Anvil hypothesis from the other direction: **AI underperforms in projects with implicit rules that are never written down.** The 19% slowdown isn't just about model capability — it's about context. Agents operating on large codebases without explicit rules must infer patterns from code, making more mistakes that developers then must fix.

**The measurement signal for rules effectiveness:** Compare time-to-completion on tasks with vs. without explicit rules context. If rules are comprehensive and current, AI-generated code should require less cleanup. If developers are spending significant time cleaning up AI code, the rules are missing, stale, or not being loaded.

---

## Finding 4: CodeScene Code Health MCP — Objective "What Is Good"

**Source:** CodeScene blog — "Agentic AI Coding: Best Practice Patterns for Speed with Quality," Feb 2026
**Relevance:** High — practical pattern for measurable rule enforcement in agentic workflows

### What They Found

CodeScene identifies the root problem for AI quality governance: **"AI lacks an objective way of measuring 'good'."** Their solution is a Code Health MCP server with three enforcement layers:

1. **Continuous review** — `code_health_review` invoked as each code snippet is generated
2. **Pre-commit safeguard** — health check on staged files before each commit
3. **PR pre-flight** — full branch vs. base ref check before opening a PR

AGENTS.md is explicitly part of the infrastructure: *"Code Health provides objective signals about maintainability and risk. MCP exposes those signals as actionable tools. AGENTS.md encodes how the tools are combined into predictable workflows."*

**Research finding cited:** AI performs measurably better on code with Code Health ≥ 9.5/10.0. Low-health code causes agents to fail tasks or burn excess tokens.

**Enforcement loop:** The MCP tools kick the AI into a *refactoring loop* on quality issues rather than just flagging them. `review → plan → refactor → re-measure` is the operative cycle.

### Anvil Implication

The CodeScene AGENTS.md approach is a concrete example of Anvil's hooks-as-enforcement pattern (Digest #8, hooks-as-enforcement.md) applied to code quality rather than just behavioral policy. The key advance: **MCP tools as feedback loops that force self-correction**, not just passive warnings.

For Anvil's rubric: The "Safeguard Generated Code" pattern (Pattern 2 from CodeScene) directly maps to Anvil's Rule Effectiveness dimension. Rules that are enforced by tooling (MCP gates, pre-commit hooks, CI checks) are measurably more effective than rules that exist only as text instructions.

**The measurement signal:** Code Health score (or any static analysis metric) trending upward in AI-assisted work = rules and enforcement are working.

---

## Synthesis: The Measurement Framework

Across these four findings, a coherent measurement framework emerges for whether AI rules are actually working:

| Signal | Source | Positive Indicator |
|--------|--------|-------------------|
| Violation trend | Qodo analytics | Violations decreasing over time |
| Code quality metrics | Cursor DiD / CodeScene | Static analysis warnings trending down; complexity stable |
| Developer cleanup time | METR hypothesis | Developers spending less time fixing AI output |
| Adoption rate | Qodo analytics | % of developers following the rule increasing |
| Task completion quality | Vercel eval pattern | AI-generated code passes review without rework |

**A rule that has no feedback mechanism cannot be measured. A rule that cannot be measured cannot be maintained.**

---

## Rubric Implications

**Rubric v1.9 candidates (§Part 6 — Rule Effectiveness):**

1. **Measurement gap flag** — Rules without a feedback mechanism (static analysis gate, test coverage check, MCP review) should be flagged. Text-only rules have no observable signal.
2. **Three-metric adoption check** — Add Qodo's three dimensions to the effectiveness checklist: adoption rate, violation trend, improvement rate.
3. **Code health as quality proxy** — Reference CodeScene's finding: Code Health ≥ 9.5 is the observable threshold for AI-ready code. Rules that target code health have clear measurement.
4. **METR context gap test** — When AI-generated code requires significant cleanup, treat it as a signal that rules are missing or stale in that domain (not just a model capability issue).

---

## Actions

- [ ] Rubric v1.9 — apply measurement framework findings to §Part 6 (Rule Effectiveness Signal)
- [ ] Consider adding "Enforcement Layer" as a rule metadata field: None / Hook / CI Gate / MCP Tool
- [ ] Reference Cursor DiD study in rubric as empirical motivation for quality-gate rules
- [ ] Note: CodeScene Code Health MCP is worth testing as a complement to Anvil's drift detection (health score as drift proxy)
