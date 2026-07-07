# Research Digest #2 — PR Mining, Community Patterns, Staleness

*Published: 2026-02-20 · Author: Scout/Anvil*

---

## Summary

Four findings this cycle: a major community resource for PR-mined rules (awesome-reviewers), the "ball of mud" anti-pattern documented by the community, the critical insight that file-path documentation in AGENTS.md is a staleness trap, and the community validation of progressive disclosure as a standard.

---

## Finding 1 — awesome-reviewers: PR History Mining at Scale

**Source:** github.com/baz-scm/awesome-reviewers (Baz SCM, 2025)

**What it is:**
An open-source registry of 8,000+ review prompts distilled from real PR comments in leading open-source repos. Each prompt captures a specific code review pattern that appeared repeatedly in actual maintainer feedback — with source repo, frequency count, and repo star count for credibility.

Example metadata: "9 prior comments advocating a rule in a project with 16k⭐ on GitHub."

**How it works:**
The tool analyzes PR comment history across repos, extracts patterns that appear repeatedly, and distills them into natural-language prompts that can be used as AI coding agent instructions.

**Key quote:** "Each reviewer prompt is distilled from thousands of real code review comments in leading open source repositories. These prompts capture best practices and coding standards that developers can easily apply during pull request reviews."

**LC relevance — Anvil Phase 2 (PR Mining):**
This is the community-scale version of exactly what Anvil's Phase 2 goal describes. The approach is:
1. Fetch PR review comments from a repo using GitHub API (`gh api`)
2. Cluster by semantic similarity to find recurring themes
3. Extract as rule candidates when a theme appears 3+ times
4. Filter by reviewer — comments from senior engineers carry more weight

**Actionable finding for Anvil:**
- The `awesome-reviewers` methodology is directly applicable to LC's PR history
- For Phase 2 mining: use `gh api graphql` to fetch PR review comments, then use LLM clustering to find repeating patterns
- A Bun script could automate this: `scripts/mine-pr-rules.ts` — takes a repo path, outputs rule candidates to `data/rule-candidates/`
- **Three occurrence threshold** from Anvil's rubric maps directly to their methodology

---

## Finding 2 — The "Ball of Mud" Anti-Pattern

**Source:** aihero.dev, "A Complete Guide to AGENTS.md" (Jan 2026)

**What they documented:**
A natural, destructive feedback loop they call the "ball of mud":
1. Agent does something wrong
2. Developer adds a rule to prevent it
3. Repeat hundreds of times over months
4. File becomes unmaintainable

They also flag a second cause: **auto-generated AGENTS.md files**. "Never use initialization scripts to auto-generate your AGENTS.md. They flood the file with things that are 'useful for most scenarios' but would be better progressively disclosed."

**LC relevance:**
This is a real risk for Forge's generator and for Anvil's own audit recommendations. When Forge generates workspace files with comprehensive AGENTS.md templates, it may be seeding the "ball of mud" by front-loading all context. The recommendation should be: generate lean, with progressive disclosure hooks, not comprehensive.

**Key quote:** "For AI agents that read documentation on every request, stale information actively _poisons_ the context."

**Actionable finding:**
- Anvil audit checks should flag files showing the "ball of mud" signature: >200 lines, multiple unrelated rule sections, contradictions, no dates
- Forge generator templates should be reviewed against this: are they starting agents off with lean files or comprehensive ones?
- Add "ball of mud" to the rubric as a named anti-pattern in §Part 5 (Hygiene)

---

## Finding 3 — Document Capabilities, Not File Paths

**Source:** aihero.dev, "A Complete Guide to AGENTS.md" (Jan 2026)

**The insight:**
File path documentation in AGENTS.md/CLAUDE.md is the highest-staleness content in any rules file. File paths change constantly — renaming, restructuring, moving files. When the rules file says "authentication logic lives in `src/auth/handlers.ts`" and that file moves, the agent confidently looks in the wrong place.

Their recommendation: **describe capabilities, not structure.** Instead of documenting where things are, give the agent hints about the shape of the project and let it explore.

> "Domain concepts (like 'organization' vs 'group' vs 'workspace') are more stable than file paths, so they're safer to document."

**LC relevance:**
Several LC workspace files include file path references — AGENTS.md files that say things like "check `data/research-log.md`" or "read `.project/PROJECT.md`, `.project/agents/*.md`." These are relatively stable (they're part of the prescribed structure), but the principle still applies to generated workspace files that document tech-stack file paths.

**Actionable finding for Anvil drift detection:**
This is a key input to Drift Detection (Goal 8). A drift detector should:
1. Scan rules files for absolute or relative file paths
2. Check whether those paths exist in the project
3. Flag any path reference that doesn't resolve

This is implementable as a simple Bun script: parse rules files for path-like strings, check `fs.existsSync()`, report mismatches.

---

## Finding 4 — Community Validates 3-Tier Rule Organization

**Source:** awesome-cursorrules community repo (tugkanboz fork), multiple community sources

**What the community has converged on:**
Independent of Anthropic's formalization, the community has organically converged on the same 3-tier loading structure:

```
Old way: .cursorrules (200+ lines, everything mixed together)

New way:
.cursor/rules/
  ├── core-standards.mdc      # Always applied
  ├── testing-patterns.mdc    # Auto-attached to test files  
  ├── framework-specific.mdc  # Context-aware activation
  └── advanced-optimizations.mdc # Agent-requested when relevant
```

This maps exactly to LC's alwaysApply → glob → on-demand tier system. The community convergence validates the approach without being told by Anthropic — it emerged from practitioners noticing that monolithic rules files degrade performance.

**Actionable finding:**
- The rubric's 3-tier system is independently validated by community practice
- The migration path from "old way" to "new way" is a useful model for Anvil's audit recommendations — when an audit finds a bloated always-on file, the recommendation should include a specific refactoring to the 3-tier structure

---

## Finding 5 — "Awesome Reviewers" Methodology Reveals Rule Quality Signals

**Source:** awesomereviewers.com / baz-scm (methodology documentation)

**Additional detail:**
Their methodology for deciding whether a PR comment should become a rule:
- **Frequency:** How many times did this exact pattern of feedback appear?
- **Authority:** What's the reputation of the repos where this feedback appeared? (star count as a proxy)
- **Consistency:** Did multiple reviewers independently give the same feedback, or was it one person's opinion?

This is a more rigorous version of Anvil's three-occurrence threshold. The authority and consistency signals are things Anvil's PR mining phase could incorporate.

**Actionable finding:**
For Anvil's PR mining script, weight rule candidates by:
1. Occurrence count (primary)
2. Reviewer seniority/commit history (secondary)
3. Whether the feedback was addressed/merged (tertiary — addressed feedback that was merged = confirmed correctness)

---

## Findings Summary Table

| Finding | Source | Priority | LC Action |
|---|---|---|---|
| awesome-reviewers: PR mining methodology at scale | baz-scm/awesome-reviewers | 🔴 High | Design PR mining script in Phase 2; use their methodology |
| "Ball of mud" anti-pattern + auto-generation risk | aihero.dev | 🔴 High | Add to rubric; audit Forge generator templates |
| Document capabilities not file paths (staleness) | aihero.dev | 🔴 High | Core input to drift detection design |
| Community independently converged on 3-tier structure | awesome-cursorrules community | 🟢 Low | Validates rubric; no action needed |
| PR rule quality signals (frequency + authority + consistency) | awesomereviewers.com | 🟡 Medium | Incorporate into PR mining script design |

---

## Atticus Gate Status

**Pending gate:** Handoff Packet pattern promotion  
**Status:** Atticus bridge returned 401 Unauthorized — target not reachable from this container (host-side networking issue). Blocker logged. Will retry when bridge connectivity is resolved.

**LC action needed:** Jake to verify Atticus gateway reachability from Scout's container, or provide alternative consult path.

---

## What to Research Next (Digest #3)

1. **Qodo/CodeRabbit "organizational learning"** — These tools claim to learn from PR history across repos and improve over time. How do they do it? What's the data model?
2. **12-factor agents** — HumanLayer published a "12 factor agents" framework. Relevant to workspace design.
3. **SuperClaude Framework** — Community agent framework with agent-as-context-instructions pattern. Worth reviewing for patterns.
4. **Agent memory architectures** — claude-mem and mem0 approaches: how do they handle long-running context across sessions?
