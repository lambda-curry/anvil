import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { discoverRuleSurfaceFiles } from "./rule-surface.ts";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "anvil-rule-surface-"));
  writeFileSync(join(root, "AGENTS.md"), "# root rules\n");
  for (const dir of ["vendor/openclaw", "agents/scout", "packages/core"]) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "AGENTS.md"), `# ${dir} rules\n`);
  }
  return root;
}

describe("discoverRuleSurfaceFiles skipDirs", () => {
  test("discovers every rule surface when no skip list is given", () => {
    const found = discoverRuleSurfaceFiles(fixture()).map((f) => f.relativePath);
    expect(found).toContain("AGENTS.md");
    expect(found).toContain("vendor/openclaw/AGENTS.md");
    expect(found).toContain("agents/scout/AGENTS.md");
  });

  test("excludes files under a skipped directory at any depth", () => {
    // Regression: --skip-dirs was parsed and printed into the report header but never
    // reached this function, the only discovery path for the scanned set. The flag reported
    // success while changing nothing — a vendored upstream's own rule files kept being
    // scored as the auditing project's drift.
    const found = discoverRuleSurfaceFiles(
      fixture(),
      new Set(["vendor", "agents"]),
    ).map((f) => f.relativePath);

    expect(found).toContain("AGENTS.md");
    expect(found).toContain("packages/core/AGENTS.md");
    expect(found).not.toContain("vendor/openclaw/AGENTS.md");
    expect(found).not.toContain("agents/scout/AGENTS.md");
  });

  test("an empty skip set behaves like no skip set", () => {
    const root = fixture();
    expect(discoverRuleSurfaceFiles(root, new Set()).length).toBe(
      discoverRuleSurfaceFiles(root).length,
    );
  });

  test("matches whole path segments, not substrings", () => {
    const root = mkdtempSync(join(tmpdir(), "anvil-rule-surface-"));
    mkdirSync(join(root, "vendored-utils"), { recursive: true });
    writeFileSync(join(root, "vendored-utils", "AGENTS.md"), "# keep me\n");

    const found = discoverRuleSurfaceFiles(root, new Set(["vendor"])).map(
      (f) => f.relativePath,
    );
    expect(found).toContain("vendored-utils/AGENTS.md");
  });
});
