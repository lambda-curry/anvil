# Bootstrap Draft — sample-cli-repo
*Generated: <DATE> · Project: <WORKSPACE>/scripts/__fixtures__/sample-cli-repo · Status: **DRAFT — requires human review before adoption***

> ⚠️ **This file is advisory only.** Do not paste these rules directly into AGENTS.md without reviewing each one.
> Each rule is grounded in a detected stack signal — but only you know which failure modes are actually relevant to your project.

---

## Detected Stack

- Runtime: Bun
- Package manager: bun
- Validation: zod
- Testing: vitest
- TypeScript: present (strict, ESM)
- Config files detected: biome.json, vitest.config.ts

---

## Suggested AGENTS.md Additions (5 rules)

Copy the rules you want to adopt into the appropriate section of `AGENTS.md`. Validate each one against your project's actual behavior before committing.

### Rule: Use bun — not npm or yarn
*Signal: `packageManager:bun` · Tier: alwaysApply*

**Why (failure mode):**
Running `npm install` or `yarn add` in a bun project creates or modifies the wrong lockfile (`package-lock.json` or `yarn.lock` instead of `bun.lockb`). This silently breaks reproducibility — the next `bun install` may resolve different package versions.

**The rule:**
This project uses bun. Always use bun commands for package management and script execution:

- Install: `bun install`
- Add package: `bun add <package>`
- Remove: `bun remove <package>`
- Run script: `bun run <script>`

Never use `npm`, `npx` (prefer `bunx`), or `yarn` in this project.

---

### Rule: ESM only — no CommonJS `require()`
*Signal: `typescript.esm` · Tier: alwaysApply*

**Why (failure mode):**
Mixing CommonJS `require()` with ESM `import` in an ESNext/Node16+ project produces runtime errors that are opaque and hard to trace. The error messages (`ERR_REQUIRE_ESM`, `__dirname is not defined`) are confusing and waste debugging time.

**The rule:**
This project uses ESM. Use `import`/`export` syntax throughout. Do not use `require()`, `module.exports`, or `__dirname`/`__filename` (use `import.meta.url` instead).

```
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
```
```
const { join } = require("path");
const __dirname = __dirname; // not defined in ESM
```

---

### Rule: No `any` — use `unknown` and narrow explicitly
*Signal: `typescript.strict` · Tier: alwaysApply*

**Why (failure mode):**
`any` is contagious. Once introduced, it disables type checking for every value it touches and spreads through calling code. Type errors that would have been caught at compile time surface as runtime crashes — often in production.

**The rule:**
Do not use `any`. If a type is genuinely unknown at authorship time, use `unknown` and narrow it with a type guard or assertion before use.

Unsafe casts (`as SomeType` without narrowing) are also forbidden — they are `any` with extra steps.

```
// unknown + narrowing
function parseResponse(raw: unknown): User {
  if (!isUser(raw)) throw new Error("Invalid user shape");
  return raw;
}
```
```
// any bypasses all checking
function parseResponse(raw: any): User {
  return raw; // crashes at runtime if shape is wrong
}
```

*See also: tsconfig.json strict: true*

---

### Rule: Test observable behavior — not internal implementation (Vitest)
*Signal: `testing:vitest` · Tier: glob*

**Why (failure mode):**
Tests that assert on mocks, internal function calls, or private state break on every refactor even when behavior is correct. They slow refactoring without catching real bugs — the opposite of what tests are for.

**The rule:**
Test what the function/component does from the outside — its outputs and side effects — not how it does it internally. Prefer few, high-value assertions over many fine-grained mock verifications.

When you find yourself asserting `expect(mockFn).toHaveBeenCalledWith(...)` more than asserting on outputs, reconsider the test design.

```
// assert on the output
const result = formatCurrency(1234.5, 'USD');
expect(result).toBe('$1,234.50');
```
```
// assert on internal calls
expect(mockIntlNumberFormat).toHaveBeenCalledWith('en-US', { style: 'currency', currency: 'USD' });
```

---

### Rule: Validate all external inputs with Zod before use
*Signal: `validation:zod` · Tier: glob*

**Why (failure mode):**
Unvalidated API inputs that reach business logic or the database cause runtime crashes, data corruption, and security vulnerabilities. The shape of request bodies and query params is never guaranteed — even from trusted sources. Assuming shape without checking is an optimistic bug waiting to happen.

**The rule:**
Every API route, form handler, and external data source must validate input with a Zod schema before the data is used. Colocate the schema with the handler.

`schema.parse()` throws on failure — use `schema.safeParse()` and handle errors explicitly at API boundaries.

```
// validate at the boundary
const schema = z.object({ email: z.string().email(), name: z.string().min(1) });
const result = schema.safeParse(req.body);
if (!result.success) return res.status(400).json({ error: result.error.flatten() });
const { email, name } = result.data; // fully typed
```
```
// assume body shape
const { email, name } = req.body; // any type, no validation
await db.users.create({ email, name }); // corrupts DB on bad input
```

---

## Suggested TOOLS.md Additions

### Verification Commands
*Add these to the verification section of TOOLS.md:*

```bash
bun run build    # bun build src/cli.ts --outfile dist/cli.js
bun run typecheck    # tsc --noEmit
bun run test    # bun test
bun run lint    # biome check .
```

---

## Rules Not Generated (Require Human Judgment)

The bootstrap generator intentionally does not generate rules for:
- Project-specific business logic or domain conventions
- Team workflow preferences (branching, PR size, review process)
- Performance budgets (no baseline data available)
- Security posture specific to your deployment environment
- Any pattern not yet observed as a real failure mode in this project

*Anvil rubric: write rules from observed failures, not anticipated ones. One occurrence → note it. Three occurrences → candidate. Cross-project → pattern.*