# Validate all external inputs with Zod before use

*Signal: validation:zod · Tier: glob · Glob: **/*.ts,**/*.tsx*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Unvalidated API inputs that reach business logic or the database cause runtime crashes, data corruption, and security vulnerabilities. The shape of request bodies and query params is never guaranteed — even from trusted sources. Assuming shape without checking is an optimistic bug waiting to happen.

## The Rule

Every API route, form handler, and external data source must validate input with a Zod schema before the data is used. Colocate the schema with the handler.

`schema.parse()` throws on failure — use `schema.safeParse()` and handle errors explicitly at API boundaries.

## Examples

### ✅ DO

```typescript
// validate at the boundary
const schema = z.object({ email: z.string().email(), name: z.string().min(1) });
const result = schema.safeParse(req.body);
if (!result.success) return res.status(400).json({ error: result.error.flatten() });
const { email, name } = result.data; // fully typed
```

### ❌ DON'T

```typescript
// assume body shape
const { email, name } = req.body; // any type, no validation
await db.users.create({ email, name }); // corrupts DB on bad input
```

## Scope

Tier: glob | Glob: **/*.ts,**/*.tsx
