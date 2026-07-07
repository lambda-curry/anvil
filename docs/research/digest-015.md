# Digest #15 — Report UX & Information Architecture for AI Tooling

**Date:** 2026-03-09
**Research thread:** Report readability and information hierarchy for dense AI audit output
**Goal:** How do best-in-class tools make dense automated output scannable and actionable? What patterns should Anvil adopt?

---

## Why This Matters for Anvil

Anvil's current report is a single-layer Markdown wall. A user running their first audit on FrontlineIQ saw "projection/mirror sync" and "Stage A/B/C/D" and didn't know what to prioritize. The goal of this research thread is to understand how comparable tools solve the "dense output → actionable insight" problem, and extract patterns Anvil can adopt for Priority 3 (restructure report) and Priority 2 (terminology).

---

## Key Patterns Observed Across AI Tooling

### Pattern 1: Two-Layer Output (Summary + Detail)

In the tools reviewed for this digest, all converged on a **summary-first, detail-below** structure:

- **CodeRabbit [1]:** Auto-generates a "walkthrough" summary at the top of every PR review — what changed, why it matters, key concerns. Full inline comments below.
- **SonarQube Quality Gate [2]:** Top-level pass/fail badge with color + 4-metric summary grid (reliability, security, maintainability, coverage). Details drill down per category.
- **Graphite Agent [3]:** PR page shows a one-paragraph AI summary + severity-ranked findings list. Interactive Q&A below for drill-down.
- **Qodo [4]:** Component-level summary (functions/classes impacted) before line-by-line findings.

**Anvil implication:** `buildSummaryLayer()` should produce a 5-7 line executive block: scores, verdict (pass/flag/critical), top 3 actions. Full sections below. This is exactly what Priority 3 specifies — research confirms it's the right call.

### Pattern 2: Severity Hierarchy with Visual Anchors

Tools that developers actually read use **visual severity signals** to guide eye movement:

- **SonarQube:** 🔴 Critical / 🟡 Major / 🔵 Minor — same iconography in summary and detail
- **CodeRabbit:** [critical] [medium] [low] badges inline with each comment
- **Graphite:** Color-coded summary counts ("3 bugs, 1 security, 12 style")

Current Anvil output uses **High / Medium / Low** text labels but no visual anchoring in Markdown. In a terminal, emoji or `[!]` / `[~]` prefixes would significantly improve scannability.

**Anvil implication for Rubric v2.4:** Severity signals should be consistent across all report sections — summary layer, issue list, and recommendations must use the same visual system.

### Pattern 3: Actionable First, Explanation Second

The tools with the lowest "review fatigue" (per the dev.to comparison) lead with the *action*, not the diagnosis:

- **Bad:** "The rule file `api-design.mdc` lacks a Why section, which reduces clarity for AI agents consuming the rule."
- **Better:** "**Add a Why section** to `api-design.mdc` — 2 lines explaining the intent makes rules 40% more likely to be followed consistently."

SonarQube's recommendations follow this: "Fix 1 bug" → click → code location → suggested fix. The fix is the headline.

**Anvil implication:** Recommendation text in Priority 2 (terminology) and Priority 4 (rule examples) should lead with the verb: "Add...", "Remove...", "Replace...", "Archive...". Not "This file has an issue where..."

### Pattern 4: Context Budget Awareness (AI-First Audience)

Qodo and CodeRabbit have both added explicit "context window impact" reporting in 2025 — they flag when a rule/file is too large to fit in a standard context window. Qodo calls this "context budget"; CodeRabbit shows file sizes relative to model limits.

This is directly relevant to Anvil's audience (people managing AI rule files). The existing Anvil recommendations about `alwaysApply` rules wasting context budget are on-point — but the framing is too internal.

**Anvil implication:** The terminology fix for "context budget" → "AI context window space" (per the work item) is confirmed as the right move. Go further: show the *number* in the recommendation. Example (assuming ~1KB average code file): "This always-on rule file is 8KB. Reducing to <2KB frees ~6KB of AI context window space — enough for approximately 6 additional code files."

### Pattern 5: False Positive Rate is the Trust Signal

The dev.to comparison identifies **false positive rate** as one of three critical evaluation criteria for AI review tools (alongside context awareness and workflow integration). CodeRabbit's main complaint is noise — too many low-value comments create "review fatigue" and developers stop reading.

The Priority 1 fix (drift false positives) directly addresses Anvil's trust signal. Every false positive in the drift report erodes confidence in the accurate findings.

**Anvil implication:** Priority 1 (false positives) was correctly ranked highest. It's not just noise reduction — it's the precondition for users trusting the rest of the report.

---

## Synthesis: Anvil Report Architecture Recommendation

Based on this research, the proposed Priority 3 `buildSummaryLayer()` structure is well-validated. Suggested refinement:

```md
## Anvil Audit Report — [project-name] [date]

### 🎯 Verdict: [PASS | NEEDS WORK | CRITICAL]
Rule Quality Score: 72/100 · Guardrail Score: 85/100

### Top 3 Actions
1. [verb] [file] — [one-line reason]
2. [verb] [file] — [one-line reason]
3. [verb] [file] — [one-line reason]

### At a Glance
| What | Count |
|------|-------|
| Rules scored | 12 |
| Issues found | 5 High · 3 Medium · 1 Low |
| Drift backlog | 2 |
| Author-written rule files | 8 |

---
[Full detail sections below]
```

**Key differences from current:**
- Verdict first (pass/fail gate, not just scores)
- Top 3 Actions are the most prominent element (actionable-first)
- "At a Glance" uses plain terminology (work item c1c7eb41 terms)
- Full sections still exist below — no information is lost

---

## Rubric v2.4 Self-Verification Criteria (Draft)

From the research, the following criteria should be added to the rubric eval harness (Goal 80):

1. **Summary layer present** — report has a distinct summary block before detail sections
2. **Verdict is explicit** — Pass/Fail/Flag stated in the first 5 lines
3. **Top Actions are verb-first** — each recommendation starts with an imperative ("Add", "Remove", "Fix", "Archive")
4. **Consistent severity signals** — same emoji/badge system in summary and detail
5. **Terminology is self-explanatory** — zero terms that require Anvil documentation to decode (test: first-time reader)
6. **False positive rate <10%** — drift report validated against a known-clean test fixture

---

## Sources

1. CodeRabbit documentation — docs.coderabbit.ai
2. SonarQube Quality Gate user guide — docs.sonarsource.com
3. Graphite Agent PR review feature overview — graphite.dev
4. Qodo static analysis tool overview — qodo.ai
5. "The 6 Best AI Code Review Tools for Pull Requests in 2025" — dev.to (Dec 2025)
6. "Best UX Audit Tools in 2026" — eleken.co (Feb 2026)

---

*Digest #15 of the Anvil research library. Feeds directly into Priority 2 (terminology), Priority 3 (report restructure), and Rubric v2.4.*
