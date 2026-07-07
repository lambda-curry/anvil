# Digest #17 — Measuring Whether Rules Actually Work

**Date:** 2026-04-08
**Research thread:** What is the smallest effectiveness framework Anvil can score without inventing vanity metrics?
**Goal:** Turn Anvil's existing effectiveness language into a compact measurement model teams can actually run.

---

## Why This Matters for Anvil

Anvil already says rules should be grounded in observed failure modes and should prove they improve outcomes. The missing piece is a **repeatable measurement loop**.

Without one, teams can only say a rule *sounds good*. They cannot show whether it reduced review churn, lowered violation counts, or improved downstream output quality.

The current milestone, **Rule Quality Confidence**, needs exactly that: a practical way to tell the difference between a rule that is present and a rule that is effective.

---

## Key Findings

### Finding 1: Effectiveness needs a baseline, not just a post-rule opinion

Qodo's rule analytics framing is useful because it starts with measurable deltas instead of static rule presence. The three stable signals are:

- **Adoption rate** — is the intended behavior showing up more often?
- **Violation trend** — are rule-covered failures going down?
- **Improvement rate** — are the target quality indicators improving?

The critical operational implication is simple: **a rule introduced without a baseline cannot prove it works**.

---

### Finding 2: Review recurrence is Anvil's cheapest native effectiveness signal

Anvil already has one strong built-in proxy: repeated PR feedback.

If `mine-pr-rules.ts` keeps surfacing the same cluster after a rule was added, then one of three things is true:

1. the rule is not being loaded,
2. the rule is not clear enough to change behavior, or
3. the failure mode belongs in enforcement, not text guidance.

That makes **recurring PR comment frequency** the lowest-cost effectiveness check Anvil can recommend across repos.

---

### Finding 3: Quality metrics matter because AI can improve speed while degrading maintainability

The Cursor DiD evidence and CodeScene framing point to the same risk pattern: AI assistance can increase short-term throughput while quietly worsening code health.

That means rule effectiveness cannot be judged only by task completion speed. Anvil needs at least one **quality-side signal**, such as:

- static analysis warning trend
- complexity trend
- maintainability / code health trend
- repeated remediation on the same class of issue

If output arrives faster but quality drift rises, the rule system is not actually succeeding.

---

### Finding 4: Cleanup burden is the best missing-rules signal when instrumentation is thin

The METR result remains important because it explains when AI help collapses: large repos with many implicit rules force experienced developers to spend time cleaning up output.

That makes **cleanup burden** the right fallback measure when a repo does not have mature telemetry. If reviewers repeatedly have to fix the same AI-generated mistakes, the project has an effectiveness gap even when no formal dashboard exists.

---

## Synthesis: The Minimal Effectiveness Framework

Anvil should score rule effectiveness with a compact four-part loop:

1. **Name the failure mode** — what repeated mistake is this rule supposed to reduce?
2. **Capture a baseline** — how often does it happen before the rule or enforcement change?
3. **Pick one primary signal** — review recurrence, violation count, quality metric, or cleanup burden.
4. **Re-check on a fixed interval** — did the signal improve, stay flat, or worsen?

This is intentionally small. It avoids pretending every project has enterprise analytics while still requiring observable evidence.

---

## Recommended Rubric Upgrade

Add a **minimum effectiveness instrumentation** requirement under Rule Effectiveness Signal:

- Every promoted rule should name its target failure mode.
- Every critical rule should name at least one observable signal.
- New rules should record a baseline or explicitly mark baseline as missing.
- Rules older than one review interval with flat or worsening signals should trigger rewrite, enforcement escalation, or removal review.

Suggested status buckets:

| Status | Meaning |
|---|---|
| **Unmeasured** | No baseline and no follow-up signal yet |
| **Instrumented** | Baseline + signal chosen, waiting for follow-up |
| **Improving** | Signal clearly moving in the intended direction |
| **Flat** | No meaningful change after the review interval |
| **Regressing** | Violation/cleanup/quality signal is worsening |

---

## Recommendation for Current Phase

The right next step is not a full analytics subsystem. It is a rubric-level contract:

- require a baseline-or-explicit-gap note,
- require one primary effectiveness signal,
- define simple status buckets,
- define what to do when a rule stays flat.

That gives Anvil a measurable effectiveness framework now, while keeping implementation burden small.

---

## Sources

1. Qodo 2.1 rules analytics framing (adoption, violation trend, improvement rate)
2. METR — *Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity* (July 2025)
3. CMU / Cursor DiD study — *Speed at the Cost of Quality* (2025)
4. CodeScene — code health as an objective feedback loop for AI-assisted work

---

*Digest #17 of the Anvil research library. Promotes a minimal, reviewable measurement loop for rule effectiveness instead of leaving effectiveness as an intuition-only claim.*
