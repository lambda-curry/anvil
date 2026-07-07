---
title: Scoring Rubric
description: How Anvil scores rules and guardrails
---

Anvil produces two companion scores:

- **Rule Quality Score** (0–100) — how good are the AI rules
- **Guardrail Readiness Score** (0–35) — how robust are the engineering guardrails

## Quality gate

Every rule must include:

1. A clear **why** — the specific failure mode this rule prevents
2. A **concrete example** where relevant (DO/DON'T)
3. An **actionable instruction** — imperative, unambiguous, testable

## Scoring dimensions

Anvil evaluates rules across multiple dimensions:

### Helpfulness
Does the rule prevent a real, observed failure mode?

### Clarity & actionability
Clear why, concrete example, actionable instruction.

### Consistency
No conflicts with other rules in the codebase.

### Maintainability
One concern per rule. Approximately 50–150 lines as a hygiene guide.

### Drift resistance
Globs match real files. References are current. Validation dates are fresh.

### Trust boundaries
Rule provenance tracked. External rules reviewed before adoption.

## Guardrail dimensions

The guardrail readiness score covers:

- CI discipline
- Type safety
- Test depth
- Security
- Drift resilience
- Hook coverage

Each dimension contributes to the 0–35 total. Hard gates can enforce minimum scores per dimension via `.anvil/config.yml`.

## What strong rules look like

- one concern per rule or file
- a concrete failure mode in the `why`
- imperative, testable instructions
- examples that show both the right move and the common miss
- current references, globs, and validation dates so the rule does not silently drift

## Sizing and loading guidance

- target roughly 50–150 lines per rule file or section
- keep always-on instructions lean; move deep detail into scoped docs or on-demand material
- use glob-matched rules for framework- or file-type-specific guidance
- use hooks for truly mandatory enforcement that should not depend on model recall

## Common anti-patterns

- **kitchen-sink rules** — multiple unrelated constraints jammed together
- **why-less rules** — instructions with no named failure mode
- **repo drift** — stale paths, stale examples, or docs that no longer match shipped behavior
- **policy without enforcement** — critical rules with no test, hook, or review backstop

## Review lens

When Anvil scores a rules surface, it is asking:

1. does this rule prevent a real observed failure mode?
2. is the instruction clear enough to follow on the first pass?
3. does it stay consistent with neighboring rules?
4. is the file small and scoped enough to earn its place in context?
5. do the surrounding engineering guardrails catch what the rules alone will miss?
