import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { discoverRuleFiles, isVendoredPath, parseArgs } from "./audit.ts";

describe("audit --skip-dirs", () => {
  test("parses a comma-separated list", () => {
    const args = parseArgs([
      "bun",
      "audit",
      "--target",
      "/tmp/x",
      "--skip-dirs",
      "vendor, agents ,node_modules",
    ]);
    expect(args.skipDirs).toEqual(["vendor", "agents", "node_modules"]);
  });

  test("defaults to an empty list", () => {
    expect(parseArgs(["bun", "audit", "--target", "/tmp/x"]).skipDirs).toEqual(
      [],
    );
  });

  test("excludes skipped directories from the scanned rule surface", () => {
    // `drift` has had --skip-dirs for a while; `audit` had none, so a repo-of-clones could not
    // be scoped and scored vendored upstreams and agent personas as its own surface.
    const root = mkdtempSync(join(tmpdir(), "anvil-audit-scope-"));
    writeFileSync(join(root, "AGENTS.md"), "# root\n\nSome rule prose.\n");
    for (const dir of ["vendor/upstream", "packages/core"]) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, "AGENTS.md"), `# ${dir}\n\nProse.\n`);
    }

    const unscoped = discoverRuleFiles(root).map((f) => f.relativePath);
    expect(unscoped).toContain("vendor/upstream/AGENTS.md");

    const scoped = discoverRuleFiles(root, new Set(["vendor"])).map(
      (f) => f.relativePath,
    );
    expect(scoped).toContain("AGENTS.md");
    expect(scoped).toContain("packages/core/AGENTS.md");
    expect(scoped).not.toContain("vendor/upstream/AGENTS.md");
  });
});

describe("isVendoredPath", () => {
  test("recognizes trees whose contents this project did not author", () => {
    // These duplicates travel with vendored material; deleting one side would diverge the
    // vendored tree from its source, so they are not the project's own duplication to fix.
    expect(
      isVendoredPath(
        "vendor/openclaw/deploy/currybot/currybot-workspace/AGENTS.md",
      ),
    ).toBe(true);
    expect(
      isVendoredPath("projects/atlas/.devagent/plugins/ralph/AGENTS.md"),
    ).toBe(true);
    expect(
      isVendoredPath("projects/forge/generated-workspaces/x/AGENTS.md"),
    ).toBe(true);
  });

  test("does not claim the project's own files", () => {
    expect(isVendoredPath("AGENTS.md")).toBe(false);
    expect(isVendoredPath("packages/core/AGENTS.md")).toBe(false);
    expect(isVendoredPath("docs/getting-started.md")).toBe(false);
  });

  test("matches whole path segments, not substrings", () => {
    expect(isVendoredPath("vendored-utils/AGENTS.md")).toBe(false);
    expect(isVendoredPath("deployment-notes/AGENTS.md")).toBe(false);
  });
});
