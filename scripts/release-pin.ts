#!/usr/bin/env bun

/**
 * Repin the proof-lane docs to the version in package.json.
 *
 * The external proof lane deliberately pins an exact published version so an outside tester
 * runs a reproducible command. That pin is repeated inline, in prose, across the README and
 * five docs — so every release needed a hand sweep, and a missed file failed CI after the
 * merge rather than before it. `expectedVersion` is already derived from package.json
 * (scripts/proof-lane-contract.ts); this makes the docs follow it.
 *
 * Dated/historical packets under docs/proofs/<YYYY-MM-DD>-* are deliberately frozen at the
 * version they were sent with — the contract cites one by name as a historical note — so they
 * are never rewritten.
 *
 * Usage:
 *   bun run release:pin           # rewrite docs to package.json's version
 *   bun run release:pin --check   # exit 1 if any governed doc is stale (CI-safe)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const version = (
  JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as {
    version: string;
  }
).version;

/** Governed by the proof-lane contract. Keep in step with DOC_CONTRACTS in verify-proof-lane-docs.ts. */
const PINNED_DOCS = [
  "README.md",
  "docs/first-user-proof.md",
  "docs/first-user-proof-packet.md",
  "docs/getting-started.md",
  "docs/byok-trust-model.md",
  "docs/proofs/current-outside-tester-send-packet.md",
  "docs-site/src/content/docs/getting-started/first-audit.md",
  "docs-site/src/content/docs/reference/cli.md",
  "docs-site/src/content/docs/index.mdx",
  "docs-site/public/llms-full.txt",
];

// Any published anvil version: 0.1.0-alpha.6, 1.2.3, 1.2.3-beta.1.
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?`;
const PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [
    new RegExp(String.raw`@lambdacurry/anvil@${VERSION}`, "g"),
    `@lambdacurry/anvil@${version}`,
  ],
  // Bare backticked version in prose: "The current `0.1.0-alpha.6` packet uses …"
  [new RegExp(String.raw`\`${VERSION}\``, "g"), `\`${version}\``],
];

const check = process.argv.includes("--check");
const stale: string[] = [];
let rewritten = 0;

for (const relPath of PINNED_DOCS) {
  const absPath = resolve(REPO_ROOT, relPath);
  let text: string;
  try {
    text = readFileSync(absPath, "utf8");
  } catch {
    console.error(`missing governed doc: ${relPath}`);
    process.exit(1);
  }

  let next = text;
  for (const [pattern, replacement] of PATTERNS) {
    next = next.replace(pattern, replacement);
  }
  if (next === text) continue;

  if (check) {
    stale.push(relPath);
    continue;
  }
  writeFileSync(absPath, next);
  console.log(`repinned ${relPath}`);
  rewritten++;
}

if (check) {
  if (stale.length > 0) {
    console.error(
      `Stale version pins for ${version} in:\n${stale.map((f) => `  ${f}`).join("\n")}\n\nRun: bun run release:pin`,
    );
    process.exit(1);
  }
  console.log(`All governed docs pinned to ${version}`);
} else {
  console.log(
    rewritten === 0
      ? `All governed docs already pinned to ${version}`
      : `Repinned ${rewritten} doc(s) to ${version}`,
  );
}
