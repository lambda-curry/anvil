# Research Digest #8 — IFScale Deep Dive, Hooks as Rule Enforcement, MCP Context Delivery

*Date: 2026-02-23 · Anvil Cycle 9 · Researcher: Scout*

---

## Summary Table

| Finding | Source | Priority | LC Action |
|---|---|---|---|
| IFScale: Three distinct degradation patterns — Claude shows linear decay | arXiv 2507.11538 (Distyl AI, Jul 2025) | 🔴 High | Rubric: update degradation pattern, name claude-sonnet-4 specifically |
| Hooks as deterministic rule enforcement — guaranteed execution vs. LLM preference | Anthropic Claude Code docs (Feb 2026) | 🔴 High | New pattern: hooks-as-enforcement (complement to AGENTS.md rules) |
| 14 hook lifecycle events as of Feb 2026 — three handler types | smartscope.blog Claude Code Hooks Guide (Feb 2026) | 🟡 Medium | Rubric §Part 8: hooks coverage |
| MCP as on-demand context delivery — rules as MCP resources | Anthropic Claude Code docs | 🟡 Medium | Pattern: mcp-rule-delivery (future-state for LC) |
| Even best frontier models hit 68% at 500 instructions | IFScale benchmark results | 🟠 LC Awareness | Confirms: 150-instruction ceiling note in rubric v1.4 is conservative estimate |

---

## Finding 1: IFScale — Three Degradation Patterns, Claude Shows Linear Decay

**Source:** arXiv 2507.11538 — "How Many Instructions Can LLMs Follow at Once?" Distyl AI (Jul 15, 2025). IFScale benchmark. Open-sourced: distylai.github.io/IFScale

**What the paper does:**

IFScale measures how LLM instruction-following accuracy degrades as instruction density increases. 500 keyword-inclusion instructions for a business report. 20 models from 7 providers. Tests at 10-instruction intervals from 10 to 500.

**The three degradation patterns (named in the paper):**

| Pattern | Models | Behavior |
|---|---|---|
| **Threshold decay** | o3, gemini-2.5-pro (reasoning models) | Near-perfect until a critical density threshold, then rising variance and steep drop |
| **Linear decay** | gpt-4.1, **claude-sonnet-4** | Steady, predictable decline as instruction count increases |
| **Exponential decay** | gpt-4o, llama-4-scout | Sharp early drop; collapses quickly under load |

**Key numbers:**
- Best frontier models: **68% accuracy at 500 instructions max density**
- "Even the best models" fail to maintain instruction compliance at scale
- Bias toward **earlier instructions** confirmed across all models (peripheral bias — aligns with Digest #7 finding)
- The model Claude Code uses (claude-sonnet-4 → claude-sonnet-4-6) is a **linear decay** model — no cliff, just steady attrition

**What linear decay means for LC:**

Linear decay is actually the best-case pattern for practical use. It means:
- There's no sudden "cliff" where instructions stop working
- Every additional instruction costs a small, predictable amount of compliance
- The budget model is accurate: each rule you add beyond the budget reduces compliance for all rules proportionally
- There's no point at which it catastrophically fails — but there's also no free lunch

The practical implication: the 80-instruction budget in Anvil's rubric is a conservative estimate of where the compliance rate meaningfully degrades for claude-sonnet-4. At exactly 80 instructions you're not at 0% compliance — you're at maybe 80-85% reliability. But "85% reliable rule compliance" means roughly 1 in 6 rule invocations is missed. For safety-critical rules (no private key logging, no npm install, mandatory Slack notification), that's unacceptable.

**Rubric update (§Part 1):**

Digest #7's note was: "frontier models follow ~150-200 reliably." The IFScale data sharpens this:
- claude-sonnet-4 shows **linear decay** — no magic safety number, just a slope
- 68% accuracy at 500 instructions implies ~90% at 100 instructions, ~95% at 50
- **For critical rules: treat ~50 instructions as the "99% reliable" zone**
- The "150 instructions" estimate from Digest #7 was too optimistic for critical rules; more accurate: treat 50-80 as the high-reliability zone, 80-150 as the degraded-but-functional zone

**Update to rubric §Part 1 (Instruction Budget):**
Add the three-pattern taxonomy and the LC-specific note that Claude is a linear decay model. Update the "~50-80 instructions budget" framing with the accuracy-conscious version.

---

## Finding 2: Claude Code Hooks — Deterministic Rule Enforcement

**Source:** Anthropic Claude Code docs, hooks-guide (Feb 2026). Also: smartscope.blog Claude Code Hooks Guide (Feb 2026 edition), 14 hook events.

**The core principle:**

> "Hooks provide **deterministic control** over Claude Code's behavior, ensuring certain actions always happen rather than relying on the LLM to choose to run them."
> — Anthropic Claude Code docs

This is the key insight: **AGENTS.md rules are requests. Hooks are enforcement.** A rule in AGENTS.md says "please do X." A hook executes X regardless of whether the model chose to.

**The 14 hook lifecycle events (as of Feb 2026):**

| Event | Enforcement use |
|---|---|
| `SessionStart` | Inject development context; load environment variables |
| `PreToolUse` | Block dangerous commands; rewrite tool input; validate before file edit |
| `PostToolUse` | Auto-format/lint after file saves; run typecheck |
| `PermissionRequest` | Auto-approve safe commands; deny unsafe ones |
| `Stop` | Auto git commit; enforce "never stop without notifying" |
| `UserPromptSubmit` | Validate prompt; add context |
| `SubagentStart/Stop` | Environment prep; subagent result validation |
| `PreCompact` | Backup conversation before compaction |
| `TeammateIdle/TaskCompleted` | Multi-agent coordination |
| `Notification` | Desktop/Slack notifications when Claude needs input |

**Three handler types:**

1. **`command`** — deterministic shell command. Always runs. Best for: lint, format, git ops, notifications.
2. **`prompt`** — judgment call delegated to Claude. For when hook input data alone is sufficient to decide (e.g., "is this Bash command risky?").
3. **`agent`** — Claude reads actual codebase state before deciding. For complex checks (e.g., "do tests exist for these changed files?").

**Async hooks** (added Jan 2026) — background execution without blocking Claude. Good for: logging, backups, Slack notifications.

**Exit code protocol:**
- Exit 0 → success, continue
- Exit 2 → **blocking error** — stops tool execution, feeds stderr back to Claude
- Other → non-blocking, shows in verbose mode

**LC implications — what hooks can enforce that AGENTS.md cannot:**

| Rule | In AGENTS.md | As hook |
|---|---|---|
| "Always run typecheck after editing TS" | Optional — Claude might skip | `PostToolUse` command: `bun run typecheck` (always runs) |
| "Never commit without running lint" | Claude must remember | `Stop` hook: block commit if lint fails |
| "Post Slack notification at cycle end" | Claude might forget | `Stop` hook: `bun run scripts/slack-notify.ts "cycle complete"` |
| "Never edit .env files" | Claude can choose to ignore | `PreToolUse` with matcher `Edit`: block if file matches `.env*` |

**The design rule this implies:**

**Safety-critical and always-mandatory behaviors belong in hooks, not AGENTS.md.** AGENTS.md is for preferences and conventions that require judgment. Hooks are for enforcement that must not be LLM-optional.

This is a new dimension Anvil's rubric doesn't currently cover. It needs a §Part 8 on hooks.

**Proposed new pattern: `hooks-as-enforcement`**

Core guidance:
1. For any rule in AGENTS.md that says "always" or "never" — ask: should this be a hook instead?
2. If the behavior is deterministic (doesn't require judgment), it should be a hook
3. AGENTS.md describes the policy; settings.json hooks enforce the policy for deterministic cases
4. Use `command` type by default; escalate to `prompt`/`agent` only when judgment is needed

**What NOT to put in hooks:**
- Rules requiring contextual judgment (use `prompt` handler if needed, but prefer AGENTS.md)
- Complex multi-step workflows (use skills)
- Policies that change frequently (harder to update hooks than AGENTS.md)

---

## Finding 3: MCP as On-Demand Rule Delivery

**Source:** Anthropic Claude Code docs (code.claude.com/docs/en/mcp), block/ai-rules MCP support (Digest #7)

**The concept:**

Rules files (AGENTS.md, CLAUDE.md) are always-loaded. Skills are demand-loaded when a workflow is invoked. MCP resources are pull-loaded — the agent calls an MCP tool to retrieve context. This creates a third loading mode beyond the two in Anvil's current tier model.

**How MCP rules delivery works:**

An MCP server can expose rules as resources. The agent queries:
```
mcp.rules.get("react-patterns")
mcp.rules.get("database-schema-conventions")
mcp.rules.get("security-posture")
```

This solves the universality problem from Digest #7 (too many AGENTS.md rules → system-reminder skip):
- Put only universally applicable rules in AGENTS.md (passes universal applicability test)
- Put task-specific rules in an MCP resource
- Agent retrieves them on-demand when the task warrants it

**block/ai-rules' implementation:**

The `ai-rules generate` command creates both CLAUDE.md files AND MCP config that serves the same rules as MCP resources. Same source, two delivery modes.

**LC current state:**

LC doesn't have MCP integrated into the agent network (as noted in Digest #7). This is a future-state pattern, not immediately actionable. But it's worth documenting because:
1. The pattern is established (block/ai-rules, Anthropic docs)
2. It resolves the universal-applicability tension cleanly
3. When LC adds MCP support, the rules tier model needs updating

**Updated tier model (future-state):**

| Tier | Mechanism | When loaded | Example content |
|---|---|---|---|
| 1 — Always | AGENTS.md | Every session | Identity, orientation, safety, ~50 instructions max |
| 2 — Glob | .cursor/rules/*.mdc | When file touched | Framework patterns, style conventions |
| 3 — Demand | skills/*.md | When skill invoked | Complex workflows, tool guides |
| 4 — Pull | MCP resource | When agent queries | Deep reference, domain rules, compliance |

MCP is Tier 4 — the deepest, most targeted loading. No system-reminder skipping risk because the agent actively opted in.

---

## Finding 4: IFScale on Peripheral Bias — Earlier Instructions More Likely Followed

**Source:** arXiv 2507.11538 §4 Results: "bias towards earlier instructions"

The IFScale paper confirms with actual measurement what Digest #7 described from HumanLayer's analysis: earlier instructions in the prompt are followed more reliably than later ones. The paper calls this "order effects."

**Exact finding:** "bias towards earlier instructions" — items presented earlier receive more attention. This holds across all 20 models tested.

**LC implication:** Already addressed in rubric v1.4 (Position Matters §Part 5). But now we have the empirical citation to back it up. Update rubric §Part 5 with the IFScale citation.

---

## Rubric Updates (v1.5 candidates)

| Section | Change |
|---|---|
| §Part 1 — Instruction Budget | Name three degradation patterns; identify claude-sonnet-4 as linear decay; sharpen the "high-reliability zone" estimate to ~50 instructions |
| §Part 5 — Position Matters | Add IFScale citation for peripheral bias |
| §Part 8 (new) — Hooks as Enforcement | Document the AGENTS.md-vs-hooks design split; hook event catalog for LC projects; "always/never rules → candidate for hook" test |

## New Pattern: hooks-as-enforcement

Planned for `docs/patterns/hooks-as-enforcement.md`. Core idea:

> Rules in AGENTS.md rely on the LLM to choose to follow them. Hooks execute unconditionally. Safety-critical and always-mandatory behaviors — things that must happen regardless of task context — belong in hooks, not rules files.

This is the missing enforcement layer in Anvil's current rubric.

---

## Agenda for Digest #9

1. **hooks-as-enforcement pattern** — After writing the pattern, research existing community implementations (awesome-claude-code, everything-claude-code). What hooks are teams building? Any LC-applicable patterns?
2. **IFScale: the reasoning model exception** — o3 and gemini-2.5-pro show threshold decay (near-perfect until cliff). If LC ever uses a reasoning model, the budget calculus changes significantly.
3. **context compaction and rules** — Claude Code compacts context after ~200k tokens. The `PreCompact` hook is new. Does compaction drop AGENTS.md? How should rules be structured to survive compaction?
