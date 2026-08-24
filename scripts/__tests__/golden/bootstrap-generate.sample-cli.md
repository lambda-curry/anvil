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

## Suggested AGENTS.md Additions (11 rules)

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

### Rule: Handle Errors Explicitly — No Silent Failures
*Signal: `language:typescript` · Tier: glob*

**Why (failure mode):**
Agents swallow errors, use empty catch blocks, or log-and-continue without proper error propagation. The result is silent failures in production that are impossible to debug — the code appears to work but quietly discards error state, leaving users with broken behavior and developers with no signal.

**The rule:**
Use typed error handling. Catch specific error types. Either handle the error with recovery logic or re-throw it. Never use empty catch blocks.

- Catch blocks must do one of: (a) recover with explicit logic, or (b) re-throw the error
- Use `instanceof` guards to distinguish error types before handling
- Prefer discriminated union Result types (`{ ok: true, data } | { ok: false, error }`) for functions that can fail predictably
- Never use `catch (e) {}` — empty catch blocks are always wrong
- Never use `catch (e) { console.log(e) }` as a substitute for handling — log-and-swallow is a silent failure
- If an error is truly ignorable, document why with an explicit comment

```
// Typed recovery with re-throw for unexpected errors
try {
  await doThing();
} catch (e) {
  if (e instanceof NetworkError) {
    await retry();
  } else {
    throw e; // propagate unexpected errors
  }
}

// Result type pattern for predictable failures
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function fetchUser(id: string): Promise<Result<User>> {
  try {
    const user = await db.users.findById(id);
    return { ok: true, data: user };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// Caller checks result explicitly
const result = await fetchUser(userId);
if (!result.ok) {
  showError(result.error);
  return;
}
processUser(result.data);
```
```
// Silent failure — swallowed error, broken state, no signal
try {
  await doThing();
} catch (e) {}

// Log-and-swallow — looks like handling but isn't; execution continues
try {
  await saveRecord(data);
} catch (e) {
  console.log(e); // logged but not propagated — caller thinks it succeeded
}

// Untyped catch with no discrimination — can't handle correctly
try {
  await fetchUser(id);
} catch (e) {
  handleError(e); // what kind of error? network? auth? not-found? unknown
}
```

*See also: `docs/rubric.md` — rule sizing and format standards, TypeScript Handbook: [Error Handling](https://www.typescriptlang.org/docs/handbook/), neverthrow library — ergonomic Result types for TypeScript*

---

### Rule: Naming Conventions — Consistent, Readable Identifiers
*Signal: `language:typescript` · Tier: glob*

**Why (failure mode):**
Agents use inconsistent naming — mixing `camelCase` and `snake_case` in the same file, using abbreviated names that lose meaning (`res`, `usr`, `cfg`), or using generic placeholder names like `data`, `result`, `temp`, `item` that require surrounding context to understand. This degrades readability, increases cognitive load, and makes code harder for both humans and AI to reason about correctly.

**The rule:**
Follow these naming conventions consistently across all TypeScript files:

- **Variables and functions:** `camelCase` — `userProfile`, `fetchOrder`, `handleSubmit`
- **Types, interfaces, and classes:** `PascalCase` — `UserProfile`, `OrderSummary`, `AuthService`
- **Module-level constants:** `SCREAMING_SNAKE_CASE` — `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT_MS`
- **Files:** `kebab-case.ts` for modules and utilities; `PascalCase.tsx` for React components
- **Booleans:** prefix with `is`, `has`, `can`, or `should` — `isLoading`, `hasError`, `canSubmit`, `shouldRetry`
- **Functions:** start with a verb that describes the action — `fetchUser`, `validateInput`, `handleClick`, `buildQuery`
- **Avoid generic names:** never use `data`, `result`, `temp`, `item`, `obj`, `val`, `res` as variable names — use the domain-specific term

```
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
```
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

*See also: `docs/rubric.md` — rule sizing and format standards, [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) — naming section, [TypeScript Deep Dive — Naming Conventions](https://basarat.gitbook.io/typescript/styleguide)*

---

### Rule: Performance work must start with measurement
*Signal: `general` · Tier: on-demand*

**Why (failure mode):**
AI coding agents often "optimize" from vibes: they add caches, memoization, batching, or query rewrites before anyone has measured the real bottleneck. That creates a second system to maintain without proving the original problem. The common failure mode is permanent complexity added for no user-visible gain, followed by a slower debugging loop when the real bottleneck shows up elsewhere.

The opposite failure also happens: agents notice an obviously hot path, but they change it without capturing a before/after signal, so the team cannot tell whether the change helped or regressed the system.

**The rule:**
Treat performance work as evidence-backed maintenance, not speculative cleanup.

- Measure before optimizing — capture one concrete baseline first (latency, query count, bundle size, memory, CPU time, or build time)
- Optimize the dominant bottleneck, not every suspicious line
- Keep the first change reversible — prefer the smallest change that can prove or disprove the hypothesis
- Re-measure after the change with the same signal and record the delta
- Remove or avoid "just in case" caches, memoization, or concurrency if no measurement shows they help

```
Performance investigation:
- Baseline: checkout endpoint p95 = 840 ms over the last 200 requests
- Suspected bottleneck: duplicate product queries inside cart enrichment
- Change: collapse N+1 fetches into one batched query
- Recheck: checkout endpoint p95 = 430 ms with identical payload size
```
```
// Added from instinct, not evidence
const expensiveValue = useMemo(() => computeDashboard(data), [data]);

// No baseline, no measured hotspot, no proof this helps
```

*See also: `docs/rubric.md` — scoring standards for evidence-backed rules, `docs/bootstrap-templates/testing-patterns.md` — pair performance changes with regression tests when the bottleneck sits in business logic, Research Digest #14 — token and context costs are measurable performance constraints, not vibes*

---

### Rule: Bootstrap Template: Scope Boundaries
*Signal: `general` · Tier: alwaysApply*

**Why (failure mode):**


**The rule:**
**Title:** Agent Scope Boundaries  
**Loading tier:** `alwaysApply: true` (this must load on every session — scope failures happen on any task)  
**Size:** ~30–50 lines (lean; this is foundational)  

```markdown

*See also: `docs/rubric.md` §Part 6 — Scope Boundary Declarations, `docs/rubric.md` §Part 9 — Reliability Lens, Add a companion high-stakes operations rule in the target repo when migrations, billing, production deploys, or destructive admin actions need explicit confirmation, Research Digest #13 — Agentic Workflow Reliability, Concentrix "12 Failure Patterns of Agentic AI Systems" (Nov 2025)*

---

### Rule: Security Basics — Input Validation and Secret Handling
*Signal: `general` · Tier: alwaysApply*

**Why (failure mode):**
Agents trust external input without validation, hardcode secrets in source code, or log sensitive data. These are the most common AI-introduced security vulnerabilities per research — agents have seen countless examples of secrets in code and tend to reproduce the pattern without flagging it as dangerous. A single leaked key or unvalidated input can compromise an entire system.

**The rule:**
- **Never hardcode secrets, API keys, or credentials** — use environment variables loaded at runtime; store secrets in `.env` files that are `.gitignore`d
- **Validate and sanitize all external input before use** — use zod or equivalent schema validation on every request body, query param, and external API response
- **Never log tokens, passwords, or PII** — mask or omit sensitive fields in logs; if a field might be sensitive, omit it
- **Treat all user input as untrusted**, regardless of source — validate server-side even when client-side validation exists

```
// Secrets via environment variables
const apiKey = process.env.API_KEY;
if (!apiKey) throw new Error("API_KEY environment variable is required");

// .env file — always in .gitignore
// API_KEY=sk-proj-abc123...

// Schema validation before processing external input
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(["user", "admin"]),
});

export async function createUser(rawInput: unknown) {
  const input = CreateUserSchema.parse(rawInput); // throws on invalid input
  return db.users.create(input);
}

// Safe logging — omit sensitive fields
console.log("Auth request", { userId: user.id, email: user.email });
// NOT: { userId, token, passwordHash }
```
```
// Hardcoded secret — will be committed to git, visible in history forever
const apiKey = "sk-proj-abc123xyzDEFGHIJKLMNOP";
const db = new Client({ password: "hunter2" });

// Logging sensitive data — token in log = token in log aggregation = token leaked
console.log("Auth token:", token);
console.log("User login:", { email, password }); // password in plaintext log

// Trusting external input without validation
app.post("/users", async (req) => {
  await db.users.create(req.body); // req.body is untrusted, unvalidated
});

// Client-side only validation — bypassed trivially
function submitForm(data) {
  if (!data.email) return alert("Email required"); // client guard only
  fetch("/api/users", { method: "POST", body: JSON.stringify(data) });
  // server endpoint accepts anything
}
```

*See also: `docs/rubric.md` — rule sizing and format standards, [OWASP Top 10](https://owasp.org/www-project-top-ten/) — authoritative web security risk list, [zod](https://zod.dev/) — TypeScript-first schema validation, OWASP: [Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)*

---

### Rule: Test Behavior, Not Implementation
*Signal: `testing` · Tier: glob*

**Why (failure mode):**
AI coding agents default to "make tests pass" mode, not "validate requirements" mode. Left without explicit guidance, agents produce self-validating tests — tests that mirror the implementation rather than asserting business behavior. These tests always pass, yield high coverage numbers, and are worthless: they don't catch bugs, they don't survive refactors, and they create false confidence. The failure is invisible until production.

The second failure mode is equally common: when a test fails, the agent modifies the test to match the new behavior rather than investigating whether the behavior regression is intentional. This inverts the purpose of testing entirely.

**The rule:**
Tests assert requirements, not implementations. Tests are specifications; they define how code *should* behave, not how it currently *does* behave.

**Core rules:**

1. **Assert concrete values** — Use literal expected values (`31.49`, `"unauthorized"`, `[]`), not re-derived expressions that mirror implementation logic
2. **Name tests as behavioral specs** — `"should reject login after 5 failed attempts"`, not `"test authService"`
3. **Use `describe` as a contract** — Each `describe` block should read as a feature/scenario; each `it` should be a verifiable claim
4. **Test isolation is mandatory** — Each test must run independently. No shared mutable state between tests. Reset fixtures before each test.
5. **Investigate before modifying** — When a test fails, determine whether the test is wrong or the code is wrong before changing anything. Failing tests are signals, not obstacles.
6. **Realistic test data** — Use data that represents actual production scenarios. Avoid placeholders (`"x"`, `"test@test.com"`, `1`).

**For AI agents specifically:** When generating or modifying tests, announce "Test failure detected. Investigating..." and analyze: (1) the assertion, (2) the business requirement, (3) the implementation — before changing either.

```
// Business requirement tested directly with concrete values
describe('calculateOrderTotal', () => {
  it('should apply 10% discount for orders over $100', () => {
    const items = [{ price: 60 }, { price: 50 }]; // $110 total
    expect(calculateOrderTotal(items)).toBe(99); // $110 - 10% = $99
  });

  it('should add 8% sales tax after discounts', () => {
    const items = [{ price: 100 }];
    expect(calculateOrderTotal(items)).toBeCloseTo(108); // $100 + 8% tax
  });

  it('should return 0 for empty cart', () => {
    expect(calculateOrderTotal([])).toBe(0);
  });
});

// Auth: behavioral scenarios, not implementation mirrors
describe('AuthService.login', () => {
  beforeEach(() => resetAuthState()); // explicit reset

  it('should issue a JWT token on successful login', async () => {
    const result = await auth.login({ email: 'user@example.com', password: 'correct-password' });
    expect(result.token).toMatch(/^eyJ/); // JWT prefix
    expect(result.expiresIn).toBe(3600);
  });

  it('should lock the account after 5 consecutive failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await auth.login({ email: 'user@example.com', password: 'wrong' }).catch(() => {});
    }
    const result = await auth.login({ email: 'user@example.com', password: 'correct-password' });
    expect(result.error).toBe('account_locked');
  });
});
```
```
// Self-validating test — mirrors implementation, catches nothing
describe('calculateOrderTotal', () => {
  it('should calculate total', () => {
    const items = [{ price: 10 }, { price: 20 }];
    const result = calculateOrderTotal(items);
    // Tests the function against ITSELF — any bug in the implementation passes
    expect(result).toBe(items.reduce((sum, item) => sum + item.price, 0));
  });
});

// Modifying the test to match broken behavior — wrong response to failure
describe('UserService', () => {
  it('should return user data', async () => {
    const user = await getUser('123');
    // Regression introduced: function now returns null sometimes
    // Wrong fix: change assertion to allow null
    expect(user?.name || null).toBeDefined(); // ← this hides the bug
  });
});

// Shared state between tests — order-dependent failures
let cart: Cart;
describe('Cart', () => {
  it('should add items', () => {
    cart = new Cart(); // set once
    cart.add({ sku: 'A', qty: 1 });
    expect(cart.items).toHaveLength(1);
  });

  it('should calculate total', () => {
    // Depends on prior test having run first — brittle
    expect(cart.total()).toBe(9.99);
  });
});
```

*See also: `docs/bootstrap-templates/error-handling.md` — pair with testing; errors need test coverage too, Martin Fowler: Tests as executable specifications, Vitest docs: [Coverage configuration](https://vitest.dev/config/#coverage), jsmanifest.com: 5 Test Integrity Rules for AI Agents (Jan 2026)*

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