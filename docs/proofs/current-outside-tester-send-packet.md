# Current outside-tester send packet

Use this packet to route one outside-Lambda-Curry tester through Anvil's remaining Milestone 3 proof lane.

This packet stays pinned to `@lambdacurry/anvil@0.1.0-alpha.6`. Do not swap the tester onto the floating `@alpha` tag.

## Three-line opener

```md
Could you try one first-run Anvil audit on a real repo of yours?
Paste the single command below from that repo's root; it saves `./anvil-audit.md`, stays local, and does not require an AI provider.
Send back whether it worked first try, the first useful fix the report pointed to, and the saved report file or excerpt.
```

## Exact command to send

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.6 audit --target . --ci --output ./anvil-audit.md
```

Send this as the only command. It assumes the tester is already in the target repo root, guarantees the saved report path, and keeps the local-only flag aligned with current public docs.

## Copy-paste outreach note

Could you try one first-run Anvil audit on a real repo of yours?

Paste the single command below from that repo's root; it saves `./anvil-audit.md`, stays local, and does not require an AI provider.

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.6 audit --target . --ci --output ./anvil-audit.md
```

Helpful docs:
- First-run guide: https://lambda-curry.github.io/anvil/getting-started/first-audit
  - If you open it, keep using the exact pinned command from this note. Its `@alpha` examples are for general public usage, not for this proof run.
- Trust model: https://lambda-curry.github.io/anvil/guides/byok-trust-model

What I'd love back:
1. Whether the exact command worked on the first try
2. If it did not, what failed first
3. If you changed the launcher or command, what you used instead
   - If you switched to global `anvil`, keep both the pinned `bun add -g @lambdacurry/anvil@0.1.0-alpha.6` line and the `anvil audit ...` line together in `Exact command`.
4. Whether you ran it from the repo root or somewhere else
5. The first useful fix the report pointed to, if any
6. Anything that felt confusing, too internal, or too hand-wavy
7. The saved `anvil-audit.md` file or one screenshot/report excerpt from the run
   - If you send back the saved report path itself, keep `./anvil-audit.md`, the exact path the retained command wrote with `--output`.

If you want one extra cross-check, this should print the same pinned version:
`bunx @lambdacurry/anvil@0.1.0-alpha.6 --version`

If you changed launchers before the successful run, use the matching `--version` command from that same install path instead of mixing launchers in the saved packet. Do not append `anvil --version` to a `bunx` or `npx` proof packet.

## What comes back

Count this as Milestone 3 proof only if all of these are true:

- the tester is outside Lambda Curry
- the tester completes a successful first run on a real repo
- the retained audit command keeps the pinned `0.1.0-alpha.6` local-only `--ci` spelling
- the exact command and returned artifact are retained in a saved proof packet
- any rough edge found is captured as follow-up work

When the tester replies, save the result in:

`docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md`

Keep the saved packet honest about the run details: install path, exact command, shell layout, pinned version, first-try result, one quote, and one real artifact. For global-install packets, keep both the pinned install line and the `anvil audit` line together in `Exact command`.
If the packet keeps the local report path, keep the same path the retained audit command wrote with `--output`; use a screenshot or approved external link only when the retained artifact is intentionally something else.

Start from:

- `docs/proofs/first-user-proof-template.md`

Then verify whether that saved packet actually counts:

```bash
bun run verify:first-user-proof -- docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md
```

Run that verifier from an Anvil repo checkout or an unpacked published Anvil package root; the verifier now ships with the same proof-doc bundle.
It keys validation off the saved packet's `Pinned CLI version`, so this retained `0.1.0-alpha.6` packet can still be checked after current `main` advances to a later package version.

Historical note: the original dated retained packet for this same pinned proof lane remains at `docs/proofs/2026-05-23-alpha4-outside-tester-send-packet.md`.

Related standing docs:

- `docs/first-user-proof.md`
- `docs/first-user-proof-packet.md`
