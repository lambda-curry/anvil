import type { CliChecks } from "./cli-detectors.ts";

export type CliCheckKey = keyof CliChecks;

const CHECK_DEFINITIONS: Array<{
  key: CliCheckKey;
  pattern: RegExp;
  signal: string;
  recommendation: string;
}> = [
  {
    key: "argumentParsing",
    pattern:
      /process\.argv|commander|yargs|parseArgs\(|cac\(|oclif|clipanion|minimist|arg\(/i,
    signal: "argument parser detected",
    recommendation:
      "Use a structured argument parser (commander/yargs/cac) instead of ad hoc argv handling.",
  },
  {
    key: "helpText",
    pattern: /--help|\.help\(|usage\(|showHelp|printHelp/i,
    signal: "help/usage text detected",
    recommendation: "Add explicit --help/usage output to CLI entrypoints.",
  },
  {
    key: "exitCodeHygiene",
    pattern:
      /process\.exit\([1-9]|throw\s+new\s+Error|return\s+[1-9];|Deno\.exit\([1-9]/i,
    signal: "non-zero exit/error path detected",
    recommendation: "Standardize failure paths to return non-zero exit codes.",
  },
  {
    key: "inputValidation",
    pattern: /zod|yup|joi|ajv|schema|validate\(|safeParse\(/i,
    signal: "input validation signal detected",
    recommendation:
      "Validate command inputs before execution (zod/yup/joi or equivalent schema checks).",
  },
  {
    key: "errorBoundary",
    pattern:
      /try\s*\{|\.catch\(|process\.on\(['"](uncaughtException|unhandledRejection)/i,
    signal: "error boundary handling detected",
    recommendation:
      "Wrap command handlers with a top-level error boundary to avoid unhandled rejections.",
  },
];

export function emptyChecks(): CliChecks {
  return {
    argumentParsing: false,
    helpText: false,
    exitCodeHygiene: false,
    inputValidation: false,
    errorBoundary: false,
  };
}

export function emptyCheckEvidence(): Record<CliCheckKey, string[]> {
  return {
    argumentParsing: [],
    helpText: [],
    exitCodeHygiene: [],
    inputValidation: [],
    errorBoundary: [],
  };
}

function recordCheck(
  checks: CliChecks,
  checkEvidence: Record<CliCheckKey, string[]>,
  key: CliCheckKey,
  relativePath: string,
  signal: string,
) {
  checks[key] = true;
  if (checkEvidence[key].length < 3) {
    checkEvidence[key].push(`${relativePath}: ${signal}`);
  }
}

export function inspectEntrypointContent(
  relativePath: string,
  content: string,
  checks: CliChecks,
  checkEvidence: Record<CliCheckKey, string[]>,
) {
  for (const definition of CHECK_DEFINITIONS) {
    if (!definition.pattern.test(content)) continue;
    recordCheck(
      checks,
      checkEvidence,
      definition.key,
      relativePath,
      definition.signal,
    );
  }
}

export function buildRecommendations(
  checks: CliChecks,
  isCliProject: boolean,
): string[] {
  if (!isCliProject) return [];
  return CHECK_DEFINITIONS.filter((definition) => !checks[definition.key]).map(
    (definition) => definition.recommendation,
  );
}
