# Server vs. client component boundary (App Router)

*Signal: framework:nextjs:app · Tier: glob · Glob: **/*.tsx,**/*.ts*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Server components that accidentally use browser APIs (`window`, `localStorage`, `document`, React hooks) cause a runtime crash in production with a cryptic error. The boundary is invisible in the code — it must be enforced by convention.

## The Rule

**Server components** (default in App Router): no browser APIs, no `useState`, no `useEffect`, no event handlers. They run on the server — no DOM exists.

**Client components**: add `'use client'` as the first line of the file. Keep client components as leaf nodes — push interactivity down, keep data fetching up.

When in doubt: if it needs state or events, it's a client component. Add `'use client'` and move the file to a `_client/` subfolder or suffix it `.client.tsx`.

## Examples

### ✅ DO

```typescript
// client component clearly marked
'use client';
import { useState } from 'react';
export function Counter() { /* ... */ }
```

### ❌ DON'T

```typescript
// server component using browser API
export default async function Page() {
  const stored = localStorage.getItem('key'); // crashes: no DOM on server
}
```

## Scope

Tier: glob | Glob: **/*.tsx,**/*.ts

## See Also

- Next.js App Router docs
