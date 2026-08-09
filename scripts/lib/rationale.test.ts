import { expect, test } from "bun:test";

import {
  extractProse,
  hasStatedRationale,
  hasWhy,
  RATIONALE_FAMILY_THRESHOLD,
  rationaleFamilies,
} from "./rationale.ts";

// Shaped after `clawconnect/AGENTS.md`, the file that exposed the false negative:
// dense stated rationale throughout, and no heading named Why anywhere.
const CLAWCONNECT_SHAPED = `# Working in this repo

## Docs: dated means historical

\`docs/architecture/2026-*.md\` are **historical build records**. When a rename
invalidates one, **annotate it with a then/now map — never rewrite the body.**
Tidying a record makes it a worse record.

## The runtime seam is optional

This never starts, chooses, or enumerates an agent session. There is no spawn
callback, and that is structural, not a policy — do not add one.

If you change either path, update the guide in the same change — a documented
integration that the shipped binary cannot perform is the exact bug that
mechanism exists to fix.

## Verify

\`\`\`bash
pnpm run ready
\`\`\`

Assert behavior, not text. An earlier version of the hygiene test grepped the
entrypoints for a class name; a refactor renamed the symbol and the check
silently passed for the wrong reason.
`;

// Shaped after the terse workspace packages: purpose, entrypoints, commands, and
// DO/DON'T imperatives. The DON'T line contains "silently" but explains nothing.
const TERSE_SHAPED = `# CLAUDE.md — @scope/package

## Purpose and runtime role

\`@scope/package\` provides the widget client for the network.

## Main entrypoints and commands

- Runtime entrypoint: \`src/server.ts\`
- Marker file: \`src/index.ts\`

Commands:
- \`dev\`: \`bun run dev\`
- \`typecheck\`: \`bun run typecheck\`

## Safe change patterns (DO / DON'T)

DO:
- Treat exported symbols as shared API contracts.

DON'T:
- Do not silently change request envelope fields sent to receivers.
- Do not make breaking API changes silently.
`;

test("prose rationale without a Why heading counts as Why", () => {
  // The regression this change exists for: adding a `## Why` heading to this
  // file used to flip fail -> pass without changing a word of substance.
  expect(/^##\s+Why/im.test(CLAWCONNECT_SHAPED)).toBe(false);
  expect(hasWhy(CLAWCONNECT_SHAPED)).toBe(true);
  expect(rationaleFamilies(CLAWCONNECT_SHAPED).length).toBeGreaterThanOrEqual(
    RATIONALE_FAMILY_THRESHOLD,
  );
});

test("a terse command-reference file stays a true negative", () => {
  expect(hasWhy(TERSE_SHAPED)).toBe(false);
  // It does trip one keyword — "silently" — which is exactly why one signal
  // cannot be enough.
  expect(rationaleFamilies(TERSE_SHAPED).length).toBeLessThan(
    RATIONALE_FAMILY_THRESHOLD,
  );
});

test("a single rationale keyword is not rationale", () => {
  const oneSignal = `# Rules\n\nUse the cache because it is faster.\n`;
  expect(rationaleFamilies(oneSignal)).toEqual(["causal"]);
  expect(hasStatedRationale(oneSignal)).toBe(false);
});

test("two distinct families are rationale", () => {
  const twoSignals = `# Rules\n\nUse the cache because it is faster. This is deliberate.\n`;
  expect(rationaleFamilies(twoSignals).sort()).toEqual([
    "causal",
    "deliberate",
  ]);
  expect(hasStatedRationale(twoSignals)).toBe(true);
});

test("a Why heading still passes on its own", () => {
  // Backward compatibility: nothing that passed before may start failing.
  const headingOnly = `# Rules\n\n## Why\n\nWe do it this way.\n`;
  expect(hasStatedRationale(headingOnly)).toBe(false);
  expect(hasWhy(headingOnly)).toBe(true);

  for (const heading of ["Background", "Motivation", "Context"]) {
    expect(hasWhy(`# Rules\n\n## ${heading}\n\nText.\n`)).toBe(true);
  }
  expect(hasWhy(`# Rules\n\n**Why**: we do it this way.\n`)).toBe(true);
});

test("hard-wrapped phrases are still detected", () => {
  // Rule files are wrapped at ~88 columns, so multi-word signals routinely
  // straddle a newline. Matching the raw text misses them.
  const wrapped = `# Rules\n\nA plain install silently\nreconciles a stale lockfile, so we pin it rather\nthan trusting the runner.\n`;
  expect(/silently \w+/i.test(wrapped)).toBe(false);
  expect(rationaleFamilies(wrapped).sort()).toEqual(["contrastive", "failure"]);
  expect(hasStatedRationale(wrapped)).toBe(true);
});

test("rationale inside fenced code does not count", () => {
  const codeOnly =
    "# Rules\n\nRun the build.\n\n```bash\n# because the cache is stale, rather than clean\nmake all\n```\n";
  expect(rationaleFamilies(codeOnly)).toEqual([]);
  expect(hasWhy(codeOnly)).toBe(false);
});

test("extractProse strips fences and collapses whitespace", () => {
  expect(extractProse("a\n\nb\t c")).toBe("a b c");
  expect(extractProse("keep\n```\ndrop me\n```\nkeep")).not.toContain(
    "drop me",
  );
});

test("an empty or heading-only file has no rationale", () => {
  expect(hasWhy("")).toBe(false);
  expect(hasWhy("# Title\n\n## Setup\n\n- step one\n")).toBe(false);
});
