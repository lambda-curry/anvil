import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { AuditConfig } from "./audit-config.ts";

export type GuardrailDimensionKey =
  | "ciDiscipline"
  | "typeSafety"
  | "testDepth"
  | "codeQuality"
  | "reviewOwnership"
  | "security"
  | "driftResilience";

export type GuardrailBreakdown = Record<GuardrailDimensionKey, number | null>;

export type HardGateResult = {
  dimension: GuardrailDimensionKey;
  minScore: number;
  actualScore: number | null;
  passed: boolean;
};

export type GuardrailScoreResult = {
  total: number;
  rawTotal: number;
  breakdown: GuardrailBreakdown;
  maturity: "Novice" | "Emerging" | "Reliable" | "Hardened";
  evidence: Record<GuardrailDimensionKey, string[]>;
  recommendations: string[];
  missingGuardrails: string[];
  profile: string;
  configPresent: boolean;
  applicability: Record<
    GuardrailDimensionKey,
    {
      applicable: boolean;
      reason: string | null;
      weight: number;
      minScoreHint: number | null;
    }
  >;
  hardGates: {
    enabled: boolean;
    exitCode: number;
    passed: boolean;
    results: HardGateResult[];
    failed: HardGateResult[];
  };
};

export type GuardrailInput = {
  projectRoot: string;
  ruleFilePaths: string[];
  driftSummary: {
    pathIssues: number;
    dateIssues: number;
  };
  auditConfig?: AuditConfig;
  configPresent?: boolean;
};

type SharedSignals = {
  workflowFiles: string[];
  workflowText: string;
  hasWorkflow: boolean;
  hasLintInCI: boolean;
  hasTestInCI: boolean;
  hasBuildInCI: boolean;
  hasTypecheckInCI: boolean;
  hasPullRequestTrigger: boolean;
  hasMergeQueueTrigger: boolean;
};

function readIfExists(path: string): string {
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function collectWorkflows(projectRoot: string): string[] {
  const workflowsDir = join(projectRoot, ".github", "workflows");
  if (!existsSync(workflowsDir)) return [];
  try {
    return readdirSync(workflowsDir)
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => join(workflowsDir, name));
  } catch {
    return [];
  }
}

function detectSharedSignals(projectRoot: string): SharedSignals {
  const workflowFiles = collectWorkflows(projectRoot);
  const workflowText = workflowFiles.map((f) => readIfExists(f)).join("\n\n");

  return {
    workflowFiles,
    workflowText,
    hasWorkflow:
      workflowFiles.length > 0 ||
      existsSync(join(projectRoot, ".gitlab-ci.yml")),
    hasLintInCI: /\b(lint|eslint|biome)\b/i.test(workflowText),
    hasTestInCI: /\b(test|vitest|jest|cypress|playwright|bun test)\b/i.test(
      workflowText,
    ),
    hasBuildInCI: /\b(build|compile)\b/i.test(workflowText),
    hasTypecheckInCI: /\b(typecheck|type-check|tsc --noEmit|tsc\b)\b/i.test(
      workflowText,
    ),
    hasPullRequestTrigger: /pull_request/i.test(workflowText),
    hasMergeQueueTrigger: /\bmerge_group\b/i.test(workflowText),
  };
}

function scoreCiDiscipline(signals: SharedSignals): {
  score: number;
  evidence: string[];
  recommendations: string[];
} {
  const evidence: string[] = [];
  const recommendations: string[] = [];

  if (!signals.hasWorkflow) {
    recommendations.push("Add CI workflows that run on pull requests.");
    return { score: 0, evidence, recommendations };
  }

  let score = 1;
  evidence.push(`Workflow files: ${signals.workflowFiles.length}`);

  const ciSignals = [
    signals.hasLintInCI,
    signals.hasTestInCI,
    signals.hasBuildInCI,
    signals.hasTypecheckInCI,
  ].filter(Boolean).length;
  if (ciSignals >= 2) score = 2;
  if (ciSignals >= 3 && signals.hasPullRequestTrigger) score = 3;
  if (ciSignals === 4 && signals.hasPullRequestTrigger) score = 4;
  if (
    score >= 4 &&
    (signals.hasMergeQueueTrigger ||
      /required checks|branch protection/i.test(signals.workflowText))
  )
    score = 5;

  if (!signals.hasPullRequestTrigger)
    recommendations.push(
      "Trigger CI on pull_request events, not just pushes to main.",
    );
  if (score >= 4 && !signals.hasMergeQueueTrigger) {
    recommendations.push(
      "If you rely on GitHub merge queue, trigger CI on merge_group too.",
    );
  }
  if (!signals.hasTypecheckInCI)
    recommendations.push("Add a dedicated typecheck step in CI.");

  return { score, evidence, recommendations };
}

function parseTsconfig(projectRoot: string): Record<string, unknown> {
  const path = join(projectRoot, "tsconfig.json");
  const text = readIfExists(path);
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function collectTsconfigFiles(projectRoot: string): string[] {
  const out: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [
    { dir: projectRoot, depth: 0 },
  ];
  const skip = new Set([
    ".git",
    "node_modules",
    ".next",
    ".turbo",
    "dist",
    "build",
    "coverage",
    ".cache",
    "out",
  ]);

  while (queue.length > 0 && out.length < 240) {
    const current = queue.pop();
    if (!current) break;

    let entries: Dirent[];
    try {
      entries = readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < 4 && !skip.has(entry.name)) {
          queue.push({ dir: full, depth: current.depth + 1 });
        }
        continue;
      }

      if (/^tsconfig(\..+)?\.json$/i.test(entry.name)) {
        out.push(full);
      }
    }
  }

  return [...new Set(out)].sort();
}

type TsconfigFlags = {
  strict: boolean;
  noUncheckedIndexedAccess: boolean;
  exactOptionalPropertyTypes: boolean;
  extraStrict: boolean;
};

function emptyTsconfigFlags(): TsconfigFlags {
  return {
    strict: false,
    noUncheckedIndexedAccess: false,
    exactOptionalPropertyTypes: false,
    extraStrict: false,
  };
}

function resolveExtendedTsconfigPath(
  filePath: string,
  extendsValue: string,
): string | null {
  const basePath = isAbsolute(extendsValue)
    ? extendsValue
    : resolve(dirname(filePath), extendsValue);
  const candidates = basePath.endsWith(".json")
    ? [basePath]
    : [basePath, `${basePath}.json`];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function readPresetTsconfigFlags(extendsValue: string): TsconfigFlags {
  if (
    /^astro\/tsconfigs\/strict$/i.test(extendsValue) ||
    /(?:^|\/)strict(?:est)?$/i.test(extendsValue)
  ) {
    return {
      ...emptyTsconfigFlags(),
      strict: true,
    };
  }

  return emptyTsconfigFlags();
}

function readTsconfigFlags(
  filePath: string,
  seen = new Set<string>(),
): TsconfigFlags {
  const normalizedPath = resolve(filePath);
  if (seen.has(normalizedPath)) return emptyTsconfigFlags();
  seen.add(normalizedPath);

  const text = readIfExists(normalizedPath);
  if (!text) return emptyTsconfigFlags();

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const extendsValue =
      typeof parsed.extends === "string" ? parsed.extends : null;
    const inherited = extendsValue
      ? (() => {
          const extendedPath = resolveExtendedTsconfigPath(
            normalizedPath,
            extendsValue,
          );
          return extendedPath
            ? readTsconfigFlags(extendedPath, seen)
            : readPresetTsconfigFlags(extendsValue);
        })()
      : emptyTsconfigFlags();
    const compilerOptions =
      (parsed.compilerOptions as Record<string, unknown> | undefined) ?? {};
    const strict =
      typeof compilerOptions.strict === "boolean"
        ? compilerOptions.strict
        : inherited.strict;
    const noUncheckedIndexedAccess =
      typeof compilerOptions.noUncheckedIndexedAccess === "boolean"
        ? compilerOptions.noUncheckedIndexedAccess
        : inherited.noUncheckedIndexedAccess;
    const exactOptionalPropertyTypes =
      typeof compilerOptions.exactOptionalPropertyTypes === "boolean"
        ? compilerOptions.exactOptionalPropertyTypes
        : inherited.exactOptionalPropertyTypes;
    const extraStrict =
      noUncheckedIndexedAccess === true || exactOptionalPropertyTypes === true;
    return {
      strict,
      noUncheckedIndexedAccess,
      exactOptionalPropertyTypes,
      extraStrict,
    };
  } catch {
    const extendsMatch = text.match(/"extends"\s*:\s*"([^"]+)"/i);
    const inherited = extendsMatch?.[1]
      ? readPresetTsconfigFlags(extendsMatch[1])
      : emptyTsconfigFlags();
    const strict = /"strict"\s*:\s*true/i.test(text) || inherited.strict;
    const noUncheckedIndexedAccess =
      /"noUncheckedIndexedAccess"\s*:\s*true/i.test(text) ||
      inherited.noUncheckedIndexedAccess;
    const exactOptionalPropertyTypes =
      /"exactOptionalPropertyTypes"\s*:\s*true/i.test(text) ||
      inherited.exactOptionalPropertyTypes;
    return {
      strict,
      noUncheckedIndexedAccess,
      exactOptionalPropertyTypes,
      extraStrict:
        noUncheckedIndexedAccess === true ||
        exactOptionalPropertyTypes === true,
    };
  }
}

function scoreTypeSafety(
  projectRoot: string,
  signals: SharedSignals,
): { score: number; evidence: string[]; recommendations: string[] } {
  const evidence: string[] = [];
  const recommendations: string[] = [];
  const rootTsconfig = parseTsconfig(projectRoot);
  const tsconfigFiles = collectTsconfigFiles(projectRoot);
  const packageJsonText = readIfExists(join(projectRoot, "package.json"));

  if (tsconfigFiles.length === 0) {
    recommendations.push(
      "Add tsconfig.json (or workspace tsconfig files) with strict TypeScript settings.",
    );
    return { score: 0, evidence, recommendations };
  }

  let score = 1;
  evidence.push(`tsconfig files detected: ${tsconfigFiles.length}`);

  const flags = tsconfigFiles.map((path) => readTsconfigFlags(path));
  const strictCount = flags.filter((f) => f.strict).length;
  const extraStrictCount = flags.filter((f) => f.extraStrict).length;
  const hasAnyStrict = strictCount > 0;
  const hasAnyExtraStrict = extraStrictCount > 0;

  if (hasAnyStrict) {
    score = 2;
    evidence.push(
      `strict=true in ${strictCount}/${tsconfigFiles.length} tsconfig file(s)`,
    );
  }

  if (hasAnyExtraStrict) {
    score = Math.max(score, 3);
    evidence.push(
      `extra strict flags in ${extraStrictCount}/${tsconfigFiles.length} tsconfig file(s)`,
    );
  }

  if (signals.hasTypecheckInCI) {
    score = Math.max(score, 4);
    evidence.push("CI typecheck detected");
  }

  const eslintConfig = [
    join(projectRoot, "eslint.config.js"),
    join(projectRoot, "eslint.config.ts"),
    join(projectRoot, ".eslintrc.js"),
    join(projectRoot, ".eslintrc.cjs"),
    join(projectRoot, ".eslintrc.json"),
  ]
    .map((p) => readIfExists(p))
    .join("\n\n");

  const hasTypeAwareEslint =
    /@typescript-eslint\/no-unsafe-|parserOptions\s*:\s*{[^}]*project|typescript-eslint/i.test(
      eslintConfig,
    );
  const hasDedicatedExtraStrictLane =
    hasAnyExtraStrict &&
    (/\btypecheck:strict\b|\btsconfig\.[^"'`\s]*strict[^"'`\s]*\.json\b/i.test(
      `${packageJsonText}\n${signals.workflowText}`,
    ) ||
      (/noUncheckedIndexedAccess|exactOptionalPropertyTypes/.test(
        packageJsonText,
      ) &&
        /tsc\b|typecheck:strict/i.test(
          `${packageJsonText}\n${signals.workflowText}`,
        )));

  if (hasTypeAwareEslint) {
    score = Math.max(score, 5);
    evidence.push("type-aware ESLint rules detected");
  } else if (signals.hasTypecheckInCI && hasDedicatedExtraStrictLane) {
    score = Math.max(score, 5);
    evidence.push("dedicated extra-strict TypeScript lane enforced in CI");
  }

  if (Object.keys(rootTsconfig).length === 0 && tsconfigFiles.length > 1) {
    recommendations.push(
      "Consider a shared root tsconfig.base.json to keep workspace strictness consistent.",
    );
  }
  if (!hasAnyStrict) recommendations.push("Enable `strict: true` in tsconfig.");
  if (hasAnyStrict && strictCount < tsconfigFiles.length) {
    recommendations.push(
      "Align strict TypeScript settings across workspace tsconfig files.",
    );
  }
  if (!signals.hasTypecheckInCI)
    recommendations.push("Add `tsc --noEmit` (or equivalent) in CI.");
  if (score === 4) {
    recommendations.push(
      "To reach 5/5 type safety, either add type-aware ESLint rules or enforce a dedicated extra-strict tsconfig lane in CI (for example `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`).",
    );
  }

  return { score, evidence, recommendations };
}

function listTestFiles(projectRoot: string): string[] {
  const out: string[] = [];
  const queue = [projectRoot];
  const skip = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".turbo",
    "coverage",
  ]);

  while (queue.length > 0 && out.length < 400) {
    const current = queue.pop();
    if (!current) break;

    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) queue.push(full);
        continue;
      }
      if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        out.push(full);
      }
    }
  }

  return out;
}

function scoreTestDepth(
  projectRoot: string,
  signals: SharedSignals,
): { score: number; evidence: string[]; recommendations: string[] } {
  const evidence: string[] = [];
  const recommendations: string[] = [];

  const pkgText = readIfExists(join(projectRoot, "package.json"));
  const tests = listTestFiles(projectRoot);
  const hasTestScript = /"test"\s*:/.test(pkgText);

  if (!hasTestScript && tests.length === 0) {
    recommendations.push("Add baseline tests and a `test` script.");
    return { score: 0, evidence, recommendations };
  }

  let score = 1;
  if (hasTestScript) evidence.push("test script present");
  if (tests.length > 0) evidence.push(`test files: ${tests.length}`);

  if (hasTestScript && tests.length > 0) score = 2;
  if (signals.hasTestInCI) {
    score = Math.max(score, 3);
    evidence.push("tests run in CI");
  }

  const testConfigText = [
    readIfExists(join(projectRoot, "bunfig.toml")),
    readIfExists(join(projectRoot, "vitest.config.ts")),
    readIfExists(join(projectRoot, "vitest.config.js")),
    readIfExists(join(projectRoot, "jest.config.ts")),
    readIfExists(join(projectRoot, "jest.config.js")),
  ].join("\n\n");

  if (/coverage[\s\S]{0,120}threshold/i.test(testConfigText)) {
    score = Math.max(score, 4);
    evidence.push("coverage thresholds detected");
  }

  if (/retry|flaky|quarantine/i.test(testConfigText + signals.workflowText)) {
    score = Math.max(score, 5);
    evidence.push("flaky test policy signal detected");
  }

  if (!signals.hasTestInCI)
    recommendations.push("Run tests in CI for every PR.");
  if (!/coverage[\s\S]{0,120}threshold/i.test(testConfigText))
    recommendations.push("Set explicit coverage thresholds in test config.");

  return { score, evidence, recommendations };
}

function scoreCodeQuality(
  projectRoot: string,
  signals: SharedSignals,
): { score: number; evidence: string[]; recommendations: string[] } {
  const evidence: string[] = [];
  const recommendations: string[] = [];

  const lintConfigPresent = [
    "eslint.config.js",
    "eslint.config.ts",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    "biome.json",
    "biome.jsonc",
    ".oxlintrc.json",
    ".oxlintrc.yml",
    ".oxlintrc.yaml",
  ].some((p) => existsSync(join(projectRoot, p)));

  const formatConfigPresent = [
    ".prettierrc",
    "prettier.config.js",
    "prettier.config.ts",
    "biome.json",
    "biome.jsonc",
    ".oxfmtrc.json",
    ".oxfmtrc.yml",
    ".oxfmtrc.yaml",
  ].some((p) => existsSync(join(projectRoot, p)));

  let score = 0;
  if (lintConfigPresent) {
    score = 1;
    evidence.push("lint config detected");
  }
  if (signals.hasLintInCI) {
    score = Math.max(score, 2);
    evidence.push("lint in CI");
  }
  if (formatConfigPresent) {
    score = Math.max(score, 3);
    evidence.push("formatter config detected");
  }

  const workflowText = signals.workflowText;
  if (
    /max-warnings\s+0|warnings as errors|--error-on-warnings/i.test(
      workflowText,
    )
  ) {
    score = Math.max(score, 4);
    evidence.push("warning-as-error policy signal");
  }

  const hasPreCommit = [
    ".husky",
    ".pre-commit-config.yaml",
    "lefthook.yml",
    ".lefthook.yml",
  ].some((p) => existsSync(join(projectRoot, p)));
  if (hasPreCommit) {
    score = Math.max(score, 5);
    evidence.push("pre-commit hook tooling detected");
  }

  if (!lintConfigPresent)
    recommendations.push("Add lint tooling (ESLint or Biome).");
  if (!signals.hasLintInCI) recommendations.push("Run lint checks in CI.");

  return { score, evidence, recommendations };
}

function scoreReviewOwnership(projectRoot: string): {
  score: number;
  evidence: string[];
  recommendations: string[];
} {
  const evidence: string[] = [];
  const recommendations: string[] = [];

  const hasCodeowners = existsSync(join(projectRoot, ".github", "CODEOWNERS"));
  const hasPrTemplate =
    existsSync(join(projectRoot, ".github", "pull_request_template.md")) ||
    existsSync(join(projectRoot, ".github", "PULL_REQUEST_TEMPLATE"));
  const hasReviewBot = [
    join(projectRoot, ".coderabbit.yaml"),
    join(projectRoot, ".github", "workflows", "reviewdog.yml"),
    join(projectRoot, ".github", "workflows", "coderabbit.yml"),
  ].some((p) => existsSync(p));

  let score = 0;
  if (hasPrTemplate) {
    score = 1;
    evidence.push("PR template detected");
  }
  if (hasCodeowners) {
    score = Math.max(score, 3);
    evidence.push("CODEOWNERS detected");
  }
  if (
    hasCodeowners &&
    /AI-authored|generated code|copilot|claude/i.test(
      readIfExists(join(projectRoot, "AGENTS.md")),
    )
  ) {
    score = Math.max(score, 4);
    evidence.push("AI-specific review policy signal in AGENTS.md");
  }
  if (hasReviewBot) {
    score = Math.max(score, 5);
    evidence.push("automated review bot signal detected");
  }

  if (!hasCodeowners)
    recommendations.push("Add CODEOWNERS for critical paths.");
  if (!hasPrTemplate)
    recommendations.push("Add a pull request template with review checklist.");

  return { score, evidence, recommendations };
}

function scoreSecurity(projectRoot: string): {
  score: number;
  evidence: string[];
  recommendations: string[];
  missing: string[];
} {
  const evidence: string[] = [];
  const recommendations: string[] = [];
  const missing: string[] = [];

  let score = 0;

  const gitignore = readIfExists(join(projectRoot, ".gitignore"));
  if (/\.env/.test(gitignore)) {
    score = 1;
    evidence.push(".gitignore protects env files");
  } else {
    missing.push("Secret ignore patterns (.env)");
  }

  const hasSecretScanning = [
    join(projectRoot, ".gitleaks.toml"),
    join(projectRoot, ".github", "workflows", "gitleaks.yml"),
    join(projectRoot, ".github", "workflows", "secret-scan.yml"),
  ].some((p) => existsSync(p));
  if (hasSecretScanning) {
    score = Math.max(score, 2);
    evidence.push("secret scanning signal detected");
  } else {
    missing.push("Secret scanning (gitleaks/GitHub secret scanning)");
  }

  const hasDepScan =
    existsSync(join(projectRoot, ".github", "dependabot.yml")) ||
    existsSync(join(projectRoot, "renovate.json"));
  if (hasDepScan) {
    score = Math.max(score, 3);
    evidence.push("dependency scanning/update automation detected");
  } else {
    missing.push("Dependency vulnerability scanning (Dependabot/Renovate)");
  }

  const hasAgentBoundary =
    existsSync(join(projectRoot, ".claude", "settings.json")) ||
    existsSync(join(projectRoot, ".cursor", "settings.json"));
  if (hasAgentBoundary) {
    score = Math.max(score, 4);
    evidence.push("agent permission boundary config detected");
  } else {
    missing.push("Agent permission boundary config");
  }

  const hookSignals = [
    readIfExists(join(projectRoot, ".openclaw", "hooks", "stop.sh")),
    readIfExists(join(projectRoot, "hooks", "stop.sh")),
    readIfExists(join(projectRoot, ".claude", "settings.json")),
  ].join("\n");

  if (/exit\s+2|block|deny|forbid|prevent/i.test(hookSignals)) {
    score = Math.max(score, 5);
    evidence.push("tool-misuse blocking signal in hooks/settings");
  } else {
    missing.push("Tool misuse blocking hooks");
  }

  if (score < 3) {
    recommendations.push(
      "Prioritize secret scanning and dependency scanning first.",
    );
  }

  return { score, evidence, recommendations, missing };
}

function parseValidationDate(content: string): string | null {
  const match = content.match(/Last validated:\s*(\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : null;
}

function ageDays(dateText: string): number | null {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function scoreDriftResilience(
  projectRoot: string,
  ruleFilePaths: string[],
  driftSummary: GuardrailInput["driftSummary"],
  workflowText: string,
): {
  score: number;
  evidence: string[];
  recommendations: string[];
  missing: string[];
} {
  const evidence: string[] = [];
  const recommendations: string[] = [];
  const missing: string[] = [];

  let score = 0;

  if (ruleFilePaths.length > 0) {
    score = 1;
    evidence.push(`rule files detected: ${ruleFilePaths.length}`);
  }

  let datedCount = 0;
  let freshCount = 0;
  for (const path of ruleFilePaths) {
    const content = readIfExists(path);
    const date = parseValidationDate(content);
    if (!date) continue;
    datedCount++;
    const age = ageDays(date);
    if (age !== null && age <= 90) freshCount++;
  }

  if (ruleFilePaths.length > 0 && datedCount / ruleFilePaths.length >= 0.5) {
    score = Math.max(score, 2);
    evidence.push("at least half of rule files include Last validated");
  } else if (ruleFilePaths.length > 0) {
    missing.push("Validation dates on rule files");
  }

  if (
    existsSync(join(projectRoot, "scripts", "drift-detect.ts")) ||
    existsSync(join(projectRoot, "drift-report.md"))
  ) {
    score = Math.max(score, 3);
    evidence.push("drift detection tooling/report found");
  } else {
    missing.push("Automated drift detection tooling");
  }

  if (/drift-detect|drift detection/i.test(workflowText)) {
    score = Math.max(score, 4);
    evidence.push("drift checks in CI");
  } else {
    missing.push("CI drift detection step");
  }

  if (
    ruleFilePaths.length > 0 &&
    freshCount === ruleFilePaths.length &&
    driftSummary.pathIssues === 0 &&
    driftSummary.dateIssues === 0
  ) {
    score = Math.max(score, 5);
    evidence.push("all rules freshly validated with zero drift findings");
  }

  if (driftSummary.pathIssues > 0 || driftSummary.dateIssues > 0) {
    recommendations.push(
      `Resolve drift backlog (path=${driftSummary.pathIssues}, date=${driftSummary.dateIssues}).`,
    );
  }

  return { score, evidence, recommendations, missing };
}

function maturityFor(total: number): GuardrailScoreResult["maturity"] {
  if (total >= 28) return "Hardened";
  if (total >= 19) return "Reliable";
  if (total >= 11) return "Emerging";
  return "Novice";
}

export function scoreGuardrails(input: GuardrailInput): GuardrailScoreResult {
  const { projectRoot, ruleFilePaths, driftSummary } = input;
  const shared = detectSharedSignals(projectRoot);
  const config = input.auditConfig;

  const ci = scoreCiDiscipline(shared);
  const typeSafety = scoreTypeSafety(projectRoot, shared);
  const testDepth = scoreTestDepth(projectRoot, shared);
  const codeQuality = scoreCodeQuality(projectRoot, shared);
  const reviewOwnership = scoreReviewOwnership(projectRoot);
  const security = scoreSecurity(projectRoot);
  const driftResilience = scoreDriftResilience(
    projectRoot,
    ruleFilePaths,
    driftSummary,
    shared.workflowText,
  );

  const rawBreakdown: Record<GuardrailDimensionKey, number> = {
    ciDiscipline: ci.score,
    typeSafety: typeSafety.score,
    testDepth: testDepth.score,
    codeQuality: codeQuality.score,
    reviewOwnership: reviewOwnership.score,
    security: security.score,
    driftResilience: driftResilience.score,
  };

  const applicability: GuardrailScoreResult["applicability"] = {
    ciDiscipline: {
      applicable:
        config?.dimensions.ciDiscipline.applicability !== "not-applicable",
      reason: config?.dimensions.ciDiscipline.reason ?? null,
      weight: config?.dimensions.ciDiscipline.weight ?? 1,
      minScoreHint: config?.dimensions.ciDiscipline.minScoreHint ?? null,
    },
    typeSafety: {
      applicable:
        config?.dimensions.typeSafety.applicability !== "not-applicable",
      reason: config?.dimensions.typeSafety.reason ?? null,
      weight: config?.dimensions.typeSafety.weight ?? 1,
      minScoreHint: config?.dimensions.typeSafety.minScoreHint ?? null,
    },
    testDepth: {
      applicable:
        config?.dimensions.testDepth.applicability !== "not-applicable",
      reason: config?.dimensions.testDepth.reason ?? null,
      weight: config?.dimensions.testDepth.weight ?? 1,
      minScoreHint: config?.dimensions.testDepth.minScoreHint ?? null,
    },
    codeQuality: {
      applicable:
        config?.dimensions.codeQuality.applicability !== "not-applicable",
      reason: config?.dimensions.codeQuality.reason ?? null,
      weight: config?.dimensions.codeQuality.weight ?? 1,
      minScoreHint: config?.dimensions.codeQuality.minScoreHint ?? null,
    },
    reviewOwnership: {
      applicable:
        config?.dimensions.reviewOwnership.applicability !== "not-applicable",
      reason: config?.dimensions.reviewOwnership.reason ?? null,
      weight: config?.dimensions.reviewOwnership.weight ?? 1,
      minScoreHint: config?.dimensions.reviewOwnership.minScoreHint ?? null,
    },
    security: {
      applicable:
        config?.dimensions.security.applicability !== "not-applicable",
      reason: config?.dimensions.security.reason ?? null,
      weight: config?.dimensions.security.weight ?? 1,
      minScoreHint: config?.dimensions.security.minScoreHint ?? null,
    },
    driftResilience: {
      applicable:
        config?.dimensions.driftResilience.applicability !== "not-applicable",
      reason: config?.dimensions.driftResilience.reason ?? null,
      weight: config?.dimensions.driftResilience.weight ?? 1,
      minScoreHint: config?.dimensions.driftResilience.minScoreHint ?? null,
    },
  };

  const breakdown: GuardrailBreakdown = {
    ciDiscipline: applicability.ciDiscipline.applicable
      ? rawBreakdown.ciDiscipline
      : null,
    typeSafety: applicability.typeSafety.applicable
      ? rawBreakdown.typeSafety
      : null,
    testDepth: applicability.testDepth.applicable
      ? rawBreakdown.testDepth
      : null,
    codeQuality: applicability.codeQuality.applicable
      ? rawBreakdown.codeQuality
      : null,
    reviewOwnership: applicability.reviewOwnership.applicable
      ? rawBreakdown.reviewOwnership
      : null,
    security: applicability.security.applicable ? rawBreakdown.security : null,
    driftResilience: applicability.driftResilience.applicable
      ? rawBreakdown.driftResilience
      : null,
  };

  const rawTotal = Object.values(rawBreakdown).reduce((sum, n) => sum + n, 0);
  const weightedAverage =
    Object.entries(rawBreakdown).reduce((sum, [key, score]) => {
      const meta = applicability[key as GuardrailDimensionKey];
      return meta.applicable ? sum + score * meta.weight : sum;
    }, 0) /
    Math.max(
      1,
      Object.values(applicability).reduce(
        (sum, meta) => sum + (meta.applicable ? meta.weight : 0),
        0,
      ),
    );
  const total =
    input.configPresent && config ? Math.round(weightedAverage * 7) : rawTotal;

  const recommendations = [
    ...ci.recommendations,
    ...typeSafety.recommendations,
    ...testDepth.recommendations,
    ...codeQuality.recommendations,
    ...reviewOwnership.recommendations,
    ...security.recommendations,
    ...driftResilience.recommendations,
  ];

  const missingGuardrails = [...security.missing, ...driftResilience.missing];

  const evidence: GuardrailScoreResult["evidence"] = {
    ciDiscipline: ci.evidence,
    typeSafety: typeSafety.evidence,
    testDepth: testDepth.evidence,
    codeQuality: codeQuality.evidence,
    reviewOwnership: reviewOwnership.evidence,
    security: security.evidence,
    driftResilience: driftResilience.evidence,
  };

  const hardGateResults: HardGateResult[] = config
    ? Object.entries(config.hardGates.dimensions).map(([dimension, gate]) => {
        const actualScore = breakdown[dimension as GuardrailDimensionKey];
        return {
          dimension: dimension as GuardrailDimensionKey,
          minScore: gate?.minScore ?? 0,
          actualScore,
          passed: actualScore !== null && actualScore >= (gate?.minScore ?? 0),
        };
      })
    : [];
  const failed = hardGateResults.filter((gate) => !gate.passed);

  return {
    total,
    rawTotal,
    breakdown,
    maturity: maturityFor(total),
    evidence,
    recommendations,
    missingGuardrails,
    profile: config?.profile ?? "default",
    configPresent: input.configPresent ?? false,
    applicability,
    hardGates: {
      enabled: config?.hardGates.enabled ?? false,
      exitCode: config?.hardGates.exitCode ?? 2,
      passed: !config?.hardGates.enabled || failed.length === 0,
      results: hardGateResults,
      failed,
    },
  };
}
