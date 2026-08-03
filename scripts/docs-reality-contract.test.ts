import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { findDocsRealityDriftFailures } from "./docs-reality-contract.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");

test("shipped drift phases are not described as planned in current docs", () => {
  expect(findDocsRealityDriftFailures(REPO_ROOT)).toEqual([]);
});

test("reports the exact stale claim and source line", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "anvil-doc-reality-"));
  mkdirSync(join(fixtureRoot, "docs"), { recursive: true });
  writeFileSync(
    join(fixtureRoot, "README.md"),
    "Drift detection: command drift detection is planned.\n",
  );

  try {
    expect(findDocsRealityDriftFailures(fixtureRoot)).toEqual([
      {
        file: "README.md",
        line: 1,
        claim: "Drift detection: command drift detection is planned.",
      },
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("does not mistake a planned future phase for a stale shipped claim", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "anvil-doc-reality-"));
  mkdirSync(join(fixtureRoot, "docs"), { recursive: true });
  writeFileSync(
    join(fixtureRoot, "README.md"),
    "Drift detection ships path, glob, date, and command checks; coverage gap analysis is planned.\n",
  );

  try {
    expect(findDocsRealityDriftFailures(fixtureRoot)).toEqual([]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("catches a stale shipped phase table entry", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "anvil-doc-reality-"));
  mkdirSync(join(fixtureRoot, "docs"), { recursive: true });
  writeFileSync(
    join(fixtureRoot, "docs/drift-detection-design.md"),
    "| Phase 1c | Command drift | Planned |\n",
  );

  try {
    expect(findDocsRealityDriftFailures(fixtureRoot)).toEqual([
      {
        file: "docs/drift-detection-design.md",
        line: 1,
        claim: "| Phase 1c | Command drift | Planned |",
      },
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("scans public docs and reports the exact source line", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "anvil-doc-reality-"));
  const publicDocsRoot = join(fixtureRoot, "docs-site/src/content/docs");
  mkdirSync(publicDocsRoot, { recursive: true });
  writeFileSync(
    join(publicDocsRoot, "index.mdx"),
    "Detect drift (basic) still appears in public docs.\n",
  );

  try {
    expect(findDocsRealityDriftFailures(fixtureRoot)).toEqual([
      {
        file: "docs-site/src/content/docs/index.mdx",
        line: 1,
        claim: "Detect drift (basic) still appears in public docs.",
      },
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
