# No `any` — use `unknown` and narrow explicitly

*Signal: typescript.strict · Tier: alwaysApply · Glob: —*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

`any` is contagious. Once introduced, it disables type checking for every value it touches and spreads through calling code. Type errors that would have been caught at compile time surface as runtime crashes — often in production.

## The Rule

Do not use `any`. If a type is genuinely unknown at authorship time, use `unknown` and narrow it with a type guard or assertion before use.

Unsafe casts (`as SomeType` without narrowing) are also forbidden — they are `any` with extra steps.

## Examples

### ✅ DO

```typescript
// unknown + narrowing
function parseResponse(raw: unknown): User {
  if (!isUser(raw)) throw new Error("Invalid user shape");
  return raw;
}
```

### ❌ DON'T

```typescript
// any bypasses all checking
function parseResponse(raw: any): User {
  return raw; // crashes at runtime if shape is wrong
}
```

## Scope

Tier: alwaysApply | alwaysApply: true

## See Also

- tsconfig.json strict: true
