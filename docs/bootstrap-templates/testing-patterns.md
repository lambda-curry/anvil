# Test Behavior, Not Implementation

*Signal: testing · Tier: glob · Glob: **/*.test.ts, **/*.spec.ts, **/*.test.tsx, **/*.spec.tsx*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

AI coding agents default to "make tests pass" mode, not "validate requirements" mode. Left without explicit guidance, agents produce self-validating tests — tests that mirror the implementation rather than asserting business behavior. These tests always pass, yield high coverage numbers, and are worthless: they don't catch bugs, they don't survive refactors, and they create false confidence. The failure is invisible until production.

The second failure mode is equally common: when a test fails, the agent modifies the test to match the new behavior rather than investigating whether the behavior regression is intentional. This inverts the purpose of testing entirely.

## The Rule

Tests assert requirements, not implementations. Tests are specifications; they define how code *should* behave, not how it currently *does* behave.

**Core rules:**

1. **Assert concrete values** — Use literal expected values (`31.49`, `"unauthorized"`, `[]`), not re-derived expressions that mirror implementation logic
2. **Name tests as behavioral specs** — `"should reject login after 5 failed attempts"`, not `"test authService"`
3. **Use `describe` as a contract** — Each `describe` block should read as a feature/scenario; each `it` should be a verifiable claim
4. **Test isolation is mandatory** — Each test must run independently. No shared mutable state between tests. Reset fixtures before each test.
5. **Investigate before modifying** — When a test fails, determine whether the test is wrong or the code is wrong before changing anything. Failing tests are signals, not obstacles.
6. **Realistic test data** — Use data that represents actual production scenarios. Avoid placeholders (`"x"`, `"test@test.com"`, `1`).

**For AI agents specifically:** When generating or modifying tests, announce "Test failure detected. Investigating..." and analyze: (1) the assertion, (2) the business requirement, (3) the implementation — before changing either.

## Examples

### ✅ DO

```typescript
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

### ❌ DON'T

```typescript
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

## Coverage Gate (Optional but Recommended)

If your project uses a CI coverage gate, target **80% line coverage minimum** for business logic files. Coverage is a floor, not a goal — 80% covered with meaningful tests beats 100% with self-validating ones.

Vitest config example:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, functions: 80, branches: 70 },
      exclude: ['**/*.config.ts', 'dist/**', 'node_modules/**'],
    },
  },
});
```

## Scope

Tier: glob-matched | Globs: `**/*.test.ts, **/*.spec.ts, **/*.test.tsx, **/*.spec.tsx, **/*.test.js, **/*.spec.js`

## See Also

- `docs/bootstrap-templates/error-handling.md` — pair with testing; errors need test coverage too
- Martin Fowler: Tests as executable specifications
- Vitest docs: [Coverage configuration](https://vitest.dev/config/#coverage)
- jsmanifest.com: 5 Test Integrity Rules for AI Agents (Jan 2026)
