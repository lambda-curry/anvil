---
title: Drift Detection
description: Detect stale globs, broken paths, and uncovered patterns in your AI rules
---

## What is rules drift?

Rules drift occurs when AI rule files become misaligned with the codebase they describe. Types of drift:

- **Path drift** — a referenced file path no longer exists
- **Glob drift** — a glob pattern matches zero files
- **Command drift** — a referenced command no longer works
- **Coverage gap** — a codebase pattern has no rule covering it
- **Date drift** — a rule's validation date exceeds its cadence threshold

## Why it matters

Drifted rules don't just fail to help — they actively mislead. A path drift causes agents to look for files that don't exist. A stale command causes failed tool invocations.

## Running drift detection

```bash
# standalone drift check
bunx @lambdacurry/anvil drift ./my-repo

# drift is also included in the full audit
bunx @lambdacurry/anvil audit --target ./my-repo
```

## What Anvil checks

1. **Glob resolution** — every glob pattern in `.mdc` files is resolved against the actual file tree
2. **Path existence** — referenced file paths are checked for existence
3. **Validation dates** — rules with `Last validated` headers are checked against their cadence
4. **Coverage analysis** — codebase patterns are checked for matching rule coverage

## Interpreting drift output

Each drift issue includes:

- **File and line** — where in the rule file the drifted reference lives
- **Type** — path, glob, command, coverage, or date
- **Severity** — low, medium, or high based on impact
- **Suggestion** — what to fix or remove

## Fixing drift

- **Stale globs** — update the glob pattern or remove the rule section
- **Missing paths** — update the path reference or confirm the file was intentionally removed
- **Date drift** — re-validate the rule and update the `Last validated` header
- **Coverage gaps** — add a new rule or confirm the pattern is out of scope
