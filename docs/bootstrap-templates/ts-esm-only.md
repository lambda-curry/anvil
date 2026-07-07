# ESM only — no CommonJS `require()`

*Signal: typescript.esm · Tier: alwaysApply · Glob: —*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Mixing CommonJS `require()` with ESM `import` in an ESNext/Node16+ project produces runtime errors that are opaque and hard to trace. The error messages (`ERR_REQUIRE_ESM`, `__dirname is not defined`) are confusing and waste debugging time.

## The Rule

This project uses ESM. Use `import`/`export` syntax throughout. Do not use `require()`, `module.exports`, or `__dirname`/`__filename` (use `import.meta.url` instead).

## Examples

### ✅ DO

```typescript
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
```

### ❌ DON'T

```typescript
const { join } = require("path");
const __dirname = __dirname; // not defined in ESM
```

## Scope

Tier: alwaysApply | alwaysApply: true
