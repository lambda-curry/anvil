import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

const packageJson = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
) as { version: string };

const expectedVersion = packageJson.version;
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const REQUIRED_FIELDS = [
  "Date",
  "Tester",
  "Outside Lambda Curry",
  "Repo tested",
  "Install path",
  "Shell layout",
  "Exact command",
  "Pinned CLI version",
  "Observed `--version` output, if captured",
  "First-try result",
  "First failure, if any",
  "First useful next action named by tester",
  "Confusing wording or friction",
  "Short quote about usefulness or friction",
  "Saved report path or screenshot link",
  "Follow-up issue or doc fix created",
] as const;

const REQUIRED_LOCAL_ONLY_FLAG_BY_VERSION: Record<string, "--no-ai" | "--ci"> =
  {
    "0.1.0-alpha.4": "--no-ai",
  };

type FieldName = (typeof REQUIRED_FIELDS)[number];

type ValidationResult = {
  checks: string[];
  expectedVersion: string;
  failures: string[];
  packetPath: string;
  result: "counts" | "does-not-count";
};

type ParsedPacket = Record<FieldName, string>;

const REQUIRED_FOR_COUNTS: FieldName[] = [
  "Date",
  "Tester",
  "Outside Lambda Curry",
  "Repo tested",
  "Install path",
  "Shell layout",
  "Exact command",
  "Pinned CLI version",
  "First-try result",
  "First useful next action named by tester",
  "Short quote about usefulness or friction",
  "Saved report path or screenshot link",
];

const FIELD_SET = new Set<FieldName>(REQUIRED_FIELDS);
const FIELD_PREFIXES = REQUIRED_FIELDS.map((field) => `- ${field}:`);

function usage(): never {
  console.error(
    "Usage: bun run scripts/verify-first-user-proof.ts <docs/proofs/YYYY-MM-DD-<tester>-first-user-proof.md>",
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { packetPath: string } {
  const args = argv.slice(2);

  if (args.length !== 1 || args[0] === "--help" || args[0] === "-h") {
    usage();
  }

  return {
    packetPath: args[0],
  };
}

function looksEmpty(value: string): boolean {
  return /^(?:|n\/a|na|none|not captured|not provided|tbd|todo)$/i.test(
    value.trim(),
  );
}

function normalizeValue(value: string): string {
  return value
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function getLogicalCommandLines(exactCommand: string): string[] {
  const logicalLines: string[] = [];
  let current = "";

  for (const rawLine of exactCommand.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = rawLine.trim();

    if (trimmed.length === 0) {
      if (current.length > 0) {
        logicalLines.push(current.replace(/\s+/g, " ").trim());
        current = "";
      }
      continue;
    }

    const normalizedLine = trimmed.replace(/\s+/g, " ");
    if (current.length === 0) {
      current = normalizedLine;
    } else {
      current = `${current.replace(/\\$/, "").trimEnd()} ${normalizedLine}`;
    }

    if (!trimmed.endsWith("\\")) {
      logicalLines.push(current.replace(/\s+/g, " ").trim());
      current = "";
    }
  }

  if (current.length > 0) {
    logicalLines.push(current.replace(/\s+/g, " ").trim());
  }

  return logicalLines;
}

function getAuditCommandLines(exactCommand: string): string[] {
  return getLogicalCommandLines(exactCommand).filter(
    (line) =>
      /^(?:bunx|npx)\s+@lambdacurry\/anvil@\S+\s+audit\b/.test(line) ||
      /^anvil\s+audit\b/.test(line),
  );
}

function matchesRepoRootLayout(auditCommand: string): boolean {
  return /\s--target\s+\.(?:\s|$)/.test(auditCommand);
}

function matchesParentDirectoryLayout(auditCommand: string): boolean {
  return /\s--target\s+\.\/(?!\.?(?:\s|$))\S*/.test(auditCommand);
}

function getOutputPath(auditCommand: string): string | null {
  const match = auditCommand.match(/(?:^|\s)--output\s+(\S+)(?:\s|$)/);
  return match?.[1] ?? null;
}

function getArtifactReference(savedArtifact: string): string {
  const trimmed = savedArtifact.trim();
  const markdownLinkMatch = trimmed.match(/^\[[^\]]+\]\((.+)\)$/s);
  let reference = markdownLinkMatch ? markdownLinkMatch[1].trim() : trimmed;

  if (reference.startsWith("<") && reference.endsWith(">")) {
    reference = reference.slice(1, -1).trim();
  }

  if (reference.startsWith("`") && reference.endsWith("`")) {
    reference = reference.slice(1, -1).trim();
  }

  return reference;
}

function isExternalArtifactReference(reference: string): boolean {
  return /^https?:\/\//i.test(reference);
}

function isScreenshotArtifact(reference: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|svg|pdf)(?:[#?].*)?$/i.test(reference);
}

function isPlaceholder(field: FieldName, value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return true;
  }

  if (trimmed.includes("<exact-version>")) {
    return true;
  }

  switch (field) {
    case "Outside Lambda Curry":
      return /^yes \/ no$/i.test(trimmed);
    case "Install path":
      return /^bunx \/ npx \/ global install$/i.test(trimmed);
    case "Shell layout":
      return /target repo root with `--target \.` \/ parent directory with `--target \.\/repo` \/ other/i.test(
        trimmed,
      );
    case "First-try result":
      return /^success \/ failure$/i.test(trimmed);
    default:
      return false;
  }
}

function parsePacket(markdown: string): ParsedPacket {
  const parsed = Object.fromEntries(
    REQUIRED_FIELDS.map((field) => [field, ""]),
  ) as ParsedPacket;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let currentField: FieldName | null = null;

  for (const line of lines) {
    const matchingField = REQUIRED_FIELDS.find((field) =>
      line.startsWith(`- ${field}:`),
    );

    if (matchingField) {
      currentField = matchingField;
      parsed[matchingField] = line
        .slice(`- ${matchingField}:`.length)
        .trimStart();
      continue;
    }

    if (!currentField) {
      continue;
    }

    const isAnotherField = FIELD_PREFIXES.some((prefix) =>
      line.startsWith(prefix),
    );
    if (isAnotherField) {
      currentField = null;
      continue;
    }

    if (line.trim().length === 0 && parsed[currentField].length === 0) {
      continue;
    }

    parsed[currentField] = parsed[currentField].length
      ? `${parsed[currentField]}\n${line}`
      : line;
  }

  for (const field of REQUIRED_FIELDS) {
    parsed[field] = normalizeValue(parsed[field]);
  }

  return parsed;
}

function getPinnedVersion(
  packet: ParsedPacket,
  fallbackVersion: string,
): string {
  const savedVersion = packet["Pinned CLI version"].trim();

  if (
    savedVersion.length === 0 ||
    isPlaceholder("Pinned CLI version", savedVersion)
  ) {
    return fallbackVersion;
  }

  return savedVersion;
}

function validatePacketText(
  markdown: string,
  packetPath: string,
  fallbackVersion = expectedVersion,
): ValidationResult {
  const packet = parsePacket(markdown);
  const version = getPinnedVersion(packet, fallbackVersion);
  const failures: string[] = [];
  const checks: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (!FIELD_SET.has(field)) {
      continue;
    }

    if (packet[field].length > 0) {
      checks.push(`captured ${field}`);
    }
  }

  for (const field of REQUIRED_FOR_COUNTS) {
    if (packet[field].length === 0 || isPlaceholder(field, packet[field])) {
      failures.push(`missing required field content: ${field}`);
    }
  }

  const filename = basename(packetPath);
  if (!/^\d{4}-\d{2}-\d{2}-.+-first-user-proof\.md$/.test(filename)) {
    failures.push(
      "packet filename must match YYYY-MM-DD-<tester>-first-user-proof.md",
    );
  } else {
    checks.push("packet filename matches proof naming contract");
  }

  if (!/^yes$/i.test(packet["Outside Lambda Curry"])) {
    failures.push("Outside Lambda Curry must be `yes`");
  } else {
    checks.push("outside tester confirmed");
  }

  if (!/^success$/i.test(packet["First-try result"])) {
    failures.push(
      "First-try result must be `success` to count for Milestone 3",
    );
  } else {
    checks.push("first run succeeded");
  }

  if (
    !looksEmpty(packet["Pinned CLI version"]) &&
    !isPlaceholder("Pinned CLI version", packet["Pinned CLI version"]) &&
    !EXACT_VERSION_RE.test(packet["Pinned CLI version"])
  ) {
    failures.push(
      "Pinned CLI version must be one exact published package version like 0.1.0-alpha.4",
    );
  } else {
    checks.push("pinned CLI version anchors the saved proof lane");
  }

  const installPath = packet["Install path"];
  if (!/^(bunx|npx|global install)$/i.test(installPath)) {
    failures.push(
      "Install path must be one of `bunx`, `npx`, or `global install`",
    );
  }

  const exactCommand = packet["Exact command"];
  const logicalCommandLines = getLogicalCommandLines(exactCommand);
  const auditCommands = getAuditCommandLines(exactCommand);
  if (auditCommands.length > 1) {
    failures.push(
      "Exact command must keep exactly one saved audit command; do not retain both repo-root and parent-directory variants in one proof packet",
    );
  }
  const isGlobalInstall = /^global install$/i.test(installPath);
  const usesBunxLauncher = logicalCommandLines.some((line) =>
    /^bunx\s+@lambdacurry\/anvil@/.test(line),
  );
  const usesNpxLauncher = logicalCommandLines.some((line) =>
    /^npx\s+@lambdacurry\/anvil@/.test(line),
  );
  if (isGlobalInstall) {
    if (
      !logicalCommandLines.some(
        (line) => line === `bun add -g @lambdacurry/anvil@${version}`,
      )
    ) {
      failures.push(
        `Exact command must include the pinned global install line \`bun add -g @lambdacurry/anvil@${version}\``,
      );
    }
    if (!logicalCommandLines.some((line) => /^anvil\b.*\baudit\b/.test(line))) {
      failures.push(
        "Exact command must include the `anvil audit` run line for global install packets",
      );
    }
    if (usesBunxLauncher || usesNpxLauncher) {
      failures.push(
        "Exact command must not mix `bunx` or `npx` lines into a `global install` proof packet; keep every saved launcher line on the declared install path",
      );
    }
  } else {
    if (!exactCommand.includes(`@lambdacurry/anvil@${version}`)) {
      failures.push(`Exact command must pin @lambdacurry/anvil@${version}`);
    }

    if (/^bunx$/i.test(installPath) && !usesBunxLauncher) {
      failures.push(
        "Exact command must use the `bunx @lambdacurry/anvil@...` launcher when Install path is `bunx`",
      );
    }

    if (/^bunx$/i.test(installPath) && usesNpxLauncher) {
      failures.push(
        "Exact command must not mix `npx` lines into a `bunx` proof packet; keep the optional `--version` cross-check on the same install path",
      );
    }

    if (/^npx$/i.test(installPath) && !usesNpxLauncher) {
      failures.push(
        "Exact command must use the `npx @lambdacurry/anvil@...` launcher when Install path is `npx`",
      );
    }

    if (/^npx$/i.test(installPath) && usesBunxLauncher) {
      failures.push(
        "Exact command must not mix `bunx` lines into an `npx` proof packet; keep the optional `--version` cross-check on the same install path",
      );
    }

    const usesGlobalAnvil = logicalCommandLines.some((line) =>
      /^anvil\b/.test(line),
    );
    if (usesGlobalAnvil) {
      failures.push(
        `Exact command must not append bare \`anvil\` launcher lines to a \`${installPath}\` proof packet; keep every command on the declared install path`,
      );
    }
  }
  if (/@lambdacurry\/anvil@alpha\b/.test(exactCommand)) {
    failures.push("Exact command cannot use the floating @alpha tag");
  }
  if (!/\baudit\b/.test(exactCommand)) {
    failures.push("Exact command must include the `audit` subcommand");
  }
  if (!/(--no-ai|--ci)\b/.test(exactCommand)) {
    failures.push(
      "Exact command must stay on the local-only `--no-ai`/`--ci` lane",
    );
  }
  const requiredLocalOnlyFlag = REQUIRED_LOCAL_ONLY_FLAG_BY_VERSION[version];
  if (
    requiredLocalOnlyFlag &&
    !new RegExp(`\\${requiredLocalOnlyFlag}\\b`).test(exactCommand)
  ) {
    failures.push(
      `Exact command must keep the pinned ${version} local-only spelling \`${requiredLocalOnlyFlag}\``,
    );
  }
  if (!/--target\b/.test(exactCommand)) {
    failures.push("Exact command must include an explicit --target");
  }
  const shellLayout = packet["Shell layout"];
  if (auditCommands.length === 1) {
    const savedAuditCommand = auditCommands[0];

    if (
      /^target repo root with `--target \.`$/i.test(shellLayout) &&
      !matchesRepoRootLayout(savedAuditCommand)
    ) {
      failures.push(
        "Shell layout says `target repo root with --target .`, but the saved audit command does not use `--target .`",
      );
    }

    if (
      /^parent directory with `--target \.\/repo`$/i.test(shellLayout) &&
      !matchesParentDirectoryLayout(savedAuditCommand)
    ) {
      failures.push(
        "Shell layout says `parent directory with --target ./repo`, but the saved audit command does not use a parent-directory `--target ./...` path",
      );
    }

    const outputPath = getOutputPath(savedAuditCommand);
    const savedArtifactReference = getArtifactReference(
      packet["Saved report path or screenshot link"],
    );

    if (
      outputPath &&
      !isExternalArtifactReference(savedArtifactReference) &&
      !isScreenshotArtifact(savedArtifactReference) &&
      savedArtifactReference !== outputPath
    ) {
      failures.push(
        "Saved report path or screenshot link must match the retained `--output` path when the packet keeps a local report artifact",
      );
    } else if (outputPath && savedArtifactReference === outputPath) {
      checks.push("saved local report path matches retained --output path");
    }
  }
  if (failures.every((failure) => !failure.startsWith("Exact command"))) {
    checks.push("exact command stays on the pinned proof lane");
  }

  const observedVersion = packet["Observed `--version` output, if captured"];
  if (!looksEmpty(observedVersion) && !observedVersion.includes(version)) {
    failures.push(
      `Observed --version output, when captured, must include ${version}`,
    );
  } else if (!looksEmpty(observedVersion)) {
    checks.push("captured --version output matches pinned version");
  }

  if (/^other$/i.test(shellLayout)) {
    failures.push(
      "Shell layout cannot be bare `other`; describe the actual layout",
    );
  }

  const firstFailure = packet["First failure, if any"];
  if (
    /^success$/i.test(packet["First-try result"]) &&
    !looksEmpty(firstFailure)
  ) {
    failures.push(
      "First failure, if any must stay empty when the first-try result is success",
    );
  }

  const friction = packet["Confusing wording or friction"];
  const followUp = packet["Follow-up issue or doc fix created"];
  if (!looksEmpty(friction) && looksEmpty(followUp)) {
    failures.push(
      "Follow-up issue or doc fix created is required when friction is reported",
    );
  }

  const result = failures.length === 0 ? "counts" : "does-not-count";

  return {
    checks,
    expectedVersion: version,
    failures,
    packetPath,
    result,
  };
}

function main() {
  const { packetPath } = parseArgs(process.argv);
  const absolutePath = resolve(process.cwd(), packetPath);
  const markdown = readFileSync(absolutePath, "utf8");
  const result = validatePacketText(markdown, absolutePath);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.result === "counts" ? 0 : 2);
}

if (import.meta.main) {
  main();
}

export {
  expectedVersion,
  parsePacket,
  validatePacketText,
  type FieldName,
  type ValidationResult,
};
