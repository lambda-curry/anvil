import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, describe, afterAll } from "bun:test";

// Mock process.exit — converts to throwable error so we can catch it in tests
const originalExit = process.exit;
const originalArgv = process.argv;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalCwd = process.cwd();

const logs: string[] = [];
const errors: string[] = [];

function mockExit() {
  process.exit = ((code?: number | string | null) => {
    throw new Error(`__EXIT_${code ?? 1}__`);
  }) as typeof process.exit;
}

function restoreExit() {
  process.exit = originalExit;
}

function captureConsole() {
  logs.length = 0;
  errors.length = 0;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };
}

function restoreConsole() {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
}

function restoreAll() {
  restoreExit();
  restoreConsole();
  process.argv = originalArgv;
  process.chdir(originalCwd);
}

// Import after mocks are set up
import {
  DOCUMENTED_TEMPLATE_EXCLUSIONS,
  formatTemplateSkip,
  loadTemplateCatalog,
  main,
  matchesSignal,
  normalizeLoadingTier,
  parseTemplateContent,
} from "./bootstrap-generate.ts";
import type { StackSignals } from "./bootstrap-detect.ts";

const FIXTURES_DIR = resolve(import.meta.dir, "__fixtures__");
const SAMPLE_CLI = join(FIXTURES_DIR, "sample-cli-repo");

// ─── main() integration tests ──────────────────────────────────────────────

describe("bootstrap-generate main()", () => {
  afterAll(() => {
    restoreAll();
  });

  test("exits with code 1 when no arguments provided", async () => {
    mockExit();
    process.argv = ["node", "bootstrap-generate.ts"];
    captureConsole();

    try {
      await main();
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect((e as Error).message).toBe("__EXIT_1__");
      expect(errors.some((l) => l.includes("Usage:"))).toBe(true);
    } finally {
      restoreExit();
      restoreConsole();
      process.argv = originalArgv;
    }
  });

  test("exits with code 1 for non-existent project path", async () => {
    mockExit();
    process.argv = [
      "node",
      "bootstrap-generate.ts",
      "--target",
      "/nonexistent/path/does/not/exist",
    ];
    captureConsole();

    try {
      await main();
      expect(true).toBe(false);
    } catch (e) {
      expect((e as Error).message).toBe("__EXIT_1__");
      expect(errors.some((l) => l.includes("Project path not found"))).toBe(
        true,
      );
    } finally {
      restoreExit();
      restoreConsole();
      process.argv = originalArgv;
    }
  });

  test("exits with code 1 when --target has no value", async () => {
    mockExit();
    process.argv = ["node", "bootstrap-generate.ts", "--target"];
    captureConsole();

    try {
      await main();
      expect(true).toBe(false);
    } catch (e) {
      expect((e as Error).message).toBe("__EXIT_1__");
      expect(errors.some((l) => l.includes("--target requires"))).toBe(true);
    } finally {
      restoreExit();
      restoreConsole();
      process.argv = originalArgv;
    }
  });

  test("exits with code 1 on unknown argument", async () => {
    mockExit();
    process.argv = [
      "node",
      "bootstrap-generate.ts",
      "--target",
      "/tmp",
      "--bogus",
    ];
    captureConsole();

    try {
      await main();
      expect(true).toBe(false);
    } catch (e) {
      expect((e as Error).message).toBe("__EXIT_1__");
      expect(errors.some((l) => l.includes("Unknown argument: --bogus"))).toBe(
        true,
      );
    } finally {
      restoreExit();
      restoreConsole();
      process.argv = originalArgv;
    }
  });

  test("generates bootstrap draft for a real fixture project", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-bootstrap-cli-"));
    const outPath = join(tmp, "bootstrap-output.md");

    try {
      process.argv = [
        "node",
        "bootstrap-generate.ts",
        "--target",
        SAMPLE_CLI,
        "--output",
        outPath,
      ];
      captureConsole();

      await main();

      // Output file should exist and contain bootstrap content
      expect(existsSync(outPath)).toBe(true);
      const output = readFileSync(outPath, "utf8");
      expect(output).toContain("DRAFT");
      expect(output.length).toBeGreaterThan(100);

      // Console output should report what happened
      expect(logs.some((l) => l.includes("Bootstrap draft written:"))).toBe(
        true,
      );
      expect(logs.some((l) => l.includes("Rules generated:"))).toBe(true);
    } finally {
      restoreConsole();
      process.argv = originalArgv;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("accepts positional project path argument", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-bootstrap-pos-"));
    const outPath = join(tmp, "positional-output.md");

    try {
      process.argv = [
        "node",
        "bootstrap-generate.ts",
        SAMPLE_CLI,
        "--output",
        outPath,
      ];
      captureConsole();

      await main();

      expect(existsSync(outPath)).toBe(true);
      expect(logs.some((l) => l.includes("Bootstrap draft written:"))).toBe(
        true,
      );
    } finally {
      restoreConsole();
      process.argv = originalArgv;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("writes to default docs/audits/ path when --output omitted", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-bootstrap-default-"));

    try {
      // Create a realistic project structure for detectStack
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "default-output-project",
          version: "1.0.0",
          scripts: {
            build: "tsc",
            test: "vitest",
            lint: "biome check .",
            typecheck: "tsc --noEmit",
          },
          devDependencies: {
            typescript: "^5.7.0",
            vitest: "^2.1.0",
          },
        }),
      );
      writeFileSync(
        join(tmp, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022", strict: true },
        }),
      );

      // Change cwd so default output lands in the temp dir
      process.chdir(tmp);

      process.argv = ["node", "bootstrap-generate.ts", "--target", tmp];
      captureConsole();

      await main();

      // Default path is docs/audits/<name>-bootstrap-<date>.md under cwd
      const expectedDir = join(tmp, "docs", "audits");
      expect(existsSync(expectedDir)).toBe(true);

      const files = readdirSync(expectedDir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/-bootstrap-\d{4}-\d{2}-\d{2}\.md/);
    } finally {
      restoreConsole();
      process.argv = originalArgv;
      process.chdir(originalCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("detects and warns about stub scripts in minimal project", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-bootstrap-stub-"));

    try {
      // Minimal project with stub scripts that detectStack can handle
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "stub-project",
          version: "0.0.1",
          scripts: {
            build: "echo 'TODO: wire build'",
            test: "echo 'TODO: wire test'",
          },
        }),
      );
      writeFileSync(
        join(tmp, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022" },
        }),
      );

      const outPath = join(tmp, "stub-output.md");
      process.argv = [
        "node",
        "bootstrap-generate.ts",
        "--target",
        tmp,
        "--output",
        outPath,
      ];
      captureConsole();

      await main();

      // Should detect stub scripts and warn
      expect(logs.some((l) => l.includes("Stub scripts detected:"))).toBe(true);
      expect(logs.some((l) => l.includes("Re-run bootstrap"))).toBe(true);
    } finally {
      restoreConsole();
      process.argv = originalArgv;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("does not warn about stubs when project has real scripts", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-bootstrap-nostub-"));

    try {
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "real-scripts-project",
          version: "1.0.0",
          scripts: {
            build: "tsc",
            test: "vitest",
            lint: "biome check .",
            typecheck: "tsc --noEmit",
          },
          devDependencies: {
            typescript: "^5.7.0",
            vitest: "^2.1.0",
          },
        }),
      );
      writeFileSync(
        join(tmp, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022", strict: true },
        }),
      );

      const outPath = join(tmp, "no-stub-output.md");
      process.argv = [
        "node",
        "bootstrap-generate.ts",
        "--target",
        tmp,
        "--output",
        outPath,
      ];
      captureConsole();

      await main();

      // Should NOT have stub warning since scripts are real
      expect(logs.some((l) => l.includes("Stub scripts detected:"))).toBe(
        false,
      );
    } finally {
      restoreConsole();
      process.argv = originalArgv;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("detects stubs in workspace sub-packages", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "anvil-bootstrap-ws-"));

    try {
      // Root package with real scripts but minimal deps
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          version: "1.0.0",
          scripts: {
            build: "tsc",
          },
        }),
      );
      writeFileSync(
        join(tmp, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022" },
        }),
      );

      // Workspace sub-package with stub
      const pkgDir = join(tmp, "packages", "widget");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "package.json"),
        JSON.stringify({
          name: "@monorepo/widget",
          version: "0.0.1",
          scripts: {
            test: "echo 'TODO: write tests'",
          },
        }),
      );

      const outPath = join(tmp, "workspace-output.md");
      process.argv = [
        "node",
        "bootstrap-generate.ts",
        "--target",
        tmp,
        "--output",
        outPath,
      ];
      captureConsole();

      await main();

      // Should detect the stub in the sub-package
      expect(logs.some((l) => l.includes("Stub scripts detected:"))).toBe(true);
    } finally {
      restoreConsole();
      process.argv = originalArgv;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

function emptySignals(): StackSignals {
  return {
    projectName: "empty",
    projectPath: "/tmp/empty",
    packageManager: "npm",
    runtime: "node",
    framework: "none",
    frameworkVersion: null,
    routerType: "unknown",
    ui: [],
    styling: [],
    orm: null,
    validation: [],
    testing: null,
    typescript: { present: false, strict: false, paths: false, esm: false },
    configFiles: [],
    dirPatterns: [],
    scripts: {},
    dependencies: [],
    devDependencies: [],
  };
}

describe("bootstrap template inventory and vocabulary", () => {
  test("loads all 18 templates or only documented exclusions", () => {
    const catalog = loadTemplateCatalog();
    const loadedIds = catalog.templates.map((template) => template.id).sort();
    const skippedFiles = catalog.skipped.map((issue) => issue.file).sort();
    const documented = DOCUMENTED_TEMPLATE_EXCLUSIONS.map(
      (entry) => entry.file,
    ).sort();

    expect(loadedIds.length + skippedFiles.length).toBe(18);
    expect(skippedFiles).toEqual(documented);
    expect(loadedIds).toContain("scope-boundaries");
    expect(loadedIds).toContain("performance-measure-before-optimize");
  });

  test("onDemand alias is on-demand, never alwaysApply", () => {
    expect(normalizeLoadingTier("onDemand")).toBe("on-demand");
    expect(normalizeLoadingTier("on-demand")).toBe("on-demand");
    expect(normalizeLoadingTier("glob-matched")).toBe("glob");
    expect(normalizeLoadingTier("mystery-tier")).toBeNull();

    const parsed = parseTemplateContent(
      "performance-measure-before-optimize.md",
      [
        "# Performance work must start with measurement",
        "",
        "*Signal: general · Tier: onDemand · Glob: —*",
        "",
        "## Why (Failure Mode)",
        "",
        "Measure first.",
        "",
        "## The Rule",
        "",
        "Do not optimize from vibes.",
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.template.tier).toBe("on-demand");
      expect(parsed.template.signal).toBe("general");
    }
  });

  test("unknown tier and missing signal produce named diagnostics", () => {
    const unknownTier = parseTemplateContent(
      "mystery.md",
      ["# Mystery", "", "*Signal: general · Tier: nightly · Glob: —*"].join(
        "\n",
      ),
    );
    expect(unknownTier.ok).toBe(false);
    if (!unknownTier.ok) {
      expect(formatTemplateSkip(unknownTier.issue)).toBe(
        "mystery.md: unknown Tier: nightly",
      );
    }

    const missingSignal = parseTemplateContent(
      "scope-boundaries.md",
      ["# Scope", "", "*Last validated: 2026-05-27*"].join("\n"),
    );
    expect(missingSignal.ok).toBe(false);
    if (!missingSignal.ok) {
      expect(formatTemplateSkip(missingSignal.issue)).toBe(
        "scope-boundaries.md: missing or invalid field: Signal",
      );
    }

    const unknownSignal = parseTemplateContent(
      "odd.md",
      ["# Odd", "", "*Signal: mystery · Tier: alwaysApply · Glob: —*"].join(
        "\n",
      ),
    );
    expect(unknownSignal.ok).toBe(false);
    if (!unknownSignal.ok) {
      expect(formatTemplateSkip(unknownSignal.issue)).toBe(
        "odd.md: unknown Signal: mystery",
      );
    }
  });

  test("general is an explicit match-all signal", () => {
    const template = {
      id: "security-patterns",
      title: "Security",
      signal: "general",
      failureMode: "x",
      rule: "y",
      tier: "alwaysApply" as const,
    };
    expect(matchesSignal(template, emptySignals())).toBe(true);
  });
});
