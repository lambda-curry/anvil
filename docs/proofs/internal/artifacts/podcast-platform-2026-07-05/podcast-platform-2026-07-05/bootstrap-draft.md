# Bootstrap Draft — podcast-platform
*Generated: 2026-07-05 · Project: /tmp/anvil-internal-proof-2026-07-05/podcast-platform · Status: **DRAFT — requires human review before adoption***

> ⚠️ **This file is advisory only.** Do not paste these rules directly into AGENTS.md without reviewing each one.
> Each rule is grounded in a detected stack signal — but only you know which failure modes are actually relevant to your project.

---

## Detected Stack

- Runtime: Bun
- Package manager: bun
- Directory patterns: scripts/

---

## Suggested AGENTS.md Additions (1 rules)

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

## Suggested TOOLS.md Additions

### Verification Commands
*Add these to the verification section of TOOLS.md:*

```bash
bun run build    # turbo build
bun run typecheck    # turbo typecheck
bun run test    # turbo test
bun run lint    # bun run lint:ox
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