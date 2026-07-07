# Use Drizzle's type-safe query builder — avoid raw SQL

*Signal: orm:drizzle · Tier: glob · Glob: **/*.ts,**/*.tsx*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Raw SQL strings bypass Drizzle's type inference. Column renames, table changes, or typos aren't caught until runtime. The entire point of Drizzle is compile-time safety on database queries.

## The Rule

Use Drizzle's query builder API (`db.select().from().where()`) for all queries. Raw SQL (`sql`...`` template literal) is only acceptable for complex aggregations or DB-specific functions that the builder can't express — document why.

## Examples

### ✅ DO

- Use `db.select().from(users).where(eq(users.id, userId))` for routine queries.
- Keep joins, filters, and inserts in Drizzle's typed API when the builder can express them.

### ❌ DON'T

- Reach for raw SQL first when the query builder already supports the query.
- Hide ordinary CRUD logic inside handwritten SQL strings without documenting why Drizzle was insufficient.

## Scope

Tier: glob | Glob: **/*.ts,**/*.tsx
