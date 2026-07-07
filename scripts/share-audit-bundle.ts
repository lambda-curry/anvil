#!/usr/bin/env bun

/* eslint-disable no-console */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

const SCRIPT_DIR = import.meta.dir;
const WORKSPACE_DIR = resolve(SCRIPT_DIR, "..");
const DEFAULT_AUDITS_DIR = join(WORKSPACE_DIR, "docs", "audits");

type CliArgs = {
  reportPath: string | null;
  outputZipPath: string | null;
  extraIncludes: string[];
  dryRun: boolean;
};

function usageAndExit(code: number): never {
  console.log(
    [
      "Usage:",
      "  bun run scripts/share-audit-bundle.ts [--report <report.md>] [--output <bundle.zip>] [--include <path1,path2>] [--dry-run]",
      "",
      "Defaults:",
      "  --report: latest report in docs/audits",
      "  --output: <report-name>-share.zip beside the report",
      "",
      "Example:",
      "  bun run scripts/share-audit-bundle.ts --report docs/audits/frontlineiq-audit-2026-02-25.md",
    ].join("\n"),
  );
  process.exit(code);
}

function parseArgs(argv: string[]): CliArgs {
  let reportPath: string | null = null;
  let outputZipPath: string | null = null;
  let extraIncludes: string[] = [];
  let dryRun = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--report") {
      reportPath = argv[++i] ?? null;
    } else if (arg === "--output") {
      outputZipPath = argv[++i] ?? null;
    } else if (arg === "--include") {
      const raw = argv[++i] ?? "";
      extraIncludes = raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usageAndExit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      usageAndExit(1);
    }
  }

  return { reportPath, outputZipPath, extraIncludes, dryRun };
}

function isAuditReportFile(path: string): boolean {
  const name = basename(path);
  if (!name.endsWith(".md")) return false;
  if (name.toLowerCase() === "readme.md") return false;
  return /-audit-\d{4}-\d{2}-\d{2}\.md$/i.test(name);
}

function findLatestReportPath(auditsDir: string): string {
  if (!existsSync(auditsDir)) {
    throw new Error(`Audits directory not found: ${auditsDir}`);
  }

  const entries = readdirSync(auditsDir)
    .map((entry) => join(auditsDir, entry))
    .filter((full) => existsSync(full) && statSync(full).isFile())
    .filter(isAuditReportFile)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (entries.length === 0) {
    throw new Error(`No audit report files found in ${auditsDir}`);
  }

  const latestEntry = entries[0];
  if (!latestEntry) {
    throw new Error(`No audit report files found in ${auditsDir}`);
  }

  return latestEntry;
}

async function extractArtifactPathsFromReport(
  reportPath: string,
): Promise<string[]> {
  const content = await Bun.file(reportPath).text();
  const lines = content.split(/\r?\n/);
  const sectionStart = lines.findIndex(
    (line) => line.trim() === "## Artifacts",
  );
  if (sectionStart === -1) return [];

  const artifactLines: string[] = [];
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    if (/^##\s+/.test(line)) break;
    artifactLines.push(line);
  }

  const paths: string[] = [];
  for (const line of artifactLines) {
    const markdownLinkMatch = line.match(/\[[^\]]*\]\(([^)]+)\)/);
    const match = markdownLinkMatch ?? line.match(/`([^`]+)`/);
    const raw = match?.[1];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    paths.push(trimmed);
  }
  return paths;
}

function toAbsolutePath(path: string, reportPath: string): string {
  if (path.startsWith("/")) return resolve(path);
  return resolve(dirname(reportPath), path);
}

function safeArchiveRelativePath(fullPath: string): string {
  const fromWorkspace = relative(WORKSPACE_DIR, fullPath);
  if (!fromWorkspace.startsWith("..")) {
    return fromWorkspace;
  }

  const sanitized = fullPath.replace(/^\/+/, "").replace(/[:*?"<>|]/g, "_");
  return join("external", sanitized);
}

function ensureZipAvailable(): void {
  const result = spawnSync("zip", ["-v"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error("`zip` command not available. Install zip and retry.");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const reportPath = resolve(
    args.reportPath
      ? args.reportPath
      : findLatestReportPath(DEFAULT_AUDITS_DIR),
  );
  if (!existsSync(reportPath) || !statSync(reportPath).isFile()) {
    throw new Error(`Report file not found: ${reportPath}`);
  }

  const artifactRawPaths = await extractArtifactPathsFromReport(reportPath);
  const includePaths = [...artifactRawPaths, ...args.extraIncludes];
  const absolutePaths = [
    ...new Set(
      includePaths
        .map((p) => toAbsolutePath(p, reportPath))
        .filter((p) => existsSync(p)),
    ),
  ];

  const defaultZipPath = join(
    dirname(reportPath),
    `${basename(reportPath, extname(reportPath))}-share.zip`,
  );
  const outputZipPath = resolve(args.outputZipPath ?? defaultZipPath);

  console.log(`Report: ${reportPath}`);
  console.log(`Output: ${outputZipPath}`);
  console.log(`Supporting paths found: ${absolutePaths.length}`);
  for (const path of absolutePaths) {
    console.log(`  - ${path}`);
  }

  if (args.dryRun) {
    console.log("Dry run only. No archive created.");
    return;
  }

  ensureZipAvailable();

  const stagingRoot = mkdtempSync(join(tmpdir(), "anvil-share-bundle-"));
  const bundleName = basename(outputZipPath, ".zip");
  const bundleDir = join(stagingRoot, bundleName);
  mkdirSync(bundleDir, { recursive: true });

  try {
    const allPaths = [reportPath, ...absolutePaths];
    const manifestLines: string[] = [
      "# Anvil Audit Share Bundle",
      "",
      `Report: ${reportPath}`,
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Included Paths",
    ];

    for (const source of allPaths) {
      if (!existsSync(source)) continue;
      const archiveRel = safeArchiveRelativePath(source);
      const destination = join(bundleDir, archiveRel);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(source, destination, { recursive: true });
      manifestLines.push(`- ${archiveRel}`);
    }

    writeFileSync(
      join(bundleDir, "MANIFEST.md"),
      `${manifestLines.join("\n")}\n`,
      "utf8",
    );

    const zipResult = spawnSync("zip", ["-r", outputZipPath, bundleName], {
      cwd: stagingRoot,
      encoding: "utf8",
    });
    if (zipResult.status !== 0) {
      throw new Error(
        zipResult.stderr?.trim() || zipResult.stdout?.trim() || "zip failed",
      );
    }
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  console.log(`✅ Bundle created: ${outputZipPath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`Fatal error: ${(error as Error).message}`);
    process.exit(1);
  });
}
