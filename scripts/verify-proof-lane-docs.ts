import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canonicalSavedReportPath,
  exactVersionPackageToken,
  expectedVersion,
  plainPinnedRepoRootAuditCommand,
  threeLineOpener,
} from "./proof-lane-contract.ts";

export { expectedVersion } from "./proof-lane-contract.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DOCS_ROOT = resolve(REPO_ROOT, "docs-site", "src", "content", "docs");
const PUBLIC_DOCS_ROOT = resolve(REPO_ROOT, "docs-site", "public");

type DocContract = {
  checks: string[];
  forbiddenChecks?: ReadonlyArray<string>;
  path: string;
};

type CodeBlockContract = {
  endMarker: string;
  expectedBlocks: ReadonlyArray<ReadonlyArray<string>>;
  label: string;
  maxLineLength?: number;
  path: string;
  sectionMarker: string;
  style: "plain" | "wrapped";
};

type ValidationResult = {
  checks: string[];
  failures: string[];
};

const DOC_CONTRACTS: DocContract[] = [
  {
    path: resolve(DOCS_ROOT, "getting-started", "first-audit.md"),
    checks: ["`--ci`", "not for pinned proof collection"],
  },
  {
    path: resolve(REPO_ROOT, "docs", "first-user-proof.md"),
    checks: [
      ...threeLineOpener,
      "`--ci`",
      "one exact first-run command",
      canonicalSavedReportPath,
    ],
  },
  {
    path: resolve(REPO_ROOT, "docs", "first-user-proof-packet.md"),
    checks: [
      ...threeLineOpener,
      "`--ci`",
      "repo-root saved-report command",
      canonicalSavedReportPath,
    ],
  },
  {
    path: resolve(DOCS_ROOT, "reference", "cli.md"),
    checks: [
      "hidden alias: `--no-ai`",
      "Deprecated compatibility alias for `--ci`",
      `current \`${expectedVersion}\` packet uses the public \`--ci\` spelling`,
    ],
  },
  {
    path: resolve(PUBLIC_DOCS_ROOT, "llms-full.txt"),
    checks: [
      "keep using the exact pinned `bunx @lambdacurry/anvil@<exact-version> ...` command from that outreach note",
      exactVersionPackageToken,
    ],
  },
  {
    path: resolve(
      REPO_ROOT,
      "docs",
      "proofs",
      "current-outside-tester-send-packet.md",
    ),
    checks: [
      `This packet stays pinned to \`@lambdacurry/anvil@${expectedVersion}\`.`,
      "Do not swap the tester onto the floating `@alpha` tag.",
      ...threeLineOpener,
      "https://lambda-curry.github.io/anvil/getting-started/first-audit",
      "https://lambda-curry.github.io/anvil/guides/byok-trust-model",
      `bunx @lambdacurry/anvil@${expectedVersion} --version`,
      "bun run verify:first-user-proof -- docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md",
      "Historical note: the original dated retained packet for this same pinned proof lane remains at `docs/proofs/2026-05-23-alpha4-outside-tester-send-packet.md`.",
    ],
    forbiddenChecks: [
      "@lambdacurry/anvil@alpha",
      `npx @lambdacurry/anvil@${expectedVersion}`,
    ],
  },
];

const HOMEPAGE_SECTION_MARKER = "## Start with one real audit";
const HOMEPAGE_SECTION_END_MARKER = "<CardGrid stagger>";
const HOMEPAGE_FIRST_AUDIT_BLOCK = [
  "bunx @lambdacurry/anvil audit \\",
  "  --target . \\",
  "  --ci",
] as const;

const CODE_BLOCK_CONTRACTS: CodeBlockContract[] = [
  {
    label: "homepage first-audit block",
    path: resolve(DOCS_ROOT, "index.mdx"),
    sectionMarker: HOMEPAGE_SECTION_MARKER,
    endMarker: HOMEPAGE_SECTION_END_MARKER,
    expectedBlocks: [HOMEPAGE_FIRST_AUDIT_BLOCK],
    style: "wrapped",
  },
  {
    label: "current-outside-tester send packet",
    path: resolve(
      REPO_ROOT,
      "docs",
      "proofs",
      "current-outside-tester-send-packet.md",
    ),
    sectionMarker: "## Exact command to send",
    endMarker: "## Copy-paste outreach note",
    expectedBlocks: [[plainPinnedRepoRootAuditCommand]],
    style: "plain",
  },
];

export function getSectionText(
  text: string,
  sectionMarker: string,
  endMarker: string,
): string | null {
  const start = text.indexOf(sectionMarker);
  if (start === -1) {
    return null;
  }

  const end = text.indexOf(endMarker, start);
  if (end === -1) {
    return null;
  }

  return text.slice(start, end);
}

export function extractBashBlocks(
  sectionText: string,
  style: CodeBlockContract["style"],
): string[][] {
  const pattern =
    style === "wrapped"
      ? /```bash wrap\n([\s\S]*?)\n```/g
      : /```bash\n([\s\S]*?)\n```/g;

  return [...sectionText.matchAll(pattern)].map((match) =>
    match[1].split("\n"),
  );
}

export function validateCodeBlock(
  text: string,
  contract: CodeBlockContract,
): ValidationResult {
  const checks: string[] = [];
  const failures: string[] = [];

  const sectionText = getSectionText(
    text,
    contract.sectionMarker,
    contract.endMarker,
  );

  if (!sectionText) {
    failures.push(
      `${contract.path} is missing the proof-packet section markers`,
    );
    return { checks, failures };
  }

  const bashBlocks = extractBashBlocks(sectionText, contract.style);

  if (bashBlocks.length < contract.expectedBlocks.length) {
    failures.push(
      `${contract.path} is missing expected ${contract.style} proof-lane bash blocks`,
    );
    return { checks, failures };
  }

  for (const [index, expectedBlock] of contract.expectedBlocks.entries()) {
    const actualBlock = bashBlocks[index];

    if (!actualBlock) {
      failures.push(
        `${contract.path} is missing proof-packet block ${index + 1}`,
      );
      continue;
    }

    if (actualBlock.join("\n") !== expectedBlock.join("\n")) {
      failures.push(
        `${contract.path} ${contract.label} block ${index + 1} drifted from the narrow-screen command layout`,
      );
      continue;
    }

    checks.push(
      `${contract.path} keeps ${contract.label} block ${index + 1} on the expected ${contract.style} command lines`,
    );

    if (contract.maxLineLength) {
      let exceeded = false;
      for (const line of actualBlock) {
        if (line.length > contract.maxLineLength) {
          failures.push(
            `${contract.path} proof-packet block ${index + 1} exceeds ${contract.maxLineLength} chars on one line`,
          );
          exceeded = true;
        }
      }

      if (!exceeded) {
        checks.push(
          `${contract.path} keeps ${contract.label} block ${index + 1} within ${contract.maxLineLength} chars per line`,
        );
      }
    }
  }

  return { checks, failures };
}

export function validateProofLaneDocs(): ValidationResult {
  const checks: string[] = [];
  const failures: string[] = [];

  for (const contract of DOC_CONTRACTS) {
    const text = readFileSync(contract.path, "utf8");

    for (const needle of contract.checks) {
      if (!text.includes(needle)) {
        failures.push(`${contract.path} is missing: ${needle}`);
        continue;
      }

      checks.push(`${contract.path} contains ${needle}`);
    }

    for (const forbiddenNeedle of contract.forbiddenChecks ?? []) {
      if (!text.includes(forbiddenNeedle)) {
        checks.push(`${contract.path} omits ${forbiddenNeedle}`);
        continue;
      }

      failures.push(`${contract.path} should not contain: ${forbiddenNeedle}`);
    }
  }

  for (const contract of CODE_BLOCK_CONTRACTS) {
    const text = readFileSync(contract.path, "utf8");
    const result = validateCodeBlock(text, contract);
    checks.push(...result.checks);
    failures.push(...result.failures);
  }

  return { checks, failures };
}

export function main(): void {
  const result = validateProofLaneDocs();

  if (result.failures.length > 0) {
    for (const failure of result.failures) {
      console.error(failure);
    }
    process.exit(1);
  }

  for (const check of result.checks) {
    console.log(check);
  }
}

if (import.meta.main) {
  main();
}
