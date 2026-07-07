# Proof Packets

Keep small milestone-proof evidence here, in one boring place.

Right now this directory is for Anvil's external first-user proof packets: the exact command, the pinned CLI version, the shell layout used for relative paths, the first-try result, one short quote, and one real run artifact.

If the tester used global `anvil`, keep both the version-pinned `bun add -g @lambdacurry/anvil@<exact-version>` line and the `anvil audit ...` line together under `Exact command` so the saved packet still shows which published build actually ran.
If the saved artifact is the local report itself, keep the same path here that the retained audit command used in `--output`. If you are retaining a different artifact instead, use a screenshot or approved external link so the packet stays honest about that mismatch.

For milestone-proof packets, do not send the floating `@alpha` tag. Record the exact package version named in the outreach command, and include `--version` output only if you captured it as an extra cross-check.

For the currently forwardable outside-tester ask, start from [`current-outside-tester-send-packet.md`](./current-outside-tester-send-packet.md). Keep dated packets as retained evidence, not as the mutable operator handoff surface.

## Naming

Use:

`YYYY-MM-DD-<tester>-first-user-proof.md`

Examples:

- `2026-04-23-alex-first-user-proof.md`
- `2026-04-23-redacted-first-user-proof.md`

If you need to redact the tester or repo, do that in the filename and inside the packet rather than storing the evidence somewhere else.

## Template

Start from [`first-user-proof-template.md`](./first-user-proof-template.md).

After saving a returned packet, verify whether it actually counts for the Milestone 3 gate:

```bash
bun run verify:first-user-proof -- docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md
```

The verifier ships with the published Anvil package as well as this repo checkout, so the same command stays valid from either Anvil package root.
It validates against the saved packet's `Pinned CLI version`, not whatever version `package.json` reaches later on current `main`.
For the current pinned `0.1.0-alpha.5` proof lane, it also requires the retained audit command to keep the pinned local-only `--ci` spelling from the packet.
When the packet keeps a local report artifact, it also checks that `Saved report path or screenshot link` matches the retained audit command's `--output` path.

The command returns a deterministic `counts` / `does-not-count` result with explicit failures, so the proof decision does not live only in human interpretation.

## Artifact handling

- Keep screenshots or report excerpts next to the packet when they are safe to store in-repo
- If the artifact should not live in-repo, link to the approved external location from the packet
- Do not treat a Slack thread or DM as the durable source of truth
