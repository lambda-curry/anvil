# Use Tailwind utilities — no inline styles or raw CSS for layout

*Signal: styling:tailwind · Tier: glob · Glob: **/*.tsx,**/*.jsx*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Inline styles and CSS-in-JS bypass Tailwind's design system. They create one-off values that don't respond to the theme, can't be overridden by Tailwind's responsive/state variants, and accumulate into inconsistent UI. Over time, they become unmaintainable.

## The Rule

Use Tailwind utility classes for all styling. If a utility doesn't exist for your use case, extend the Tailwind theme (`tailwind.config.ts`) — don't add a one-off inline style or custom CSS.

Inline styles (`style={{ ... }}`) are only acceptable for dynamic values that cannot be expressed as Tailwind classes (e.g., truly dynamic pixel values computed at runtime).

## Examples

### ✅ DO

```typescript
// extend the theme
// tailwind.config.ts
theme: { extend: { spacing: { '18': '4.5rem' } } }
// then in component:
<div className="mt-18">
```

### ❌ DON'T

```typescript
// one-off inline style
<div style={{ marginTop: '72px' }}>
```

## Scope

Tier: glob | Glob: **/*.tsx,**/*.jsx
