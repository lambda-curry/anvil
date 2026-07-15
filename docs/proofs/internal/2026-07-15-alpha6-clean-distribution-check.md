# Alpha.6 Clean Distribution Check — 2026-07-15

## Scope

This is an internal distribution-path check for the published
`@lambdacurry/anvil@0.1.0-alpha.6` package. It verifies the exact pinned
`bunx` path a proof-lane tester will receive, from an empty Bun cache and an
isolated target clone.

It is **not** outside-user proof and does not satisfy Anvil Milestone 3's
remaining gate.

## Method

- Created a fresh `/tmp/anvil-alpha6-distribution-*` directory and a separate
  empty Bun cache.
- Cloned `lambda-curry/saffron-starter` with `--depth 1` into that directory
  as the internal target.
- Ran the exact pinned package path from the target root:

  ```bash
  BUN_INSTALL_CACHE_DIR="$tmpdir/bun-cache" \
    bunx @lambdacurry/anvil@0.1.0-alpha.6 audit \
      --target . --ci --output ./anvil-audit.md
  ```

- Confirmed the resolved CLI version first with:

  ```bash
  BUN_INSTALL_CACHE_DIR="$tmpdir/bun-cache" \
    bunx @lambdacurry/anvil@0.1.0-alpha.6 --version
  ```

## Result

- Bun resolved, downloaded, and extracted the published package from the
  empty cache, then reported version `0.1.0-alpha.6`.
- The pinned audit completed successfully and wrote `./anvil-audit.md`.
- The generated report recorded Structural Lint `94/100`, Guardrail Readiness
  `19/35`, and SHA-256
  `73c3073625d65256c838a48ff5aaa1e8886ed76867dfd596257c7aefb1f9d7dc`.

## Interpretation

The alpha.6 pin, registry artifact, and documented `bunx` command are
currently usable from a fresh distribution path. The only remaining Milestone
3 dependency is human routing: one outside-Lambda-Curry tester must run the
same pinned command and return the report artifact plus a short
usefulness/friction quote.

## Next Move

Jake/operator should route the existing proof packet by 2026-07-20, or
explicitly defer the gate without counting this internal check as external
validation.
