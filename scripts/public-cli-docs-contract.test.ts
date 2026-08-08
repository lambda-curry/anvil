import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

test("mine-pr docs require the gh CLI and do not promise a token-only fallback", () => {
  const docs = [
    readRepoFile("docs-site/src/content/docs/getting-started/installation.md"),
    readRepoFile("docs-site/src/content/docs/guides/mine-pr.md"),
    readRepoFile("docs-site/src/content/docs/reference/cli.md"),
    readRepoFile("docs-site/src/content/docs/reference/agent-skill.md"),
  ];

  for (const doc of docs) {
    expect(doc).toContain("gh");
  }
  expect(docs.join("\n")).not.toContain(
    "mine-pr` falls back to the GitHub API via `GITHUB_TOKEN`",
  );
  expect(docs.join("\n")).not.toContain(
    "Requires `GITHUB_TOKEN` in your environment",
  );
});

test("operator proof pages are excluded from the public docs sidebar", () => {
  const config = readRepoFile("docs-site/astro.config.mjs");

  // Proof pages are internal operator docs, not public docs-site pages
  expect(config).not.toContain("label: 'Proof Process'");
  expect(config).not.toContain("slug: 'guides/first-user-proof'");
  expect(config).not.toContain("slug: 'guides/first-user-proof-packet'");
});

test("BYOK docs describe provider auto-detection without an opt-in claim", () => {
  const docs = [
    readRepoFile("docs/byok-trust-model.md"),
    readRepoFile("docs-site/src/content/docs/guides/byok-trust-model.md"),
  ];

  for (const doc of docs) {
    expect(doc).not.toContain("opt-in only");
    expect(doc).not.toContain("only after explicit opt-in");
    expect(doc).toContain("auto-detected or explicitly selected provider");
    expect(doc).toContain("use `--ci` to stay local");
  }
});

test("CLI reference documents every public audit output and timeout flag", () => {
  const cliReference = readRepoFile(
    "docs-site/src/content/docs/reference/cli.md",
  );

  expect(cliReference).toContain("`--json`");
  expect(cliReference).toContain("`--artifacts-dir <dir>`");
  expect(cliReference).toContain("`--ai-timeout-ms <ms>`");
});

test("CLI reference documents every public drift flag", () => {
  const cliReference = readRepoFile(
    "docs-site/src/content/docs/reference/cli.md",
  );

  expect(cliReference).toContain("`--skip-dirs <dir1,dir2,...>`");
  expect(cliReference).toContain("`--output <file>`");
  expect(cliReference).toContain("`--target <path>`");
});

test("README does not link to removed docs-site proof pages", () => {
  const readme = readRepoFile("README.md");

  // SFD-328 removed operator proof pages from the public docs site.
  // README links must point to internal docs/ paths, not docs-site URLs.
  expect(readme).not.toContain(
    "lambda-curry.github.io/anvil/guides/first-user-proof",
  );
});

test("rubric reference matches the seven guardrail dimensions in code", () => {
  const rubric = readRepoFile("docs-site/src/content/docs/reference/rubric.md");
  const guardrailSource = readRepoFile("scripts/lib/guardrail-score.ts");

  for (const dimension of [
    "ciDiscipline",
    "typeSafety",
    "testDepth",
    "codeQuality",
    "reviewOwnership",
    "security",
    "driftResilience",
  ]) {
    expect(guardrailSource).toContain(`"${dimension}"`);
  }

  for (const heading of [
    "CI discipline",
    "Type safety",
    "Test depth",
    "Code quality",
    "Review ownership",
    "Security",
    "Drift resilience",
  ]) {
    expect(rubric).toContain(`**${heading}**`);
  }
  expect(rubric).not.toContain("Hook coverage");
});
