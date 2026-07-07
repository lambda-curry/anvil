# Handle Errors Explicitly — No Silent Failures

*Signal: language:typescript · Tier: glob · Glob: **/*.ts, **/*.tsx*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Agents swallow errors, use empty catch blocks, or log-and-continue without proper error propagation. The result is silent failures in production that are impossible to debug — the code appears to work but quietly discards error state, leaving users with broken behavior and developers with no signal.

## The Rule

Use typed error handling. Catch specific error types. Either handle the error with recovery logic or re-throw it. Never use empty catch blocks.

- Catch blocks must do one of: (a) recover with explicit logic, or (b) re-throw the error
- Use `instanceof` guards to distinguish error types before handling
- Prefer discriminated union Result types (`{ ok: true, data } | { ok: false, error }`) for functions that can fail predictably
- Never use `catch (e) {}` — empty catch blocks are always wrong
- Never use `catch (e) { console.log(e) }` as a substitute for handling — log-and-swallow is a silent failure
- If an error is truly ignorable, document why with an explicit comment

## Examples

### ✅ DO

```typescript
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

### ❌ DON'T

```typescript
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

## Scope

Tier: glob-matched | Globs: `**/*.ts, **/*.tsx`

## See Also

- `docs/rubric.md` — rule sizing and format standards
- TypeScript Handbook: [Error Handling](https://www.typescriptlang.org/docs/handbook/)
- neverthrow library — ergonomic Result types for TypeScript
