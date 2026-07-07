# Security Basics — Input Validation and Secret Handling

*Signal: general · Tier: alwaysApply · Glob: —*
*Source: Anvil bootstrap template · Last validated: 2026-05-27*

## Why (Failure Mode)

Agents trust external input without validation, hardcode secrets in source code, or log sensitive data. These are the most common AI-introduced security vulnerabilities per research — agents have seen countless examples of secrets in code and tend to reproduce the pattern without flagging it as dangerous. A single leaked key or unvalidated input can compromise an entire system.

## The Rule

- **Never hardcode secrets, API keys, or credentials** — use environment variables loaded at runtime; store secrets in `.env` files that are `.gitignore`d
- **Validate and sanitize all external input before use** — use zod or equivalent schema validation on every request body, query param, and external API response
- **Never log tokens, passwords, or PII** — mask or omit sensitive fields in logs; if a field might be sensitive, omit it
- **Treat all user input as untrusted**, regardless of source — validate server-side even when client-side validation exists

## Examples

### ✅ DO

```typescript
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

### ❌ DON'T

```typescript
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

## Scope

Tier: alwaysApply | alwaysApply: true

## See Also

- `docs/rubric.md` — rule sizing and format standards
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) — authoritative web security risk list
- [zod](https://zod.dev/) — TypeScript-first schema validation
- OWASP: [Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
