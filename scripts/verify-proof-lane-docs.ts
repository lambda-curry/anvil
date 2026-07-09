import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canonicalSavedReportPath,
  exactVersionPackageToken,
  expectedVersion,
  pinnedProofPacketUsesCiNote,
  plainPinnedRepoRootAuditCommand,
  plainRepoRootExactVersionAuditCommand,
  threeLineOpener,
  wrappedExactVersionCommand,
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
    path: resolve(DOCS_ROOT, "guides", "first-user-proof.md"),
    checks: [
      ...threeLineOpener,
      "`--ci`",
      "one command",
      canonicalSavedReportPath,
    ],
  },
  {
    path: resolve(DOCS_ROOT, "guides", "first-user-proof-packet.md"),
    checks: [
      ...threeLineOpener,
      "`--ci`",
      "one repo-root saved-report command",
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
      pinnedProofPacketUsesCiNote,
      "keep using the exact pinned `bunx @lambdacurry/anvil@<exact-version> ...` command from that outreach note",
      "https://lambda-curry.github.io/anvil/guides/first-user-proof-packet",
      canonicalSavedReportPath,
      exactVersionPackageToken,
      plainRepoRootExactVersionAuditCommand,
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

const PROOF_PACKET_SECTION_MARKER =
  "Send this three-line note, then paste the exact command below it:";
const PROOF_PACKET_SECTION_END_MARKER = "## Operator checklist";
const FIRST_USER_PROOF_SECTION_MARKER = "## Exact command to send";
const FIRST_USER_PROOF_SECTION_END_MARKER =
  "## Public docs to share with the tester";
const HOMEPAGE_SECTION_MARKER = "## Start with one real audit";
const HOMEPAGE_SECTION_END_MARKER = "<CardGrid stagger>";
const HOMEPAGE_FIRST_AUDIT_BLOCK = [
  "bunx @lambdacurry/anvil audit \\",
  "  --target . \\",
  "  --ci",
] as const;
const PROOF_PACKET_BLOCKS = [
  [plainRepoRootExactVersionAuditCommand],
  wrappedExactVersionCommand,
] as const;
const FIRST_USER_PROOF_BLOCKS = [
  [plainRepoRootExactVersionAuditCommand],
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
    label: "first-user-proof guide",
    path: resolve(DOCS_ROOT, "guides", "first-user-proof.md"),
    sectionMarker: FIRST_USER_PROOF_SECTION_MARKER,
    endMarker: FIRST_USER_PROOF_SECTION_END_MARKER,
    expectedBlocks: [...FIRST_USER_PROOF_BLOCKS],
    style: "wrapped",
  },
  {
    label: "llms-full first-user-proof handoff",
    path: resolve(PUBLIC_DOCS_ROOT, "llms-full.txt"),
    sectionMarker: FIRST_USER_PROOF_SECTION_MARKER,
    endMarker: FIRST_USER_PROOF_SECTION_END_MARKER,
    expectedBlocks: [...FIRST_USER_PROOF_BLOCKS],
    style: "wrapped",
  },
  {
    label: "first-user-proof-packet guide",
    path: resolve(DOCS_ROOT, "guides", "first-user-proof-packet.md"),
    sectionMarker: PROOF_PACKET_SECTION_MARKER,
    endMarker: PROOF_PACKET_SECTION_END_MARKER,
    expectedBlocks: [...PROOF_PACKET_BLOCKS],
    style: "wrapped",
  },
  {
    label: "llms-full proof-packet handoff",
    path: resolve(PUBLIC_DOCS_ROOT, "llms-full.txt"),
    sectionMarker: PROOF_PACKET_SECTION_MARKER,
    endMarker: PROOF_PACKET_SECTION_END_MARKER,
    expectedBlocks: [...PROOF_PACKET_BLOCKS],
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

function getSectionText(
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

function extractBashBlocks(
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
    const sectionText = getSectionText(
      text,
      contract.sectionMarker,
      contract.endMarker,
    );

    if (!sectionText) {
      failures.push(
        `${contract.path} is missing the proof-packet section markers`,
      );
      continue;
    }

    const bashBlocks = extractBashBlocks(sectionText, contract.style);

    if (bashBlocks.length < contract.expectedBlocks.length) {
      failures.push(
        `${contract.path} is missing expected ${contract.style} proof-lane bash blocks`,
      );
      continue;
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
        for (const line of actualBlock) {
          if (line.length > contract.maxLineLength) {
            failures.push(
              `${contract.path} proof-packet block ${index + 1} exceeds ${contract.maxLineLength} chars on one line`,
            );
          }
        }

        checks.push(
          `${contract.path} keeps ${contract.label} block ${index + 1} within ${contract.maxLineLength} chars per line`,
        );
      }
    }
  }

  return { checks, failures };
}

function main(): void {
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
