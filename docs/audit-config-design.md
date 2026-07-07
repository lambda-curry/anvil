# Audit Config Design (`.anvil/config.yml`)

Status: design-ready  
Issue: `SFD-2`  
Scope: guardrail scorer tuning, not a general policy engine

## Goal

Let repos tune Anvil's guardrail scoring without making config mandatory.

The config should solve three real problems:

1. a repo can start from a sensible profile instead of hand-tuning 7 dimensions
2. truly non-applicable dimensions can be dismissed with an explicit reason
3. CI can enforce hard minimums on dimensions that must not regress

## Non-goals

- no per-file rules
- no conditional logic engine
- no arbitrary expressions
- no config required for normal Anvil runs
- no profile inheritance beyond the built-in base profile merge

## File location

```text
.anvil/config.yml
```

If the file is missing, Anvil uses the default profile and current built-in scoring behavior.

## Schema shape

```yaml
version: 1
profile: internal-tool

hardGates:
  enabled: true
  exitCode: 2
  dimensions:
    ciDiscipline:
      minScore: 3
    typeSafety:
      minScore: 4
    driftResilience:
      minScore: 3

# Optional per-dimension tuning.
dimensions:
  security:
    applicability: not-applicable
    reason: "This repo ships no deployable service, secrets, or external runtime surface."
  reviewOwnership:
    weight: 0.5
  testDepth:
    minScoreHint: 3
```

## Top-level fields

### `version`

Required integer. Starts at `1`.

### `profile`

Optional string.

Allowed values:

- `library`
- `internal-tool`
- `production-app`
- `prototype`

Default when omitted: `internal-tool`

Reason: this is the least surprising default for the current Anvil target set and matches the common case better than a production-only baseline.

### `hardGates`

Optional object.

```yaml
hardGates:
  enabled: true
  exitCode: 2
  dimensions:
    ciDiscipline:
      minScore: 3
```

Rules:

- `enabled` defaults to `true` when `hardGates` is present
- `exitCode` defaults to `2`
- `dimensions` maps dimension key -> gate config
- `minScore` must be an integer from `0` to `5`
- a dimension marked `not-applicable` cannot also be hard-gated

Behavior:

- Anvil still completes the audit and prints the full report
- if one or more hard gates fail, the command exits non-zero with `exitCode`
- the report includes a dedicated `Hard Gates` section listing pass/fail results

### `dimensions`

Optional object keyed by dimension name.

Allowed keys:

- `ciDiscipline`
- `typeSafety`
- `testDepth`
- `codeQuality`
- `reviewOwnership`
- `security`
- `driftResilience`

Each dimension can override this shape:

```yaml
dimensions:
  security:
    applicability: not-applicable
    reason: "No secrets or external runtime surface in this repo."
    weight: 0.5
    minScoreHint: 2
```

Rules:

- `applicability`: `applicable` | `not-applicable`
- `reason` is required when `applicability: not-applicable`
- `weight` must be a number between `0` and `2`
- `minScoreHint` must be an integer `0` to `5`
- `minScoreHint` changes recommendation severity and profile expectations, not process exit behavior
- hard CI failure belongs in `hardGates`, not `minScoreHint`

## Built-in profiles

Profiles are presets, not separate schemas.

They only tune weights, default applicability, and default hard-gate posture.

### 1. `library`

Best for reusable packages and SDKs.

```yaml
profile: library
```

Defaults:

| Dimension | Weight | Applicability | Hard gate default |
|-----------|--------|---------------|-------------------|
| `ciDiscipline` | 1.0 | applicable | `minScore: 3` |
| `typeSafety` | 1.5 | applicable | `minScore: 4` |
| `testDepth` | 1.25 | applicable | `minScore: 3` |
| `codeQuality` | 1.25 | applicable | none |
| `reviewOwnership` | 1.0 | applicable | none |
| `security` | 0.75 | applicable | none |
| `driftResilience` | 1.0 | applicable | `minScore: 3` |

Why: libraries need strong type and regression discipline because downstream users absorb breakage immediately.

### 2. `internal-tool`

Best for agent workspaces, internal automation, and operator-facing tools.

```yaml
profile: internal-tool
```

Defaults:

| Dimension | Weight | Applicability | Hard gate default |
|-----------|--------|---------------|-------------------|
| `ciDiscipline` | 1.0 | applicable | `minScore: 3` |
| `typeSafety` | 1.25 | applicable | `minScore: 3` |
| `testDepth` | 1.0 | applicable | none |
| `codeQuality` | 1.0 | applicable | none |
| `reviewOwnership` | 0.75 | applicable | none |
| `security` | 0.75 | applicable | none |
| `driftResilience` | 1.25 | applicable | `minScore: 3` |

Why: internal tools still need guardrails, but drift and maintainability usually matter more than customer-facing production controls.

### 3. `production-app`

Best for deployed apps, services, or products with user-facing runtime risk.

```yaml
profile: production-app
```

Defaults:

| Dimension | Weight | Applicability | Hard gate default |
|-----------|--------|---------------|-------------------|
| `ciDiscipline` | 1.25 | applicable | `minScore: 4` |
| `typeSafety` | 1.25 | applicable | `minScore: 4` |
| `testDepth` | 1.25 | applicable | `minScore: 4` |
| `codeQuality` | 1.0 | applicable | `minScore: 3` |
| `reviewOwnership` | 1.25 | applicable | `minScore: 3` |
| `security` | 1.5 | applicable | `minScore: 3` |
| `driftResilience` | 1.0 | applicable | `minScore: 3` |

Why: production systems need stronger review, security, and CI floors because failures escape the repo.

### 4. `prototype`

Best for spikes, short-lived exploration, or repos intentionally trading rigor for speed.

```yaml
profile: prototype
```

Defaults:

| Dimension | Weight | Applicability | Hard gate default |
|-----------|--------|---------------|-------------------|
| `ciDiscipline` | 0.75 | applicable | none |
| `typeSafety` | 0.75 | applicable | none |
| `testDepth` | 0.5 | applicable | none |
| `codeQuality` | 0.75 | applicable | none |
| `reviewOwnership` | 0.5 | applicable | none |
| `security` | 1.0 | applicable | none |
| `driftResilience` | 0.75 | applicable | none |

Why: prototypes should not pretend to be hardened, but security still cannot disappear completely.

## Base defaults

Before any profile loads, Anvil starts from this base object:

```yaml
version: 1
profile: internal-tool
hardGates:
  enabled: false
  exitCode: 2
  dimensions: {}
dimensions:
  ciDiscipline: { applicability: applicable, weight: 1.0 }
  typeSafety: { applicability: applicable, weight: 1.0 }
  testDepth: { applicability: applicable, weight: 1.0 }
  codeQuality: { applicability: applicable, weight: 1.0 }
  reviewOwnership: { applicability: applicable, weight: 1.0 }
  security: { applicability: applicable, weight: 1.0 }
  driftResilience: { applicability: applicable, weight: 1.0 }
```

This keeps merge behavior deterministic even when the file is partial.

## Merge order

Deterministic merge order is:

1. built-in base defaults
2. selected built-in profile preset
3. repo-local `dimensions` overrides
4. repo-local `hardGates` overrides

Later layers always win.

### Merge rules

#### Scalars

Replace on write.

Examples:
- `profile`
- `hardGates.enabled`
- `hardGates.exitCode`
- `dimensions.security.weight`

#### Objects

Deep merge by key.

Examples:
- `dimensions`
- `hardGates.dimensions`

#### Invalid combinations

Fail config validation before running the audit when:

- an unknown dimension key is used
- `not-applicable` is set without a `reason`
- `minScore` or `minScoreHint` is outside `0..5`
- `weight` is outside `0..2`
- a hard gate references a `not-applicable` dimension

Config validation should exit before scoring with a clear error message pointing to the field path.

## Scoring behavior

### Applicability

If a dimension is `not-applicable`:

- it is removed from the weighted denominator
- it is displayed in the report as `not applicable`
- its `reason` is printed in the audit output
- it does not count as missing or failing

This is the anti-noise lever, but the mandatory reason prevents silent score gaming.

### Weighting

Weighted score formula:

```text
weighted score = sum(dimensionScore * weight) / sum(applicable weights)
```

Current output can still render the raw 0 to 35 breakdown for continuity, but the config-aware profile score should use weighted applicable dimensions.

### Hard gates

Hard gates are independent of weighting.

A low-weight dimension can still be mandatory.

Example:

```yaml
dimensions:
  security:
    weight: 0.5
hardGates:
  dimensions:
    security:
      minScore: 3
```

Interpretation: security contributes less to the blended score, but must still clear a minimum bar.

## Example configs

### Internal tool with one legitimate dismissal

```yaml
version: 1
profile: internal-tool

dimensions:
  security:
    applicability: not-applicable
    reason: "Local operator workspace only, with no deployed service or runtime secrets path."

hardGates:
  enabled: true
  dimensions:
    ciDiscipline:
      minScore: 3
    driftResilience:
      minScore: 3
```

### Production app with stronger release floors

```yaml
version: 1
profile: production-app

hardGates:
  enabled: true
  dimensions:
    ciDiscipline:
      minScore: 4
    typeSafety:
      minScore: 4
    testDepth:
      minScore: 4
    security:
      minScore: 4
    reviewOwnership:
      minScore: 4
```

### Prototype that still keeps security visible

```yaml
version: 1
profile: prototype

dimensions:
  testDepth:
    weight: 0.25
  reviewOwnership:
    weight: 0.25
hardGates:
  enabled: false
```

## CLI and report implications

Implementation follow-up should add:

- config discovery at `.anvil/config.yml`
- schema validation with field-path errors
- audit summary note showing active profile
- guardrail table annotations for `not applicable`
- a `Hard Gates` report block with pass/fail status
- non-zero exit on hard-gate failure after report generation

## Recommended implementation sequence

1. parse + validate `.anvil/config.yml`
2. add merge layer and config-aware in-memory score model
3. render applicability reasons and active profile in the report
4. add hard-gate evaluation and exit behavior
5. add fixtures for all four built-in profiles plus invalid-config cases

## Follow-up issue shape

Implementation should be a separate task from this design doc.

Suggested split:

- parser + schema validation
- scorer merge integration
- report rendering + exit semantics
- docs/getting-started examples once the feature ships
