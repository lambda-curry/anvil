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

test("operator proof pages have a separate public docs sidebar section", () => {
  const config = readRepoFile("docs-site/astro.config.mjs");

  expect(config).toContain("label: 'Proof Process'");
  expect(config).toContain("slug: 'guides/first-user-proof'");
  expect(config).toContain("slug: 'guides/first-user-proof-packet'");

  const guidesStart = config.indexOf("label: 'Guides'");
  const proofStart = config.indexOf("label: 'Proof Process'");
  const referenceStart = config.indexOf("label: 'Reference'");
  const guidesSection = config.slice(guidesStart, proofStart);
  const proofSection = config.slice(proofStart, referenceStart);

  expect(guidesSection).not.toContain("slug: 'guides/first-user-proof'");
  expect(guidesSection).not.toContain("slug: 'guides/first-user-proof-packet'");
  expect(proofSection).toContain("slug: 'guides/first-user-proof'");
  expect(proofSection).toContain("slug: 'guides/first-user-proof-packet'");
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
