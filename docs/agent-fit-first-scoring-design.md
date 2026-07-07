# Agent-fit-first scoring for tool-native repos

**Status:** Proposed design for `SFD-97`  
**Source feedback:** GitHub issue [`#48`](https://github.com/lambda-curry/anvil/issues/48)  
**Proof fixture:** [`scripts/__fixtures__/tool-native-cursor-repo`](../scripts/__fixtures__/tool-native-cursor-repo) + [`docs/proofs/sfd-97-agent-fit-first-scoring.md`](./proofs/sfd-97-agent-fit-first-scoring.md)

## Problem

Anvil's report language is now more honest about canonical scoring, but the scoring model still treats two format conventions as hard penalties on tool-native repos:

- Stage B gives every canonical file a fixed `0.3` for `Why` and `0.3` for examples before it considers whether the file is already well-scoped for the tool that actually loads it.
- Stage D marks a rule as low-yield whenever it lacks `Why` or examples, which can turn a compact `.cursor/rules/*.mdc` surface into a blocking noise failure even when the surface is discoverable, dated, scoped, and drift-free.

That is the remaining product gap Derek called out in issue `#48`: a repo can be good for the agents it actually uses while still reading as under-structured against Anvil's preferred governance style.

## Evidence from current behavior

Current implementation details in `scripts/audit.ts`:

- `hasWhySection` and `hasExamplesSection` drive both Stage B format scoring and Stage D low-yield detection.
- Stage B's `format` score is fixed at:
  - `0.3` for `Why`
  - `0.3` for examples
  - `0.2` for description
  - `0.2` for staying within size budget
- Stage D low-yield pressure currently counts any scoring file missing `Why` **or** examples.

The fixture report at [`docs/audits/tool-native-cursor-repo-audit-2026-05-10.md`](./audits/tool-native-cursor-repo-audit-2026-05-10.md) shows the effect:

- `Canonical Rule Helpfulness (Why/Examples/Size) | 0.4/1`
- `Low-Yield Rule Ratio | ❌ fail | 2/2 scoring files miss Why or Examples`
- top remediation starts with rewriting or retiring rules, even though the fixture is already a clean tool-native Cursor surface

## Bounded definition: "agent-fit-first"

A repo is **agent-fit-first** when its canonical rule surface is optimized for the agent tools it actually uses, even if it does not follow Anvil's preferred governance-file structure.

For this slice, that means all of the following are true:

1. the canonical scoring surface is a single native tool surface (for example `.cursor/rules/`)
2. the repo does not also rely on cross-agent governance files as its primary instruction surface
3. the native files include real loading metadata (`globs` or `alwaysApply`) that matches the repo's working files
4. the surface is current enough to trust (`Last validated`, no drift backlog)
5. the surface is compact enough to load without obvious context waste

If those conditions hold, Anvil should score the repo primarily on whether the surface works for the active tool, then treat governance-style clarity conventions as improvement guidance.

## Current penalties that should become advisory in this posture

When the surface is classified as **tool-native-first**:

- missing `## Why`
- missing examples / `DO:` / `DON'T:` patterns
- resulting Stage D `low-yield-rules` hard fail driven only by those missing clarity sections

These should remain visible in the report, but as **clarity uplift suggestions**, not as the main reason a good tool-native repo is judged unhealthy.

## Signals that should count as positive agent-fit evidence

For this slice, positive evidence should be:

- **surface alignment** — canonical files all come from the repo's active tool-native surface
- **native loading fidelity** — the files use `globs` / `alwaysApply` in a way the tool can actually load
- **coverage of active files** — the globs match real repo paths the rules are meant to guide
- **freshness** — the canonical surface carries `Last validated` and has no stale-path drift
- **bounded context load** — no oversized or obviously noisy always-on surface

## Proposed scoring change

Keep the slice narrow: do not redesign the whole rubric. Change only how Stage B and the Stage D low-yield check behave for tool-native-first surfaces.

### 1. Detect surface posture

Add a small posture classifier before Stage B:

- `governance-first` — current default behavior
- `tool-native-first` — all canonical scoring files come from one tool-native rule directory, at least one file has native loading metadata, and no top-level governance file is acting as the primary surface

### 2. Split today's format lane into two concepts

For `tool-native-first`, compute:

- `agentFitEvidence` = average of:
  - surface alignment
  - native loading fidelity
  - active-file coverage
  - freshness
  - bounded context load
- `clarityUplift` = current format subscore (`Why`, examples, description, size)

Then replace the Stage B format score with:

```text
agentFitFirstScore = round(0.7 * agentFitEvidence + 0.3 * clarityUplift, 1)
```

The report label should change from **Canonical Rule Helpfulness (Why/Examples/Size)** to something like **Agent-Fit / Canonical Clarity** so the user sees the actual priority order.

### 3. Downgrade low-yield from fail to advisory for tool-native-first

For `tool-native-first` surfaces only:

- keep missing `Why` / examples visible
- do **not** let those omissions alone fail Stage D
- at most emit a warning unless another real noise signal is also present (duplication, conflict, oversized always-on load)

This preserves the best-practice signal without letting structure preferences masquerade as a repo health failure.

## Representative before / after on the fixture

Using the Cursor-only fixture in `scripts/__fixtures__/tool-native-cursor-repo`:

### Before (current behavior)

- format score: `0.4/1`
- Stage D low-yield: `❌ fail`
- summary fix-first: rewrite or retire low-yield rules

### After (target behavior)

The same fixture has strong agent-fit evidence:

- surface alignment = `1.0`
- native loading fidelity = `1.0`
- active-file coverage = `1.0`
- freshness = `1.0`
- bounded context load = `1.0`
- `clarityUplift = 0.4`

So:

```text
agentFitFirstScore = 0.7 * 1.0 + 0.3 * 0.4 = 0.82 -> 0.8
```

Expected report shift:

- `Agent-Fit / Canonical Clarity | 0.8/1`
- Stage D low-yield becomes `⚠️ warn` instead of `❌ fail`
- top guidance shifts from "rewrite or retire" to "add rationale/examples if you want stronger portability across tools"

## Why this is the right slice size

This proposal stays inside the open question from `SFD-97`:

- it does **not** reopen nested rule discovery
- it does **not** revisit AI-default vs `--ci`
- it does **not** redesign every rubric dimension
- it does define one concrete scoring change, one posture detector, and one proof fixture

## Implementation sketch

1. add a `surfacePosture` classifier near canonical-surface selection
2. compute `agentFitEvidence` for tool-native-first surfaces from existing inventory facts plus one glob-match check
3. rename the Stage B format row and swap in the weighted score when posture is tool-native-first
4. cap Stage D `low-yield-rules` at warning for tool-native-first unless another noise pressure also exists
5. refresh the golden audit fixture(s) and the proof report

## Done signal for the eventual implementation PR

- the tool-native fixture no longer fails Stage D solely for missing `Why` / examples
- the report names agent-fit before canonical clarity on that fixture
- the resulting before/after report is legible enough that Derek's question from issue `#48` can be answered with one link instead of prose defense
