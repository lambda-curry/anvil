import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { findDocsRealityDriftFailures } from "./docs-reality-contract.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");

test("public drift guide lists shipped checks before planned coverage analysis", () => {
  const guide = readFileSync(
    resolve(REPO_ROOT, "docs-site/src/content/docs/guides/drift-detection.md"),
    "utf8",
  );

  expect(guide).toContain(
    "5. **Command drift** — referenced commands are checked against package scripts and available binaries",
  );
  expect(guide).toContain(
    "1. **Coverage analysis** — detecting codebase patterns with no matching rule",
  );
});

test("shipped drift phases are not described as planned in current docs", () => {
  expect(findDocsRealityDriftFailures(REPO_ROOT)).toEqual([]);
});

test("reports the exact stale claim and source line", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "anvil-doc-reality-"));
  mkdirSync(join(fixtureRoot, "docs"), { recursive: true });
  writeFileSync(
    join(fixtureRoot, "README.md"),
    "# README\n\nDrift detection: command drift detection is planned.\n",
  );

  try {
    expect(findDocsRealityDriftFailures(fixtureRoot)).toEqual([
      {
        file: "README.md",
        line: 3,
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

test("catches plural and hyphenated public stale claim variants", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "anvil-doc-reality-"));
  const publicDocsRoot = join(fixtureRoot, "docs-site/src/content/docs/guides");
  mkdirSync(publicDocsRoot, { recursive: true });
  writeFileSync(
    join(publicDocsRoot, "drift-detection.md"),
    [
      "# Drift Detection",
      "Globs are planned.",
      "Commands are planned.",
      "Dates are planned.",
      "Broken symlinks are planned.",
      "Broken-symlink checks are planned.",
      "Command availability is planned.",
    ].join("\n"),
  );

  try {
    expect(findDocsRealityDriftFailures(fixtureRoot)).toEqual([
      {
        file: "docs-site/src/content/docs/guides/drift-detection.md",
        line: 2,
        claim: "Globs are planned.",
      },
      {
        file: "docs-site/src/content/docs/guides/drift-detection.md",
        line: 3,
        claim: "Commands are planned.",
      },
      {
        file: "docs-site/src/content/docs/guides/drift-detection.md",
        line: 4,
        claim: "Dates are planned.",
      },
      {
        file: "docs-site/src/content/docs/guides/drift-detection.md",
        line: 5,
        claim: "Broken symlinks are planned.",
      },
      {
        file: "docs-site/src/content/docs/guides/drift-detection.md",
        line: 6,
        claim: "Broken-symlink checks are planned.",
      },
      {
        file: "docs-site/src/content/docs/guides/drift-detection.md",
        line: 7,
        claim: "Command availability is planned.",
      },
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
