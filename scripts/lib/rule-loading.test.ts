import { expect, test } from "bun:test";

import {
  classifyLoadTier,
  frontmatter,
  hasPathScopedFrontmatter,
  importsRootMirror,
  summarizeLoad,
} from "./rule-loading.ts";

const PATHS_SCOPED = `---
paths:
  - apps/web/**/*
---
# AGENTS.md

Web app rules.
`;

const ALWAYS_APPLY = `---
alwaysApply: true
globs: apps/**
---
# Always resident
`;

function file(
  relativePath: string,
  sizeLines: number,
  content = "",
  overrides: { hasAlwaysApply?: boolean; hasGlob?: boolean } = {},
) {
  return {
    relativePath,
    sizeLines,
    hasAlwaysApply: overrides.hasAlwaysApply ?? false,
    hasGlob: overrides.hasGlob ?? false,
    content,
  };
}

test("`paths:` frontmatter marks a rule path-scoped", () => {
  // The exact shape budgets uses. The pre-existing hasGlob detection missed it:
  // "paths" is not in its key list, and its bare-glob fallback requires a file
  // extension, so `apps/web/**/*` never matched.
  expect(hasPathScopedFrontmatter(PATHS_SCOPED)).toBe(true);
  expect(
    classifyLoadTier(file(".claude/rules/apps-web.md", 232, PATHS_SCOPED)),
  ).toBe("path-scoped");
});

test("alwaysApply beats a glob sitting next to it", () => {
  expect(hasPathScopedFrontmatter(ALWAYS_APPLY)).toBe(false);
  expect(
    classifyLoadTier(
      file(".cursor/rules/x.mdc", 40, ALWAYS_APPLY, { hasAlwaysApply: true }),
    ),
  ).toBe("always-on");
});

test("a nested instruction file is chain-loaded, a root one is not", () => {
  expect(classifyLoadTier(file("apps/web/AGENTS.md", 228))).toBe(
    "chain-loaded",
  );
  expect(classifyLoadTier(file("apps/server/CLAUDE.md", 112))).toBe(
    "chain-loaded",
  );
  expect(classifyLoadTier(file("AGENTS.md", 208))).toBe("always-on");
  expect(classifyLoadTier(file("CLAUDE.md", 196))).toBe("always-on");
});

test("a rule with no scope and no nesting stays always-on", () => {
  expect(
    classifyLoadTier(file(".claude/rules/global.md", 30, "# Global\n")),
  ).toBe("always-on");
});

test("empty or malformed frontmatter is not a scope", () => {
  expect(frontmatter("# No frontmatter\n")).toBeNull();
  expect(frontmatter("---\nunterminated\n")).toBeNull();
  expect(hasPathScopedFrontmatter("---\npaths:\n---\n# x\n")).toBe(false);
  expect(hasPathScopedFrontmatter("---\ndescription: hi\n---\n# x\n")).toBe(
    false,
  );
});

test("inline glob values count as a scope", () => {
  expect(hasPathScopedFrontmatter("---\nglobs: apps/**\n---\n")).toBe(true);
  expect(hasPathScopedFrontmatter("---\nfileMatching: src/*.ts\n---\n")).toBe(
    true,
  );
});

test("a generated AGENTS/CLAUDE twin is counted once, at its heavier side", () => {
  // Codex reads one, Claude Code reads the other; no single session loads both.
  const load = summarizeLoad([
    { relativePath: "AGENTS.md", sizeLines: 209, loadTier: "always-on" },
    { relativePath: "CLAUDE.md", sizeLines: 197, loadTier: "always-on" },
  ]);

  expect(load.alwaysOnLines).toBe(209);
  expect(load.mirrorDedupedLines).toBe(197);
});

test("a lone root file is not deduped", () => {
  const load = summarizeLoad([
    { relativePath: "AGENTS.md", sizeLines: 62, loadTier: "always-on" },
  ]);

  expect(load.alwaysOnLines).toBe(62);
  expect(load.mirrorDedupedLines).toBe(0);
});

test("the budgets shape: only the root file counts as always-on", () => {
  const load = summarizeLoad([
    { relativePath: "AGENTS.md", sizeLines: 209, loadTier: "always-on" },
    { relativePath: "CLAUDE.md", sizeLines: 197, loadTier: "always-on" },
    {
      relativePath: "apps/server/AGENTS.md",
      sizeLines: 113,
      loadTier: "chain-loaded",
    },
    {
      relativePath: "apps/web/AGENTS.md",
      sizeLines: 229,
      loadTier: "chain-loaded",
    },
    {
      relativePath: ".claude/rules/apps-server.md",
      sizeLines: 117,
      loadTier: "path-scoped",
    },
    {
      relativePath: ".claude/rules/apps-web.md",
      sizeLines: 233,
      loadTier: "path-scoped",
    },
  ]);

  expect(load.alwaysOnLines).toBe(209);
  expect(load.chainLoadedLines).toBe(342);
  expect(load.pathScopedLines).toBe(350);
  // Every line is accounted for — nothing is silently dropped.
  expect(
    load.alwaysOnLines +
      load.chainLoadedLines +
      load.pathScopedLines +
      load.mirrorDedupedLines,
  ).toBe(1098);
});

test("an @AGENTS.md shim adds to the load rather than replacing the twin", () => {
  // robinhood-trader's shape. A shim is the sanctioned alternative to a symlink
  // and is additive: Claude loads the shim AND the file it imports, so treating
  // it as a twin and taking max() would undercount the session.
  const load = summarizeLoad([
    { relativePath: "AGENTS.md", sizeLines: 332, loadTier: "always-on" },
    {
      relativePath: "CLAUDE.md",
      sizeLines: 11,
      loadTier: "always-on",
      importsRootMirror: true,
    },
  ]);

  expect(load.alwaysOnLines).toBe(343);
  expect(load.mirrorDedupedLines).toBe(0);
});

test("importsRootMirror recognizes the shim body only", () => {
  expect(
    importsRootMirror("@AGENTS.md\n@data-model.md\n\nRead AGENTS.md first.\n"),
  ).toBe(true);
  expect(importsRootMirror("# Rules\n\nSee AGENTS.md for details.\n")).toBe(
    false,
  );
});

test("a repo that dumps everything into root still scores full load", () => {
  // The guard against 'the fix is just a smaller number'.
  const load = summarizeLoad([
    { relativePath: "AGENTS.md", sizeLines: 900, loadTier: "always-on" },
    {
      relativePath: ".claude/rules/everything.md",
      sizeLines: 400,
      loadTier: "always-on",
    },
  ]);

  expect(load.alwaysOnLines).toBe(1300);
  expect(load.chainLoadedLines).toBe(0);
});
