# Research Digest #14 — Multi-Agent Orchestration Patterns

*Date: 2026-02-25*
*Last validated: 2026-02-25*

## Summary

Four findings this cycle: Anthropic's production multi-agent research system (orchestrator-worker architecture + token economics), Microsoft Azure's complexity spectrum + 5 canonical orchestration patterns, Meta's "Agents Rule of Two" for prompt injection security in multi-agent contexts, and Claude Code's subagent system (context isolation, tool restrictions, scope per agent). Together these paint a clear picture of what multi-agent governance requires in rules — and expose a gap in the rubric around subagent boundary declarations.

---

## Finding 1: Anthropic's Multi-Agent Research System — Token Economics + Delegation Rules

**Source:** Anthropic Engineering Blog, "How we built our multi-agent research system" (June 2025)

### What they found

Anthropic's production Research feature uses an orchestrator-worker pattern: a **lead agent** plans and spawns **subagents** in parallel, each with their own context window, specialized tools, and focused task scope. Key metrics from production:

- Multi-agent systems use **~15× more tokens** than chat interactions
- Single agents use ~4× more than chat
- Token usage explains **80% of performance variance** on BrowseComp
- Multi-agent Claude Opus 4 + Sonnet 4 subagents outperformed single-agent Claude Opus 4 by **90.2%** on internal research eval

### The delegation rules that matter

Anthropic found that vague subagent instructions caused agents to duplicate work and produce gaps:

1. **Each subagent needs 4 components in its task description:** concrete objective, output format, tools/sources guidance, and clear task boundaries
2. **Scale effort to query complexity:** embed explicit scaling rules — simple queries = 1 agent + 3-10 tool calls; complex research = 10+ subagents with divided responsibilities
3. **Context window overflow is a coordination failure mode:** lead agent saves plan to memory before context hits 200K tokens, ensuring plan survives compaction

### Key architecture insight: separation of concerns is the value

Each subagent operates as an "intelligent filter" — exploring a direction independently and condensing findings before returning to the lead. This is the compression mechanism. Without it, the lead agent would see everything (n² attention cost), defeating the purpose of multi-agent parallelization.

### Anvil implication

**Rules for multi-agent systems must specify subagent task structure.** Vague delegation instructions are the #1 failure mode Anthropic documented. The subagent's task description is itself a mini-rule — it needs objective, format, tools, and boundaries. This maps directly to the handoff-packet pattern.

**Rubric gap:** §Part 9 (Reliability Lens) covers context rot and scope creep for single-agent systems. Multi-agent context rot — lead agent's context filling with subagent results — is a distinct failure mode that needs coverage.

---

## Finding 2: Microsoft Azure — Orchestration Complexity Spectrum + 5 Canonical Patterns

**Source:** Azure Architecture Center, "AI Agent Orchestration Patterns" (February 2026)

### Complexity spectrum (start here)

| Level | When to use |
|-------|-------------|
| Direct model call | Single-step tasks — classification, translation |
| Single agent with tools | Varied domain queries with dynamic tool use |
| Multi-agent orchestration | Cross-domain, requires distinct security boundaries, or parallelizable |

**Key: use the lowest complexity that works.** Multi-agent adds coordination overhead, latency, and failure modes. Justify it.

### Five canonical orchestration patterns

1. **Sequential** (pipeline) — agents chain linearly. Each processes previous output. Best for staged refinement (draft → review → polish). Avoid when stages are parallelizable.
2. **Concurrent** (fan-out/fan-in) — agents run in parallel on same task. Aggregated by orchestrator. Best for breadth-first exploration.
3. **Group chat** — agents communicate peer-to-peer via shared channel. Orchestrator arbitrates. Best for collaborative reasoning (review board, debate team).
4. **Handoff** — agent delegates to another based on intermediate result. Dynamic routing. Best when the right specialist depends on what's discovered.
5. **Magentic** — agents self-organize around goals without predefined roles. Emergent coordination. High capability ceiling, high reliability risk.

### Anvil implication

**Sequential is the safest and most auditable pattern for AI coding agents.** Handoff and Magentic introduce dynamic routing that's hard to govern with static rules. The handoff-packet pattern (Anvil Pattern #7) maps directly to the Handoff orchestration pattern.

**New rubric dimension candidate:** Multi-agent topology should be declared in AGENTS.md — which pattern does this agent participate in? Orchestrator? Subagent? Peer? This is a governance gap in nearly all community rule files.

---

## Finding 3: Meta's "Agents Rule of Two" — Security Constraint for Multi-Agent Rules

**Source:** Meta AI Blog, "Agents Rule of Two: A Practical Approach to AI Agent Security" (October 2025). Covered by Simon Willison, November 2025.

### The framework

Prompt injection attacks in multi-agent systems remain unsolved. Until they are, agents must satisfy **no more than two** of these three properties in a single session:

- **[A]** Can process untrustworthy inputs (web content, user data, external API results)
- **[B]** Has access to sensitive systems or private data
- **[C]** Can change state or communicate externally

Any agent requiring all three [A+B+C] **must have human-in-the-loop supervision or another validation mechanism** — it cannot operate autonomously.

### Why this matters for rules

This is a **structural rule** — not a style preference. It constrains what an agent should be *allowed* to do simultaneously. Yet no community rule file expresses this constraint explicitly.

The Rule of Two maps to the scope boundary template (may/confirm/never) in a specific way:
- **Must confirm:** any session where the agent processes external/untrusted inputs AND has write access to production/sensitive systems
- **May do autonomously:** tasks that satisfy at most 2 of [A, B, C]
- **Never autonomously:** [A+B+C] all satisfied without a checkpoint

The companion paper ("The Attacker Moves Second") confirms: all 12 published prompt injection defenses were bypassed with >90% success rate by adaptive attacks. The current state of the art is **architecture-first defense**, not prompt-based defense.

### Anvil implication

**The high-stakes registry pattern and scope boundary template already address this — but don't explicitly cite the Rule of Two framework.** Adding a Rule of Two check to the reliability coverage detection in the audit script would surface this constraint for multi-agent systems. Specifically: does the AGENTS.md declare what happens when the agent is in an [A+B+C] state?

---

## Finding 4: Claude Code Subagents — Context Isolation as Governance Mechanism

**Source:** Claude Code documentation, "Create custom subagents" (accessed February 2026)

### Architecture

Claude Code's subagent system defines agents as **Markdown files with YAML frontmatter** in `.claude/agents/`. Each agent:
- Runs in its **own context window** (context isolation)
- Has **restricted tool access** (not all tools from parent session)
- Can be **model-specific** (route to Haiku for cost control, Sonnet for balance)
- **Inherits CLAUDE.md context** from the parent project — coding standards, conventions, project instructions propagate automatically

Four scope levels (priority order):
1. `--agents` CLI flag — session-only
2. `.claude/agents/` — project-specific (check into version control)
3. `~/.claude/agents/` — user-global
4. Plugin `agents/` dir — lowest priority

**Key finding:** Subagents cannot spawn other subagents (prevents infinite nesting). The orchestrator is always the main conversation, not a subagent.

### Context inheritance model

Subagents inherit CLAUDE.md context. This means:
- Project-level coding rules propagate without re-declaration
- But subagent-specific rules (scope, tool restrictions, domain focus) must be in the subagent definition file itself
- The subagent's `description` field is what Claude reads to decide *when to delegate* — this is a rule in the rubric sense

### Governance gap

Most projects using Claude Code don't define explicit subagents — they rely on the ad-hoc `Task` tool invocation, which gives the subagent no persistent configuration, no tool restrictions, and no specialized prompt. This is the ad-hoc delegation anti-pattern: **delegation without governance**.

**Rule pattern:** For any project using multi-agent delegation, define subagents as explicit `.claude/agents/` files with scoped tool access and focused system prompts. The description field functions as a routing rule — write it as one.

---

## Synthesis

### What multi-agent governance requires in rules

Four things community rule files almost never include:

1. **Topology declaration** — which pattern (sequential/concurrent/handoff), which role (orchestrator/subagent/peer). Without this, a subagent that's supposed to be read-only can be used as an executor.

2. **Subagent task structure** — delegation instructions must include: objective, output format, tools/sources, task boundaries. This is the handoff-packet pattern applied to agent-to-agent delegation.

3. **Rule-of-Two state check** — when does this agent operate in an [A+B+C] state? What's the confirmation requirement? This is the scope boundary template + high-stakes registry, extended to multi-agent contexts.

4. **Context isolation policy** — which context should flow from orchestrator to subagent? Full context (Google ADK default) vs. task-scoped only (Anthropic's subagent pattern). Neither is universally correct — but the choice should be declared.

### Rubric additions queued

- **§Part 9** (Reliability Lens): Add multi-agent context rot as a distinct failure mode (lead agent's context filling with subagent results)
- **§Part 4** (High-Stakes Operations): Add Rule-of-Two architectural constraint for agents in [A+B+C] sessions
- **New coverage category**: Multi-agent topology declaration — added to `analyzeCoverage()` in audit.ts

### Pattern candidate

**"Subagent Boundary Declaration"** — a rule template that declares:
- Agent's role in any multi-agent topology (orchestrator / specialist subagent / peer)
- Subagent task structure (the 4-component template from Anthropic's findings)
- Rule-of-Two state check (which sessions require human-in-the-loop)
- Context inheritance policy (what flows in, what flows out)

Atticus consult warranted before promoting to network-wide (involves both operational detail and structural architecture decisions). Document as candidate, not finalized pattern.

---

*Queued: rubric v2.1 (multi-agent context rot + Rule of Two architectural constraint), audit.ts coverage category expansion (multi-agent topology), Subagent Boundary Declaration pattern candidate.*
