# Alpha.4 outside-tester send packet

Use this packet to route one outside-Lambda-Curry tester through Anvil's remaining Milestone 3 proof lane.

This packet stays pinned to `@lambdacurry/anvil@0.1.0-alpha.4`. Do not swap the tester onto the floating `@alpha` tag.

## Pick the exact command before you send

Send only one command, matched to where the tester will paste it.

If the tester will run from the target repo root:

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.4 audit --target . --no-ai --output ./anvil-audit.md
```

If the tester will run from the parent directory of the target repo:

```bash
bunx @lambdacurry/anvil@0.1.0-alpha.4 audit --target ./your-repo --no-ai --output ./your-repo/anvil-audit.md
```

Use the parent-directory variant only after replacing `./your-repo` with the real folder name the tester will use.

## Copy-paste outreach note

```md
Hey, could you help me validate one first-run path for a small CLI called Anvil?

If you're up for it, please try this on one real repo of yours:

`<paste the one exact command you picked above>`

Helpful docs:
- First-run guide: https://lambda-curry.github.io/anvil/getting-started/first-audit
  - If you open it, keep using the exact pinned command from this note. Its `@alpha` examples are for general public usage, not for this proof run, and its current-main local-only examples use `--ci` instead of this pinned packet's legacy `--no-ai` spelling.
- Trust model: https://lambda-curry.github.io/anvil/guides/byok-trust-model

What I'd love back:
1. Whether the exact command worked on the first try
2. If it did not, what failed first
3. If you changed the launcher or command, what you used instead
4. Whether you ran it from the repo root, the parent directory, or somewhere else
5. The first fix the report made obvious to you, if any
6. Anything that felt confusing, too internal, or too hand-wavy
7. The saved `anvil-audit.md` file or one screenshot/report excerpt from the run

If you want one extra cross-check, this should print the same pinned version:
`bunx @lambdacurry/anvil@0.1.0-alpha.4 --version`

Treat the `--no-ai` spelling above as a pinned-build compatibility exception, not as a second competing contract.
```

## What comes back

Count this as Milestone 3 proof only if all of these are true:

- the tester is outside Lambda Curry
- the tester completes a successful first run on a real repo
- the exact command and returned artifact are retained in a saved proof packet
- any rough edge found is captured as follow-up work

When the tester replies, save the result in:

`docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md`

Keep the saved packet honest about the run details: install path, exact command, shell layout, pinned version, first-try result, one quote, and one real artifact.

Start from:

- `docs/proofs/first-user-proof-template.md`

Related standing docs:

- `docs/first-user-proof.md`
- `docs/first-user-proof-packet.md`
