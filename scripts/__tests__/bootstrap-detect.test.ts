import { expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { detectStack } from "../bootstrap-detect.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

const SCRIPT = resolve(import.meta.dir, "..", "bootstrap-detect.ts");

function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "anvil-bootstrap-"));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath);
    const parent = fullPath.slice(0, fullPath.lastIndexOf("/"));
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
    writeFileSync(fullPath, content, "utf8");
  }
  return dir;
}

function makePackageJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: "test-project",
    ...overrides,
  });
}

// ─── Framework detection ────────────────────────────────────────────────────

test("detectStack identifies Next.js with app router", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: { next: "^15.0.0", react: "^19.0.0" },
    }),
    "src/app/layout.tsx": "export default function() {}",
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.framework).toBe("nextjs");
    expect(stack.frameworkVersion).toBe("15");
    expect(stack.routerType).toBe("app");
    expect(stack.ui).toContain("react");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies Next.js with pages router", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: { next: "^14.2.0", react: "^18.0.0" },
    }),
    "pages/index.tsx": "export default function() {}",
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.framework).toBe("nextjs");
    expect(stack.routerType).toBe("pages");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies Next.js with unknown router", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: { next: "^14.0.0" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.framework).toBe("nextjs");
    expect(stack.routerType).toBe("unknown");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies Remix", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: {
        "@remix-run/node": "^2.0.0",
        "@remix-run/react": "^2.0.0",
      },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.framework).toBe("remix");
    expect(stack.frameworkVersion).toBe("2");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies Vite (devDep)", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      devDependencies: { vite: "^5.0.0" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.framework).toBe("vite");
    expect(stack.frameworkVersion).toBe("5");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies Express", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: { express: "^4.18.0" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.framework).toBe("express");
    expect(stack.frameworkVersion).toBe("4");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies Fastify", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: { fastify: "^4.26.0" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.framework).toBe("fastify");
    expect(stack.frameworkVersion).toBe("4");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Package manager detection ──────────────────────────────────────────────

test("detectStack detects pnpm via lockfile", async () => {
  const dir = makeProject({
    "package.json": makePackageJson(),
    "pnpm-lock.yaml": "lockfileVersion: '6.0'",
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.packageManager).toBe("pnpm");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack detects yarn via lockfile", async () => {
  const dir = makeProject({
    "package.json": makePackageJson(),
    "yarn.lock": "# yarn lockfile v1",
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.packageManager).toBe("yarn");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack detects npm fallback", async () => {
  const dir = makeProject({
    "package.json": makePackageJson(),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.packageManager).toBe("npm");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack detects bun via packageManager field", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({ packageManager: "bun@1.1.0" }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.packageManager).toBe("bun");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack detects pnpm via packageManager field", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({ packageManager: "pnpm@9.0.0" }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.packageManager).toBe("pnpm");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack detects yarn via packageManager field", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({ packageManager: "yarn@4.0.0" }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.packageManager).toBe("yarn");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Runtime detection ──────────────────────────────────────────────────────

test("detectStack detects bun runtime via @types/bun devDep", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      devDependencies: { "@types/bun": "latest" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.runtime).toBe("bun");
    // Without bun lockfile, pm should be npm
    expect(stack.packageManager).toBe("npm");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Testing framework detection ────────────────────────────────────────────

test("detectStack identifies jest", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      devDependencies: { jest: "^29.0.0" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.testing).toBe("jest");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies mocha", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      devDependencies: { mocha: "^10.0.0" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.testing).toBe("mocha");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies playwright", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      devDependencies: { "@playwright/test": "^1.40.0" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.testing).toBe("playwright");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies cypress", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      devDependencies: { cypress: "^13.0.0" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.testing).toBe("cypress");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── TypeScript detection ───────────────────────────────────────────────────

test("detectStack handles missing tsconfig", async () => {
  const dir = makeProject({
    "package.json": makePackageJson(),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.typescript.present).toBe(false);
    expect(stack.typescript.strict).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Error paths ────────────────────────────────────────────────────────────

test("detectStack throws on non-existent path", async () => {
  await expect(
    detectStack("/nonexistent/path/that/should/not/exist"),
  ).rejects.toThrow("Project path not found");
});

test("detectStack throws when path is a file, not a directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-bootstrap-file-"));
  const filePath = join(dir, "not-a-dir.txt");
  writeFileSync(filePath, "hello", "utf8");
  try {
    await expect(detectStack(filePath)).rejects.toThrow("Not a directory");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Script variant detection ───────────────────────────────────────────────

test("detectStack captures test: and lint: script variants", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      scripts: {
        build: "bun run build",
        "test:unit": "bun test",
        "test:e2e": "playwright test",
        "lint:css": "stylelint",
        "lint:ts": "oxlint",
      },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.scripts["build"]).toBe("bun run build");
    expect(stack.scripts["test:unit"]).toBe("bun test");
    expect(stack.scripts["test:e2e"]).toBe("playwright test");
    expect(stack.scripts["lint:css"]).toBe("stylelint");
    expect(stack.scripts["lint:ts"]).toBe("oxlint");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Config file and dir pattern detection ──────────────────────────────────

test("detectStack detects multiple config files", async () => {
  const dir = makeProject({
    "package.json": makePackageJson(),
    "tailwind.config.ts": "export default {}",
    "biome.json": "{}",
    ".env.example": "FOO=bar",
    "eslint.config.js": "export default {}",
    "vite.config.ts": "export default {}",
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.configFiles).toContain("tailwind.config.ts");
    expect(stack.configFiles).toContain("biome.json");
    expect(stack.configFiles).toContain(".env.example");
    expect(stack.configFiles).toContain("eslint.config.js");
    expect(stack.configFiles).toContain("vite.config.ts");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack detects directory patterns", async () => {
  const dir = makeProject({
    "package.json": makePackageJson(),
    "src/components/Button.tsx": "export {}",
    "src/lib/utils.ts": "export {}",
    "src/hooks/useThing.ts": "export {}",
    "public/favicon.ico": "",
    "__tests__/index.test.ts": "export {}",
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.dirPatterns).toContain("src/components/");
    expect(stack.dirPatterns).toContain("src/lib/");
    expect(stack.dirPatterns).toContain("src/hooks/");
    expect(stack.dirPatterns).toContain("public/");
    expect(stack.dirPatterns).toContain("__tests__/");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── CLI subprocess tests ───────────────────────────────────────────────────

test("CLI outputs JSON with --json flag", () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: { express: "^4.0.0" },
    }),
  });
  try {
    const result = spawnSync("bun", ["run", SCRIPT, dir, "--json"], {
      encoding: "utf8",
      timeout: 15000,
    });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.framework).toBe("express");
    // projectName is derived from the directory basename, not package.json name
    expect(parsed.projectName).toMatch(/^anvil-bootstrap-/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI outputs pretty JSON by default", () => {
  const dir = makeProject({
    "package.json": makePackageJson(),
  });
  try {
    const result = spawnSync("bun", ["run", SCRIPT, dir], {
      encoding: "utf8",
      timeout: 15000,
    });
    expect(result.status).toBe(0);
    // Pretty JSON has newlines and indentation
    expect(result.stdout).toContain('  "');
    expect(result.stdout).toContain("\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI exits 1 for non-existent path", () => {
  const result = spawnSync(
    "bun",
    ["run", SCRIPT, "/nonexistent/path/from/cli/test"],
    {
      encoding: "utf8",
      timeout: 15000,
    },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Project path not found");
});

test("CLI exits 1 when no path argument provided", () => {
  const result = spawnSync("bun", ["run", SCRIPT], {
    encoding: "utf8",
    timeout: 15000,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Usage:");
});

// ─── Malformed package.json ─────────────────────────────────────────────────

test("detectStack handles malformed package.json gracefully", async () => {
  const dir = makeProject({
    "package.json": "{ not valid json }",
  });
  try {
    const stack = await detectStack(dir);
    // Should fall back to defaults
    expect(stack.dependencies).toEqual([]);
    expect(stack.devDependencies).toEqual([]);
    expect(stack.framework).toBe("none");
    expect(stack.packageManager).toBe("npm");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── UI library detection ───────────────────────────────────────────────────

test("detectStack identifies vue, svelte, solid, preact", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: {
        vue: "^3.0.0",
        svelte: "^4.0.0",
        "solid-js": "^1.8.0",
        preact: "^10.0.0",
      },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.ui).toContain("vue");
    expect(stack.ui).toContain("svelte");
    expect(stack.ui).toContain("solid");
    expect(stack.ui).toContain("preact");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── ORM detection ──────────────────────────────────────────────────────────

test("detectStack identifies prisma, drizzle, typeorm, sequelize, mongoose, knex, mikro-orm", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: {
        "@prisma/client": "^5.0.0",
        "drizzle-orm": "^0.30.0",
        typeorm: "^0.3.0",
        sequelize: "^6.0.0",
        mongoose: "^8.0.0",
        knex: "^3.0.0",
        "mikro-orm": "^6.0.0",
      },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.orm).toBe("prisma");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies drizzle when prisma absent", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: { "drizzle-orm": "^0.30.0" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.orm).toBe("drizzle");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStack identifies mikro-orm via @mikro-orm/ prefix", async () => {
  const dir = makeProject({
    "package.json": makePackageJson({
      dependencies: { "@mikro-orm/core": "^6.0.0" },
    }),
  });
  try {
    const stack = await detectStack(dir);
    expect(stack.orm).toBe("mikro-orm");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
