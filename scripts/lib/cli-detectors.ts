import {
  type Dirent,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  buildRecommendations,
  emptyCheckEvidence,
  emptyChecks,
  inspectEntrypointContent,
  type CliCheckKey,
} from "./cli-checks.ts";

export type CliChecks = {
  argumentParsing: boolean;
  helpText: boolean;
  exitCodeHygiene: boolean;
  inputValidation: boolean;
  errorBoundary: boolean;
};

export type CliSignals = {
  isCliProject: boolean;
  confidence: number;
  frameworks: string[];
  entrypoints: string[];
  evidence: string[];
  checks: CliChecks;
  checkEvidence: Record<keyof CliChecks, string[]>;
  missingChecks: string[];
  recommendations: string[];
};

type PkgJson = {
  bin?: string | Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const CLI_FRAMEWORK_DEPS = [
  "commander",
  "yargs",
  "oclif",
  "@oclif/core",
  "cac",
  "clipanion",
  "meow",
  "arg",
  "minimist",
  "sade",
  "caporal",
];

const SCRIPT_ENTRY_HINTS = ["cli", "bin", "command", "cmd"];

const CLI_FILE_PATTERNS = [
  /(^|\/)bin\//,
  /(^|\/)cli\./,
  /(^|\/)command(s)?\//,
  /(^|\/)cmd\//,
  /(^|\/)main\.(ts|js|mjs|cjs)$/,
];

function readPackageJson(projectRoot: string): PkgJson {
  const packageJsonPath = join(projectRoot, "package.json");
  if (!existsSync(packageJsonPath)) return {};
  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PkgJson;
  } catch {
    return {};
  }
}

function listFiles(projectRoot: string, maxFiles = 500): string[] {
  const out: string[] = [];
  const queue: string[] = [projectRoot];
  const skip = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".turbo",
    "coverage",
    ".codex",
  ]);

  while (queue.length > 0 && out.length < maxFiles) {
    const current = queue.pop();
    if (!current) break;

    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) queue.push(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
      out.push(full);
      if (out.length >= maxFiles) break;
    }
  }

  return out;
}

function getFrameworks(pkg: PkgJson): string[] {
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  return CLI_FRAMEWORK_DEPS.filter((dep) => dep in all);
}

function normalizeEntry(entry: string, projectRoot: string): string {
  const abs = resolve(projectRoot, entry);
  return abs.replace(`${projectRoot}/`, "");
}

function getBinEntrypoints(pkg: PkgJson, projectRoot: string): string[] {
  const value = pkg.bin;
  if (!value) return [];
  if (typeof value === "string") return [normalizeEntry(value, projectRoot)];
  return Object.values(value).map((entry) =>
    normalizeEntry(entry, projectRoot),
  );
}

function detectPotentialEntrypoints(
  projectRoot: string,
  files: string[],
): string[] {
  const out = new Set<string>();

  for (const full of files) {
    const relative = full.replace(`${projectRoot}/`, "");
    if (!CLI_FILE_PATTERNS.some((re) => re.test(relative))) continue;
    out.add(relative);
  }

  return [...out].toSorted();
}

function readExistingEntrypoints(
  projectRoot: string,
  paths: string[],
): string[] {
  return paths.filter((relativePath) => {
    const abs = join(projectRoot, relativePath);
    return existsSync(abs) && statSync(abs).isFile();
  });
}

function detectChecks(
  projectRoot: string,
  entrypoints: string[],
): {
  checks: CliChecks;
  checkEvidence: Record<CliCheckKey, string[]>;
} {
  const checks = emptyChecks();
  const checkEvidence = emptyCheckEvidence();

  for (const relativePath of entrypoints.slice(0, 8)) {
    const abs = join(projectRoot, relativePath);
    try {
      inspectEntrypointContent(
        relativePath,
        readFileSync(abs, "utf8"),
        checks,
        checkEvidence,
      );
    } catch {
      continue;
    }
  }

  return { checks, checkEvidence };
}

function scoreConfidence(
  pkg: PkgJson,
  frameworks: string[],
  entrypoints: string[],
): number {
  let score = 0;
  if (pkg.bin) score += 0.55;
  if (frameworks.length > 0) score += 0.25;

  const scriptKeys = Object.keys(pkg.scripts ?? {});
  if (
    scriptKeys.some((key) =>
      SCRIPT_ENTRY_HINTS.some((hint) => key.includes(hint)),
    )
  ) {
    score += 0.1;
  }

  if (entrypoints.length > 0) score += 0.2;
  return Math.max(0, Math.min(1, score));
}

function buildEvidence(
  pkg: PkgJson,
  frameworks: string[],
  entrypoints: string[],
): string[] {
  const evidence: string[] = [];
  if (pkg.bin) evidence.push("package.json bin field present");
  if (frameworks.length > 0) {
    evidence.push(`CLI frameworks: ${frameworks.join(", ")}`);
  }
  if (entrypoints.length > 0) {
    evidence.push(`Entrypoints: ${entrypoints.slice(0, 4).join(", ")}`);
  }
  return evidence;
}

export function detectCliSignals(projectRoot: string): CliSignals {
  const pkg = readPackageJson(projectRoot);
  const frameworks = getFrameworks(pkg);
  const allFiles = listFiles(projectRoot);
  const entrypoints = readExistingEntrypoints(projectRoot, [
    ...new Set([
      ...getBinEntrypoints(pkg, projectRoot),
      ...detectPotentialEntrypoints(projectRoot, allFiles),
    ]),
  ]);

  const confidence = scoreConfidence(pkg, frameworks, entrypoints);
  const isCliProject = confidence >= 0.5;
  const evidence = buildEvidence(pkg, frameworks, entrypoints);
  const { checks, checkEvidence } = detectChecks(projectRoot, entrypoints);
  const missingChecks = (Object.keys(checks) as CliCheckKey[]).filter(
    (key) => !checks[key],
  );

  return {
    isCliProject,
    confidence,
    frameworks,
    entrypoints,
    evidence,
    checks,
    checkEvidence,
    missingChecks,
    recommendations: buildRecommendations(checks, isCliProject),
  };
}
