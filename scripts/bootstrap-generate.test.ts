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
import { main } from "./bootstrap-generate.ts";

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
