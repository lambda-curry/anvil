# Use bun — not npm or yarn

*Signal: packageManager:bun · Tier: alwaysApply · Glob: —*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Running `npm install` or `yarn add` in a bun project creates or modifies the wrong lockfile (`package-lock.json` or `yarn.lock` instead of `bun.lockb`). This silently breaks reproducibility — the next `bun install` may resolve different package versions.

## The Rule

This project uses bun. Always use bun commands for package management and script execution:

- Install: `bun install`
- Add package: `bun add <package>`
- Remove: `bun remove <package>`
- Run script: `bun run <script>`

Never use `npm`, `npx` (prefer `bunx`), or `yarn` in this project.

## Examples

### ✅ DO

- `bun install`
- `bun add zod`
- `bun run test`
- `bunx tsc --noEmit`

### ❌ DON'T

- `npm install`
- `yarn add zod`
- `npx tsc --noEmit`

## Scope

Tier: alwaysApply | alwaysApply: true
