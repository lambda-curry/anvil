import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  exactVersionPackageToken,
  expectedVersion as version,
  joinCommandLines,
  legacyNoAiCompatibilityNote,
  legacyNoAiDiffNote,
  pinnedProofPacketUsesCiNote,
  plainPinnedRepoRootAuditCommand,
  plainRepoRootExactVersionAuditCommand,
  threeLineOpener,
  wrappedExactVersionCommand,
} from "./proof-lane-contract.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function expectAll(text: string, snippets: string[]) {
  for (const snippet of snippets) {
    expect(text).toContain(snippet);
  }
}

test("README and repo mirrors keep the alpha.5 proof lane pinned", () => {
  const readme = readRepoFile("README.md");
  const gettingStarted = readRepoFile("docs/getting-started.md");
  const sendPacket = readRepoFile(
    "docs/proofs/current-outside-tester-send-packet.md",
  );

  expectAll(readme, [
    `collect outside-Lambda-Curry first-run proof on pinned \`${version}\``,
    `@lambdacurry/anvil@${version}`,
    `--version\` prints \`${version}\``,
    "one canonical repo-root command",
    "--ci --output ./anvil-audit.md",
  ]);

  expectAll(gettingStarted, [
    `published \`${version}\` proof packet uses one canonical repo-root \`bunx\` command`,
    `--version\` prints \`${version}\``,
    `${exactVersionPackageToken} audit --target . --ci --output ./anvil-audit.md`,
  ]);

  expectAll(sendPacket, [
    `@lambdacurry/anvil@${version}`,
    "This packet stays pinned",
    "--output ./anvil-audit.md",
  ]);
});

test("repo proof docs expose the three-line opener and one saved-report command", () => {
  const checklist = readRepoFile("docs/first-user-proof.md");
  const packet = readRepoFile("docs/first-user-proof-packet.md");
  const sendPacket = readRepoFile(
    "docs/proofs/current-outside-tester-send-packet.md",
  );

  for (const doc of [checklist, packet, sendPacket]) {
    expectAll(doc, [...threeLineOpener]);
    expect(doc).toContain("--ci");
    expect(doc).toContain("--output ./anvil-audit.md");
    expect(doc).not.toContain("--output ./your-repo/anvil-audit.md");
  }

  expectAll(checklist, [
    `for example \`${version}\``,
    plainRepoRootExactVersionAuditCommand,
    "it requires the retained audit command to keep the exact `--ci` spelling from the packet.",
  ]);

  expectAll(packet, [
    "Do not use the floating `@alpha` tag in the external proof packet.",
    "public docs-site URLs, not GitHub blob URLs or local repo-relative paths",
    plainRepoRootExactVersionAuditCommand,
    joinCommandLines(wrappedExactVersionCommand),
    "For the current pinned `0.1.0-alpha.5` proof lane, that includes checking that the retained audit command keeps the packet's `--ci` spelling.",
  ]);

  expectAll(sendPacket, [
    `This packet stays pinned to \`@lambdacurry/anvil@${version}\`.`,
    plainPinnedRepoRootAuditCommand,
    `\`bunx @lambdacurry/anvil@${version} --version\``,
    "It keys validation off the saved packet's `Pinned CLI version`, so this retained `0.1.0-alpha.5` packet can still be checked after current `main` advances to a later package version.",
    "Historical note: the original dated retained packet for this same pinned proof lane remains at `docs/proofs/2026-05-23-alpha4-outside-tester-send-packet.md`.",
  ]);

  expect(sendPacket).not.toContain(`npx @lambdacurry/anvil@${version}`);
});

test("public proof guides mirror the alpha.5 opener contract", () => {
  const publicGuide = readRepoFile(
    "docs-site/src/content/docs/guides/first-user-proof.md",
  );
  const publicPacket = readRepoFile(
    "docs-site/src/content/docs/guides/first-user-proof-packet.md",
  );

  for (const doc of [publicGuide, publicPacket]) {
    expectAll(doc, [...threeLineOpener]);
    expectAll(doc, [
      plainRepoRootExactVersionAuditCommand,
      "exact pinned command",
      "`@alpha` examples",
    ]);
    expect(doc).not.toContain("--output ./your-repo/anvil-audit.md");
    expect(doc).not.toContain("```bash\n");
  }

  expectAll(publicPacket, [
    joinCommandLines(wrappedExactVersionCommand),
    "Install path: bunx / npx / global install",
    "Saved report path or screenshot link",
    "retained audit command keeps the pinned `0.1.0-alpha.5` local-only `--ci` spelling",
  ]);
});

test("first-run docs fence proof testers away from floating alpha commands", () => {
  const firstAudit = readRepoFile(
    "docs-site/src/content/docs/getting-started/first-audit.md",
  );
  const installation = readRepoFile(
    "docs-site/src/content/docs/getting-started/installation.md",
  );

  for (const doc of [firstAudit, installation]) {
    expect(doc.toLowerCase()).toContain(
      "using the exact pinned `bunx @lambdacurry/anvil@<exact-version> ...` command",
    );
    expect(doc).toMatch(
      /general public usage, not for Milestone 3 proof collection|do not switch to the floating `@alpha` commands/,
    );
    expect(doc).toContain(
      "bunx @lambdacurry/anvil@alpha audit --target . --ci",
    );
    expect(doc).toContain("```bash wrap");
    expect(doc).not.toContain("```bash\n");
  }
});

test("getting-started and BYOK notes match the current alpha.5 packet", () => {
  const guide = readRepoFile("docs/getting-started.md");
  const byok = readRepoFile("docs/byok-trust-model.md");
  const publicByok = readRepoFile(
    "docs-site/src/content/docs/guides/byok-trust-model.md",
  );

  expectAll(guide, [
    `published \`${version}\` proof packet uses one canonical repo-root \`bunx\` command`,
    `--version\` prints \`${version}\``,
    `${exactVersionPackageToken} audit --target . --ci --output ./anvil-audit.md`,
  ]);

  expectAll(byok, [
    `published \`${version}\` proof packet uses one canonical repo-root \`bunx\` command`,
    "bunx @lambdacurry/anvil@alpha audit --target ./my-repo --ci",
  ]);

  expectAll(publicByok, [
    "bunx @lambdacurry/anvil@alpha audit --target ./my-repo --ci",
    "deprecated alias for `--ci`",
  ]);
});

test("historical alpha4 packet remains retained evidence for the legacy spelling", () => {
  const packet = readRepoFile(
    "docs/proofs/2026-05-23-alpha4-outside-tester-send-packet.md",
  );

  expectAll(packet, [
    "@lambdacurry/anvil@0.1.0-alpha.4",
    "--no-ai",
    legacyNoAiDiffNote,
    legacyNoAiCompatibilityNote,
  ]);
});

test("proof packet README and template keep validation rules explicit", () => {
  const proofReadme = readRepoFile("docs/proofs/README.md");
  const template = readRepoFile("docs/proofs/first-user-proof-template.md");

  expectAll(proofReadme, [
    "bun run verify:first-user-proof -- docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md",
    "deterministic `counts` / `does-not-count` result",
    "It validates against the saved packet's `Pinned CLI version`, not whatever version `package.json` reaches later on current `main`.",
  ]);

  expectAll(template, [
    "Keep exactly one saved audit command in `Exact command`, matched to the shell layout you record below.",
    "Do not retain both the repo-root and parent-directory variants in the same packet.",
  ]);
});

test("generated llms-full preserves the pinned proof-lane handoff contract", () => {
  const llmsFull = readRepoFile("docs-site/public/llms-full.txt");

  expectAll(llmsFull, [
    "keep using the exact pinned `bunx @lambdacurry/anvil@<exact-version> ...` command from that outreach note",
    pinnedProofPacketUsesCiNote,
    "https://lambda-curry.github.io/anvil/guides/first-user-proof-packet",
    plainRepoRootExactVersionAuditCommand,
  ]);

  expect(llmsFull).not.toContain(
    "https://github.com/lambda-curry/anvil/blob/main/docs/",
  );
  expect(llmsFull).not.toContain("  --output ./your-repo/anvil-audit.md");
});

test("public proof-lane docs keep canonical no-trailing-slash URLs", () => {
  const files = [
    "README.md",
    "docs/byok-trust-model.md",
    "docs/config-examples.md",
    "docs/first-user-proof.md",
    "docs/first-user-proof-packet.md",
    "docs/getting-started.md",
    "docs-site/public/llms-full.txt",
    "docs-site/public/llms.txt",
  ];

  const canonicalUrls = [
    "https://lambda-curry.github.io/anvil/getting-started/first-audit",
    "https://lambda-curry.github.io/anvil/guides/configuration",
    "https://lambda-curry.github.io/anvil/guides/byok-trust-model",
    "https://lambda-curry.github.io/anvil/guides/first-user-proof",
    "https://lambda-curry.github.io/anvil/guides/first-user-proof-packet",
    "https://lambda-curry.github.io/anvil/guides/mine-pr",
  ];

  for (const file of files) {
    const content = readRepoFile(file);

    for (const url of canonicalUrls) {
      expect(content).not.toContain(`${url}/`);
    }
  }
});
