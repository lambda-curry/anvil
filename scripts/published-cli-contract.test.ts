import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

type PackageJson = {
  bin?: Record<string, string>;
  engines?: Record<string, string>;
  packageManager?: string;
  version?: string;
};

type PackedFile = {
  path: string;
};

type NpmPackDryRunEntry = {
  filename?: string;
  files: PackedFile[];
};

const packageJson = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
) as PackageJson;

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function readPackedFilePaths(): string[] {
  const run = Bun.spawnSync(
    // --loglevel=error keeps npm's warn chatter out of the pipes; CI environments (setup-node's
    // npmrc/auth env) provoke `npm warn` lines that can land in stdout ahead of the JSON.
    [
      "npm",
      "pack",
      "--dry-run",
      "--json",
      "--ignore-scripts",
      "--loglevel=error",
    ],
    {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  expect(run.exitCode).toBe(0);

  // Shape-agnostic extraction. Two hazards, both hit on CI:
  //  - npm may emit warn preamble ahead of the JSON, so parse from the first line that IS JSON;
  //  - npm 12 changed `pack --json` from an ARRAY of entries to an OBJECT keyed by package name
  //    (CI installs npm@latest for the trusted-publishing OIDC exchange, so majors arrive unpinned).
  const stdout = new TextDecoder().decode(run.stdout);
  const lines = stdout.split("\n");
  const start = lines.findIndex(
    (l) => l.trimStart().startsWith("{") || l.trimStart().startsWith("["),
  );
  expect(start).toBeGreaterThanOrEqual(0);
  const parsed = JSON.parse(lines.slice(start).join("\n")) as
    | NpmPackDryRunEntry[]
    | Record<string, NpmPackDryRunEntry>;
  const entries = Array.isArray(parsed) ? parsed : Object.values(parsed);
  expect(entries).toHaveLength(1);

  return entries[0].files.map((file) => file.path);
}

function parseNpmPackOutput(stdout: Uint8Array): NpmPackDryRunEntry {
  const lines = new TextDecoder().decode(stdout).split("\n");
  const start = lines.findIndex(
    (line) =>
      line.trimStart().startsWith("{") || line.trimStart().startsWith("["),
  );
  expect(start).toBeGreaterThanOrEqual(0);

  const parsed = JSON.parse(lines.slice(start).join("\n")) as
    | NpmPackDryRunEntry[]
    | Record<string, NpmPackDryRunEntry>;
  const entries = Array.isArray(parsed) ? parsed : Object.values(parsed);
  expect(entries).toHaveLength(1);
  return entries[0];
}

function packCli(tempRoot: string): string {
  const pack = Bun.spawnSync(
    [
      "npm",
      "pack",
      "--json",
      "--ignore-scripts",
      "--loglevel=error",
      "--pack-destination",
      tempRoot,
    ],
    {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(pack.exitCode).toBe(0);

  const packedEntry = parseNpmPackOutput(pack.stdout);
  expect(packedEntry.filename).toBeTruthy();
  return resolve(tempRoot, packedEntry.filename!);
}

function runPackedCli(
  tarballPath: string,
  cwd: string,
  args: string[],
): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(
    ["npx", "--yes", `--package=${tarballPath}`, "--", "anvil", ...args],
    {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
}

test("published package metadata declares the Bun-native launcher contract", () => {
  expect(packageJson.bin).toEqual({
    anvil: "./bin/anvil.ts",
  });
  expect(packageJson.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);
  expect(packageJson.engines?.bun).toBe(">=1.0.0");
  expect(packageJson.engines?.node).toBe(">=20");
});

test("CLI help spells out the supported launcher paths", () => {
  const run = Bun.spawnSync(
    ["bun", "run", resolve(REPO_ROOT, "bin/anvil.ts"), "--help"],
    {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  expect(run.exitCode).toBe(0);

  const stdout = new TextDecoder().decode(run.stdout);
  expect(stdout).toContain("Launcher contract:");
  expect(stdout).toContain(
    "bunx @lambdacurry/anvil <command> [...args]   Recommended zero-install path",
  );
  expect(stdout).toContain(
    "npx @lambdacurry/anvil <command> [...args]    Alternate launcher; Bun and Node.js >= 20 must already be installed",
  );
  expect(stdout).toContain(
    "bun add -g @lambdacurry/anvil                 Global install",
  );
  expect(stdout).toContain(
    "anvil <command> [...args]                    Run after global install",
  );
  expect(stdout).not.toContain("&& anvil");
});

test("repo README and public installation guide match the published launcher contract", () => {
  const readme = readRepoFile("README.md");
  const installation = readRepoFile(
    "docs-site/src/content/docs/getting-started/installation.md",
  );
  const releasing = readRepoFile("docs/releasing.md");

  expect(readme).toContain(
    "Bun is the runtime requirement for the published CLI.",
  );
  expect(readme).toContain(
    "Node is optional and only matters if you prefer `npx` as the launcher instead of `bunx`.",
  );

  expect(installation).toContain("- [Bun](https://bun.sh) ≥ 1.0");
  expect(installation).toContain(
    "- Node.js ≥ 20 only if you want to launch the published package with `npx` instead of `bunx`",
  );
  expect(installation).toContain(
    "### `npx` (still launches the Bun-native CLI)",
  );

  expect(releasing).toContain(
    "bunx @lambdacurry/anvil audit --target ./some-typescript-repo --output ./report.md --no-ai",
  );
  expect(releasing).not.toContain(
    "npx @lambdacurry/anvil audit --target ./some-typescript-repo --output ./report.md --no-ai",
  );
});

test("packed npm artifact keeps the runtime and proof surfaces while excluding internal test baggage", () => {
  const filePaths = readPackedFilePaths();

  expect(filePaths).toEqual(
    expect.arrayContaining([
      "README.md",
      "bin/anvil.ts",
      "docs/bootstrap-templates/bun-commands.md",
      "docs/byok-trust-model.md",
      "docs/first-user-proof.md",
      "docs/first-user-proof-packet.md",
      "docs/getting-started.md",
      "docs/proofs/README.md",
      "docs/proofs/current-outside-tester-send-packet.md",
      "docs/proofs/first-user-proof-template.md",
      "docs/rubric.md",
      "package.json",
      "scripts/audit.ts",
      "scripts/bootstrap-detect.ts",
      "scripts/bootstrap-generate.ts",
      "scripts/drift-detect.ts",
      "scripts/lib/audit-config.ts",
      "scripts/lib/guardrail-score.ts",
      "scripts/lib/rule-surface.ts",
      "scripts/mine-pr-rules.ts",
      "scripts/verify-first-user-proof.ts",
    ]),
  );

  expect(filePaths).not.toContain(
    "scripts/__fixtures__/sample-cli-repo/AGENTS.md",
  );
  expect(filePaths).not.toContain("scripts/__tests__/golden.test.ts");
  expect(filePaths).not.toContain("scripts/first-user-proof-docs.test.ts");
  expect(filePaths).not.toContain("scripts/share-audit-bundle.ts");
  expect(filePaths).not.toContain("scripts/slack-notify.ts");
  expect(filePaths).not.toContain("scripts/verify-cycle-memory.ts");
  expect(filePaths).not.toContain("scripts/verify-first-user-proof.test.ts");
});

test("packed npm artifact executes version and audit commands through npx", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "anvil-npx-contract-"));

  try {
    const tarballPath = packCli(tempRoot);
    const version = runPackedCli(tarballPath, tempRoot, ["--version"]);
    expect(version.exitCode).toBe(0);
    expect(new TextDecoder().decode(version.stdout).trim()).toBe(
      packageJson.version,
    );

    const reportPath = resolve(tempRoot, "anvil-audit.md");
    const audit = runPackedCli(tarballPath, tempRoot, [
      "audit",
      "--target",
      resolve(REPO_ROOT, "scripts/__fixtures__/sample-cli-repo"),
      "--ci",
      "--output",
      reportPath,
    ]);
    expect(audit.exitCode).toBe(0);
    expect(statSync(reportPath).size).toBeGreaterThan(0);
    expect(readFileSync(reportPath, "utf8")).toContain("# Anvil Audit");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
