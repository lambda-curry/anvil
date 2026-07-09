# First User Proof Packet

Use this as the operator-facing companion to [First User Proof](https://lambda-curry.github.io/anvil/guides/first-user-proof).

It turns the checklist into a copy-paste packet you can send to one external tester, plus a small evidence template you can save after the run.

Completed packets should live in [`docs/proofs/`](./proofs/README.md), not only in chat history.

## 1. Outreach message template

Send this short note plus the one exact command from section 3:

Could you try one first-run Anvil audit on a real repo of yours?

Paste the single command below from that repo's root; it saves `./anvil-audit.md`, stays local, and does not require an AI provider.

Send back whether it worked first try, the first useful fix the report pointed to, and the saved report file or excerpt.

```bash
bunx @lambdacurry/anvil@<exact-version> audit --target . --ci --output ./anvil-audit.md
```

Replace `<exact-version>` with the specific published build you want validated. The alpha.5 proof packet sends only the repo-root saved-report command above so the artifact comes back from the same first run without asking the tester to choose between layouts.

Helpful docs:
- Getting started: https://lambda-curry.github.io/anvil/getting-started/first-audit
  - If you open it, keep using the exact pinned command from this note. That guide's unpinned examples are for general public usage, not for this proof run.
- Trust model: https://lambda-curry.github.io/anvil/guides/byok-trust-model

What I'd love back:
1. Whether the exact command worked on the first try
2. If it did not, what failed first
3. If you switched install path or changed the command, what you used instead
4. Whether you ran it from the repo root or somewhere else
5. The first useful fix the report pointed to, if any
6. Anything that felt confusing, too internal, or too hand-wavy
7. The saved report file (preferred) or one report excerpt / screenshot from the run

The `--ci` run above stays local unless you explicitly choose otherwise.

## 2. Operator send checklist

Before sending the note above, make sure:

- the published package version you are naming is the intended live version
- for an outside first-user proof, default to the Bun-native zero-install path (`bunx`); use `npx` only if the tester already has both Bun and Node and prefers that launcher
- the exact command you are sharing works from a clean environment when pasted from the target repo root
- the saved path is `./anvil-audit.md`
- the outreach packet pins an exact published CLI version, not the floating `@alpha` tag
- if you want extra verification, you have a plan to capture one matching `--version` line in the saved proof packet using the same install path the tester used for the audit command, without appending global `anvil` lines to a `bunx` or `npx` packet
- the linked docs are public docs-site URLs, not GitHub blob URLs or local repo-relative paths
- the linked docs match the current published behavior
- you are not asking the tester to rely on Scout-internal context

## 3. Exact command blocks to send

Pick one install path and one shell layout, then send only that exact command so the tester is not choosing between multiple moving parts. For alpha.5, the canonical layout is Bun zero-install from the target repo root.

Replace `<exact-version>` before you send anything. Do not use the floating `@alpha` tag in the external proof packet.

Relative `--target` and `--output` paths resolve from the tester's current shell cwd. The canonical first-user proof layout is already in the target repo root, using `--target .` and `--output ./anvil-audit.md`.

For the first outside-Lambda-Curry proof, prefer the Bun-native zero-install path (`bunx`). Use `npx` only if the tester already has both Bun and Node and prefers that launcher.

### Bun zero-install (recommended default for external testers)

```bash
bunx @lambdacurry/anvil@<exact-version> audit --target . --ci --output ./anvil-audit.md
```

The proof packet's audit command is repo-root only. If the tester cannot run from the repo root, record the changed command as a deviation in the returned packet instead of rewriting the outreach note.

### npm launcher fallback (Bun still required)

Use the same repo-root command shape above if the tester already has both Bun and Node and explicitly prefers `npx`.

```bash
npx @lambdacurry/anvil@<exact-version> audit --target . --ci --output ./anvil-audit.md
```

### Global install

Use the same repo-root command shape above, swapping the launcher for `anvil` after install.

```bash
bun add -g @lambdacurry/anvil@<exact-version>
anvil audit --target . --ci --output ./anvil-audit.md
```

## 4. Optional version-cross-check commands

If you want an extra cross-check in the saved packet, capture `--version` with the same install path you used for the audit run. Do not append `anvil --version` to a `bunx` or `npx` packet.

### After a `bunx` run

```bash
bunx \
  @lambdacurry/anvil@<exact-version> \
  --version
```

### After an `npx` run

```bash
npx \
  @lambdacurry/anvil@<exact-version> \
  --version
```

### After a global install run

```bash
anvil --version
```

## 5. Evidence capture template

Save one small packet like this after the tester replies. The command itself should already pin the exact package version. If the tester used global `anvil`, keep both the pinned `bun add -g @lambdacurry/anvil@<exact-version>` line and the `anvil audit ...` line together in `Exact command`. If the tester stayed on `bunx` or `npx`, keep the optional `--version` line on that same launcher instead of switching to global `anvil`. Add `--version` output only if you captured it as an extra cross-check.

Preferred path: `docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md`

Blank template: [`docs/proofs/first-user-proof-template.md`](./proofs/first-user-proof-template.md)

After saving the returned packet in the repo, verify whether it actually counts for the Milestone 3 gate:

```bash
bun run verify:first-user-proof -- docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md
```

The validator returns a deterministic `counts` / `does-not-count` result and names the missing proof fields or contract mismatches directly.
For the current pinned `0.1.0-alpha.6` proof lane, that includes checking that the retained audit command keeps the packet's `--ci` spelling.
When the packet keeps a local report artifact, it also requires `Saved report path or screenshot link` to match the retained audit command's `--output` path.

Save one small packet with these fields:

- `Date`
- `Tester`
- `Outside Lambda Curry: yes / no`
- `Repo tested`
- `Install path: bunx / npx / global install`
- `Shell layout: target repo root with --target . / other`
- `Exact command` (for global install, keep both the pinned install line and the `anvil audit` line)
- `Pinned CLI version`
- `Observed --version output, if captured`
- `First-try result: success / failure`
- `First failure, if any`
- `First useful next action named by tester`
- `Confusing wording or friction`
- `Short quote about usefulness or friction`
- `Saved report path or screenshot link`
- `Follow-up issue or doc fix created`

## 6. What counts as success

Count this as Milestone 3 proof only if all of these are true:

- the tester is outside Lambda Curry
- the tester completes a successful first run on a real repo
- the packet above is filled in with a real artifact
- any rough edge found is captured as a follow-up

If the tester gets blocked by packaging or docs, treat the packet as failure evidence, not success proof.
