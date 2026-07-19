---
title: First User Proof Packet
description: Copy-paste outreach note and compact evidence template for the first outside-user proof
---

Use this as the operator-facing companion to [First User Proof](https://lambda-curry.github.io/anvil/guides/first-user-proof).

## Outreach note

Send this three-line note, then paste the exact command below it:

Could you try one first-run Anvil audit on a real repo of yours?

Paste the single command below from that repo's root; it saves `./anvil-audit.md`, stays local, and does not require an AI provider.

Send back whether it worked first try, the first useful fix the report pointed to, and the saved report file or excerpt.

```bash wrap
bunx @lambdacurry/anvil@0.1.0-alpha.6 audit --target . --ci --output ./anvil-audit.md
```

The current proof packet is pinned to `0.1.0-alpha.6` and uses one repo-root saved-report command with `--ci`, so the tester is not choosing between versions or layouts.

Helpful docs:
- Getting started: https://lambda-curry.github.io/anvil/getting-started/first-audit
- Trust model: https://lambda-curry.github.io/anvil/guides/byok-trust-model

If you open those docs, please keep using the exact pinned command from this note. The unpinned examples are for general public usage, not for this proof run.

What I'd love back:
1. Whether the exact command worked on the first try
2. If it did not, what failed first
3. If you changed the launcher or command, what you used instead
4. Whether you ran it from the repo root or somewhere else
5. The first useful fix the report pointed to, if any
6. Anything that felt confusing, too internal, or too hand-wavy
7. The saved report file or one report excerpt / screenshot from the run

If you want one extra cross-check, this should print the same pinned version:

```bash wrap
bunx \
  @lambdacurry/anvil@0.1.0-alpha.6 \
  --version
```

## Operator checklist

- pin one exact published version before sending
- prefer the Bun-native zero-install path (`bunx`); use `npx` only if the tester already has both Bun and Node and prefers that launcher
- ask the tester to paste the shared command from the target repo root
- keep `--output ./anvil-audit.md`
- do not switch the tester onto the floating `@alpha` tag mid-proof
- if you want extra verification, plan to capture one matching `--version` line with the same install path the tester used for the audit command, without appending global `anvil` lines to a `bunx` or `npx` packet
- keep the linked docs on public docs-site URLs and make sure they match the current published behavior

## Evidence template

Save one small packet with these fields:

- `Date`
- `Tester`
- `Outside Lambda Curry: yes / no`
- `Repo tested`
- `Install path: bunx / npx / global install`
- `Shell layout: target repo root with --target . / other`
- `Exact command`
- `Pinned CLI version`
- `Observed --version output, if captured`
- `First-try result: success / failure`
- `First failure, if any`
- `First useful next action named by tester`
- `Confusing wording or friction`
- `Short quote about usefulness or friction`
- `Saved report path or screenshot link`
- `Follow-up issue or doc fix created`

If the tester used global `anvil`, keep both the pinned `bun add -g @lambdacurry/anvil@0.1.0-alpha.6` line and the `anvil audit ...` line together in `Exact command`. If the tester stayed on `bunx` or `npx`, keep the optional `--version` line on that same launcher instead of switching to global `anvil`.
If the packet keeps the local report path, keep the same path the retained audit command wrote with `--output`; use a screenshot or approved external link only when the retained artifact is intentionally something else.

Count the proof as complete only if the tester is outside Lambda Curry, the run succeeds on a real repo, the retained audit command keeps the pinned `0.1.0-alpha.6` local-only `--ci` spelling, the packet includes a real artifact, and any rough edge becomes a follow-up.
