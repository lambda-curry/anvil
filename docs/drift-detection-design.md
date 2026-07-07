# Drift Detection — Design Document

*Written: 2026-02-20 · Author: Scout/Anvil · Status: Design only — not yet implemented*

---

## What is Rules Drift?

Rules drift occurs when AI rules files become misaligned with the reality they describe. A rule is drifted when:

1. **Path drift** — A file path referenced in a rule no longer exists
2. **Glob drift** — A glob pattern in a `.mdc` rule no longer matches any files in the project
3. **Command drift** — A command referenced in rules no longer works (script moved, CLI flag changed)
4. **Coverage gap** — A pattern regularly observed in the codebase has no rule covering it
5. **Date drift** — A rule's `Last validated` date exceeds its validation cadence threshold

---

## Why This Matters

From aihero.dev (Jan 2026):
> "For AI agents that read documentation on every request, stale information actively _poisons_ the context."

A drifted rule doesn't just fail to help — it actively misleads. A path drift causes the agent to look for files that don't exist. A stale command causes failed tool invocations. Coverage gaps mean failure modes that have no rule protection keep recurring.

---

## Detection Approaches by Drift Type

### Type 1: Path Drift

**Mechanism:** Scan rules files for file path patterns, check existence.

**Pattern to detect:**
```
src/auth/handlers.ts        # absolute/relative paths
GOALS.md                    # relative paths
.project/PROJECT.md         # relative paths with directories
```

**Algorithm:**
1. Parse rules file (AGENTS.md, TOOLS.md, SKILL.md, .mdc files)
2. Extract strings matching path patterns: `[a-z0-9_-]+/[a-z0-9_.-]+`
3. Resolve relative to project root
4. `fs.existsSync(resolved)` → flag misses as drift candidates
5. Manual review: some path references are intentional future paths ("create X at Y") — filter these

**Confidence:** High — binary check, no false negatives except intentional future-path references.

---

### Type 2: Glob Drift

**Mechanism:** Parse `.mdc` frontmatter globs; check if any project files match.

**Pattern to detect:**
```yaml
globs: apps/**/*.tsx, apps/**/*.ts
```

**Algorithm:**
1. Read all `.mdc` files in `.cursor/rules/`
2. Extract `globs:` frontmatter field
3. For each glob pattern: `glob.sync(pattern, { cwd: projectRoot })`
4. If `glob.sync()` returns empty array → glob matches nothing → drift candidate
5. Report: "Rule X has glob `apps/**/*.tsx` — no matching files found"

**Confidence:** High — empty glob match is unambiguous.

---

### Type 3: Command Drift

**Mechanism:** Extract CLI commands from rules; test that they're invocable.

**Pattern to detect:**
```
bun run scripts/slack-notify.ts
codex --yolo exec
bun run typecheck
gh pr view
```

**Algorithm:**
1. Extract code blocks from rules files
2. Identify lines starting with shell commands (`bun`, `codex`, `gh`, `node`, etc.)
3. Check: does the referenced script file exist? (`bun run scripts/X.ts` → check `scripts/X.ts`)
4. Check: is the CLI binary available? (`which codex`, `which gh`)
5. Do NOT execute commands — existence check only

**Confidence:** Medium — can check existence, not correctness (flags may have changed).

---

### Type 4: Coverage Gap Detection

**Mechanism:** Compare known failure modes against rule set.

This is the hardest type — it requires knowing what failure modes exist. Two approaches:

**Approach A: PR comment mining**
- Fetch recent PR review comments
- LLM-classify each as: constraint violation, missing convention, architecture issue
- Cross-reference against existing rules
- Comments that don't map to any existing rule = coverage gap candidate

**Approach B: Error pattern mining**
- Scan git log for commit messages containing "fix", "revert", "undo", "oops"
- LLM-classify: what rule would have prevented this commit?
- Cross-reference against rule set

**Confidence:** Low-medium — requires LLM classification + manual validation.

---

### Type 5: Date Drift

**Mechanism:** Parse `Last validated` dates; compare to validation cadence.

**Pattern to detect:**
```markdown
*Last validated: 2026-02-20*
```

**Algorithm:**
1. Scan rules files for `Last validated: YYYY-MM-DD` pattern
2. Compare to current date
3. Apply cadence rules:
   - alwaysApply rules: flag if >30 days
   - Glob rules: flag if >90 days
   - On-demand/SKILL.md: flag if >180 days
4. Also flag: rules files with NO validation date at all

**Confidence:** High — date arithmetic is deterministic.

---

## Implementation Plan

### Script: `scripts/drift-detect.ts`

```typescript
// Usage: bun run scripts/drift-detect.ts [project-path]
// Output: drift-report.md

interface DriftIssue {
  type: 'path' | 'glob' | 'command' | 'date' | 'coverage-gap';
  file: string;
  line?: number;
  detail: string;
  severity: 'high' | 'medium' | 'low';
}
```

**Phase 1 implementation (types 1, 2, 5):**
- Path drift: regex + `fs.existsSync`
- Glob drift: frontmatter parse + `glob.sync`
- Date drift: regex + date arithmetic

**Phase 2 implementation (types 3, 4):**
- Command drift: binary existence check
- Coverage gaps: LLM-powered (requires separate prompt + token budget)

### Output Format

```markdown
# Drift Detection Report — [project] — [date]

## Summary
- Path drift: 2 issues
- Glob drift: 0 issues  
- Date drift: 3 issues
- Command drift: 1 issue

## Issues

### 🔴 High — Path Drift
**File:** AGENTS.md line 34
**Reference:** `.project/blockers.md`
**Status:** File not found at `projects/example-app/.project/blockers.md`
**Action:** Verify path or remove reference

### 🟡 Medium — Date Drift  
**File:** docs/patterns/north-star.md
**Last validated:** 2025-11-15 (97 days ago)
**Cadence:** On-demand (180 days)
**Status:** Within cadence — but approaching threshold
```

---

## Integration with Anvil Audit Cycle

Drift detection should run as part of each Anvil audit cycle:

1. Agent reads AGENTS.md/TOOLS.md/SKILL.md files for the target project
2. Runs drift-detect.ts against the project
3. Appends drift findings to the audit report
4. High-severity findings become high-priority recommendations

---

## Open Questions

1. **Coverage gap detection depth** — PR comment mining requires GitHub access and token budget. Is this part of the automated cycle or manual/on-demand only?

2. **False positive handling** — Path drift detection will flag intentional "create this file" instructions. Need a `# drift-ignore` comment convention?

3. **Scope of path checking** — Should path drift check paths relative to the workspace root, or relative to the rules file? Both are valid in different contexts.

4. **Cross-project drift** — A network-wide pattern (e.g., a Slack script path) can drift in one project while staying current in another. Should drift detection have a "network-wide" mode?

## Known False Positive Categories (from first test run)

When running `scripts/drift-detect.ts` against the Anvil project itself on 2026-02-20, we identified these systematic false positive categories:

**1. Workspace-level script references in TOOLS.md**
- `scripts/bridge.ts`, `scripts/codex-usage.sh`, `scripts/slack-notify.ts`
- These are workspace-root scripts (`~/.openclaw/workspace/scripts/`) referenced in TOOLS.md (which is the injected workspace TOOLS.md, not a project file)
- Resolution: when running against a project sub-directory, also check workspace root for script paths
- Workaround until fixed: these are genuine missing scripts at the *project* level — the references in TOOLS.md point to workspace root, which is correct behavior

**2. Prose text path-like strings**
- `research/planning/testing` extracted from the sentence "switch to research/planning/testing work"
- Resolution: path regex could be made more conservative (require file extension, or exclude all-lowercase word sequences without extensions)

**3. Log/operational files that don't need validation dates**
- `data/progress-log.md`, `SCRATCHPAD.md`, `CHANGELOG.md` — these are operational files, not rules files
- Resolution: exclude operational files from date drift checks; only scan files whose content is loaded as agent instructions

**Next iteration improvements:**
- Add `--workspace-root` flag to also resolve paths relative to a parent workspace directory
- Add allowlist of operational file patterns to exclude from date drift: `SCRATCHPAD.md`, `*-log.md`, `CHANGELOG.md`
- Tighten path regex to require file extension (reduces prose extraction)

---

## Estimated Implementation Effort

| Phase | What | Effort |
|---|---|---|
| Phase 1a | Path drift + date drift | ~2 hours (Codex) |
| Phase 1b | Glob drift | ~1 hour (Codex) |
| Phase 2a | Command drift | ~1 hour (Codex) |
| Phase 2b | Coverage gaps (PR mining) | ~4-6 hours (research + Codex) |

**Recommendation:** Phase 1a is the highest-value, lowest-effort start. Path drift and date drift catch the most dangerous issues with straightforward implementation.
