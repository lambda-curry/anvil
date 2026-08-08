import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  buildRuleInventory,
  discoverRuleFiles,
  isVendoredPath,
  parseArgs,
  rulesyncGeneratesInstructionPair,
} from "./audit.ts";

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

describe("nested AGENTS.md/CLAUDE.md mirror families", () => {
  test("a pair in the same directory is one family at any depth", () => {
    // Regression: the descriptor matched only the exact root paths, so every nested pair fell
    // through to "accidental duplicate" and the report recommended deleting one side — which
    // makes that directory invisible to whichever tool reads the deleted name.
    const root = mkdtempSync(join(tmpdir(), "anvil-mirror-depth-"));
    // Each directory has its own content; the pair inside a directory is identical, which is
    // what a symlinked AGENTS.md/CLAUDE.md looks like on disk.
    const rootBody = "# Root rules\n\nProse for the repository root surface.\n";
    const pkgBody =
      "# Core package rules\n\nProse specific to the core package.\n";
    writeFileSync(join(root, "AGENTS.md"), rootBody);
    writeFileSync(join(root, "CLAUDE.md"), rootBody);
    mkdirSync(join(root, "packages/core"), { recursive: true });
    writeFileSync(join(root, "packages/core/AGENTS.md"), pkgBody);
    writeFileSync(join(root, "packages/core/CLAUDE.md"), pkgBody);

    const files = discoverRuleFiles(root);
    const inventory = buildRuleInventory(files, {
      present: false,
      sources: [],
    });

    const accidentalPaths = inventory.accidentalDuplicateGroups.flatMap(
      (g) => g.memberPaths,
    );
    expect(accidentalPaths).not.toContain("packages/core/CLAUDE.md");
    expect(accidentalPaths).not.toContain("CLAUDE.md");
  });
});

describe("rulesyncGeneratesInstructionPair", () => {
  test("detects a config that targets both surfaces, in either shape", () => {
    const objectForm = mkdtempSync(join(tmpdir(), "anvil-rs-obj-"));
    writeFileSync(
      join(objectForm, "rulesync.jsonc"),
      '{\n  // comment tolerated\n  "targets": { "agentsmd": ["rules"], "claudecode": ["rules"] }\n}\n',
    );
    expect(rulesyncGeneratesInstructionPair(objectForm)).toBe(true);

    const arrayForm = mkdtempSync(join(tmpdir(), "anvil-rs-arr-"));
    writeFileSync(
      join(arrayForm, "rulesync.jsonc"),
      '{ "targets": ["agentsmd", "claudecode", "cursor"] }\n',
    );
    expect(rulesyncGeneratesInstructionPair(arrayForm)).toBe(true);
  });

  test("is false when only one surface is generated", () => {
    // 360training targets claudecode + cursor only, so its AGENTS.md is hand-written and a
    // difference between the two files is real drift rather than generator output.
    const root = mkdtempSync(join(tmpdir(), "anvil-rs-one-"));
    writeFileSync(
      join(root, "rulesync.jsonc"),
      '{ "targets": ["claudecode", "cursor"] }\n',
    );
    expect(rulesyncGeneratesInstructionPair(root)).toBe(false);
  });

  test("is false with no config, and survives an unparseable one", () => {
    expect(
      rulesyncGeneratesInstructionPair(
        mkdtempSync(join(tmpdir(), "anvil-rs-none-")),
      ),
    ).toBe(false);

    const broken = mkdtempSync(join(tmpdir(), "anvil-rs-bad-"));
    writeFileSync(join(broken, "rulesync.json"), "{ not json");
    expect(rulesyncGeneratesInstructionPair(broken)).toBe(false);
  });
});

describe("shim mirrors", () => {
  test("a CLAUDE.md that imports AGENTS.md is healthy, not drifted", () => {
    // The shim is the sanctioned alternative to a symlink: it lets Claude carry extras Codex
    // must not receive, so the two files differ on purpose. Reporting that as drift asks the
    // maintainer to repair a working cross-tool contract (robinhood-trader: 10 vs 291 lines).
    const root = mkdtempSync(join(tmpdir(), "anvil-shim-"));
    writeFileSync(
      join(root, "AGENTS.md"),
      "# Rules\n\nLong canonical prose for the repository.\n",
    );
    writeFileSync(
      join(root, "CLAUDE.md"),
      "@AGENTS.md\n\nRead AGENTS.md first; it is canonical for this repo.\n",
    );

    const inventory = buildRuleInventory(
      discoverRuleFiles(root),
      { hasConfig: false, agents: [], generatesInstructionPair: false },
      root,
    );
    expect(inventory.mirrorDriftedCount).toBe(0);
  });

  test("two unrelated files with no import are still drift", () => {
    const root = mkdtempSync(join(tmpdir(), "anvil-shim-neg-"));
    writeFileSync(
      join(root, "AGENTS.md"),
      "# Rules\n\nCanonical prose here.\n",
    );
    writeFileSync(
      join(root, "CLAUDE.md"),
      "# Other\n\nCompletely different guidance.\n",
    );

    const inventory = buildRuleInventory(
      discoverRuleFiles(root),
      { hasConfig: false, agents: [], generatesInstructionPair: false },
      root,
    );
    expect(inventory.mirrorDriftedCount).toBe(1);
  });
});
