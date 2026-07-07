# Releasing @lambdacurry/anvil

`@lambdacurry/anvil` publishes to npm via `.github/workflows/publish.yml` on a self-hosted macOS runner. **No manual `npm publish` is required.** The primary path is *bump the version in a PR, merge it, the workflow auto-publishes.*

## Prerequisites

- Push access to `lambda-curry/anvil`
- `NPM_TOKEN` secret configured in the repo (already set)
- CI passing on `main`

## Three publish paths

The workflow has three triggers; pick whichever matches the situation.

### A — Bump-and-merge (primary path)

This is how every alpha refresh ships. Most fixes land this way.

```sh
# In a feature branch with the fix
# Bump the version:
jq '.version = "0.1.0-alpha.4"' package.json > /tmp/p.json && mv /tmp/p.json package.json
# Or use npm:
#   npm version prerelease --preid=alpha    # bumps alpha.N
#   npm version patch                       # bumps patch (stable)

git add package.json
git commit -m "chore: bump alpha.4"

# Open PR, merge as usual
```

When the PR merges to `main`, the workflow fires automatically (push trigger on `src/**`, `scripts/**`, `bin/**`, or `package.json` paths). It then:

1. Reads `package.json` version and checks npm to see if it's already published
2. If yes → exits cleanly. Safe to fire on any PR touching publish-relevant paths.
3. If no → runs lint → typecheck → tests → publishes to npm with `--tag alpha` for pre-release versions, otherwise `latest`

So if a PR touches `src/` but doesn't bump the version (most PRs), the workflow fires but skips publish. Only PRs that bump version actually publish.

### B — Tag-driven release (explicit version cuts)

For deliberate version cuts (e.g., promoting alpha → stable, or cutting a major release):

```sh
# After version is bumped on main:
gh release create v0.1.0-alpha.4 \
  --title "v0.1.0-alpha.4" \
  --notes "Release notes here" \
  --prerelease
```

Creating the release fires `release: published` and the same workflow runs. Useful when you want a GitHub release page to anchor the version in repo history.

### C — Manual dispatch (retry path)

```sh
gh workflow run publish.yml
```

Useful when a previous run failed for transient reasons (npm registry hiccup, runner unavailable). Doesn't bump version — just retries the publish for whatever's currently in `package.json`.

## Verifying the publish

```sh
# Check what's on npm under the alpha tag:
npm view @lambdacurry/anvil@alpha version

# Test zero-install against a sample repo:
mkdir /tmp/anvil-zero-install && cd /tmp/anvil-zero-install
bunx @lambdacurry/anvil@alpha audit --target ./some-typescript-repo --output ./report.md --no-ai
```

Confirm:

- The CLI runs without errors
- `./report.md` lands in the expected location
- Artifact paths in the report are relative to the report (not absolute install paths)

This is the zero-install proof that `SFD-6` and related blockers track. If it doesn't pass, the alpha needs another round before external users see it.

## Version conventions

- `0.x.0-alpha.N` — pre-release for testing (`--tag alpha`)
- `0.x.0-beta.N` — beta (`--tag alpha` by convention, or `--tag beta`)
- `0.x.y` — stable patch release (`--tag latest`)

The workflow auto-detects pre-release versions (anything matching `*-alpha.*`, `*-beta.*`, or `*-rc.*`) and publishes with `--tag alpha`. Stable versions publish under the default `latest` tag.

## Who can trigger this

- **Anyone whose PR merges to `main`** — bump-and-merge is the primary path; merge perms come from normal PR review
- **Repo collaborators** — can dispatch manually via `gh workflow run`
- **Release authors** — anyone with permission to create releases on the repo
