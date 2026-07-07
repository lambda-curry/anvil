# useEffect dependencies must be explicit and correct

*Signal: ui:react · Tier: glob · Glob: **/*.tsx,**/*.jsx*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Stale closures in useEffect are a primary source of subtle bugs: effects read outdated state, event handlers fire on unmounted components, and infinite re-render loops are triggered by missing or incorrect deps arrays. ESLint's `exhaustive-deps` rule catches many of these but not all.

## The Rule

Always provide a complete, accurate dependency array for `useEffect`, `useMemo`, and `useCallback`. Never suppress the exhaustive-deps ESLint warning with a comment — fix the underlying issue instead.

If the deps array feels wrong (too many deps, unstable references), the abstraction is wrong. Extract the logic into a custom hook or useMemo.

No effects with missing deps arrays (bare `useEffect(() => { ... })` that should only run once — use `[]` explicitly and comment why).

## Examples

### ✅ DO

```typescript
// explicit empty array + comment
useEffect(() => {
  fetchData(); // intentionally runs once on mount
}, []); // deps: empty — runs once
```

### ❌ DON'T

```typescript
// missing deps causes stale closure
useEffect(() => {
  setResult(computeWith(value)); // value is stale
}); // missing deps array → runs every render
```

## Scope

Tier: glob | Glob: **/*.tsx,**/*.jsx
