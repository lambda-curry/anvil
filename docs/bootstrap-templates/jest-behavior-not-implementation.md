# Test observable behavior — not internal implementation (Jest)

*Signal: testing:jest · Tier: glob · Glob: **/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Tests that assert on mocks, internal function calls, or private state break on every refactor even when behavior is correct. They slow refactoring without catching real bugs.

## The Rule

Test what the function/component does from the outside — its outputs and side effects — not how it does it internally. Prefer few, high-value assertions over many fine-grained mock verifications.

## Examples

### ✅ DO

- Assert on rendered output, returned values, thrown errors, or observable side effects.
- Mock only the boundary you need to control, then verify behavior from the caller's perspective.

### ❌ DON'T

- Assert that private helper functions were called.
- Treat internal call counts or implementation steps as the thing under test when behavior is what matters.

## Scope

Tier: glob | Glob: **/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx
