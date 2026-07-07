# Research Digest #9 — Hooks Community Patterns & Context Compaction

*Published: 2026-02-23 · Author: Scout/Anvil · Status: Active*

---

## Summary

Four findings this digest: community hook patterns from awesome-claude-code (20+ examples catalog), the context compaction AGENTS.md survival problem (what actually survives compaction), the PreCompact witness pattern (LLM-interpreted recovery briefs), and the Stop hook infinite loop trap. All four have direct implications for LC hook design and the Hooks-as-Enforcement pattern.

---

## Finding 1: Community Hook Catalog — 12 Events, 3 Handler Types

**Source:** DEV Community — "Claude Code Hooks: Complete Guide with 20+ Ready-to-Use Examples (2026)" (lukaszfryc, published ~2026-02-09)

**What they found:** A comprehensive catalog of Claude Code's 12 hook lifecycle events and 20+ ready-to-use configurations, organized by event type.

**The 12 events (grouped):**

*Session lifecycle:*
- `SessionStart` — fires on startup, resume, compact, clear
- `PreCompact` — fires before context compaction (manual or auto)
- `SessionEnd` — fires on clear, logout, or other termination

*Tool lifecycle:*
- `PreToolUse` — fires before any tool executes; **can block** (exit 2)
- `PostToolUse` — fires after tool succeeds; cannot block
- `PostToolUseFailure` — fires after tool fails; cannot block
- `PermissionRequest` — fires when permission dialog would appear; can block

*Agent lifecycle:*
- `SubagentStart` — fires when subagent spawns; cannot block
- `SubagentStop` — fires when subagent finishes; can block
- `Stop` — fires when main agent finishes; **can block**

*User interaction:*
- (2 additional events not fully documented in source)

**The blocking rule:** Only `PreToolUse`, `PermissionRequest`, `SubagentStop`, and `Stop` can block. Exit code 2 blocks; exit 0 proceeds.

**Handler type decision table:**

| Need | Handler | Speed |
|---|---|---|
| Deterministic check/action | `command` | Fastest |
| Judgment from hook input alone | `prompt` | Medium |
| Judgment requiring codebase state | `agent` | Slowest |

**Killer SessionStart pattern (compact matcher):**
```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "compact",
      "hooks": [{
        "type": "command",
        "command": "echo 'Reminder: Use Bun, not npm. Current sprint: auth refactor. Run bun test before committing.'"
      }]
    }]
  }
}
```

This re-injects reminders *after* every compaction event. The `compact` matcher fires on `SessionStart` that follows a compaction — meaning the injected text appears in fresh context, after the summary. This is the current best workaround for post-compaction context loss.

**Actionable for LC:** The `SessionStart compact` pattern is the highest-leverage hook for AGENTS.md survival. Every LC project with critical AGENTS.md rules should have this as its first hook.

---

## Finding 2: Context Compaction — What Actually Survives

**Source:** GitHub issue anthropics/claude-code#14258 — "[FEATURE] PostCompact Hook Event and Compaction Content Control" (December 17, 2025)

**The problem (confirmed by Anthropic community):** When context compaction fires, Claude Code generates a summary of the conversation. **AGENTS.md/CLAUDE.md rules that were cited in the conversation get paraphrased in that summary.** Post-compaction, Claude sees "framework already discussed" in the summary and doesn't re-read source files (training bias: "don't re-read if in context"). Paraphrased rules lose precision → **behavioral drift**.

**What survives verbatim:**
- CLAUDE.md files ARE loaded fresh from disk after compaction — they survive
- `SessionStart` hooks fire after compaction (compact matcher)

**What does NOT survive:**
- Rules injected via PreCompact that are included in the compacted content get paraphrased
- Conversation-level rule citations become lossy summaries
- No "retain verbatim" marking exists yet (feature request, not implemented)

**The PostCompact gap:** There is no `PostCompact` hook (as of February 2026). The feature request proposes it, but it doesn't exist. The `SessionStart compact` matcher is the workaround.

**Key implication for LC:** The order of survival reliability:
1. **AGENTS.md/CLAUDE.md (disk files)** — survive compaction verbatim; always re-loaded
2. **SessionStart compact hook output** — injected post-compaction; fresh, unparaphrased
3. **PreCompact hook output** — injected pre-compaction; gets summarized
4. **Conversation-level rule citations** — lossy paraphrase; unreliable

**For rule writing:** Put critical rules in AGENTS.md (disk file survives). Put critical *reminders* in a `SessionStart compact` hook. Do not rely on in-conversation rule repetition to survive compaction.

---

## Finding 3: PreCompact Witness Pattern — LLM-Interpreted Recovery Briefs

**Source:** GitHub — mvara-ai/precompact-hook ("The witness at the threshold", 2025-2026)

**The pattern:** When context approaches the limit, a PreCompact hook:
1. Reads the last N conversation exchanges from the transcript file
2. Sends them to a fresh Claude instance (empty context window — full attention available)
3. Fresh Claude generates a structured "recovery brief": what matters, not just what happened
4. Brief is injected into post-compaction context via stdout

**Six recovery brief sections:**
- Who Is Here — human identity, role, relationship dynamics
- The Living Thread — the inquiry driving the conversation, what's at stake
- What Just Happened — specific files, decisions, discoveries
- Emotional Truth — energy, mood, tension
- Key Artifacts — files, IDs, commands, technical details
- Continue With — concrete next actions

**Why a fresh Claude instance:** The subagent has an empty context window — it can dedicate full attention to interpreting the session without noise from its own history. This is the same principle as context isolation in sub-agent design.

**The limitation:** The PreCompact brief itself gets included in the compacted content — so it is also subject to paraphrase. But because it's already a structured summary (not raw conversation), paraphrase does less damage. The brief's structure (six sections) tends to survive better than inline conversation references.

**For LC:** The witness pattern is worth considering for long-running agent sessions (Forge workspace generation runs, multi-hour builds). For short cycles like most LC agents, a `SessionStart compact` re-injection of key rules is simpler and sufficient.

---

## Finding 4: Stop Hook Infinite Loop Trap

**Source:** DEV Community guide (same source as Finding 1)

**The trap:** Stop hooks can prevent Claude Code from finishing until conditions are met. But if the Stop hook asks Claude to do more work (e.g., "run tests"), and that work triggers another Stop event, you get an infinite loop.

**The fix — always check `stop_hook_active`:**
```bash
#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0  # Let Claude stop — we already verified once
fi
# Your verification logic here
```

**The `stop_hook_active` field** is set to `true` when Claude is in a stop-hook-triggered follow-up turn. Checking this prevents the hook from firing again during the recovery action.

**LC implication:** Every LC Stop hook that triggers additional Claude work MUST include this guard. The Slack notification hook is safe (async, no follow-up Claude turn) but any hook that triggers a verification task must implement the guard.

**The async flag:** For Stop hooks that post notifications or run fire-and-forget tasks, use `"async": true` — the hook runs in the background and doesn't block Claude from completing. Critical for Slack notification hooks.

---

## Rubric Updates from This Digest

No rubric updates needed — Digest #8 already captured the hooks-as-enforcement principle in §Part 8. This digest adds operational detail:

1. **`SessionStart compact` pattern** → goes directly into `hooks-as-enforcement.md` pattern as the "compaction survival" section
2. **Stop hook loop guard** → goes into `hooks-as-enforcement.md` as a safety requirement
3. **Survival hierarchy** → goes into `hooks-as-enforcement.md` as the "where to put critical rules" guide

---

## See Also

- `docs/research/digest-008.md` — Hooks as enforcement, IFScale, MCP
- `docs/patterns/hooks-as-enforcement.md` (next deliverable this cycle)
- `docs/rubric.md` §Part 8 — Hooks as Enforcement
- awesome-claude-code repo: github.com/hesreallyhim/awesome-claude-code
