---
title: Drift Detection
description: Detect stale paths, broken references, and outdated validation dates in your AI rules
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

# exclude generated or vendored directories from scanning
bunx @lambdacurry/anvil drift ./my-repo --skip-dirs node_modules,dist,generated

# write the report to a specific file
bunx @lambdacurry/anvil drift ./my-repo --output ./drift-report.md

# drift is also included in the full audit
bunx @lambdacurry/anvil audit --target ./my-repo
```

Use `--skip-dirs` to exclude directories that contain generated code, vendored copies, or template files — these often produce false-positive path and glob drift. Pass directory names (not paths), comma-separated.

## Current capabilities

**Implemented today:**

1. **Path existence** — referenced file paths are checked for existence
2. **Glob patterns** — glob references (e.g., `src/**/*.ts`) are resolved against the file tree; patterns matching zero files are reported as drift
3. **Validation dates** — rules with `Last validated` headers are checked against their cadence
4. **Broken symlinks** — symlinked rule files pointing at missing targets are flagged
5. **Command drift** — referenced commands are checked against package scripts and available binaries

**Planned:**

1. **Coverage analysis** — detecting codebase patterns with no matching rule

## Interpreting drift output

Each drift issue includes:

- **File and line** — where in the rule file the drifted reference lives
- **Type** — path, glob, date, broken-symlink, or command
- **Severity** — low, medium, or high based on impact
- **Suggestion** — what to fix or remove

## Fixing drift

- **Missing paths** — update the path reference or confirm the file was intentionally removed
- **Glob drift** — update the glob pattern to match existing files, or remove the stale reference
- **Date drift** — re-validate the rule and update the `Last validated` header
- **Broken symlinks** — restore the target or remove the link if it is no longer needed
- **Command drift** — update the referenced command, script, or binary so it is available to the target repo

Coverage analysis and its remediation guidance remain planned for a future phase.
