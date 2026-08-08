import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
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
    const found = discoverRuleSurfaceFiles(fixture()).map(
      (f) => f.relativePath,
    );
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

describe("symlink aliases", () => {
  test("marks a CLAUDE.md symlinked to its AGENTS.md, without dropping it", () => {
    // Both names must stay discoverable so mirror-family detection can see the pair, but
    // per-file scanners must be able to skip one: they are physically the same file, and
    // scanning both counted saffron's references twice (drift 205 -> 230 from pairing alone).
    const root = mkdtempSync(join(tmpdir(), "anvil-alias-"));
    writeFileSync(join(root, "AGENTS.md"), "# rules\n");
    symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));

    const found = discoverRuleSurfaceFiles(root);
    const agents = found.find((f) => f.relativePath === "AGENTS.md");
    const claude = found.find((f) => f.relativePath === "CLAUDE.md");

    expect(agents?.isSymlinkAlias).toBeUndefined();
    expect(claude?.isSymlinkAlias).toBe(true);
  });

  test("does not mark a real file that merely shares content", () => {
    const root = mkdtempSync(join(tmpdir(), "anvil-alias-"));
    writeFileSync(join(root, "AGENTS.md"), "# rules\n");
    writeFileSync(join(root, "CLAUDE.md"), "# rules\n");

    for (const file of discoverRuleSurfaceFiles(root)) {
      expect(file.isSymlinkAlias).toBeUndefined();
    }
  });
});
