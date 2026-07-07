#!/usr/bin/env bun
/**
 * bootstrap-detect.ts — Stack Signal Reader (Phase 1a)
 *
 * Reads a project directory and outputs a structured JSON object of
 * detected stack signals: runtime, framework, ORM, testing, TypeScript
 * config, package manager, config files, directory patterns, and scripts.
 *
 * Usage:
 *   bun run scripts/bootstrap-detect.ts <project-path> [--json] [--pretty]
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";
export type RouterType = "app" | "pages" | "unknown";

export type StackSignals = {
  projectName: string;
  projectPath: string;
  packageManager: PackageManager;
  runtime: "bun" | "node" | "unknown";
  framework:
    | "nextjs"
    | "remix"
    | "vite"
    | "express"
    | "fastify"
    | "none"
    | "unknown";
  frameworkVersion: string | null;
  routerType: RouterType;
  ui: string[]; // react, vue, svelte, etc.
  styling: string[]; // tailwind, css-modules, styled-components, etc.
  orm: string | null; // prisma, drizzle, typeorm, etc.
  validation: string[]; // zod, yup, joi, etc.
  testing: string | null; // vitest, jest, playwright, etc.
  typescript: {
    present: boolean;
    strict: boolean;
    paths: boolean;
    esm: boolean;
  };
  configFiles: string[]; // tailwind.config.*, biome.json, docker-compose.yml, etc.
  dirPatterns: string[]; // src/components, src/app, pages/, __tests__, etc.
  scripts: Record<string, string>; // build, test, typecheck, dev, etc.
  dependencies: string[]; // all dep names
  devDependencies: string[];
};

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const projectPath = argv[2];
  const pretty = argv.includes("--pretty");
  const jsonOnly = argv.includes("--json");

  if (!projectPath) {
    console.error(
      "Usage: bun run scripts/bootstrap-detect.ts <project-path> [--json] [--pretty]",
    );
    process.exit(1);
  }
  return { projectPath, pretty, jsonOnly };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJson<T>(path: string): T | null {
  try {
    const text = readFileSync(path, "utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function hasDep(
  deps: Record<string, string> | undefined,
  name: string,
): boolean {
  return !!deps?.[name];
}

function hasDepPrefix(
  deps: Record<string, string> | undefined,
  prefix: string,
): boolean {
  return Object.keys(deps ?? {}).some((k) => k.startsWith(prefix));
}

function getVersion(
  deps: Record<string, string> | undefined,
  name: string,
): string | null {
  const v = deps?.[name];
  if (!v) return null;
  return v.replace(/^[\^~>=<]/, "").split(".")[0] ?? null;
}

function dirExists(root: string, rel: string): boolean {
  const p = join(root, rel);
  return existsSync(p) && statSync(p).isDirectory();
}

function fileExists(root: string, rel: string): boolean {
  return existsSync(join(root, rel));
}

function listTopLevel(root: string): string[] {
  try {
    return readdirSync(root);
  } catch {
    return [];
  }
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function detectPackageManager(
  root: string,
  pkg: Record<string, unknown>,
): PackageManager {
  if (fileExists(root, "bun.lockb") || fileExists(root, "bun.lock"))
    return "bun";
  if (fileExists(root, "pnpm-lock.yaml")) return "pnpm";
  if (fileExists(root, "yarn.lock")) return "yarn";
  // check packageManager field
  const pm = (pkg.packageManager as string | undefined) ?? "";
  if (pm.startsWith("bun")) return "bun";
  if (pm.startsWith("pnpm")) return "pnpm";
  if (pm.startsWith("yarn")) return "yarn";
  return "npm";
}

function detectRuntime(
  pm: PackageManager,
  deps: Record<string, string>,
  devDeps: Record<string, string>,
): "bun" | "node" | "unknown" {
  if (pm === "bun") return "bun";
  if (hasDep(deps, "@types/bun") || hasDep(devDeps, "@types/bun")) return "bun";
  return "node";
}

function detectFramework(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
  root: string,
): {
  framework: StackSignals["framework"];
  version: string | null;
  routerType: RouterType;
} {
  const all = { ...deps, ...devDeps };

  if (hasDep(all, "next")) {
    const version = getVersion(deps, "next") ?? getVersion(devDeps, "next");
    const routerType: RouterType =
      dirExists(root, "src/app") || dirExists(root, "app")
        ? "app"
        : dirExists(root, "pages") || dirExists(root, "src/pages")
          ? "pages"
          : "unknown";
    return { framework: "nextjs", version, routerType };
  }
  if (hasDep(all, "@remix-run/node") || hasDep(all, "@remix-run/react")) {
    return {
      framework: "remix",
      version: getVersion(all, "@remix-run/node"),
      routerType: "unknown",
    };
  }
  if (hasDep(devDeps, "vite") || hasDep(all, "vite")) {
    return {
      framework: "vite",
      version: getVersion(all, "vite"),
      routerType: "unknown",
    };
  }
  if (hasDep(deps, "express")) {
    return {
      framework: "express",
      version: getVersion(deps, "express"),
      routerType: "unknown",
    };
  }
  if (hasDep(deps, "fastify")) {
    return {
      framework: "fastify",
      version: getVersion(deps, "fastify"),
      routerType: "unknown",
    };
  }
  return { framework: "none", version: null, routerType: "unknown" };
}

function detectUI(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
): string[] {
  const all = { ...deps, ...devDeps };
  const ui: string[] = [];
  if (hasDep(all, "react")) ui.push("react");
  if (hasDep(all, "vue")) ui.push("vue");
  if (hasDep(all, "svelte")) ui.push("svelte");
  if (hasDep(all, "solid-js")) ui.push("solid");
  if (hasDep(all, "preact")) ui.push("preact");
  return ui;
}

function detectStyling(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
  root: string,
): string[] {
  const all = { ...deps, ...devDeps };
  const styling: string[] = [];

  const hasTailwindDep =
    hasDep(all, "tailwindcss") || hasDep(all, "@tailwindcss/vite");
  const hasTailwindConfig =
    fileExists(root, "tailwind.config.ts") ||
    fileExists(root, "tailwind.config.js") ||
    fileExists(root, "tailwind.config.cjs");

  if (hasTailwindDep || hasTailwindConfig) styling.push("tailwind");
  if (hasDep(all, "styled-components")) styling.push("styled-components");
  if (hasDep(all, "@emotion/react") || hasDep(all, "@emotion/styled"))
    styling.push("emotion");
  if (hasDep(all, "sass") || hasDep(all, "node-sass")) styling.push("sass");
  if (hasDepPrefix(all, "@radix-ui/")) styling.push("radix-ui");
  if (hasDep(all, "@shadcn/ui") || hasDep(all, "shadcn-ui"))
    styling.push("shadcn");
  return styling;
}

function detectORM(deps: Record<string, string>): string | null {
  if (hasDep(deps, "@prisma/client")) return "prisma";
  if (hasDep(deps, "drizzle-orm")) return "drizzle";
  if (hasDep(deps, "typeorm")) return "typeorm";
  if (hasDep(deps, "sequelize")) return "sequelize";
  if (hasDep(deps, "mongoose")) return "mongoose";
  if (hasDep(deps, "knex")) return "knex";
  if (hasDep(deps, "mikro-orm") || hasDepPrefix(deps, "@mikro-orm/"))
    return "mikro-orm";
  return null;
}

function detectValidation(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
): string[] {
  const all = { ...deps, ...devDeps };
  const v: string[] = [];
  if (hasDep(all, "zod")) v.push("zod");
  if (hasDep(all, "yup")) v.push("yup");
  if (hasDep(all, "joi")) v.push("joi");
  if (hasDep(all, "valibot")) v.push("valibot");
  if (hasDep(all, "arktype")) v.push("arktype");
  return v;
}

function detectTesting(
  devDeps: Record<string, string>,
  deps: Record<string, string>,
): string | null {
  const all = { ...deps, ...devDeps };
  if (hasDep(all, "vitest")) return "vitest";
  if (hasDep(all, "jest") || hasDep(all, "@jest/core")) return "jest";
  if (hasDep(all, "mocha")) return "mocha";
  if (hasDep(all, "@playwright/test")) return "playwright";
  if (hasDep(all, "cypress")) return "cypress";
  return null;
}

function detectTypeScript(root: string): StackSignals["typescript"] {
  const tsconfigPath = join(root, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    return { present: false, strict: false, paths: false, esm: false };
  }

  const tsconfig = readJson<{
    compilerOptions?: {
      strict?: boolean;
      paths?: Record<string, unknown>;
      module?: string;
      target?: string;
    };
  }>(tsconfigPath);

  const opts = tsconfig?.compilerOptions ?? {};
  return {
    present: true,
    strict: !!opts.strict,
    paths: !!opts.paths && Object.keys(opts.paths).length > 0,
    esm:
      (opts.module ?? "").toLowerCase().includes("esnext") ||
      (opts.module ?? "").toLowerCase() === "node16" ||
      (opts.module ?? "").toLowerCase() === "nodenext",
  };
}

function detectConfigFiles(root: string): string[] {
  const candidates = [
    "tailwind.config.ts",
    "tailwind.config.js",
    "tailwind.config.cjs",
    "biome.json",
    "biome.jsonc",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".env.example",
    ".env.local.example",
    "drizzle.config.ts",
    "drizzle.config.js",
    "prisma/schema.prisma",
    "vite.config.ts",
    "vite.config.js",
    "vitest.config.ts",
    "playwright.config.ts",
    "jest.config.ts",
    "jest.config.js",
    ".eslintrc.js",
    ".eslintrc.cjs",
    "eslint.config.js",
    "eslint.config.ts",
    ".prettierrc",
    "prettier.config.js",
    "prettier.config.ts",
    "postcss.config.js",
    "postcss.config.ts",
  ];
  return candidates.filter((f) => fileExists(root, f));
}

function detectDirPatterns(root: string): string[] {
  const patterns: string[] = [];
  const checks: [string, string][] = [
    ["src/app", "src/app/"],
    ["src/pages", "src/pages/"],
    ["app", "app/ (root)"],
    ["pages", "pages/ (root)"],
    ["src/components", "src/components/"],
    ["components", "components/ (root)"],
    ["src/lib", "src/lib/"],
    ["src/utils", "src/utils/"],
    ["src/hooks", "src/hooks/"],
    ["src/server", "src/server/"],
    ["src/api", "src/api/"],
    ["api", "api/ (root)"],
    ["__tests__", "__tests__/"],
    ["tests", "tests/"],
    ["e2e", "e2e/"],
    ["scripts", "scripts/"],
    ["prisma", "prisma/"],
    ["src/styles", "src/styles/"],
    ["public", "public/"],
  ];
  for (const [rel, label] of checks) {
    if (dirExists(root, rel)) patterns.push(label);
  }
  return patterns;
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function detectStack(projectPath: string): Promise<StackSignals> {
  const root = resolve(projectPath);

  if (!existsSync(root)) {
    throw new Error(`Project path not found: ${root}`);
  }
  if (!statSync(root).isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  // Read package.json
  const pkgPath = join(root, "package.json");
  const pkg =
    readJson<{
      name?: string;
      packageManager?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    }>(pkgPath) ?? {};

  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};
  const packageManager = detectPackageManager(
    root,
    pkg as Record<string, unknown>,
  );
  const runtime = detectRuntime(packageManager, deps, devDeps);
  const {
    framework,
    version: frameworkVersion,
    routerType,
  } = detectFramework(deps, devDeps, root);
  const ui = detectUI(deps, devDeps);
  const styling = detectStyling(deps, devDeps, root);
  const orm = detectORM(deps);
  const validation = detectValidation(deps, devDeps);
  const testing = detectTesting(devDeps, deps);
  const typescript = detectTypeScript(root);
  const configFiles = detectConfigFiles(root);
  const dirPatterns = detectDirPatterns(root);

  // Relevant scripts
  const relevantScriptKeys = [
    "build",
    "test",
    "dev",
    "start",
    "typecheck",
    "type-check",
    "check",
    "lint",
    "format",
    "generate",
    "db:push",
    "db:migrate",
    "migrate",
  ];
  const scripts: Record<string, string> = {};
  for (const key of relevantScriptKeys) {
    if (pkg.scripts?.[key]) scripts[key] = pkg.scripts[key];
  }

  // Also check for "test:*" and "lint:*" variants
  for (const [k, v] of Object.entries(pkg.scripts ?? {})) {
    if ((k.startsWith("test:") || k.startsWith("lint:")) && !scripts[k]) {
      scripts[k] = v;
    }
  }

  const projectName =
    (pkg.name ?? listTopLevel(root).find((f) => f === "package.json"))
      ? (root.split("/").pop() ?? "unknown")
      : "unknown";

  return {
    projectName,
    projectPath: root,
    packageManager,
    runtime,
    framework,
    frameworkVersion,
    routerType,
    ui,
    styling,
    orm,
    validation,
    testing,
    typescript,
    configFiles,
    dirPatterns,
    scripts,
    dependencies: Object.keys(deps),
    devDependencies: Object.keys(devDeps),
  };
}

// Run as CLI only when executed directly (not imported)
// Bun sets import.meta.main=true when the file is the entry point
if (import.meta.main) {
  const args = parseArgs(process.argv);
  const root = resolve(args.projectPath);

  if (!existsSync(root)) {
    console.error(`Project path not found: ${root}`);
    process.exit(1);
  }

  const signals = await detectStack(root);

  if (args.jsonOnly) {
    console.log(JSON.stringify(signals));
  } else {
    console.log(JSON.stringify(signals, null, 2));
  }
}
