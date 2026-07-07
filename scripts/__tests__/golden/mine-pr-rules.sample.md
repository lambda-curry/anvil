# Rule Candidates — example/cli
*Mined: <DATE> · PRs analyzed: 40 · Comments reviewed: 90 · Candidates surfaced: 1*

---

## Theme: Security (3 comments, score 3.6)

### Candidate: Treat auth, secrets, and user input as security-sensitive
*Frequency: 3 · Severity signals: medium · Representativeness: medium*

**Supporting comments:**
- PR #103: "Need to validate auth token input and handle failures clearly."
- PR #102: "Please use zod validation and explicit error handling here."
- PR #101: "We should validate user input and avoid unsafe assumptions."

### Candidate Rule — Security

**Why (failure mode):** We should validate user input and avoid unsafe assumptions.

**The Rule:** Treat auth, secrets, and user input as security-sensitive. Validate input and avoid exposing credentials or unsafe assumptions.

**✅ DO:** ```
// Example: [insert preferred pattern here]
```

**❌ DON'T:** ```
// Anti-pattern: [insert pattern to avoid]
```

**Scope:** alwaysApply: true

*Candidate rule — review before adopting. Frequency=3 in 40 PRs (7.5%). Evidence: 3 PR comments shown above.*

---

## Skipped (low signal)
- 10 comments below length threshold
- 20 pure approvals
- 5 questions without suggestions
- 3 low-signal comments
