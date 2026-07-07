# Anvil first-user proof packet

If the tester used `global install`, keep both the version-pinned `bun add -g @lambdacurry/anvil@<exact-version>` line and the `anvil audit ...` line together in `Exact command`.
If you captured an optional `--version` cross-check, keep it on the same install path as the saved audit command instead of mixing launchers.
Do not append `anvil --version` to a `bunx` or `npx` packet; keep every saved launcher line on one install path.
Keep exactly one saved audit command in `Exact command`, matched to the shell layout you record below. Do not retain both the repo-root and parent-directory variants in the same packet.
If you keep the saved report path itself, use the same path the retained audit command wrote with `--output`. If you are retaining a different artifact, use a screenshot or approved external link instead.

- Date:
- Tester:
- Outside Lambda Curry: yes / no
- Repo tested:
- Install path: bunx / npx / global install
- Shell layout: target repo root with `--target .` / other
- Exact command:
- Pinned CLI version:
- Observed `--version` output, if captured:
- First-try result: success / failure
- First failure, if any:
- First useful next action named by tester:
- Confusing wording or friction:
- Short quote about usefulness or friction:
- Saved report path or screenshot link:
- Follow-up issue or doc fix created:
