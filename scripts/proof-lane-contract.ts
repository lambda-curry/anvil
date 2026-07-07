import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

const packageJson = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
) as { version: string };

export const expectedVersion = packageJson.version;
export const exactVersionPackageToken = "@lambdacurry/anvil@<exact-version>";
export const localOnlyFlag = "--ci";
export const canonicalShellLayout = "target repo root with `--target .`";
export const canonicalSavedReportPath = "./anvil-audit.md";
export const threeLineOpener = [
  "Could you try one first-run Anvil audit on a real repo of yours?",
  "Paste the single command below from that repo's root; it saves `./anvil-audit.md`, stays local, and does not require an AI provider.",
  "Send back whether it worked first try, the first useful fix the report pointed to, and the saved report file or excerpt.",
] as const;
export const legacyNoAiCompatibilityNote =
  "Treat the `--no-ai` spelling above as a pinned-build compatibility exception, not as a second competing contract.";
export const legacyNoAiDiffNote =
  "current-main local-only examples use `--ci` instead of this pinned packet's legacy `--no-ai` spelling";
export const pinnedProofPacketUsesCiNote = `pinned \`${expectedVersion}\` proof packet uses \`${localOnlyFlag}\``;

type AuditCommandOptions = {
  launcher?: "bunx" | "npx";
  output: string;
  packageToken?: string;
  target: string;
};

type VersionCommandOptions = {
  launcher?: "bunx" | "npx";
  packageToken?: string;
};

export function joinCommandLines(lines: readonly string[]): string {
  return lines.join("\n");
}

export function buildWrappedAuditCommandLines(
  options: AuditCommandOptions,
): string[] {
  const launcher = options.launcher ?? "bunx";
  const packageToken = options.packageToken ?? exactVersionPackageToken;

  return [
    `${launcher} \\`,
    `  ${packageToken} \\`,
    "  audit \\",
    `  --target ${options.target} \\`,
    `  ${localOnlyFlag} \\`,
    `  --output ${options.output}`,
  ];
}

export function buildWrappedVersionCommandLines(
  options: VersionCommandOptions = {},
): string[] {
  const launcher = options.launcher ?? "bunx";
  const packageToken = options.packageToken ?? exactVersionPackageToken;

  return [`${launcher} \\`, `  ${packageToken} \\`, "  --version"];
}

export function buildPlainAuditCommand(options: AuditCommandOptions): string {
  const launcher = options.launcher ?? "bunx";
  const packageToken = options.packageToken ?? exactVersionPackageToken;

  return `${launcher} ${packageToken} audit --target ${options.target} ${localOnlyFlag} --output ${options.output}`;
}

export const wrappedRepoRootExactVersionAuditCommand =
  buildWrappedAuditCommandLines({
    output: canonicalSavedReportPath,
    target: ".",
  });

export const wrappedParentDirExactVersionAuditCommand =
  buildWrappedAuditCommandLines({
    output: "./your-repo/anvil-audit.md",
    target: "./your-repo",
  });

export const wrappedExactVersionCommand = buildWrappedVersionCommandLines();

export const wrappedPinnedRepoRootAuditCommand = buildWrappedAuditCommandLines({
  output: canonicalSavedReportPath,
  packageToken: `@lambdacurry/anvil@${expectedVersion}`,
  target: ".",
});

export const plainRepoRootExactVersionAuditCommand = buildPlainAuditCommand({
  output: canonicalSavedReportPath,
  target: ".",
});

export const wrappedPinnedParentDirAuditCommand = buildWrappedAuditCommandLines(
  {
    output: "./your-repo/anvil-audit.md",
    packageToken: `@lambdacurry/anvil@${expectedVersion}`,
    target: "./your-repo",
  },
);

export const plainPinnedRepoRootAuditCommand = buildPlainAuditCommand({
  output: canonicalSavedReportPath,
  packageToken: `@lambdacurry/anvil@${expectedVersion}`,
  target: ".",
});

export const plainPinnedParentDirAuditCommand = buildPlainAuditCommand({
  output: "./your-repo/anvil-audit.md",
  packageToken: `@lambdacurry/anvil@${expectedVersion}`,
  target: "./your-repo",
});
