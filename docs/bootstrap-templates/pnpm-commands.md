# Use pnpm — not npm or yarn

*Signal: packageManager:pnpm · Tier: alwaysApply · Glob: —*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Running npm or yarn commands in a pnpm project modifies the wrong lockfile and breaks the workspace structure. pnpm's symlinked node_modules will silently diverge from what npm/yarn would install.

## The Rule

This project uses pnpm. Always use pnpm commands:

- Install: `pnpm install`
- Add: `pnpm add <package>`
- Remove: `pnpm remove <package>`
- Run: `pnpm run <script>` or `pnpm <script>`

Never use npm or yarn.

## Examples

### ✅ DO

- `pnpm install`
- `pnpm add zod`
- `pnpm test`
- `pnpm lint`

### ❌ DON'T

- `npm install`
- `yarn add zod`
- `npm run test`

## Scope

Tier: alwaysApply | alwaysApply: true
