# `.anvil/config.yml` Examples

Use these as copy-paste starting points when you want guardrail scoring to match the kind of repo you are auditing.

For the full public schema and merge rules, see the [Configuration guide](https://lambda-curry.github.io/anvil/guides/configuration).

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

## Dismiss one dimension explicitly

Only use `not-applicable` when the repo truly does not have that surface.

```yaml
version: 1
profile: internal-tool
dimensions:
  security:
    applicability: not-applicable
    reason: "Local operator workspace only, with no deployed service or runtime secrets path."
```
