---
title: Configuration
description: Configure Anvil audit profiles and hard gates via .anvil/config.yml
---

Use `.anvil/config.yml` to make guardrail scoring match the kind of repo you are auditing. Place it in the target repo root.

## Internal tool

Good default for operator workspaces, internal automation, and agent-facing repos.

```yaml
version: 1
profile: internal-tool
hardGates:
  dimensions:
    ciDiscipline:
      minScore: 3
    driftResilience:
      minScore: 3
```

## Library

Stricter on types and regression discipline for reusable packages.

```yaml
version: 1
profile: library
hardGates:
  dimensions:
    typeSafety:
      minScore: 4
    testDepth:
      minScore: 3
    driftResilience:
      minScore: 3
```

## Production app

Use when runtime, release, and security failures can escape the repo.

```yaml
version: 1
profile: production-app
hardGates:
  dimensions:
    ciDiscipline:
      minScore: 4
    typeSafety:
      minScore: 4
    testDepth:
      minScore: 4
    security:
      minScore: 3
```

## Prototype

Lighter weighting, but still keeps the repo honest about drift and security.

```yaml
version: 1
profile: prototype
hardGates:
  enabled: false
```

## Dismiss one dimension

Only use `not-applicable` when the repo truly does not have that surface:

```yaml
version: 1
profile: internal-tool
dimensions:
  security:
    applicability: not-applicable
    reason: "Local operator workspace only, no deployed service or runtime secrets path."
```

## Schema quick reference

```yaml
version: 1
profile: internal-tool

hardGates:
  enabled: true
  exitCode: 2
  dimensions:
    ciDiscipline:
      minScore: 3

dimensions:
  security:
    applicability: not-applicable
    reason: "No deployable runtime or secrets surface."
  testDepth:
    minScoreHint: 3
```

### Top-level fields

- `version` — required integer, currently `1`
- `profile` — optional preset: `internal-tool`, `library`, `production-app`, or `prototype`
- `hardGates` — optional enforced minimums that can fail CI without hiding the rest of the report
- `dimensions` — optional per-dimension overrides for applicability, weight, and recommendation floor

### Merge rules

- Missing config file: Anvil uses the built-in defaults
- Missing `profile`: defaults to `internal-tool`
- `hardGates.enabled` defaults to `true` when `hardGates` is present
- `hardGates.exitCode` defaults to `2`
- `reason` is required when `applicability: not-applicable`
- a `not-applicable` dimension cannot also be hard-gated
- `minScore` and `minScoreHint` are integer scores from `0` to `5`

### What each preset emphasizes

- `internal-tool` — drift resilience and practical guardrails for agent/operator repos
- `library` — stronger type safety and regression discipline for reusable packages
- `production-app` — higher CI, testing, and security floors for deployed systems
- `prototype` — lightest posture, good for short-lived spikes
