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

test("first-user proof pages are discoverable from the public docs sidebar", () => {
  const config = readRepoFile("docs-site/astro.config.mjs");

  expect(config).toContain("slug: 'guides/first-user-proof'");
  expect(config).toContain("slug: 'guides/first-user-proof-packet'");
});
