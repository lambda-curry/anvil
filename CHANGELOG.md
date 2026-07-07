# CHANGELOG.md — Anvil

Shipped milestones use format: `YYYY-MM-DD — <one line>`.

## Planned / queued milestones

These notes are not shipped history yet. Move them into the shipped log when they land.

Target 2026-07-08 — North Star reframed: outcome-optimization over cost-optimization.
  Before: "Anvil makes AI rules better — by analyzing what exists, mining what's been learned, and codifying what works into rules that are small, sharp, and grounded in real failure modes."
  After: "Anvil optimizes AI rules for project outcomes — quality, reliability, and maintainability — by auditing what exists, detecting drift, and giving concrete improvement paths grounded in observed failure modes."
  Files changed: AGENTS.md (root charter + project), PLDP.md, docs/rubric.md, docs/patterns/north-star.md
  Key changes: (1) North Star updated everywhere, (2) Rubric scoring dimensions reordered — usefulness, clarity/actionability, consistency, maintainability, drift resistance, trust boundaries now lead, (3) Cost/token impact removed as core metric (kept as optional diagnostic), (4) Explicit quality gate added: every rule needs clear why + concrete example + actionable instruction, (5) Size guidance reframed as maintainability hygiene not cost optimization, (6) Drift detection promoted as primary value in rubric positioning.
  Rationale: Anvil's purpose is helping projects produce better outcomes through better rules — not minimizing token spend.


Target 2026-07-25 — Expand Anvil to AI rules + engineering guardrails (TypeScript-first).
  Before: Anvil audited AI rules only, producing a single Rule Quality Score (0–100).
  After: Anvil audits AI rules AND engineering guardrails, producing dual scores: Rule Quality (0–100) + Guardrail Readiness (0–35, across 7 dimensions). TypeScript-first scope declared for v1.
  New: Guardrail Score Pack (7 dimensions: CI discipline, type safety, test depth, code quality, review/ownership, security, drift resilience), maturity bands (Novice/Emerging/Reliable/Hardened), missing guardrails detector, TS policy templates, regression watch, sample audit output.
  Files changed: PLDP.md (reframed positioning + UI + deliverables), docs/rubric.md (v1.9 — dual-score, TS scope), docs/guardrail-score-pack.md (new), docs/patterns/north-star.md (validated), AGENTS.md (root charter), CHANGELOG.md.
  Rationale: Rules teach agents what to do; guardrails catch what rules miss. Both layers are needed for project outcomes. Jake directed this expansion with explicit TypeScript-first scope.


## Shipped milestones

2026-04-08 — Added Digest #17 and Rubric v2.2 to define a measurable rule-effectiveness framework (baseline, primary signal, fixed follow-up, status buckets) and realigned README status to the new Rule Quality Confidence milestone.
2026-02-20 — Project chartered by Jake. Phase 1 (Foundation) begins: rubric, research digest, pattern library seed, first audit.
2026-03-16 — Standardized charter inheritance: added parent symlinks and missing lifecycle files after the charter inheritance audit.
2026-03-19 — Locked the Multi-Agent Topology recommendation path with a focused regression test and exported the rule-portfolio helper types/functions needed to test it directly.
2026-03-19 — Added a project-local charter cycle mode entrypoint, daily memory bootstrap, and deterministic handoff verification for the local charter helper flow.
2026-03-20 — Tightened the charter rule surface with explicit loading-tier metadata, validation dates, failure-mode framing, and examples so self-audit freshness/low-yield checks pass cleanly.
2026-03-20 — Fixed drift detection false positives for metadata-style `Last validated` lines in charter rule files and added a regression test covering the real markdown/backtick format used by `AGENTS.md` and `TOOLS.md`.
2026-03-20 — Cleared the remaining `TOOLS.md` path-drift findings by replacing stale host/skill/path-like references with verified project-local wording, bringing `bun run ./scripts/drift-detect.ts .` back to zero path-drift issues.
2026-03-20 — Clarified drift-report workspace-root notes so resolved shared-script references are labeled as non-drift, reducing false-alarm ambiguity in audit output.
2026-03-21 — Trimmed duplicated `TOOLS.md` guidance, fixed the stale Git/no-remote note, and revalidated the tools guide with drift detection so the charter helper docs stay concise and current.
2026-03-21 — Captured a fresh zero-drift audit artifact for PR #11 in `docs/audits/artifacts/anvil-2026-03-21/` so the current charter-helper rule surface has reviewable evidence, not just summary claims.
2026-03-21 — Made the project-local cycle-memory verification deterministic by adding a fixed-time bootstrap override, isolated temp-workspace checks, idempotency coverage, and invalid-input rejection for the local charter helper flow.
2026-03-21 — Documented `scripts/verify-cycle-memory.ts --all` as the one-command charter-helper verification path and refreshed roadmap context so PR #11 is represented accurately in the project source of truth.
2026-03-21 — Clarified the charter cycle operator flow in `README.md` so the required shared-selector lifecycle and the project-local manual bootstrap path are both explicit, reducing ambiguity while keeping PR #11 narrowly scoped.
2026-03-21 — Extended `scripts/verify-cycle-memory.ts --handoff` to preserve bootstrap/shared-selector failure exit codes in the deterministic fake-workspace harness, closing the last local helper failure-propagation gap before merge.
2026-03-21 — Scoped the next outward milestone as **BYOK CLI Alpha** in the project backlog so the post-helper plan is explicit: shareable CLI packaging/install, user-facing entry flow, getting-started docs, and a written BYOK trust model.
2026-03-22 — Added `docs/byok-cli-alpha.md` as the reviewable source-of-truth artifact for the post-helper OSS milestone, locking the minimum alpha artifact set and keeping that follow-on scope separate from PR #11.
2026-03-22 — Tightened the BYOK CLI Alpha packet with explicit work packages, acceptance checks, and a suggested outward-facing artifact layout so the next branch can start from a concrete review contract instead of a high-level milestone note.
2026-03-22 — Added `docs/audit-report-goal-6a9cf960.md` and re-aligned README/goals/roadmap so Jake’s report-restructure/examples/stale-flag directive is the explicit active goal ahead of the parked BYOK follow-on.
2026-03-22 — Promoted high-risk stale always-on rules into the audit summary layer with a dedicated at-a-glance signal, freshness alert callout, and regression coverage so stale-risk findings are harder to miss in the report summary path.
2026-03-22 — Added a summary-layer “Fix first” cue that points reviewers at the first remediation move (stage trust blocker, ordered task, or stale always-on file) and covered the new remediation-ordering path with focused regression tests.
2026-03-22 — Made the Process Issue Queue show inline evidence examples in the report body and added a focused regression test so reviewers can see why queued issues exist without hunting deeper sections.
2026-03-23 — Carried compact example evidence into the Remediation Pack table and locked it with a report-format regression test so the action list stays self-explanatory without extra section-hopping.
2026-03-23 — Reordered the audit body so Remediation Pack now appears before Process Issue Queue, with a regression test locking the summary → fix-order → issue-diagnostics reading path.
2026-03-23 — Moved the Remediation Pack up to sit directly after the summary, ahead of AI backlog and rule diagnostics, and added a regression test to lock the summary → remediation → diagnostics reading order.
2026-03-23 — Refreshed the representative audit golden snapshot to show the new summary/remediation flow, and taught generated remediation tasks to carry inline example evidence so snapshot-backed reports match the live format.
2026-03-23 — Moved the report action path (`Remediation Pack` + `Process Issue Queue`) directly under the executive summary and added regression coverage so reviewers reach fix order before stage/score diagnostics.
2026-03-23 — Added a compact `Action Path Recap` inside the later diagnostics that links back to the first remediation task and first process issue (or explicit empty states), reducing section hopping after the summary path.
2026-03-24 — Added a `Freshness focus` cue inside the `Remediation Pack` so high-risk stale always-on rules stay visible in the action path, not only in the executive summary, and locked it with a focused report-format regression test.
2026-03-25 — Reduced path-drift false positives by classifying domain-like references and non-local import-style backtick references as external notes instead of broken local paths, and added regression coverage for the observed URL/import cases.
