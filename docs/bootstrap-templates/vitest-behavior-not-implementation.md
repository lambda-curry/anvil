# Test observable behavior — not internal implementation (Vitest)

*Signal: testing:vitest · Tier: glob · Glob: **/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Tests that assert on mocks, internal function calls, or private state break on every refactor even when behavior is correct. They slow refactoring without catching real bugs — the opposite of what tests are for.

## The Rule

Test what the function/component does from the outside — its outputs and side effects — not how it does it internally. Prefer few, high-value assertions over many fine-grained mock verifications.

When you find yourself asserting `expect(mockFn).toHaveBeenCalledWith(...)` more than asserting on outputs, reconsider the test design.

## Examples

### ✅ DO

```typescript
// assert on the output
const result = formatCurrency(1234.5, 'USD');
expect(result).toBe('$1,234.50');
```

### ❌ DON'T

```typescript
// assert on internal calls
expect(mockIntlNumberFormat).toHaveBeenCalledWith('en-US', { style: 'currency', currency: 'USD' });
```

## Scope

Tier: glob | Glob: **/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx
