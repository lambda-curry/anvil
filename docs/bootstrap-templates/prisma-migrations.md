# Schema changes require a migration — never edit the database directly

*Signal: orm:prisma · Tier: glob · Glob: prisma/***
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Editing the Prisma schema without running `prisma migrate dev` leaves the database out of sync with the schema. The app works locally (if you manually altered the DB) but fails in CI and production where the migration hasn't been applied. This is one of the most common causes of "works on my machine" database bugs.

## The Rule

All schema changes go through the migration workflow:

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <description>` (or the project's equivalent npm script)
3. Commit both the schema change AND the generated migration file together

Never use `prisma db push` for production or CI environments — it bypasses the migration history. Reserve `db push` for local prototyping only, and always follow up with a proper migration before committing.

## Examples

### ✅ DO

```bash
# proper migration workflow
npx prisma migrate dev --name add_user_roles
```

### ❌ DON'T

```bash
# skips migration history
npx prisma db push  # in production/CI
```

## Scope

Tier: glob | Glob: prisma/**

## See Also

- prisma/schema.prisma
