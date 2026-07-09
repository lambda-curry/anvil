---
title: First User Proof
description: Capture one clean outside-user proof against one exact published Anvil build
---

Use this when you want one honest outside-Lambda-Curry proof that Anvil's first-run path works on a real repo.

## Goal

Capture one real external run that proves:

1. a new user can run Anvil without any Lambda Curry–internal context
2. the user reaches a successful audit on their own repo
3. the returned report suggests at least one plausible next fix
4. the proof is saved as a small evidence packet instead of disappearing into chat

## When to run this

- after the exact published package version you want to validate is live
- before the first outside-user milestone is called complete
- only with an exact pinned version, never the floating `@alpha` tag

## Exact command to send

Send this opener and one command. It assumes the tester is already in the target repo root, so the saved report lands at `./anvil-audit.md`.

```md
Could you try one first-run Anvil audit on a real repo of yours?
Paste the single command below from that repo's root; it saves `./anvil-audit.md`, stays local, and does not require an AI provider.
Send back whether it worked first try, the first useful fix the report pointed to, and the saved report file or excerpt.
```

```bash wrap
bunx @lambdacurry/anvil@<exact-version> audit --target . --ci --output ./anvil-audit.md
```

If the tester needs a different launcher or shell layout, save that as a deviation in the returned evidence packet instead of sending multiple choices up front. Keep the exact pinned package version and local-only `--ci` flag.
The pinned `0.1.0-alpha.6` proof packet uses `--ci`.

## Public docs to share with the tester

- [Getting started](https://lambda-curry.github.io/anvil/getting-started/first-audit)
- [BYOK trust model](https://lambda-curry.github.io/anvil/guides/byok-trust-model)

If the tester opens those docs, tell them to keep using the exact pinned command from the proof packet instead of switching to the unpinned examples.

## Capture questions

- Did the exact command succeed on the first try?
- If not, what failed first?
- If you changed the launcher or command, what did you use instead?
- Were you in the repo root when you ran it? If not, where were you?
- What was the first useful fix the report pointed to?
- What felt confusing, too internal, or too hand-wavy?

## Minimum evidence packet

Keep these together:

1. the install path the tester used: `bunx`, `npx`, or global `anvil`
2. the exact command the tester ran
3. the shell layout they used
4. the pinned CLI version named in the command, plus matching `--version` output if you captured it
5. whether it succeeded on the first try
6. one short usefulness/friction quote
7. one saved report artifact path or screenshot excerpt

If the tester used global `anvil`, keep both the pinned `bun add -g @lambdacurry/anvil@<exact-version>` line and the `anvil audit ...` line together in the saved packet's `Exact command` field.

For a ready-to-send outreach note and fill-in template, use [First User Proof Packet](https://lambda-curry.github.io/anvil/guides/first-user-proof-packet).

Count the returned proof as complete only if the retained audit command keeps the pinned `0.1.0-alpha.6` local-only `--ci` spelling.
