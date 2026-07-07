# Naming Conventions — Consistent, Readable Identifiers

*Signal: language:typescript · Tier: glob · Glob: **/*.ts, **/*.tsx*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Agents use inconsistent naming — mixing `camelCase` and `snake_case` in the same file, using abbreviated names that lose meaning (`res`, `usr`, `cfg`), or using generic placeholder names like `data`, `result`, `temp`, `item` that require surrounding context to understand. This degrades readability, increases cognitive load, and makes code harder for both humans and AI to reason about correctly.

## The Rule

Follow these naming conventions consistently across all TypeScript files:

- **Variables and functions:** `camelCase` — `userProfile`, `fetchOrder`, `handleSubmit`
- **Types, interfaces, and classes:** `PascalCase` — `UserProfile`, `OrderSummary`, `AuthService`
- **Module-level constants:** `SCREAMING_SNAKE_CASE` — `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT_MS`
- **Files:** `kebab-case.ts` for modules and utilities; `PascalCase.tsx` for React components
- **Booleans:** prefix with `is`, `has`, `can`, or `should` — `isLoading`, `hasError`, `canSubmit`, `shouldRetry`
- **Functions:** start with a verb that describes the action — `fetchUser`, `validateInput`, `handleClick`, `buildQuery`
- **Avoid generic names:** never use `data`, `result`, `temp`, `item`, `obj`, `val`, `res` as variable names — use the domain-specific term

## Examples

### ✅ DO

```typescript
// Variables and functions: camelCase, verb-first functions, domain names
const user = await fetchUser(userId);
const orderTotal = calculateTotal(lineItems);
const isAuthenticated = checkAuthStatus(session);

// Types and interfaces: PascalCase
interface UserProfile {
  id: string;
  displayName: string;
  emailAddress: string;
}

// Module-level constants: SCREAMING_SNAKE_CASE
const MAX_RETRY_COUNT = 3;
const DEFAULT_TIMEOUT_MS = 5000;

// Booleans: is/has/can/should prefix
const isLoading = true;
const hasValidationErrors = errors.length > 0;
const canSubmitForm = isValid && !isSubmitting;

// Files
// fetch-user.ts        — utility module
// UserProfile.tsx      — React component
// order-service.ts     — service module
```

### ❌ DON'T

```typescript
// snake_case in TypeScript code
const fetch_user_data = async (id) => { ... };
const user_profile = await fetch_user_data(userId);

// Abbreviated names — meaning is lost
const usr = await getUsr(id);
const cfg = loadCfg();
const res = await req.json();

// Generic placeholder names — what does "data" refer to?
let temp = calculateTotal(items);
const data = await fetchUser(id);
const result = validateForm(input);
// ^^ all require reading the RHS to understand what the variable holds

// Missing verb prefix — function name doesn't describe action
function userById(id: string) { ... }     // fetch? find? get? validate?
function loginCheck(session: Session) {}   // ambiguous direction
```

## Scope

Tier: glob-matched | Globs: `**/*.ts, **/*.tsx`

## See Also

- `docs/rubric.md` — rule sizing and format standards
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) — naming section
- [TypeScript Deep Dive — Naming Conventions](https://basarat.gitbook.io/typescript/styleguide)
