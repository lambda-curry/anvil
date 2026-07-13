# Bootstrap Draft — saffron-starter
*Generated: 2026-07-05 · Project: /tmp/anvil-internal-proof-2026-07-05/saffron-starter · Status: **DRAFT — requires human review before adoption***

> ⚠️ **This file is advisory only.** Do not paste these rules directly into AGENTS.md without reviewing each one.
> Each rule is grounded in a detected stack signal — but only you know which failure modes are actually relevant to your project.

---

## Detected Stack

- Runtime: Node.js
- Package manager: pnpm
- Testing: playwright
- Config files detected: playwright.config.ts
- Directory patterns: e2e/, scripts/, public/

---

## Suggested AGENTS.md Additions (1 rules)

Copy the rules you want to adopt into the appropriate section of `AGENTS.md`. Validate each one against your project's actual behavior before committing.

### Rule: Use pnpm — not npm or yarn
*Signal: `packageManager:pnpm` · Tier: alwaysApply*

**Why (failure mode):**
Running npm or yarn commands in a pnpm project modifies the wrong lockfile and breaks the workspace structure. pnpm's symlinked node_modules will silently diverge from what npm/yarn would install.

**The rule:**
This project uses pnpm. Always use pnpm commands:

- Install: `pnpm install`
- Add: `pnpm add <package>`
- Remove: `pnpm remove <package>`
- Run: `pnpm run <script>` or `pnpm <script>`

Never use npm or yarn.

---

## Suggested TOOLS.md Additions

### Verification Commands
*Add these to the verification section of TOOLS.md:*

```bash
pnpm run build    # vp run --cache --filter @saffron-starter/design-tokens --filter @saffron-starter/ui --filter @saffron-starter/web build
pnpm run typecheck    # vp run --cache --filter @saffron-starter/design-tokens --filter @saffron-starter/testing --filter @saffron-starter/ui --filter @saffron-starter/web --filter @saffron-starter/storybook typecheck
pnpm run test    # vp run --cache --filter @saffron-starter/ui --filter @saffron-starter/web test
pnpm run lint    # vp lint
pnpm run check    # vp check
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