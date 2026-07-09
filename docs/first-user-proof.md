# First User Proof Checklist

Use this once you have one specific published Anvil build to validate and you want one clean external proof of Anvil's first-run path.

## Goal

Capture one real outside-Lambda-Curry run that proves:

1. a new user can install or zero-run Anvil without Scout-internal context
2. the user reaches a successful audit on their own repo
3. the user can name at least one useful next action from the report
4. we keep a small evidence packet instead of a vague "someone tried it"

## When to run this

Do this only after the exact published version you want to validate is live, and before Milestone 3 is called complete.

Do not send this packet with the floating `@alpha` tag. Replace `<exact-version>` in the command below with the specific published build you are validating, for example `0.1.0-alpha.6`.

## Suggested tester profile

Pick one person who is:

- outside Lambda Curry
- comfortable in a terminal
- willing to share brief setup friction and one report artifact
- able to run on a real repo with AI rule files or a nearby equivalent surface

## What to send the tester

Send only this minimal packet:

1. package name: `@lambdacurry/anvil`
1. this three-line opener:

```md
Could you try one first-run Anvil audit on a real repo of yours?
Paste the single command below from that repo's root; it saves `./anvil-audit.md`, stays local, and does not require an AI provider.
Send back whether it worked first try, the first useful fix the report pointed to, and the saved report file or excerpt.
```

1. one exact first-run command, with one install path and one shell layout only:

```bash
bunx @lambdacurry/anvil@<exact-version> audit --target . --ci --output ./anvil-audit.md
```

   - This canonical command assumes the tester is already in the target repo root. If they need a different launcher or shell layout, save that as a deviation in the returned evidence packet instead of sending multiple choices up front.
1. getting-started guide, on the public docs site:
   - `https://lambda-curry.github.io/anvil/getting-started/first-audit`
   - Tell the tester to keep using the exact pinned command from this packet if they open that guide. Its unpinned examples are for general usage, not for this proof run.
1. trust boundary guide, on the public docs site:
   - `https://lambda-curry.github.io/anvil/guides/byok-trust-model`
1. the capture questions below

If you want a ready-to-send note and a fill-in evidence template, use [First User Proof Packet](https://lambda-curry.github.io/anvil/guides/first-user-proof-packet).

When the tester replies, save the completed packet under [`docs/proofs/`](./proofs/README.md) so the Milestone 3 proof does not disappear into chat history.

If you want one extra sanity check in the saved packet, also capture one `--version` line with the same install path used for the audit command. The main requirement is that the outreach command itself already pins the exact package version.

If the tester used global `anvil`, keep both the pinned `bun add -g @lambdacurry/anvil@<exact-version>` line and the `anvil audit ...` line together in the saved packet's `Exact command` field. Otherwise the packet no longer shows which published build they actually ran.

Use the matching version command:

- `bunx @lambdacurry/anvil@<exact-version> --version`
- `npx @lambdacurry/anvil@<exact-version> --version`
- `anvil --version` after global install

Do not send Scout-internal project context, charter notes, or milestone history.

## Capture questions

Ask the tester to reply with short answers to these:

### Setup + execution

- Did the exact command succeed on the first try?
- If not, what failed first?
- If you switched install path or changed the command, what did you use instead?
- Were you in the target repo root when you ran the command? If not, where were you?

### Output usefulness

- Did the report point to a clear first fix?
- What was the first fix you would actually try?
- Was any wording confusing or too Scout-internal?

### Trust + comfort

- Did the pinned local-only `--ci` path feel clear enough?
- If you considered AI-assisted mode, what extra trust detail did you still want?

## Minimum evidence packet

Keep this small packet together:

1. the exact command the tester ran
2. if the tester used global `anvil`, keep both the pinned install line and the `anvil audit` line together
3. the shell layout they used when relative paths were involved: target repo root with `--target .`, or a short note for any other layout
4. the exact CLI version named in the command you sent, plus the matching `--version` output if you chose to capture it
5. whether it succeeded first try
6. one short quote about usefulness or friction
7. one saved report artifact path (preferred) or a screenshot excerpt showing a real run

For the external Milestone 3 proof, prefer sending a command with `--output` so the saved report path is explicit from the start. Relative `--output` resolves from the same cwd as `--target`.
If you keep that saved report path in the packet, use the same path the retained audit command wrote with `--output`; use a screenshot or approved external link only when you are intentionally retaining a different artifact.

Save the filled packet as `docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md`, using [`docs/proofs/first-user-proof-template.md`](./proofs/first-user-proof-template.md). Keep any screenshot or report excerpt in the same folder, or link it from that packet.

After you save the packet in-repo, verify whether it actually counts for the Milestone 3 gate:

```bash
bun run verify:first-user-proof -- docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md
```

That validator checks the outside-tester status, pinned CLI version, first-try success, returned artifact, and other minimum packet fields, then returns `counts` or `does-not-count` with explicit reasons.
For the current pinned `0.1.0-alpha.6` proof lane, it requires the retained audit command to keep the exact `--ci` spelling from the packet.

## Done signal for Milestone 3 gate

This gate is met when:

- the tester is outside Lambda Curry
- the tester completes a successful first run on a real repo
- we retain the minimum evidence packet above
- any rough edge discovered is written down as a follow-up issue or doc fix

## Follow-up rule

If the first tester gets blocked by docs or packaging, do not count it as proof.

Instead:

1. fix the blocking issue
2. update the docs or package
3. run the checklist again with a fresh tester or a clean rerun
