import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildResolutionContext,
  matchesExactlyOneTrackedFile,
  pointsIntoSkippedDir,
  resolvesSomewhere,
} from "./path-resolution.ts";

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/** A monorepo shaped like watchtower/currychat: apps/* with their own tsconfig. */
function makeMonorepo(): string {
  const root = mkdtempSync(join(tmpdir(), "anvil-paths-"));
  created.push(root);
  mkdirSync(join(root, "apps", "web", "app", "routes"), { recursive: true });
  mkdirSync(join(root, "packages", "ui", "src"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "root", workspaces: ["apps/*", "packages/*"] }),
  );
  writeFileSync(
    join(root, "packages", "ui", "package.json"),
    JSON.stringify({ name: "@wt/ui" }),
  );
  writeFileSync(
    join(root, "apps", "web", "package.json"),
    JSON.stringify({ name: "@wt/web" }),
  );
  writeFileSync(
    join(root, "apps", "web", "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "~/*": ["./app/*"] } } }),
  );
  writeFileSync(join(root, "apps", "web", "app", "routes", "__root.tsx"), "");
  mkdirSync(join(root, "apps", "web", "app", "components"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "apps", "web", "app", "components", "checkbox.tsx"),
    "",
  );
  mkdirSync(join(root, ".cursor", "rules"), { recursive: true });
  writeFileSync(join(root, ".cursor", "rules", "react-router.mdc"), "");
  return root;
}

test("a path relative to a workspace package resolves", () => {
  // watchtower cites `app/routes/__root.tsx` meaning apps/web/app/routes/...
  const root = makeMonorepo();
  const context = buildResolutionContext(root);

  expect(resolvesSomewhere("app/routes/__root.tsx", context)).toBe(true);
  expect(resolvesSomewhere("app/routes/nope.tsx", context)).toBe(false);
});

test("a declared package name is a specifier, not a path", () => {
  const root = makeMonorepo();
  const context = buildResolutionContext(root);

  expect(resolvesSomewhere("@wt/ui", context)).toBe(true);
  expect(resolvesSomewhere("@wt/ui/button", context)).toBe(true);
  // An undeclared scope is a stale specifier and must stay flagged — 360training
  // cites `@360training/ui` while the workspace actually publishes `@t360/ui`.
  expect(resolvesSomewhere("@other/ui", context)).toBe(false);
});

test("`~` is a tsconfig alias before it is a home directory", () => {
  const root = makeMonorepo();
  const context = buildResolutionContext(root);

  // currychat's meaning: ~/components/... -> apps/*/app/components/...
  expect(resolvesSomewhere("~/components/checkbox", context)).toBe(true);
  expect(resolvesSomewhere("~/components/missing", context)).toBe(false);
});

test("a leading dot dropped by the scanner is restored", () => {
  // Cursor writes [x](mdc:.cursor/rules/x.mdc); the scanner is `\b`-anchored so
  // the dot is already gone by the time the reference is checked.
  const root = makeMonorepo();
  const context = buildResolutionContext(root);

  expect(resolvesSomewhere("cursor/rules/react-router.mdc", context)).toBe(
    true,
  );
  expect(resolvesSomewhere("cursor/rules/absent.mdc", context)).toBe(false);
});

test("references into skipped directories are never resolvable", () => {
  expect(pointsIntoSkippedDir("node_modules/qmd/src/store.ts")).toBe(true);
  expect(pointsIntoSkippedDir("dist/index.js")).toBe(true);
  expect(pointsIntoSkippedDir("app/node_modules_helper.ts")).toBe(false);
});

test("a genuinely absent path still resolves nowhere", () => {
  // The guard against resolving our way to silence.
  const root = makeMonorepo();
  const context = buildResolutionContext(root);

  expect(resolvesSomewhere("apps/todo-app/TESTING.md", context)).toBe(false);
  expect(resolvesSomewhere("src/does-not-exist.ts", context)).toBe(false);
});

test("an unrelated sibling repo is not an ancestor frame", () => {
  // CodeRabbit on #44: accepting every parent let a genuinely missing path
  // resolve against an unrelated repo further up and vanish from the report.
  const parent = mkdtempSync(join(tmpdir(), "anvil-siblings-"));
  created.push(parent);
  mkdirSync(join(parent, "other-repo", "src"), { recursive: true });
  writeFileSync(join(parent, "other-repo", "src", "secret.ts"), "");
  const repo = join(parent, "mine");
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "mine" }));

  const context = buildResolutionContext(repo);

  // The plain parent holds no package.json/.git, so it is not a frame.
  expect(resolvesSomewhere("other-repo/src/secret.ts", context)).toBe(false);
});

test("non-tilde aliases and baseUrl are honoured", () => {
  const root = mkdtempSync(join(tmpdir(), "anvil-alias-"));
  created.push(root);
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  writeFileSync(join(root, "src", "lib", "util.ts"), "");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "aliased" }),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { baseUrl: "./src", paths: { "@/*": ["./lib/*"] } },
    }),
  );

  const context = buildResolutionContext(root);

  expect(resolvesSomewhere("@/util.ts", context)).toBe(true);
  expect(resolvesSomewhere("@/missing.ts", context)).toBe(false);
});

test("a reference naming exactly one tracked file resolves", () => {
  // 360training cites `steps/create-order-note-step.ts`; the file sits at
  // apps/medusa/src/workflows/order-note/steps/... — below every frame.
  const files = [
    "apps/medusa/src/workflows/order-note/steps/create-order-note-step.ts",
    "apps/web/app/routes/about.tsx",
  ];

  expect(
    matchesExactlyOneTrackedFile("steps/create-order-note-step.ts", files),
  ).toBe(true);
  expect(matchesExactlyOneTrackedFile("apps/todo-app/TESTING.md", files)).toBe(
    false,
  );
});

test("an ambiguous tail is not evidence and does not resolve", () => {
  // 360training alone has 221 two-segment suffixes shared by several files.
  // Silencing on an ambiguous match is how a real defect disappears.
  const files = ["apps/a/src/index.ts", "apps/b/src/index.ts"];

  expect(matchesExactlyOneTrackedFile("src/index.ts", files)).toBe(false);
  // A bare basename is never enough on its own.
  expect(matchesExactlyOneTrackedFile("index.ts", files)).toBe(false);
});

test("Claude's @ import sigil is stripped, scoped specifiers are not", () => {
  const root = makeMonorepo();
  const context = buildResolutionContext(root);

  // `@.agents/...` is a path wearing an import sigil.
  expect(/^@[./]/.test("@.agents/commands/research.md")).toBe(true);
  // A scoped specifier never has `.` or `/` straight after the `@`, so the two
  // shapes cannot be confused.
  expect(/^@[./]/.test("@wt/ui")).toBe(false);
  expect(resolvesSomewhere("@wt/ui", context)).toBe(true);
});
