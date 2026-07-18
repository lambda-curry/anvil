#!/usr/bin/env bun

/**
 * audit.ts — Anvil Framework-Agnostic Audit CLI
 *
 * Runs the full Anvil audit pipeline against any repo:
 *   1. Rule file discovery (multi-tool: CLAUDE.md, AGENTS.md, .cursor/rules/, ai-rules/, etc.)
 *   2. Drift detection (path drift + date drift)
 *   3. Bootstrap stack detection + rule generation
 *   4. Coverage gap analysis (community baseline categories)
 *   5. CLI quality detection (for CLI-oriented repos)
 *   6. Guardrail scoring (7 dimensions, 0-35)
 *   7. PR-derived failure mode mining (gap detection)
 *   8. Stage C: gap coverage checks
 *   9. Stage D: overkill/noise checks
 *  10. AI synthesis: top 5 repo-specific improvements
 *  11. Audit report output
 *
 * Does NOT modify the target project by default. Output is advisory only.
 *
 * Usage:
 *   bun run scripts/audit.ts --target <path> [--output <file>] [--artifacts-dir <dir>] [--skip-bootstrap] [--json] [--no-ai] [--ai-provider <provider>] [--ai-model <model>] [--ai-timeout-ms <ms>] [--force-stage-b]
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  type AiProvider,
  heuristicTopImprovements,
  isNearMaxRatchetLane,
  type ImprovementSuggestion,
  synthesizeTopImprovements,
} from "./lib/ai-synthesis.ts";
import {
  AuditConfigError,
  type AuditConfigLoadResult,
  loadAuditConfig,
} from "./lib/audit-config.ts";
import { type CliSignals, detectCliSignals } from "./lib/cli-detectors.ts";
import {
  type GuardrailScoreResult,
  scoreGuardrails,
} from "./lib/guardrail-score.ts";
import { discoverRuleSurfaceFiles } from "./lib/rule-surface.ts";
import {
  buildMarkdown as buildPrMiningMarkdown,
  clusterAndScore,
  fetchMergedPRComments,
  filterComments,
  scoreThemeMatches,
  representativeness as summarizeRepresentativeness,
  summarizeSeverity,
  type Theme,
  themeDisplay,
} from "./mine-pr-rules.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RuleFile = {
  path: string;
  relativePath: string;
  tool: string;
  format: string;
  sizeLines: number;
  hasAlwaysApply: boolean;
  hasGlob: boolean;
  hasDescription: boolean;
  hasLastValidated: boolean;
  hasWhySection: boolean;
  hasExamplesSection: boolean;
  linesOverBudget: boolean;
  loadingPatterns?: string[];
  authorship: RuleAuthorship;
  fingerprint: string;
};

export type RuleAuthorship = "governance" | "generated";

export type DuplicateGroup = {
  fingerprint: string;
  canonicalPath: string;
  memberPaths: string[];
  memberTools: string[];
};

export type MirrorConfig = {
  hasConfig: boolean;
  agents: string[];
};

export type MirrorStatus =
  | "healthy"
  | "drifted"
  | "orphan-projection"
  | "source-only";

export type MirrorGroup = {
  key: string;
  sourcePaths: string[];
  projectionPaths: string[];
  status: MirrorStatus;
  fingerprintCount: number;
  memberPaths: string[];
};

export type RuleInventory = {
  allFiles: RuleFile[];
  canonicalFiles: RuleFile[];
  canonicalGovernanceFiles: RuleFile[];
  canonicalGeneratedFiles: RuleFile[];
  mirrorConfig: MirrorConfig;
  mirrorGroups: MirrorGroup[];
  mirrorHealthyCount: number;
  mirrorDriftedCount: number;
  mirrorOrphanProjectionCount: number;
  mirrorSourceOnlyCount: number;
  duplicateGroups: DuplicateGroup[];
  expectedDuplicateGroups: DuplicateGroup[];
  accidentalDuplicateGroups: DuplicateGroup[];
  duplicateMirrorCount: number;
  expectedDuplicateMirrorCount: number;
  accidentalDuplicateMirrorCount: number;
  duplicationRate: number;
  accidentalDuplicationRate: number;
};

export type EnforcementLevel = "none" | "hook" | "ci-gate" | "mcp-tool";

export type EnforcementLayer = {
  level: EnforcementLevel;
  detected: string[];
};

export type CoverageCategory = {
  name: string;
  present: boolean;
  signals: string[];
  /** true when the category is conditional and no triggering signals were found in the project */
  notApplicable?: boolean;
};

export type DriftSummary = {
  pathIssues: number;
  dateIssues: number;
  notes: number;
};

export type AiSynthesis = {
  mode: "ai" | "heuristic";
  model: string | null;
  suggestions: ImprovementSuggestion[];
};

export type AuditMode = "full" | "ci";

export type PrFinding = {
  theme: Theme;
  label: string;
  frequency: number;
  score: number;
  uniquePrs: number;
  severity: "low" | "medium" | "high";
  representativeness: "low" | "medium" | "high";
  coverageStatus: "match" | "missing" | "unknown";
  commentAlignmentRate: number;
  commentAlignmentStatus: "strong" | "partial" | "weak" | "unknown";
  samplePaths: string[];
};

export type PrMiningInsight = {
  status: "available" | "unavailable";
  repo: string | null;
  reason: string | null;
  analyzedPrs: number;
  reviewedComments: number;
  substantiveComments: number;
  candidateCount: number;
  findings: PrFinding[];
  artifactPath: string | null;
};

export type GapCoverageMetrics = {
  score: number;
  prCoverageScore: number;
  commentAlignmentScore: number;
  criticalCoverageScore: number;
  highSeverityCoverageScore: number;
  freshnessCoverageScore: number;
  uncoveredThemes: string[];
};

export type RuleEffectivenessStatus =
  | "Unmeasured"
  | "Instrumented"
  | "Improving"
  | "Flat"
  | "Regressing";

export type RuleEffectivenessAssessment = {
  status: RuleEffectivenessStatus;
  instrumentedRuleCount: number;
  totalRuleCount: number;
  failureModeRuleCount: number;
  baselineRuleCount: number;
  signalRuleCount: number;
  reviewIntervalRuleCount: number;
  evidence: string[];
  note: string;
  instrumentationCandidate?: {
    fileName: string;
    missing: string[];
  };
};

export type SurfacePosture = "governance-first" | "tool-native-first";

export type SurfacePostureAssessment = {
  posture: SurfacePosture;
  surfaceRoot: string | null;
  surfaceTool: string | null;
  surfaceAlignment: number | null;
  nativeLoadingFidelity: number | null;
  activeFileCoverage: number | null;
  freshness: number | null;
  boundedContextLoad: number | null;
  agentFitEvidence: number | null;
  clarityUplift: number | null;
};

export type OverkillMetrics = {
  score: number;
  redundancyPressure: number;
  conflictPressure: number;
  contextLoadPressure: number;
  lowYieldPressure: number;
  alwaysOnLines: number;
  lowYieldRules: number;
  keywordConflictCount: number;
};

export type AuditResult = {
  auditMode: AuditMode;
  projectName: string;
  projectPath: string;
  auditDate: string;
  ruleFiles: RuleFile[]; // discovered (pre-dedup)
  scoringRuleFiles: RuleFile[]; // canonical scoring surface (post-dedup, governance-first)
  surfacePosture?: SurfacePostureAssessment;
  ruleInventory: RuleInventory;
  driftReportPath: string | null;
  bootstrapDraftPath: string | null;
  artifactsDir: string;
  coverageGaps: CoverageCategory[];
  enforcementLayer: EnforcementLayer;
  cliSignals: CliSignals;
  guardrail: GuardrailScoreResult;
  aiSynthesis: AiSynthesis;
  hasBlockAiRules: boolean;
  hasAiRulesDir: boolean;
  ruleScore5: number;
  ruleScore100: number;
  scoreBreakdown: Record<string, number>;
  recommendations: string[];
  driftSummary: DriftSummary;
  stageA: StageResult;
  stageB: StageResult;
  stageC: StageResult;
  stageD: StageResult;
  gapCoverage: GapCoverageMetrics;
  ruleEffectiveness: RuleEffectivenessAssessment;
  overkill: OverkillMetrics;
  prMining: PrMiningInsight;
  rulePortfolio: RulePortfolioActions;
  processIssues: ProcessIssue[];
  remediationPack: RemediationPack;
  auditConfig: AuditConfigLoadResult;
};

export type StageStatus = "pass" | "fail" | "skipped";

export type StageCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type StageResult = {
  name: "Stage A" | "Stage B" | "Stage C" | "Stage D";
  status: StageStatus;
  summary: string;
  checks: StageCheck[];
};

export type IssueClass = "blocking" | "hygiene" | "backlog";

export type ProcessIssue = {
  id: string;
  title: string;
  detail: string;
  issueClass: IssueClass;
  owner: string;
  slaDays: number;
  dueDate: string;
  evidence: string[];
  actionGroup?: string;
};

export type RemediationTask = {
  order: number;
  title: string;
  issueClass: IssueClass;
  owner: string;
  slaDays: number;
  dueDate: string;
  expectedRuleDelta: number;
  expectedGuardrailDelta: number;
  exampleEvidence: string[];
  acceptanceCriteria: string[];
};

export type RemediationPack = {
  strategy: string;
  tasks: RemediationTask[];
};

export type RuleActionPriority = "high" | "medium" | "low";

export type RulePortfolioAction = {
  title: string;
  detail: string;
  priority: RuleActionPriority;
  targets: string[];
  evidence: string[];
};

export type RulePortfolioActions = {
  changeExisting: RulePortfolioAction[];
  addNew: RulePortfolioAction[];
  reduceOverkill: RulePortfolioAction[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const SCRIPT_DIR = import.meta.dir;
const WORKSPACE_DIR = resolve(SCRIPT_DIR, "..");

const COVERAGE_CATEGORIES: {
  name: string;
  patterns: RegExp[];
  conditional?: boolean;
}[] = [
  {
    name: "TypeScript / Type Safety",
    patterns: [
      /typescript/i,
      /\bany\b/,
      /strict mode/i,
      /type safety/i,
      /\btypes?\b/i,
      /interface/i,
    ],
  },
  {
    name: "Error Handling",
    patterns: [
      /error handling/i,
      /guard clause/i,
      /early return/i,
      /try.catch/i,
      /exception/i,
      /handle failures explicitly/i,
      /failed command/i,
      /failure signal/i,
      /escalate blockers/i,
    ],
  },
  {
    name: "Testing",
    patterns: [
      /test(ing)?/i,
      /vitest/i,
      /jest/i,
      /spec/i,
      /unit test/i,
      /e2e/i,
    ],
  },
  {
    name: "Code Structure / Naming",
    patterns: [
      /naming/i,
      /convention/i,
      /folder structure/i,
      /directory/i,
      /functional/i,
      /declarative/i,
    ],
  },
  {
    name: "Security",
    patterns: [
      /security/i,
      /sanitize/i,
      /validate/i,
      /injection/i,
      /auth/i,
      /secret/i,
      /env/i,
    ],
  },
  {
    name: "Performance",
    patterns: [/performance/i, /optimiz/i, /lazy load/i, /bundle/i, /caching/i],
  },
  {
    name: "Package Manager / Commands",
    patterns: [
      /\bbun\b/i,
      /\bpnpm\b/i,
      /\bnpm\b/i,
      /package manager/i,
      /install/i,
      /run scripts/i,
    ],
  },
  {
    // Digest #14: multi-agent topology — conditional/advanced pattern.
    // Only applicable when the project has explicit delegation/subagent/orchestrator signals.
    // See docs/patterns/subagent-boundary-declaration.md
    name: "Multi-Agent Topology",
    conditional: true,
    patterns: [
      /multi.?agent/i,
      /orchestrat/i,
      /\bsubagent\b/i,
      /\btopology\b/i,
      /rule.of.two/i,
      /context isolation/i,
      /\.claude\/agents/i,
    ],
  },
];

/**
 * Signals that indicate a project uses explicit multi-agent delegation/orchestration.
 * Scanned in rule files AND project source. If none found, Multi-Agent Topology is notApplicable.
 */
const MULTI_AGENT_DELEGATION_SIGNALS = [
  /sessions_spawn/i,
  /\.claude\/agents/i,
  /subagent/i,
  /orchestrat/i,
  /\bdelegate\b/i,
  /Task tool/i,
  /spawn.*agent/i,
  /agent.*spawn/i,
];

const PR_MINING_LIMIT = 100;

const GITHUB_REMOTE_PATTERNS = [
  /^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/i,
  /^https?:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?\/?$/i,
  /^ssh:\/\/git@github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?\/?$/i,
];

const CRITICAL_COVERAGE_CATEGORIES = new Set([
  "TypeScript / Type Safety",
  "Error Handling",
  "Testing",
  "Security",
]);

const COMMENT_ALIGNMENT_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "is",
  "it",
  "this",
  "that",
  "these",
  "those",
  "be",
  "been",
  "being",
  "are",
  "was",
  "were",
  "will",
  "would",
  "should",
  "could",
  "can",
  "may",
  "might",
  "must",
  "we",
  "you",
  "they",
  "he",
  "she",
  "i",
  "our",
  "your",
  "their",
  "its",
  "also",
  "just",
  "please",
  "here",
  "there",
  "then",
  "than",
  "when",
  "while",
  "into",
  "about",
  "after",
  "before",
  "over",
  "under",
  "use",
  "using",
  "used",
  "need",
  "needs",
  "make",
  "makes",
  "made",
  "add",
  "added",
  "remove",
  "removed",
  "update",
  "updated",
  "file",
  "files",
  "code",
  "line",
  "lines",
  "change",
  "changes",
  "review",
  "comment",
  "comments",
  "would",
  "should",
  "maybe",
  "consider",
  "prefer",
  "avoid",
]);

// ─── Argument Parsing ─────────────────────────────────────────────────────────

export type ParsedArgs = {
  targetPath: string;
  outputFile: string | null;
  artifactsDir: string | null;
  skipBootstrap: boolean;
  jsonOutput: boolean;
  ciMode: boolean;
  noAi: boolean;
  noAiAliasUsed: boolean;
  aiProvider: AiProvider | null;
  aiModel: string | null;
  aiTimeoutMs: number | null;
  forceStageB: boolean;
};

function usageAndExit(): never {
  console.error(
    "Usage: bun run scripts/audit.ts --target <path> [--output <file>] [--artifacts-dir <dir>] [--skip-bootstrap] [--json] [--ci] [--ai-provider <provider>] [--ai-model <model>] [--ai-timeout-ms <ms>] [--force-stage-b]",
  );
  console.error("");
  console.error("Options:");
  console.error(
    "  --target <path>         Path to project to audit (required)",
  );
  console.error(
    "  --output <file>         Write report to this path (default: docs/audits/<name>-<date>.md)",
  );
  console.error(
    "  --artifacts-dir <dir>   Write drift/bootstrap artifacts here (default: docs/audits/artifacts/<name>-<date>)",
  );
  console.error("  --skip-bootstrap        Skip bootstrap stack detection");
  console.error(
    "  --json                  Output JSON instead of markdown report",
  );
  console.error(
    "  --ci                    Run deterministic structural lint mode (local-only heuristic suggestions)",
  );
  console.error(
    "  --ai-provider <name>    AI provider: auto | openai | codex-cli | claude-code | gemini-cli | opencode | heuristic",
  );
  console.error("  --ai-model <name>       Override provider model");
  console.error(
    "  --ai-timeout-ms <ms>    Timeout for AI synthesis calls in milliseconds",
  );
  console.error(
    "  --force-stage-b         Run Stage B scoring even when Stage A fails",
  );
  process.exit(1);
}

export function parseArgs(argv: string[]): ParsedArgs {
  let targetPath: string | null = null;
  let outputFile: string | null = null;
  let artifactsDir: string | null = null;
  let skipBootstrap = false;
  let jsonOutput = false;
  let ciMode = false;
  let noAi = false;
  let noAiAliasUsed = false;
  let aiProvider: AiProvider | null = null;
  let aiModel: string | null = null;
  let aiTimeoutMs: number | null = null;
  let forceStageB = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--target") {
      targetPath = argv[++i] ?? null;
    } else if (arg === "--output") {
      outputFile = argv[++i] ?? null;
    } else if (arg === "--artifacts-dir") {
      artifactsDir = argv[++i] ?? null;
    } else if (arg === "--skip-bootstrap") {
      skipBootstrap = true;
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "--ci") {
      ciMode = true;
      noAi = true;
    } else if (arg === "--no-ai") {
      ciMode = true;
      noAi = true;
      noAiAliasUsed = true;
    } else if (arg === "--ai-provider") {
      const value = (argv[++i] ?? "").trim() as AiProvider;
      if (
        ![
          "auto",
          "openai",
          "codex-cli",
          "claude-code",
          "gemini-cli",
          "opencode",
          "heuristic",
        ].includes(value)
      ) {
        console.error(
          `Invalid --ai-provider: ${value}. Expected auto | openai | codex-cli | claude-code | gemini-cli | opencode | heuristic`,
        );
        process.exit(1);
      }
      aiProvider = value;
    } else if (arg === "--ai-model") {
      aiModel = argv[++i] ?? null;
    } else if (arg === "--ai-timeout-ms") {
      const raw = argv[++i] ?? "";
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        console.error(`Invalid --ai-timeout-ms: ${raw}`);
        process.exit(1);
      }
      aiTimeoutMs = parsed;
    } else if (arg === "--force-stage-b") {
      forceStageB = true;
    } else if (arg === "--help" || arg === "-h") {
      usageAndExit();
    } else {
      if (!targetPath && !arg.startsWith("--")) {
        targetPath = arg;
      } else {
        console.error(`Unknown argument: ${arg}`);
        usageAndExit();
      }
    }
  }

  if (!targetPath) {
    console.error("Error: --target <path> is required");
    usageAndExit();
  }

  return {
    targetPath,
    outputFile,
    artifactsDir,
    skipBootstrap,
    jsonOutput,
    ciMode,
    noAi,
    noAiAliasUsed,
    aiProvider,
    aiModel,
    aiTimeoutMs,
    forceStageB,
  };
}

function resolveAuditMode(args: ParsedArgs): AuditMode {
  if (args.ciMode || args.noAi || args.aiProvider === "heuristic") {
    return "ci";
  }

  return "full";
}

function scoreHeadlineLabel(auditMode: AuditMode): string {
  return auditMode === "ci" ? "Structural Lint Score" : "Rule Quality Score";
}

function emitNoAiAliasDeprecationWarning(): void {
  console.error(
    "Warning: `--no-ai` is deprecated and will be removed in a future release. Use `--ci` for the same deterministic local-only audit path.",
  );
}

function buildAiRequiredMessage(args: ParsedArgs): string {
  const providerLine =
    args.aiProvider && args.aiProvider !== "auto"
      ? `Requested provider \`${args.aiProvider}\` did not produce a synthesis result.`
      : "No working AI provider was detected for the default audit path.";

  return [
    "AI synthesis is required for the default `anvil audit` path.",
    providerLine,
    "",
    "Next steps:",
    "- Install/login to Claude Code, Codex CLI, Gemini CLI, or opencode; or set `OPENAI_API_KEY`.",
    "- Re-run the same audit command for the full product output.",
    "- If you want deterministic local-only structural lint instead, re-run with `--ci`.",
  ].join("\n");
}

function toIsoDate(input: Date): string {
  return input.toISOString().split("T")[0];
}

function addDays(date: string, days: number): string {
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toIsoDate(dt);
}

function normalizedHash(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

function classifyRuleAuthorship(
  relativePath: string,
  tool: string,
): RuleAuthorship {
  if (tool === "ai-rules-generated") return "generated";
  if (/(^|\/)\.generated-ai-rules\//.test(relativePath)) return "generated";
  if (/ai-rules-generated/i.test(relativePath)) return "generated";
  return "governance";
}

function isBootstrapTemplatePath(relativePath: string): boolean {
  return /^docs\/bootstrap-templates\/.+\.md$/i.test(relativePath);
}

function isPatternDocPath(relativePath: string): boolean {
  return /^docs\/patterns\/.+\.md$/i.test(relativePath);
}

function recommendedLineBudget(relativePath: string): number {
  if (isPatternDocPath(relativePath)) return 300;
  if (isBootstrapTemplatePath(relativePath)) return 200;
  return 200;
}

function requiresExplicitTier(ruleFile: RuleFile): boolean {
  return !isPatternDocPath(ruleFile.relativePath);
}

function countsAsAlwaysOn(ruleFile: RuleFile): boolean {
  if (
    isPatternDocPath(ruleFile.relativePath) ||
    isBootstrapTemplatePath(ruleFile.relativePath)
  )
    return false;
  return ruleFile.hasAlwaysApply || !ruleFile.hasGlob;
}

const TOOL_NATIVE_SURFACE_ROOTS = [
  ".cursor/rules/",
  ".claude/rules/",
  ".windsurf/rules/",
  ".augment/rules/",
  ".clinerules/",
] as const;

const WORKING_FILE_SCAN_SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
]);

function toolNativeSurfaceRoot(relativePath: string): string | null {
  return (
    TOOL_NATIVE_SURFACE_ROOTS.find((prefix) =>
      relativePath.startsWith(prefix),
    ) ?? null
  );
}

function isCrossAgentGovernancePath(relativePath: string): boolean {
  return (
    relativePath === "AGENTS.md" ||
    relativePath === "CLAUDE.md" ||
    relativePath === "TOOLS.md" ||
    relativePath === "global_rules.md" ||
    relativePath === ".github/copilot-instructions.md" ||
    (relativePath.startsWith("ai-rules/") &&
      !relativePath.startsWith("ai-rules/.generated-ai-rules/"))
  );
}

function normalizeLoadingPattern(pattern: string): string {
  return pattern
    .trim()
    .replace(/^[-*]\s*/, "")
    .replace(/^['"`]|['"`]$/g, "")
    .replace(/^\.\//, "")
    .replace(/,$/, "")
    .trim();
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeLoadingPattern(pattern);
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    const afterNext = normalized[index + 2];

    if (char === "*" && next === "*" && afterNext === "/") {
      source += "(?:.*/)?";
      index += 2;
      continue;
    }
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += "\\^$+?.()|{}[]".includes(char) ? `\\${char}` : char;
  }

  return new RegExp(`^${source}$`);
}

function collectWorkingProjectFiles(projectRoot: string): string[] {
  const files: string[] = [];
  const queue = [projectRoot];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) continue;

    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relativePath = relative(projectRoot, fullPath).replaceAll(
        "\\",
        "/",
      );

      if (entry.isDirectory()) {
        if (WORKING_FILE_SCAN_SKIP_DIRS.has(entry.name)) continue;
        queue.push(fullPath);
        continue;
      }

      if (
        toolNativeSurfaceRoot(relativePath) ||
        isCrossAgentGovernancePath(relativePath)
      ) {
        continue;
      }
      files.push(relativePath);
    }
  }

  return files;
}

function ruleMatchesWorkingFiles(
  ruleFile: RuleFile,
  projectFiles: string[],
): boolean {
  if (ruleFile.hasAlwaysApply) return true;

  const patterns = (ruleFile.loadingPatterns ?? [])
    .map((pattern) => normalizeLoadingPattern(pattern))
    .filter(Boolean);
  if (patterns.length === 0) return false;

  return patterns.some((pattern) => {
    const regex = globToRegExp(pattern);
    return projectFiles.some((projectFile) => regex.test(projectFile));
  });
}

function computeFormatSubscore(ruleFiles: RuleFile[]): number {
  if (ruleFiles.length === 0) return 0;

  const scores = ruleFiles.map((rf) => {
    let s = 0;
    if (rf.hasWhySection) s += 0.3;
    if (rf.hasExamplesSection) s += 0.3;
    if (rf.hasDescription) s += 0.2;
    if (!rf.linesOverBudget) s += 0.2;
    return s;
  });

  return roundTenth(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function classifySurfacePosture(
  scoringRuleFiles: RuleFile[],
  inventory: Pick<
    RuleInventory,
    "canonicalFiles" | "mirrorDriftedCount" | "mirrorOrphanProjectionCount"
  >,
  projectRoot: string,
): SurfacePostureAssessment {
  const nativeRoots = unique(
    scoringRuleFiles
      .map((ruleFile) => toolNativeSurfaceRoot(ruleFile.relativePath) ?? "")
      .filter(Boolean),
  );
  const hasNativeLoadingMetadata = scoringRuleFiles.some(
    (ruleFile) => ruleFile.hasAlwaysApply || ruleFile.hasGlob,
  );
  const hasCrossAgentPrimary = inventory.canonicalFiles.some((ruleFile) =>
    isCrossAgentGovernancePath(ruleFile.relativePath),
  );

  if (
    scoringRuleFiles.length === 0 ||
    nativeRoots.length !== 1 ||
    !hasNativeLoadingMetadata ||
    hasCrossAgentPrimary
  ) {
    return {
      posture: "governance-first",
      surfaceRoot: null,
      surfaceTool: null,
      surfaceAlignment: null,
      nativeLoadingFidelity: null,
      activeFileCoverage: null,
      freshness: null,
      boundedContextLoad: null,
      agentFitEvidence: null,
      clarityUplift: computeFormatSubscore(scoringRuleFiles),
    };
  }

  const projectFiles = collectWorkingProjectFiles(projectRoot);
  const alwaysOnLines = scoringRuleFiles
    .filter((ruleFile) => countsAsAlwaysOn(ruleFile))
    .reduce((sum, ruleFile) => sum + ruleFile.sizeLines, 0);
  const nativeLoadingFidelity = ratio(
    scoringRuleFiles.filter(
      (ruleFile) => ruleFile.hasAlwaysApply || ruleFile.hasGlob,
    ).length,
    scoringRuleFiles.length,
  );
  const activeFileCoverage = ratio(
    scoringRuleFiles.filter((ruleFile) =>
      ruleMatchesWorkingFiles(ruleFile, projectFiles),
    ).length,
    scoringRuleFiles.length,
  );
  const freshness =
    inventory.mirrorDriftedCount > 0 ||
    inventory.mirrorOrphanProjectionCount > 0
      ? 0
      : ratio(
          scoringRuleFiles.filter((ruleFile) => ruleFile.hasLastValidated)
            .length,
          scoringRuleFiles.length,
        );
  const boundedContextLoad = clamp01(1 - contextLoadPressure(alwaysOnLines));
  const agentFitEvidence =
    (1 +
      nativeLoadingFidelity +
      activeFileCoverage +
      freshness +
      boundedContextLoad) /
    5;

  return {
    posture: "tool-native-first",
    surfaceRoot: nativeRoots[0] ?? null,
    surfaceTool: scoringRuleFiles[0]?.tool ?? null,
    surfaceAlignment: 1,
    nativeLoadingFidelity: roundTenth(nativeLoadingFidelity),
    activeFileCoverage: roundTenth(activeFileCoverage),
    freshness: roundTenth(freshness),
    boundedContextLoad: roundTenth(boundedContextLoad),
    agentFitEvidence: roundTenth(agentFitEvidence),
    clarityUplift: computeFormatSubscore(scoringRuleFiles),
  };
}

function canonicalPriority(ruleFile: RuleFile): number {
  const path = ruleFile.relativePath;
  let score = 0;

  if (ruleFile.authorship === "governance") score += 100;
  if (path === "AGENTS.md") score += 70;
  if (path === "CLAUDE.md") score += 65;
  if (path === "TOOLS.md") score += 60;
  if (
    path.startsWith("ai-rules/") &&
    !path.startsWith("ai-rules/.generated-ai-rules/")
  )
    score += 50;
  if (path.startsWith(".cursor/rules/") && !/ai-rules-generated/i.test(path))
    score += 40;
  if (path.startsWith("ai-rules/.generated-ai-rules/")) score += 20;
  if (path.startsWith(".cursor/rules/") && /ai-rules-generated/i.test(path))
    score += 10;

  // Slightly prefer shorter rules in the same priority bucket.
  score += Math.max(0, 10 - Math.floor(ruleFile.sizeLines / 100));

  return score;
}

function parseAiRulesAgents(configText: string): string[] {
  const inline = configText.match(/^\s*agents\s*:\s*\[([^\]]*)\]/im);
  if (inline) {
    return inline[1]
      .split(",")
      .map((part) =>
        part
          .trim()
          .replace(/^['"]|['"]$/g, "")
          .toLowerCase(),
      )
      .filter(Boolean);
  }

  const blockMatch = configText.match(/^\s*agents\s*:\s*$(?<block>[\s\S]*)/im);
  if (!blockMatch?.groups?.block) return [];

  const agents: string[] = [];
  for (const line of blockMatch.groups.block.split("\n")) {
    const item = line.match(/^\s*-\s*([A-Za-z0-9_-]+)/);
    if (!item) {
      if (/^\S/.test(line)) break;
      continue;
    }
    agents.push(item[1].toLowerCase());
  }
  return agents;
}

function loadMirrorConfig(projectRoot: string): MirrorConfig {
  const configPath = join(projectRoot, "ai-rules", "ai-rules-config.yaml");
  if (!existsSync(configPath)) return { hasConfig: false, agents: [] };

  try {
    const content = readFileSync(configPath, "utf8");
    return {
      hasConfig: true,
      agents: [...new Set(parseAiRulesAgents(content))],
    };
  } catch {
    return { hasConfig: true, agents: [] };
  }
}

type MirrorRole = "source" | "projection";

type MirrorDescriptor = {
  key: string;
  role: MirrorRole;
};

function rootMirrorDescriptor(
  ruleFile: RuleFile,
  rootFiles: Set<string>,
): MirrorDescriptor | null {
  const path = ruleFile.relativePath;

  if (path === "AGENTS.md") {
    return { key: "agent-instructions/root", role: "source" };
  }

  if (path === "CLAUDE.md") {
    return {
      key: "agent-instructions/root",
      role: rootFiles.has("AGENTS.md") ? "projection" : "source",
    };
  }

  return null;
}

function mirrorDescriptor(
  ruleFile: RuleFile,
  rootFiles: Set<string>,
): MirrorDescriptor | null {
  const rootDescriptor = rootMirrorDescriptor(ruleFile, rootFiles);
  if (rootDescriptor) return rootDescriptor;

  const path = ruleFile.relativePath;

  const aiRuleSource = path.match(
    /^ai-rules\/(?!\.generated-ai-rules\/)([^/]+)\.md$/,
  );
  if (aiRuleSource) {
    return { key: `ai-rule:${aiRuleSource[1]}`, role: "source" };
  }

  const generatedSource = path.match(
    /^ai-rules\/\.generated-ai-rules\/ai-rules-generated-(.+)\.md$/,
  );
  if (generatedSource) {
    return { key: `ai-rule:${generatedSource[1]}`, role: "projection" };
  }

  const cursorProjection = path.match(
    /^\.cursor\/rules\/ai-rules-generated-(.+)\.mdc?$/,
  );
  if (cursorProjection) {
    return { key: `ai-rule:${cursorProjection[1]}`, role: "projection" };
  }

  const claudeProjection = path.match(
    /^\.claude\/rules\/ai-rules-generated-(.+)\.mdc?$/,
  );
  if (claudeProjection) {
    return { key: `ai-rule:${claudeProjection[1]}`, role: "projection" };
  }

  return null;
}

function classifyMirrorStatus(
  sourceCount: number,
  projectionCount: number,
  fingerprintCount: number,
): MirrorStatus {
  if (sourceCount === 0 && projectionCount > 0) return "orphan-projection";
  if (sourceCount > 0 && projectionCount === 0) return "source-only";
  return fingerprintCount === 1 ? "healthy" : "drifted";
}

function comparableMirrorFingerprint(file: RuleFile): string {
  try {
    let content = readFileSync(file.path, "utf8").replace(/\r\n/g, "\n");
    if (content.startsWith("---\n")) {
      content = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
    }
    return normalizedHash(content);
  } catch {
    return file.fingerprint;
  }
}

function buildMirrorGroups(ruleFiles: RuleFile[]): {
  groups: MirrorGroup[];
  byPath: Map<string, MirrorDescriptor>;
  healthyCount: number;
  driftedCount: number;
  orphanProjectionCount: number;
  sourceOnlyCount: number;
} {
  const byKey = new Map<
    string,
    { sources: RuleFile[]; projections: RuleFile[]; members: RuleFile[] }
  >();
  const byPath = new Map<string, MirrorDescriptor>();
  const rootFiles = new Set(
    ruleFiles
      .map((file) => file.relativePath)
      .filter((path) => path === "AGENTS.md" || path === "CLAUDE.md"),
  );

  for (const file of ruleFiles) {
    const descriptor = mirrorDescriptor(file, rootFiles);
    if (!descriptor) continue;
    byPath.set(file.relativePath, descriptor);
    const row = byKey.get(descriptor.key) ?? {
      sources: [],
      projections: [],
      members: [],
    };
    if (descriptor.role === "source") row.sources.push(file);
    if (descriptor.role === "projection") row.projections.push(file);
    row.members.push(file);
    byKey.set(descriptor.key, row);
  }

  const groups: MirrorGroup[] = [];
  let healthyCount = 0;
  let driftedCount = 0;
  let orphanProjectionCount = 0;
  let sourceOnlyCount = 0;

  for (const [key, row] of byKey.entries()) {
    const fingerprintCount = new Set(
      row.members.map((m) => comparableMirrorFingerprint(m)),
    ).size;
    const status = classifyMirrorStatus(
      row.sources.length,
      row.projections.length,
      fingerprintCount,
    );
    if (status === "healthy") healthyCount++;
    if (status === "drifted") driftedCount++;
    if (status === "orphan-projection") orphanProjectionCount++;
    if (status === "source-only") sourceOnlyCount++;

    groups.push({
      key,
      sourcePaths: row.sources.map((m) => m.relativePath).sort(),
      projectionPaths: row.projections.map((m) => m.relativePath).sort(),
      status,
      fingerprintCount,
      memberPaths: row.members.map((m) => m.relativePath).sort(),
    });
  }

  const statusRank: Record<MirrorStatus, number> = {
    drifted: 0,
    "orphan-projection": 1,
    healthy: 2,
    "source-only": 3,
  };

  return {
    groups: groups.sort(
      (a, b) =>
        statusRank[a.status] - statusRank[b.status] ||
        a.key.localeCompare(b.key),
    ),
    byPath,
    healthyCount,
    driftedCount,
    orphanProjectionCount,
    sourceOnlyCount,
  };
}

function isExpectedDuplicateGroup(
  group: DuplicateGroup,
  mirrorByPath: Map<string, MirrorDescriptor>,
): boolean {
  const descriptors: MirrorDescriptor[] = [];
  for (const path of group.memberPaths) {
    const descriptor = mirrorByPath.get(path);
    if (!descriptor) return false;
    descriptors.push(descriptor);
  }

  if (descriptors.length < 2) return false;
  const uniqueKeys = new Set(descriptors.map((d) => d.key));
  if (uniqueKeys.size !== 1) return false;

  const hasSource = descriptors.some((d) => d.role === "source");
  const hasProjection = descriptors.some((d) => d.role === "projection");
  return hasSource && hasProjection;
}

export function buildRuleInventory(
  ruleFiles: RuleFile[],
  mirrorConfig: MirrorConfig,
): RuleInventory {
  const groups = new Map<string, RuleFile[]>();
  for (const rf of ruleFiles) {
    const list = groups.get(rf.fingerprint) ?? [];
    list.push(rf);
    groups.set(rf.fingerprint, list);
  }

  const canonicalFiles: RuleFile[] = [];
  const duplicateGroups: DuplicateGroup[] = [];

  for (const [fingerprint, members] of groups.entries()) {
    const sorted = [...members].sort((a, b) => {
      const priorityDiff = canonicalPriority(b) - canonicalPriority(a);
      if (priorityDiff !== 0) return priorityDiff;
      if (a.sizeLines !== b.sizeLines) return a.sizeLines - b.sizeLines;
      return a.relativePath.localeCompare(b.relativePath);
    });

    const canonical = sorted[0];
    canonicalFiles.push(canonical);

    if (sorted.length > 1) {
      duplicateGroups.push({
        fingerprint,
        canonicalPath: canonical.relativePath,
        memberPaths: sorted.map((m) => m.relativePath),
        memberTools: sorted.map((m) => m.tool),
      });
    }
  }

  const mirrorGroupsSummary = buildMirrorGroups(ruleFiles);
  const expectedDuplicateGroups: DuplicateGroup[] = [];
  const accidentalDuplicateGroups: DuplicateGroup[] = [];
  for (const group of duplicateGroups) {
    if (isExpectedDuplicateGroup(group, mirrorGroupsSummary.byPath)) {
      expectedDuplicateGroups.push(group);
    } else {
      accidentalDuplicateGroups.push(group);
    }
  }

  const canonicalGovernanceFiles = canonicalFiles.filter(
    (rf) => rf.authorship === "governance",
  );
  const canonicalGeneratedFiles = canonicalFiles.filter(
    (rf) => rf.authorship === "generated",
  );
  const duplicateMirrorCount = Math.max(
    0,
    ruleFiles.length - canonicalFiles.length,
  );
  const expectedDuplicateMirrorCount = expectedDuplicateGroups.reduce(
    (sum, group) => sum + Math.max(0, group.memberPaths.length - 1),
    0,
  );
  const accidentalDuplicateMirrorCount = Math.max(
    0,
    duplicateMirrorCount - expectedDuplicateMirrorCount,
  );
  const duplicationRate =
    ruleFiles.length === 0 ? 0 : duplicateMirrorCount / ruleFiles.length;
  const accidentalDuplicationRate =
    ruleFiles.length === 0
      ? 0
      : accidentalDuplicateMirrorCount / ruleFiles.length;

  return {
    allFiles: ruleFiles,
    canonicalFiles,
    canonicalGovernanceFiles,
    canonicalGeneratedFiles,
    mirrorConfig,
    mirrorGroups: mirrorGroupsSummary.groups,
    mirrorHealthyCount: mirrorGroupsSummary.healthyCount,
    mirrorDriftedCount: mirrorGroupsSummary.driftedCount,
    mirrorOrphanProjectionCount: mirrorGroupsSummary.orphanProjectionCount,
    mirrorSourceOnlyCount: mirrorGroupsSummary.sourceOnlyCount,
    duplicateGroups: duplicateGroups.sort(
      (a, b) => b.memberPaths.length - a.memberPaths.length,
    ),
    expectedDuplicateGroups: expectedDuplicateGroups.sort(
      (a, b) => b.memberPaths.length - a.memberPaths.length,
    ),
    accidentalDuplicateGroups: accidentalDuplicateGroups.sort(
      (a, b) => b.memberPaths.length - a.memberPaths.length,
    ),
    duplicateMirrorCount,
    expectedDuplicateMirrorCount,
    accidentalDuplicateMirrorCount,
    duplicationRate: Math.round(duplicationRate * 1000) / 1000,
    accidentalDuplicationRate:
      Math.round(accidentalDuplicationRate * 1000) / 1000,
  };
}

export function assessStageA(
  inventory: RuleInventory,
  drift: DriftSummary,
): StageResult {
  const governanceCount = inventory.canonicalGovernanceFiles.length;
  const generatedCount = inventory.canonicalGeneratedFiles.length;
  const totalCanonical = inventory.canonicalFiles.length;
  const oversizedCount = inventory.canonicalFiles.filter(
    (f) => f.linesOverBudget,
  ).length;
  const datedCoverage =
    governanceCount === 0
      ? 0
      : inventory.canonicalGovernanceFiles.filter((f) => f.hasLastValidated)
          .length / governanceCount;

  const checks: StageCheck[] = [];

  checks.push({
    id: "dedup-rate",
    label: "Mirror Duplication Rate",
    status:
      inventory.accidentalDuplicationRate > 0.2
        ? "fail"
        : inventory.accidentalDuplicationRate > 0.05
          ? "warn"
          : "pass",
    detail:
      `${Math.round(inventory.accidentalDuplicationRate * 100)}% accidental duplicates (${inventory.accidentalDuplicateMirrorCount}/${inventory.allFiles.length}); ` +
      `expected mirrors=${inventory.expectedDuplicateMirrorCount}`,
  });

  checks.push({
    id: "mirror-sync",
    label: "Mirror Sync Health",
    status:
      inventory.mirrorDriftedCount > 0
        ? "fail"
        : inventory.mirrorOrphanProjectionCount > 0
          ? "warn"
          : "pass",
    detail: formatMirrorSyncSummary(inventory),
  });

  const governanceSurfaceThreshold =
    totalCanonical >= 4 ? Math.max(3, Math.ceil(totalCanonical * 0.25)) : 1;

  checks.push({
    id: "governance-surface",
    label: "Governance Surface",
    status:
      governanceCount === 0
        ? "fail"
        : governanceCount < governanceSurfaceThreshold
          ? "warn"
          : "pass",
    detail: `${governanceCount} governance canonical files vs ${generatedCount} generated canonical files`,
  });

  checks.push({
    id: "date-hygiene",
    label: "Validation Date Coverage",
    status:
      datedCoverage < 0.3 ? "fail" : datedCoverage < 0.7 ? "warn" : "pass",
    detail: `${Math.round(datedCoverage * 100)}% of governance files include Last validated`,
  });

  checks.push({
    id: "oversized-rules",
    label: "Oversized Canonical Rules",
    status: oversizedCount > 12 ? "fail" : oversizedCount > 4 ? "warn" : "pass",
    detail: `${oversizedCount} canonical files exceed their recommended size budget`,
  });

  checks.push({
    id: "drift-backlog",
    label: "Drift Backlog",
    status:
      drift.pathIssues + drift.dateIssues > 250
        ? "fail"
        : drift.pathIssues + drift.dateIssues > 50
          ? "warn"
          : "pass",
    detail: `path=${drift.pathIssues}, date=${drift.dateIssues}`,
  });

  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");

  return {
    name: "Stage A",
    status: hasFail ? "fail" : "pass",
    summary: hasFail
      ? "Structural health is below threshold. Address process hygiene before deep rule scoring."
      : hasWarn
        ? "Structural health passes with warnings."
        : "Structural health checks passed.",
    checks,
  };
}

function formatMirrorSyncSummary(
  inventory: Pick<
    RuleInventory,
    | "mirrorHealthyCount"
    | "mirrorDriftedCount"
    | "mirrorOrphanProjectionCount"
    | "mirrorSourceOnlyCount"
    | "mirrorGroups"
  >,
): string {
  const base =
    `healthy=${inventory.mirrorHealthyCount}, drifted=${inventory.mirrorDriftedCount}, ` +
    `orphan projections=${inventory.mirrorOrphanProjectionCount}`;

  if (inventory.mirrorSourceOnlyCount === 0) {
    return base;
  }

  const sourceOnlyContext = formatSourceOnlyMirrorFamilySummary(
    inventory.mirrorGroups,
  );

  return `${base}, source-only=${inventory.mirrorSourceOnlyCount} (informational: ${sourceOnlyContext})`;
}

function formatSourceOnlyMirrorFamilyLabel(group: MirrorGroup): string {
  const sourcePaths =
    group.sourcePaths.length > 0 ? group.sourcePaths : group.memberPaths;
  return sourcePaths.join(" + ");
}

function formatSourceOnlyMirrorFamilySummary(
  groups: MirrorGroup[],
  limit = 2,
): string {
  const sourceOnlyGroups = groups.filter(
    (group) => group.status === "source-only",
  );
  if (sourceOnlyGroups.length === 0) {
    return "detected source family without a matching copy";
  }

  const visibleLabels = sourceOnlyGroups
    .slice(0, limit)
    .map(formatSourceOnlyMirrorFamilyLabel);
  const remainderCount = sourceOnlyGroups.length - visibleLabels.length;
  const familyLabel =
    sourceOnlyGroups.length === 1
      ? "source-only family"
      : "source-only families";
  const remainderSuffix =
    remainderCount > 0 ? ` (+${remainderCount} more)` : "";

  return `${familyLabel}: ${visibleLabels.join("; ")}${remainderSuffix}`;
}

function pushSourceOnlyMirrorFamilyDetail(
  lines: string[],
  groups: MirrorGroup[],
): void {
  const sourceOnlyGroups = groups.filter(
    (group) => group.status === "source-only",
  );
  if (sourceOnlyGroups.length === 0) {
    return;
  }

  const familyLabel =
    sourceOnlyGroups.length === 1
      ? "Named source-only family"
      : "Named source-only families";
  const familyList = sourceOnlyGroups
    .map((group) => `\`${formatSourceOnlyMirrorFamilyLabel(group)}\``)
    .join(", ");
  lines.push(`*Current surface:* ${familyLabel}: ${familyList}.`);
  lines.push("");
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function ratio(part: number, total: number): number {
  if (total <= 0) return 0;
  return part / total;
}

function tokenizeForAlignment(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .filter((token) => !COMMENT_ALIGNMENT_STOPWORDS.has(token));
}

type RuleCorpusEntry = {
  relativePath: string;
  content: string;
  tokens: Set<string>;
};

function classifyAlignmentStatus(
  rate: number,
): "strong" | "partial" | "weak" | "unknown" {
  if (rate <= 0) return "unknown";
  if (rate >= 0.65) return "strong";
  if (rate >= 0.35) return "partial";
  return "weak";
}

function evaluateCommentAlignment(
  comments: Array<{ body: string }>,
  ruleCorpus: RuleCorpusEntry[],
): { rate: number; matchedRuleFiles: string[] } {
  if (comments.length === 0 || ruleCorpus.length === 0) {
    return { rate: 0, matchedRuleFiles: [] };
  }

  let evaluableCount = 0;
  let matchedCount = 0;
  const matchedRuleFiles = new Set<string>();

  for (const comment of comments) {
    const commentTokens = [...new Set(tokenizeForAlignment(comment.body))];
    if (commentTokens.length === 0) continue;
    evaluableCount++;

    let bestMatch: RuleCorpusEntry | null = null;
    let bestOverlap = 0;
    for (const rule of ruleCorpus) {
      const overlap = commentTokens.reduce(
        (count, token) => count + (rule.tokens.has(token) ? 1 : 0),
        0,
      );
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = rule;
      }
    }

    if (
      bestMatch &&
      (bestOverlap >= 2 || (commentTokens.length <= 4 && bestOverlap >= 1))
    ) {
      matchedCount++;
      matchedRuleFiles.add(bestMatch.relativePath);
    }
  }

  if (evaluableCount === 0) {
    return { rate: 0, matchedRuleFiles: [] };
  }
  return {
    rate: matchedCount / evaluableCount,
    matchedRuleFiles: [...matchedRuleFiles],
  };
}

export function assessStageC(
  coverageGaps: CoverageCategory[],
  prMining: PrMiningInsight,
  scoringRuleFiles: RuleFile[],
): { stage: StageResult; metrics: GapCoverageMetrics } {
  const datedCount = scoringRuleFiles.filter(
    (rf) => rf.hasLastValidated,
  ).length;
  const freshnessCoverageScore = ratio(datedCount, scoringRuleFiles.length);

  const criticalCategories = coverageGaps.filter((cat) =>
    CRITICAL_COVERAGE_CATEGORIES.has(cat.name),
  );
  const criticalCovered = criticalCategories.filter(
    (cat) => cat.present,
  ).length;
  const criticalCoverageScore = ratio(
    criticalCovered,
    criticalCategories.length,
  );

  const hasUsablePrSignal =
    prMining.status === "available" &&
    (prMining.findings.some(
      (finding) => finding.coverageStatus !== "unknown",
    ) ||
      prMining.findings.some(
        (finding) => finding.commentAlignmentStatus !== "unknown",
      ));

  const knownFindings = prMining.findings.filter(
    (finding) => finding.coverageStatus !== "unknown",
  );
  const prTotalWeight = knownFindings.reduce(
    (sum, finding) => sum + finding.frequency,
    0,
  );
  const prCoveredWeight = knownFindings
    .filter((finding) => finding.coverageStatus === "match")
    .reduce((sum, finding) => sum + finding.frequency, 0);
  const prCoverageScore = hasUsablePrSignal
    ? ratio(prCoveredWeight, prTotalWeight)
    : criticalCoverageScore;

  const highSeverityFindings = prMining.findings.filter(
    (finding) =>
      finding.severity === "high" && finding.coverageStatus !== "unknown",
  );
  const highSeverityCovered = highSeverityFindings.filter(
    (finding) => finding.coverageStatus === "match",
  ).length;
  const highSeverityCoverageScore =
    hasUsablePrSignal && highSeverityFindings.length > 0
      ? ratio(highSeverityCovered, highSeverityFindings.length)
      : criticalCoverageScore;

  const knownAlignmentFindings = prMining.findings.filter(
    (finding) => finding.commentAlignmentStatus !== "unknown",
  );
  const alignmentTotalWeight = knownAlignmentFindings.reduce(
    (sum, finding) => sum + finding.frequency,
    0,
  );
  const alignmentMatchedWeight = knownAlignmentFindings.reduce(
    (sum, finding) => sum + finding.frequency * finding.commentAlignmentRate,
    0,
  );
  const commentAlignmentScore = hasUsablePrSignal
    ? ratio(alignmentMatchedWeight, alignmentTotalWeight)
    : criticalCoverageScore;

  const score = hasUsablePrSignal
    ? clamp01(
        0.3 * prCoverageScore +
          0.25 * commentAlignmentScore +
          0.2 * criticalCoverageScore +
          0.15 * highSeverityCoverageScore +
          0.1 * freshnessCoverageScore,
      )
    : clamp01(0.6 * criticalCoverageScore + 0.4 * freshnessCoverageScore);

  const checks: StageCheck[] = [];
  if (hasUsablePrSignal) {
    checks.push({
      id: "pr-theme-coverage",
      label: "PR-Recurring Theme Signal Match",
      status:
        prCoverageScore < 0.45
          ? "fail"
          : prCoverageScore < 0.7
            ? "warn"
            : "pass",
      detail: `${Math.round(prCoverageScore * 100)}% weighted signal match across PR-derived themes`,
    });
    checks.push({
      id: "comment-rule-alignment",
      label: "PR Comment-to-Rule Alignment",
      status:
        commentAlignmentScore < 0.4
          ? "fail"
          : commentAlignmentScore < 0.65
            ? "warn"
            : "pass",
      detail: `${Math.round(commentAlignmentScore * 100)}% weighted lexical alignment between PR comments and canonical rules`,
    });
    checks.push({
      id: "high-severity-theme-coverage",
      label: "High-Severity Theme Signal Match",
      status:
        highSeverityCoverageScore < 0.5
          ? "fail"
          : highSeverityCoverageScore < 0.75
            ? "warn"
            : "pass",
      detail: `${Math.round(highSeverityCoverageScore * 100)}% of high-severity PR themes have rule signal match`,
    });
  } else {
    const unavailableReason =
      prMining.status === "available"
        ? "No PR-derived clusters crossed confidence thresholds"
        : (prMining.reason ?? "no PR mining data");
    checks.push({
      id: "pr-theme-coverage",
      label: "PR-Recurring Theme Signal Match",
      status: "warn",
      detail: `Unavailable (${unavailableReason})`,
    });
    checks.push({
      id: "comment-rule-alignment",
      label: "PR Comment-to-Rule Alignment",
      status: "warn",
      detail: hasUsablePrSignal
        ? "Unavailable"
        : `Unavailable (${unavailableReason})`,
    });
    checks.push({
      id: "high-severity-theme-coverage",
      label: "High-Severity Theme Signal Match",
      status: "warn",
      detail: hasUsablePrSignal
        ? "Unavailable"
        : `Unavailable (${unavailableReason})`,
    });
  }

  checks.push({
    id: "critical-baseline-coverage",
    label: "Critical Baseline Coverage",
    status:
      criticalCoverageScore < 0.5
        ? "fail"
        : criticalCoverageScore < 0.75
          ? "warn"
          : "pass",
    detail: `${criticalCovered}/${criticalCategories.length || 0} critical categories covered`,
  });

  checks.push({
    id: "freshness-coverage",
    label: "Freshness Coverage",
    status:
      freshnessCoverageScore < 0.3
        ? "fail"
        : freshnessCoverageScore < 0.7
          ? "warn"
          : "pass",
    detail: `${Math.round(freshnessCoverageScore * 100)}% of scoring files include Last validated`,
  });

  const hasFail = checks.some((check) => check.status === "fail");
  const hasWarn = checks.some((check) => check.status === "warn");
  const uncoveredThemes = prMining.findings
    .filter((finding) => finding.coverageStatus === "missing")
    .map((finding) => finding.label);

  return {
    stage: {
      name: "Stage C",
      status: hasFail ? "fail" : "pass",
      summary: hasFail
        ? "Gap coverage is below threshold; recurring failures are not sufficiently represented in canonical rule text."
        : hasWarn
          ? "Gap coverage passes with warnings."
          : "Gap coverage checks passed.",
      checks,
    },
    metrics: {
      score: roundTenth(score),
      prCoverageScore: roundTenth(prCoverageScore),
      commentAlignmentScore: roundTenth(commentAlignmentScore),
      criticalCoverageScore: roundTenth(criticalCoverageScore),
      highSeverityCoverageScore: roundTenth(highSeverityCoverageScore),
      freshnessCoverageScore: roundTenth(freshnessCoverageScore),
      uncoveredThemes: unique(uncoveredThemes),
    },
  };
}

function detectKeywordConflicts(ruleFiles: RuleFile[]): {
  count: number;
  examples: string[];
} {
  const patterns = [
    {
      id: "package-manager",
      positive: /\b(always|prefer|use)\s+bun\b/i,
      negative: /\b(always|prefer|use)\s+(npm|pnpm)\b/i,
    },
    {
      id: "type-looseness",
      positive: /\b(avoid|never use|do not use)\s+any\b/i,
      negative: /\b(use|allow)\s+any\b/i,
    },
    {
      id: "testing-mandate",
      positive: /\b(always|must)\s+(add|write|run).*(test|tests)\b/i,
      negative: /\b(skip|avoid).*(test|tests)\b/i,
    },
  ] as const;

  const positives = new Map<string, string[]>();
  const negatives = new Map<string, string[]>();

  for (const ruleFile of ruleFiles) {
    if (
      isBootstrapTemplatePath(ruleFile.relativePath) ||
      isPatternDocPath(ruleFile.relativePath)
    ) {
      continue;
    }

    let content = "";
    try {
      content = readFileSync(ruleFile.path, "utf8");
    } catch {
      continue;
    }
    for (const pattern of patterns) {
      if (pattern.positive.test(content)) {
        positives.set(pattern.id, [
          ...(positives.get(pattern.id) ?? []),
          ruleFile.relativePath,
        ]);
      }
      if (pattern.negative.test(content)) {
        negatives.set(pattern.id, [
          ...(negatives.get(pattern.id) ?? []),
          ruleFile.relativePath,
        ]);
      }
    }
  }

  const examples: string[] = [];
  let count = 0;
  for (const pattern of patterns) {
    const pos = unique(positives.get(pattern.id) ?? []);
    const neg = unique(negatives.get(pattern.id) ?? []);
    if (pos.length === 0 || neg.length === 0) continue;
    count++;
    examples.push(
      `${pattern.id}: +(${pos.slice(0, 2).join(", ")}) vs -(${neg.slice(0, 2).join(", ")})`,
    );
  }

  return { count, examples };
}

function contextLoadPressure(alwaysOnLines: number): number {
  if (alwaysOnLines <= 0) return 0;
  if (alwaysOnLines <= 200) return 0.1;
  if (alwaysOnLines <= 400) return 0.3;
  if (alwaysOnLines <= 700) return 0.6;
  return 0.9;
}

export function assessStageD(
  inventory: RuleInventory,
  scoringRuleFiles: RuleFile[],
  surfacePosture: SurfacePostureAssessment,
): { stage: StageResult; metrics: OverkillMetrics } {
  const alwaysOnLines = scoringRuleFiles
    .filter((ruleFile) => countsAsAlwaysOn(ruleFile))
    .reduce((sum, ruleFile) => sum + ruleFile.sizeLines, 0);
  const lowYieldRules = scoringRuleFiles.filter(
    (ruleFile) => !ruleFile.hasWhySection || !ruleFile.hasExamplesSection,
  ).length;
  const lowYieldRatio = ratio(lowYieldRules, scoringRuleFiles.length);
  const keywordConflicts = detectKeywordConflicts(scoringRuleFiles);

  const redundancyPressure = clamp01(inventory.accidentalDuplicationRate * 3);
  const conflictPressure = clamp01(
    inventory.mirrorDriftedCount * 0.5 +
      inventory.mirrorOrphanProjectionCount * 0.2 +
      keywordConflicts.count * 0.4,
  );
  const loadPressure = contextLoadPressure(alwaysOnLines);
  const rawLowYieldPressure = clamp01(lowYieldRatio);
  const toolNativeAdvisoryLowYield =
    surfacePosture.posture === "tool-native-first" &&
    redundancyPressure <= 0.3 &&
    conflictPressure <= 0.2 &&
    loadPressure <= 0.4;
  const lowYieldPressure = toolNativeAdvisoryLowYield
    ? roundTenth(rawLowYieldPressure * 0.5)
    : rawLowYieldPressure;
  const noiseScore = clamp01(
    0.3 * redundancyPressure +
      0.3 * conflictPressure +
      0.25 * loadPressure +
      0.15 * lowYieldPressure,
  );
  const score = clamp01(1 - noiseScore);

  const lowYieldStatus: StageCheck["status"] = toolNativeAdvisoryLowYield
    ? lowYieldRules > 0
      ? "warn"
      : "pass"
    : lowYieldPressure > 0.6
      ? "fail"
      : lowYieldPressure > 0.3
        ? "warn"
        : "pass";

  const checks: StageCheck[] = [
    {
      id: "redundancy-pressure",
      label: "Redundancy Pressure",
      status:
        redundancyPressure > 0.6
          ? "fail"
          : redundancyPressure > 0.3
            ? "warn"
            : "pass",
      detail: `${Math.round(redundancyPressure * 100)}% pressure from accidental duplication`,
    },
    {
      id: "conflict-pressure",
      label: "Conflict Pressure",
      status:
        conflictPressure > 0.5
          ? "fail"
          : conflictPressure > 0.2
            ? "warn"
            : "pass",
      detail: `${Math.round(conflictPressure * 100)}% pressure (mirror drift/orphans + keyword conflicts=${keywordConflicts.count})`,
    },
    {
      id: "context-load-pressure",
      label: "Context Load Pressure",
      status:
        loadPressure > 0.7 ? "fail" : loadPressure > 0.4 ? "warn" : "pass",
      detail: `${alwaysOnLines} always-on lines across scoring surface`,
    },
    {
      id: "low-yield-rules",
      label: "Low-Yield Rule Ratio",
      status: lowYieldStatus,
      detail: toolNativeAdvisoryLowYield
        ? `${lowYieldRules}/${scoringRuleFiles.length || 0} scoring files miss Why or Examples; tool-native-first surface keeps this advisory while duplication/conflict/load stay healthy`
        : `${lowYieldRules}/${scoringRuleFiles.length || 0} scoring files miss Why or Examples`,
    },
  ];

  const hasFail = checks.some((check) => check.status === "fail");
  const hasWarn = checks.some((check) => check.status === "warn");
  return {
    stage: {
      name: "Stage D",
      status: hasFail ? "fail" : "pass",
      summary: hasFail
        ? stageDFailSummary(inventory, keywordConflicts.count)
        : hasWarn
          ? toolNativeAdvisoryLowYield
            ? "Overkill/noise checks pass; tool-native clarity gaps stay advisory while noise signals remain controlled."
            : "Overkill/noise checks pass with warnings."
          : "Overkill/noise checks passed.",
      checks,
    },
    metrics: {
      score: roundTenth(score),
      redundancyPressure: roundTenth(redundancyPressure),
      conflictPressure: roundTenth(conflictPressure),
      contextLoadPressure: roundTenth(loadPressure),
      lowYieldPressure: roundTenth(lowYieldPressure),
      alwaysOnLines,
      lowYieldRules,
      keywordConflictCount: keywordConflicts.count,
    },
  };
}

function classOwner(issueClass: IssueClass): string {
  if (issueClass === "blocking") return "rules-platform";
  if (issueClass === "hygiene") return "rules-maintainers";
  return "repo-owners";
}

function classSlaDays(issueClass: IssueClass): number {
  if (issueClass === "blocking") return 7;
  if (issueClass === "hygiene") return 14;
  return 30;
}

function processIssue(
  auditDate: string,
  id: string,
  title: string,
  detail: string,
  issueClass: IssueClass,
  evidence: string[],
  options?: { actionGroup?: string },
): ProcessIssue {
  const slaDays = classSlaDays(issueClass);
  return {
    id,
    title,
    detail,
    issueClass,
    owner: classOwner(issueClass),
    slaDays,
    dueDate: addDays(auditDate, slaDays),
    evidence: evidence.slice(0, 4),
    actionGroup: options?.actionGroup,
  };
}

function isMetadataOnlyStageCheck(check: StageCheck): boolean {
  return check.id === "date-hygiene" || check.id === "freshness-coverage";
}

function stageCheckIssueClass(check: StageCheck): IssueClass {
  if (isMetadataOnlyStageCheck(check)) {
    return "hygiene";
  }

  return check.status === "fail" ? "blocking" : "hygiene";
}

function issueActionGroup(id: string): string | undefined {
  if (
    id === "stageA-mirror-sync" ||
    id === "mirror-drift" ||
    id === "mirror-orphan"
  ) {
    return "mirror-projections";
  }

  if (
    id === "stageA-date-hygiene" ||
    id === "stageC-freshness-coverage" ||
    id === "hygiene-dates"
  ) {
    return "validation-dates";
  }

  return undefined;
}

function extractKeywordConflictCount(detail: string): number {
  const match = detail.match(/keyword conflicts=(\d+)/i);
  if (!match) return 0;
  const value = Number.parseInt(match[1] ?? "0", 10);
  return Number.isFinite(value) ? value : 0;
}

function classifyConflictPressureDrivers(
  inventory: Pick<
    RuleInventory,
    "mirrorDriftedCount" | "mirrorOrphanProjectionCount"
  >,
  keywordConflictCount: number,
) {
  const hasMirrorPressure =
    inventory.mirrorDriftedCount > 0 ||
    inventory.mirrorOrphanProjectionCount > 0;
  const hasKeywordConflicts = keywordConflictCount > 0;

  return {
    hasMirrorPressure,
    hasKeywordConflicts,
    mirrorOnly: hasMirrorPressure && !hasKeywordConflicts,
    keywordOnly: hasKeywordConflicts && !hasMirrorPressure,
    mixed: hasMirrorPressure && hasKeywordConflicts,
  };
}

function stageDConflictPressureTitle(
  check: StageCheck,
  inventory: Pick<
    RuleInventory,
    "mirrorDriftedCount" | "mirrorOrphanProjectionCount"
  >,
): string {
  const drivers = classifyConflictPressureDrivers(
    inventory,
    extractKeywordConflictCount(check.detail),
  );

  if (drivers.mirrorOnly) {
    return "Repair mirror drift/orphan pressure before adding more rules";
  }

  if (drivers.keywordOnly) {
    return "Resolve conflicting rule guidance before adding more rules";
  }

  if (drivers.mixed) {
    return "Reduce mirror drift and conflicting rule guidance pressure";
  }

  return "Reduce conflict pressure before adding more rules";
}

function stageDFailSummary(
  inventory: Pick<
    RuleInventory,
    "mirrorDriftedCount" | "mirrorOrphanProjectionCount"
  >,
  keywordConflictCount: number,
): string {
  const drivers = classifyConflictPressureDrivers(
    inventory,
    keywordConflictCount,
  );

  if (drivers.mirrorOnly) {
    return "Overkill/noise pressure is high; repair mirror drift/orphan pressure and streamline low-yield rules before adding more.";
  }

  if (drivers.mixed) {
    return "Overkill/noise pressure is high; repair mirror drift and de-conflict rules before adding more.";
  }

  return "Overkill/noise pressure is high; streamline and de-conflict rules before adding more.";
}

function stageDPressureNarrative(
  inventory: Pick<
    RuleInventory,
    "mirrorDriftedCount" | "mirrorOrphanProjectionCount"
  >,
  keywordConflictCount: number,
): string {
  const drivers = classifyConflictPressureDrivers(
    inventory,
    keywordConflictCount,
  );

  if (drivers.mirrorOnly) {
    return "which means the repo likely has too much instruction load or mirror-sync drift.";
  }

  if (drivers.mixed) {
    return "which means the repo likely has too much instruction load plus both mirror-sync drift and conflicting guidance.";
  }

  return "which means the repo likely has too much instruction load or conflicting guidance.";
}

function actionableFallbackTitle(check: StageCheck): string {
  return `Address ${check.label.toLowerCase()}`;
}

function actionableStageCheckTitle(
  stageKey: string,
  check: StageCheck,
  prMining: PrMiningInsight,
  inventory: Pick<
    RuleInventory,
    "mirrorDriftedCount" | "mirrorOrphanProjectionCount"
  >,
): string | null {
  if (stageKey === "stageA") {
    switch (check.id) {
      case "dedup-rate":
        return "Remove accidental duplicate rule copies";
      case "mirror-sync":
        return "Repair drifted or orphaned mirror rule projections";
      case "governance-surface":
        return "Restore governance-owned canonical rule coverage";
      case "date-hygiene":
        return "Add Last validated dates to governance rules";
      case "oversized-rules":
        return "Split oversized canonical rules into focused files";
      case "drift-backlog":
        return "Reduce projection drift backlog";
      default:
        return actionableFallbackTitle(check);
    }
  }

  if (stageKey === "stageC") {
    switch (check.id) {
      case "pr-theme-coverage":
      case "comment-rule-alignment":
      case "high-severity-theme-coverage":
        if (prMining.status !== "available") {
          return prMining.reason?.includes(
            "nested inside a larger git repository",
          )
            ? "Re-run audit at the repo root to include parent-repo PR signal"
            : "Restore PR-derived audit signal before promoting theme work";
        }
        if (prMining.candidateCount === 0 || prMining.findings.length === 0) {
          return null;
        }
        if (check.id === "pr-theme-coverage") {
          return "Add rules for recurring PR failure themes";
        }
        if (check.id === "comment-rule-alignment") {
          return "Align rule wording with recurring PR review language";
        }
        return "Cover high-severity PR failure themes in canonical rules";
      case "critical-baseline-coverage":
        return "Add rules for uncovered critical baseline categories";
      case "freshness-coverage":
        return "Add Last validated dates to scoring rules";
      default:
        return actionableFallbackTitle(check);
    }
  }

  if (stageKey === "stageD") {
    switch (check.id) {
      case "redundancy-pressure":
        return "Remove duplicate rule instructions from the scoring surface";
      case "conflict-pressure":
        return stageDConflictPressureTitle(check, inventory);
      case "context-load-pressure":
        return "Trim always-on rule load on the scoring surface";
      case "low-yield-rules":
        return check.detail.includes("tool-native-first surface")
          ? "Add rationale/examples to improve cross-tool portability"
          : "Rewrite or retire low-yield scoring rules";
      default:
        return actionableFallbackTitle(check);
    }
  }

  return actionableFallbackTitle(check);
}

function buildStageCheckIssue(
  auditDate: string,
  stage: StageResult,
  stageKey: string,
  check: StageCheck,
  prMining: PrMiningInsight,
  inventory: Pick<
    RuleInventory,
    "mirrorDriftedCount" | "mirrorOrphanProjectionCount"
  >,
): ProcessIssue | null {
  const title = actionableStageCheckTitle(stageKey, check, prMining, {
    mirrorDriftedCount: inventory.mirrorDriftedCount,
    mirrorOrphanProjectionCount: inventory.mirrorOrphanProjectionCount,
  });
  if (!title) return null;

  const issueId =
    stageKey === "stageC" &&
    (title ===
      "Re-run audit at the repo root to include parent-repo PR signal" ||
      title === "Restore PR-derived audit signal before promoting theme work")
      ? "stageC-pr-signal-recovery"
      : `${stageKey}-${check.id}`;

  return processIssue(
    auditDate,
    issueId,
    title,
    check.detail,
    stageCheckIssueClass(check),
    [check.detail, stage.summary],
    { actionGroup: issueActionGroup(issueId) },
  );
}

export function buildProcessIssues(
  auditDate: string,
  stageA: StageResult,
  stageB: StageResult,
  stageC: StageResult,
  stageD: StageResult,
  scoringRuleFiles: RuleFile[],
  inventory: RuleInventory,
  diagnostics: {
    noWhyCount: number;
    noExamplesCount: number;
    overBudgetCount: number;
    undatedCount: number;
  },
  guardrail: GuardrailScoreResult,
  coverageGaps: CoverageCategory[],
  prMining: PrMiningInsight,
  recommendations: string[],
): ProcessIssue[] {
  const issues: ProcessIssue[] = [];
  const seenStageIssueIds = new Set<string>();
  const highRiskStaleAlwaysOn =
    assessHighRiskStaleAlwaysOnRules(scoringRuleFiles);
  const highRiskStaleAlwaysOnPaths = new Set(
    highRiskStaleAlwaysOn.map((item) => item.path),
  );

  const addStageIssues = (stage: StageResult, stageKey: string) => {
    for (const check of stage.checks) {
      if (check.status === "fail" || check.status === "warn") {
        const issue = buildStageCheckIssue(
          auditDate,
          stage,
          stageKey,
          check,
          prMining,
          inventory,
        );
        if (!issue || seenStageIssueIds.has(issue.id)) {
          continue;
        }
        seenStageIssueIds.add(issue.id);
        issues.push(issue);
      }
    }
  };

  addStageIssues(stageA, "stageA");
  addStageIssues(stageC, "stageC");
  addStageIssues(stageD, "stageD");

  if (highRiskStaleAlwaysOn.length > 0) {
    const stalePreview = highRiskStaleAlwaysOn
      .slice(0, 2)
      .map((item) => `\`${item.path}\``)
      .join(", ");
    const firstReason = summarizeFreshnessReasons(
      highRiskStaleAlwaysOn[0]?.reasons ?? [],
    );
    issues.push(
      processIssue(
        auditDate,
        "freshness-risk-stale-always-on",
        "Validate or split stale always-on rules",
        `${highRiskStaleAlwaysOn.length} high-risk stale always-on rule file(s) need explicit remediation tracking.${stalePreview ? ` Start with ${stalePreview}` : ""}${firstReason ? ` (${firstReason})` : ""}.`,
        "hygiene",
        highRiskStaleAlwaysOn.slice(0, 3).map((item) => {
          const reasons = item.reasons.join(" + ");
          return reasons
            ? `${item.path} — ${reasons}`
            : `${item.path} — high-risk stale always-on rule`;
        }),
      ),
    );
  }

  if (stageB.status === "skipped") {
    issues.push(
      processIssue(
        auditDate,
        "stageB-skipped",
        "Repair structural trust so content scoring can run normally",
        stageB.summary,
        "blocking",
        recommendations.filter((r) => /Stage B/i.test(r)),
      ),
    );
  }

  if (inventory.accidentalDuplicateGroups.length > 0) {
    issues.push(
      processIssue(
        auditDate,
        "dedup-governance",
        "Resolve accidental duplicate rule sources",
        `${inventory.accidentalDuplicateGroups.length} accidental duplicate group(s) detected.`,
        "hygiene",
        inventory.accidentalDuplicateGroups
          .slice(0, 2)
          .map((g) => g.memberPaths.join(" | ")),
      ),
    );
  }

  if (inventory.mirrorDriftedCount > 0) {
    issues.push(
      processIssue(
        auditDate,
        "mirror-drift",
        "Fix drifted mirror projections",
        `${inventory.mirrorDriftedCount} mirror group(s) have content drift between source and projected agent files.`,
        "blocking",
        inventory.mirrorGroups
          .filter((group) => group.status === "drifted")
          .slice(0, 2)
          .map((group) => group.memberPaths.join(" | ")),
        { actionGroup: issueActionGroup("mirror-drift") },
      ),
    );
  }

  if (inventory.mirrorOrphanProjectionCount > 0) {
    issues.push(
      processIssue(
        auditDate,
        "mirror-orphan",
        "Remove or backfill orphan mirror projections",
        `${inventory.mirrorOrphanProjectionCount} projection group(s) have no source-of-truth rule file.`,
        "hygiene",
        inventory.mirrorGroups
          .filter((group) => group.status === "orphan-projection")
          .slice(0, 2)
          .map((group) => group.memberPaths.join(" | ")),
        { actionGroup: issueActionGroup("mirror-orphan") },
      ),
    );
  }

  const noWhyOutsideHighRisk = scoringRuleFiles.filter(
    (ruleFile) =>
      !ruleFile.hasWhySection &&
      !highRiskStaleAlwaysOnPaths.has(ruleFile.relativePath),
  );
  if (noWhyOutsideHighRisk.length > 0) {
    issues.push(
      processIssue(
        auditDate,
        "format-why",
        "Add Why sections to canonical rules",
        `${noWhyOutsideHighRisk.length} canonical scoring file(s) are missing Why sections.`,
        "hygiene",
        ["Every rule should state the failure mode it prevents."],
      ),
    );
  }

  const noExamplesOutsideHighRisk = scoringRuleFiles.filter(
    (ruleFile) =>
      !ruleFile.hasExamplesSection &&
      !highRiskStaleAlwaysOnPaths.has(ruleFile.relativePath),
  );
  if (noExamplesOutsideHighRisk.length > 0) {
    issues.push(
      processIssue(
        auditDate,
        "format-examples",
        "Add examples (DO/DON'T) to canonical rules",
        `${noExamplesOutsideHighRisk.length} canonical scoring file(s) are missing examples.`,
        "hygiene",
        [
          "DO: show one concrete good pattern reviewers should copy.",
          "DON'T: leave rule intent abstract and force reviewers to infer the right move.",
        ],
      ),
    );
  }

  const oversizedOutsideHighRisk = scoringRuleFiles.filter(
    (ruleFile) =>
      ruleFile.linesOverBudget &&
      !highRiskStaleAlwaysOnPaths.has(ruleFile.relativePath),
  );
  if (oversizedOutsideHighRisk.length > 0) {
    issues.push(
      processIssue(
        auditDate,
        "format-size",
        "Split oversized rules into focused files",
        `${oversizedOutsideHighRisk.length} canonical scoring file(s) exceed their recommended size budget.`,
        "hygiene",
        ["Target 50-150 lines per rule file where possible."],
      ),
    );
  }

  const undatedOutsideHighRisk = scoringRuleFiles.filter(
    (ruleFile) =>
      !ruleFile.hasLastValidated &&
      !highRiskStaleAlwaysOnPaths.has(ruleFile.relativePath),
  );
  if (undatedOutsideHighRisk.length > 0) {
    issues.push(
      processIssue(
        auditDate,
        "hygiene-dates",
        "Add Last validated dates",
        `${undatedOutsideHighRisk.length} canonical scoring file(s) are missing validation dates.`,
        "hygiene",
        ["Use `Last validated: YYYY-MM-DD` and refresh on rule edits."],
        { actionGroup: issueActionGroup("hygiene-dates") },
      ),
    );
  }

  if (guardrail.missingGuardrails.length > 0) {
    issues.push(
      processIssue(
        auditDate,
        "missing-guardrails",
        "Close missing guardrails backlog",
        `${guardrail.missingGuardrails.length} guardrails are missing.`,
        "backlog",
        guardrail.missingGuardrails,
      ),
    );
  }

  // Exclude notApplicable conditional categories (e.g., Multi-Agent Topology for non-orchestrator repos)
  const missingCoverage = coverageGaps
    .filter((c) => !c.present && !c.notApplicable)
    .map((c) => c.name);
  if (missingCoverage.length > 0) {
    issues.push(
      processIssue(
        auditDate,
        "coverage-gaps",
        "Close baseline rule coverage gaps",
        `${missingCoverage.length} baseline categories are missing.`,
        "backlog",
        missingCoverage,
      ),
    );
  }

  if (prMining.status === "available") {
    const uncoveredThemes = prMining.findings.filter(
      (finding) => finding.coverageStatus === "missing",
    );
    if (uncoveredThemes.length > 0) {
      issues.push(
        processIssue(
          auditDate,
          "pr-derived-gaps",
          "Close PR-derived failure-mode signal gaps",
          `${uncoveredThemes.length} recurring PR-derived theme(s) have no clear signal match in canonical rules.`,
          "backlog",
          uncoveredThemes
            .slice(0, 4)
            .map(
              (theme) =>
                `${theme.label} (${theme.frequency} comments across ${theme.uniquePrs} PRs)`,
            ),
        ),
      );
    }
  }

  // Deduplicate by id, keeping first/highest class encountered.
  const uniqueById = new Map<string, ProcessIssue>();
  for (const issue of issues) {
    if (!uniqueById.has(issue.id)) {
      uniqueById.set(issue.id, issue);
    }
  }

  return [...uniqueById.values()].sort(compareProcessIssuePriority);
}

function compareProcessIssuePriority(a: ProcessIssue, b: ProcessIssue): number {
  const classRank: Record<IssueClass, number> = {
    blocking: 0,
    hygiene: 1,
    backlog: 2,
  };

  if (classRank[a.issueClass] !== classRank[b.issueClass]) {
    return classRank[a.issueClass] - classRank[b.issueClass];
  }

  const priorityRank = (issue: ProcessIssue) =>
    issue.id === "freshness-risk-stale-always-on" ? 0 : 1;
  if (priorityRank(a) !== priorityRank(b)) {
    return priorityRank(a) - priorityRank(b);
  }

  if (a.dueDate !== b.dueDate) {
    return a.dueDate.localeCompare(b.dueDate);
  }

  return a.title.localeCompare(b.title);
}

type BuildRemediationPackOptions = {
  promoteStageATrustIssues?: boolean;
};

function stageATrustRemediationRank(issue: ProcessIssue): number {
  if (issue.id.startsWith("stageA-")) return 0;
  if (issue.id === "stageB-skipped") return 1;
  return 2;
}

function compareRemediationPackPriority(
  a: ProcessIssue,
  b: ProcessIssue,
  options: BuildRemediationPackOptions,
): number {
  if (options.promoteStageATrustIssues) {
    const aStageARank = stageATrustRemediationRank(a);
    const bStageARank = stageATrustRemediationRank(b);
    if (aStageARank !== bStageARank) {
      return aStageARank - bStageARank;
    }
  }

  return compareProcessIssuePriority(a, b);
}

export function buildRemediationPack(
  issues: ProcessIssue[],
  options: BuildRemediationPackOptions = {},
): RemediationPack {
  const sorted = [...issues].sort((a, b) =>
    compareRemediationPackPriority(a, b, options),
  );
  const distinctTopIssues: ProcessIssue[] = [];
  const seenActionGroups = new Set<string>();

  for (const issue of sorted) {
    const actionGroup = issue.actionGroup;
    if (actionGroup) {
      if (seenActionGroups.has(actionGroup)) {
        continue;
      }
      seenActionGroups.add(actionGroup);
    }

    distinctTopIssues.push(issue);
    if (distinctTopIssues.length >= 8) {
      break;
    }
  }

  const tasks: RemediationTask[] = distinctTopIssues.map((issue, index) => {
    const expectedRuleDelta =
      issue.issueClass === "blocking"
        ? 8
        : issue.issueClass === "hygiene"
          ? 5
          : 3;
    const expectedGuardrailDelta =
      issue.issueClass === "blocking"
        ? 5
        : issue.issueClass === "hygiene"
          ? 3
          : 2;
    return {
      order: index + 1,
      title: issue.title,
      issueClass: issue.issueClass,
      owner: issue.owner,
      slaDays: issue.slaDays,
      dueDate: issue.dueDate,
      expectedRuleDelta,
      expectedGuardrailDelta,
      exampleEvidence: issue.evidence.slice(0, 2),
      acceptanceCriteria: [
        "Change merged with linked issue id",
        "Audit rerun shows improvement and no regression on tracked metrics",
      ],
    };
  });

  return {
    strategy:
      "Blocking → Hygiene → Backlog (ratchet quality without halting delivery)",
    tasks,
  };
}

// ─── Rule File Discovery ──────────────────────────────────────────────────────

export function discoverRuleFiles(projectRoot: string): RuleFile[] {
  const discovered: RuleFile[] = [];

  for (const file of discoverRuleSurfaceFiles(projectRoot)) {
    const rf = analyzeRuleFile(file.path, projectRoot, file.tool, file.format);
    if (rf) discovered.push(rf);
  }

  return discovered;
}

function extractLoadingPatterns(content: string): string[] {
  const patterns: string[] = [];

  for (const match of content.matchAll(
    /^\s*(?:globs?|fileMatching|Scope):\s*`?([^`\n]+?)`?\s*$/gim,
  )) {
    const pattern = normalizeLoadingPattern(match[1] ?? "");
    if (pattern) patterns.push(pattern);
  }

  for (const match of content.matchAll(
    /^\s*(?:globs?|fileMatching):\s*$\n((?:^\s+.+\n?)*)/gim,
  )) {
    const block = match[1] ?? "";
    for (const line of block.split("\n")) {
      const item = line.match(/^\s*[-*]\s*(.+)$/);
      if (!item) continue;
      const pattern = normalizeLoadingPattern(item[1] ?? "");
      if (pattern) patterns.push(pattern);
    }
  }

  return unique(patterns);
}

export function analyzeRuleFile(
  fullPath: string,
  projectRoot: string,
  tool: string,
  format: string,
): RuleFile | null {
  try {
    const content = readFileSync(fullPath, "utf8");
    const lines = content.split("\n");
    const sizeLines = lines.length;
    const relativePath = fullPath.replace(`${projectRoot}/`, "");
    const authorship = classifyRuleAuthorship(relativePath, tool);
    const fingerprint = normalizedHash(content);
    const loadingPatterns = extractLoadingPatterns(content);

    const hasAlwaysApply =
      /alwaysApply:\s*true/i.test(content) ||
      /Loading tier:\*\*?\s*`?alwaysApply\b/i.test(content) ||
      /Loading tier:\s*`?alwaysApply\b/i.test(content);
    const hasGlob =
      /fileMatching:|globs?:/i.test(content) ||
      /\*\*\/\*\./i.test(content) ||
      /Loading tier:\*\*?\s*`?(applyIntelligently|glob|scoped|conditional)\b/i.test(
        content,
      ) ||
      /Loading tier:\s*`?(applyIntelligently|glob|scoped|conditional)\b/i.test(
        content,
      ) ||
      /Scope:\*\*?\s*`[^`]*\*[^`]*`/i.test(content) ||
      /Scope:\s*`[^`]*\*[^`]*`/i.test(content);
    const hasDescription =
      /^description:/im.test(content) ||
      /^##\s+Why/im.test(content) ||
      /^>\s+Why/im.test(content);
    const hasLastValidated = /Last validated:/i.test(content);
    const hasWhySection =
      /^##\s+(Why|Background|Motivation|Context)/im.test(content) ||
      /\*\*Why\*\*/i.test(content);
    const hasExamplesSection = /```|DO:|DON'T:|✅|❌/i.test(content);
    const linesOverBudget = sizeLines > recommendedLineBudget(relativePath);

    return {
      path: fullPath,
      relativePath,
      tool,
      format,
      sizeLines,
      hasAlwaysApply,
      hasGlob,
      hasDescription,
      hasLastValidated,
      hasWhySection,
      hasExamplesSection,
      linesOverBudget,
      loadingPatterns,
      authorship,
      fingerprint,
    };
  } catch {
    return null;
  }
}

// ─── Coverage Gap Analysis ────────────────────────────────────────────────────

/**
 * Check whether a project has explicit multi-agent delegation/orchestration signals.
 * Scans rule file content AND the project root directory (source files) for the signals.
 */
function detectMultiAgentDelegationSignals(
  ruleFiles: RuleFile[],
  projectRoot: string,
): boolean {
  // Check rule file content first
  const ruleContent = ruleFiles
    .map((rf) => {
      try {
        return readFileSync(rf.path, "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");

  for (const sig of MULTI_AGENT_DELEGATION_SIGNALS) {
    if (sig.test(ruleContent)) return true;
  }

  // Also scan source files one level deep (AGENTS.md, CLAUDE.md, .claude/agents/, scripts/)
  const sourceGlobs = [
    join(projectRoot, "AGENTS.md"),
    join(projectRoot, "CLAUDE.md"),
    join(projectRoot, ".claude", "agents"),
  ];
  for (const p of sourceGlobs) {
    try {
      const stat = statSync(p);
      if (stat.isDirectory()) {
        // .claude/agents/ presence alone is a signal
        const entries = readdirSync(p);
        if (entries.length > 0) return true;
      } else {
        const content = readFileSync(p, "utf8");
        for (const sig of MULTI_AGENT_DELEGATION_SIGNALS) {
          if (sig.test(content)) return true;
        }
      }
    } catch {
      // file/dir doesn't exist — skip
    }
  }

  return false;
}

export function analyzeCoverage(
  ruleFiles: RuleFile[],
  projectRoot?: string,
): CoverageCategory[] {
  const allContent = ruleFiles
    .map((rf) => {
      try {
        return readFileSync(rf.path, "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");

  // Detect delegation signals once (only needed for the conditional topology category)
  let hasDelegationSignals: boolean | null = null;
  const getDelegationSignals = () => {
    if (hasDelegationSignals === null) {
      hasDelegationSignals = projectRoot
        ? detectMultiAgentDelegationSignals(ruleFiles, projectRoot)
        : MULTI_AGENT_DELEGATION_SIGNALS.some((sig) => sig.test(allContent));
    }
    return hasDelegationSignals;
  };

  return COVERAGE_CATEGORIES.map((cat) => {
    // Conditional categories: if the project has no triggering signals, mark notApplicable
    if (cat.conditional) {
      if (!getDelegationSignals()) {
        return {
          name: cat.name,
          present: true,
          signals: [],
          notApplicable: true,
        };
      }
    }

    const matchingSignals: string[] = [];
    for (const pattern of cat.patterns) {
      const match = allContent.match(pattern);
      if (match) {
        matchingSignals.push(match[0]);
      }
    }
    return {
      name: cat.name,
      present: matchingSignals.length > 0,
      signals: [...new Set(matchingSignals)].slice(0, 3),
    };
  });
}

// ─── Enforcement Layer Detection ─────────────────────────────────────────────

export function detectEnforcementLayer(
  projectRoot: string,
  ruleFiles: RuleFile[],
): EnforcementLayer {
  const detected: string[] = [];
  let highestLevel: EnforcementLevel = "none";

  const elevate = (to: EnforcementLevel) => {
    const order: EnforcementLevel[] = ["none", "hook", "ci-gate", "mcp-tool"];
    if (order.indexOf(to) > order.indexOf(highestLevel)) highestLevel = to;
  };

  const hookPaths = [
    join(projectRoot, ".claude", "settings.json"),
    join(projectRoot, ".openclaw", "hooks"),
    join(projectRoot, "hooks"),
  ];

  for (const hp of hookPaths) {
    if (!existsSync(hp)) continue;
    try {
      const stat = statSync(hp);
      if (stat.isDirectory()) {
        const entries = readdirSync(hp);
        if (entries.length > 0) {
          detected.push(`Hook scripts: ${hp.replace(`${projectRoot}/`, "")}/`);
          elevate("hook");
        }
      } else if (stat.isFile()) {
        const content = readFileSync(hp, "utf8");
        if (/"hooks"|"Stop"|"PostToolUse"/.test(content)) {
          detected.push(
            `Claude Code hooks: ${hp.replace(`${projectRoot}/`, "")}`,
          );
          elevate("hook");
        }
      }
    } catch {
      // skip unreadable paths
    }
  }

  for (const pcp of [
    ".husky",
    ".pre-commit-config.yaml",
    "lefthook.yml",
    ".lefthook.yml",
  ]) {
    const full = join(projectRoot, pcp);
    if (existsSync(full)) {
      detected.push(`Pre-commit: ${pcp}`);
      elevate("hook");
    }
  }

  const workflowsDir = join(projectRoot, ".github", "workflows");
  if (existsSync(workflowsDir)) {
    let entries: string[] = [];
    try {
      entries = readdirSync(workflowsDir)
        .filter((e) => e.endsWith(".yml") || e.endsWith(".yaml"))
        .sort((a, b) => a.localeCompare(b));
    } catch {
      // pass
    }

    for (const entry of entries) {
      try {
        const content = readFileSync(join(workflowsDir, entry), "utf8");
        const hasLinting =
          /\b(lint|eslint|biome|tsc|typecheck|type-check)\b/i.test(content);
        const hasTesting = /\b(test|vitest|jest|pytest|bun test)\b/i.test(
          content,
        );
        const hasBuild = /\b(build|compile)\b/i.test(content);
        const signals: string[] = [];
        if (hasLinting) signals.push("lint/typecheck");
        if (hasTesting) signals.push("tests");
        if (hasBuild) signals.push("build");
        if (signals.length > 0) {
          detected.push(
            `CI gate (${signals.join(", ")}): .github/workflows/${entry}`,
          );
          elevate("ci-gate");
        }
      } catch {
        // skip unreadable workflows
      }
    }
  }

  for (const cp of [".gitlab-ci.yml", "Makefile", "justfile"]) {
    const full = join(projectRoot, cp);
    if (existsSync(full)) {
      try {
        const content = readFileSync(full, "utf8");
        if (/\b(lint|test|typecheck|ci)\b/i.test(content)) {
          detected.push(`${cp} CI target: ${cp}`);
          elevate("ci-gate");
        }
      } catch {
        // skip
      }
    }
  }

  for (const mcp of [".mcp.json", ".claude/mcp.json", "mcp.json"]) {
    const full = join(projectRoot, mcp);
    if (existsSync(full)) {
      detected.push(`MCP config: ${mcp}`);
      elevate("mcp-tool");
    }
  }

  for (const rf of ruleFiles) {
    try {
      const content = readFileSync(rf.path, "utf8");
      if (
        /mcp[_-]?server|mcpServers|codescene-mcp|@modelcontextprotocol/i.test(
          content,
        )
      ) {
        detected.push(`MCP reference in ${rf.relativePath}`);
        elevate("mcp-tool");
      }
    } catch {
      // skip
    }
  }

  return { level: highestLevel, detected };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function scoreAudit(
  ruleFiles: RuleFile[],
  coverageGaps: CoverageCategory[],
  enforcementLayer: EnforcementLayer,
  gapCoverageScore: number,
  overkillScore: number,
  surfacePosture?: SurfacePostureAssessment,
): {
  ruleScore5: number;
  ruleScore100: number;
  breakdown: Record<string, number>;
  recommendations: string[];
  diagnostics: {
    noWhyCount: number;
    noExamplesCount: number;
    overBudgetCount: number;
    undatedCount: number;
  };
} {
  const recommendations: string[] = [];
  const breakdown: Record<string, number> = {};
  let noWhyCount = 0;
  let noExamplesCount = 0;
  let overBudgetCount = 0;
  let undatedCount = 0;
  const highRiskStaleAlwaysOn = assessHighRiskStaleAlwaysOnRules(ruleFiles);

  if (ruleFiles.length === 0) {
    breakdown.presence = 0;
    recommendations.push(
      "🔴 No canonical scoring rule files detected. Run `bun run scripts/bootstrap-generate.ts <path>` to generate a starter set.",
    );
  } else if (ruleFiles.length === 1) {
    breakdown.presence = 0.5;
    recommendations.push(
      "⚠️ Only one canonical scoring rule file found. Consider splitting the scored source-of-truth surface into multiple focused files.",
    );
  } else {
    breakdown.presence = 1;
  }

  if (ruleFiles.length > 0) {
    const clarityUplift = computeFormatSubscore(ruleFiles);
    if (surfacePosture?.posture === "tool-native-first") {
      const agentFitEvidence = surfacePosture.agentFitEvidence ?? 0;
      breakdown.format = roundTenth(
        0.7 * agentFitEvidence + 0.3 * clarityUplift,
      );
    } else {
      breakdown.format = clarityUplift;
    }

    noWhyCount = ruleFiles.filter((rf) => !rf.hasWhySection).length;
    if (noWhyCount > 0) {
      recommendations.push(
        surfacePosture?.posture === "tool-native-first"
          ? `⚠️ ${noWhyCount} canonical scoring rule file(s) missing a "Why" section. This stays a clarity uplift for the active tool-native surface, but it would improve portability across tools.`
          : `⚠️ ${noWhyCount} canonical scoring rule file(s) missing a "Why" section — explain the failure mode each rule prevents.`,
      );
    }
    noExamplesCount = ruleFiles.filter((rf) => !rf.hasExamplesSection).length;
    if (noExamplesCount > 0) {
      recommendations.push(
        surfacePosture?.posture === "tool-native-first"
          ? `⚠️ ${noExamplesCount} canonical scoring rule file(s) missing examples (DO/DON'T). Keep this advisory for the tool-native surface, but add examples if you want stronger cross-tool portability.`
          : `⚠️ ${noExamplesCount} canonical scoring rule file(s) missing examples (DO/DON'T). Examples dramatically increase rule effectiveness.`,
      );
    }
    overBudgetCount = ruleFiles.filter((rf) => rf.linesOverBudget).length;
    if (overBudgetCount > 0) {
      recommendations.push(
        `⚠️ ${overBudgetCount} canonical scoring rule file(s) exceed their recommended size budget. Consider splitting or tightening the scored surface by file type.`,
      );
    }
  } else {
    breakdown.format = 0;
  }

  if (ruleFiles.length > 0) {
    const tierRelevantFiles = ruleFiles.filter((rf) =>
      requiresExplicitTier(rf),
    );
    const tieredCount = tierRelevantFiles.filter(
      (rf) => rf.hasAlwaysApply || rf.hasGlob,
    ).length;
    breakdown.tiers =
      tierRelevantFiles.length === 0
        ? 1
        : Math.round((tieredCount / tierRelevantFiles.length) * 10) / 10;
    if (breakdown.tiers < 0.5) {
      recommendations.push(
        "⚠️ Most tier-relevant canonical scoring rule files lack explicit loading tier (alwaysApply / glob). Rules without tiers default to always-on, wasting context budget.",
      );
    }
  } else {
    breakdown.tiers = 0;
  }

  if (ruleFiles.length > 0) {
    const datedCount = ruleFiles.filter((rf) => rf.hasLastValidated).length;
    undatedCount = ruleFiles.length - datedCount;
    breakdown.hygiene = Math.round((datedCount / ruleFiles.length) * 10) / 10;
    if (breakdown.hygiene < 0.5) {
      recommendations.push(
        "🔴 Most canonical scoring rule files missing 'Last validated' date. Stale rules teach the model wrong things — worse than no rules.",
      );
    }
    if (highRiskStaleAlwaysOn.length > 0) {
      recommendations.push(
        `🔴 ${highRiskStaleAlwaysOn.length} high-risk stale always-on rule file(s) detected. Prioritize validation or splitting for ${highRiskStaleAlwaysOn
          .slice(0, 3)
          .map((item) => `\`${item.path}\``)
          .join(", ")}.`,
      );
    }
  } else {
    breakdown.hygiene = 0;
  }

  // Exclude notApplicable conditional categories from scoring (e.g., Multi-Agent Topology for non-orchestrator repos)
  const applicableGaps = coverageGaps.filter((c) => !c.notApplicable);
  const coveredCount = applicableGaps.filter((c) => c.present).length;
  breakdown.coverage =
    applicableGaps.length > 0
      ? Math.round((coveredCount / applicableGaps.length) * 10) / 10
      : 1.0;
  const missingCategories = applicableGaps
    .filter((c) => !c.present)
    .map((c) => c.name);
  if (missingCategories.length > 0) {
    recommendations.push(
      `⚠️ Coverage gaps in: ${missingCategories.join(", ")}. These are top categories from 130+ community rule sets.`,
    );
  }

  const enforcementScore: Record<EnforcementLevel, number> = {
    none: 0,
    hook: 0.5,
    "ci-gate": 0.8,
    "mcp-tool": 1.0,
  };
  breakdown.enforcement = enforcementScore[enforcementLayer.level];
  if (enforcementLayer.level === "none") {
    recommendations.push(
      "🔴 No enforcement layer detected. Text-only rules are aspiration, not governance. Add hooks (Stop/PostToolUse), CI gates (lint/typecheck/test), or MCP tools for critical rules.",
    );
  } else if (enforcementLayer.level === "hook") {
    recommendations.push(
      "⚠️ Hooks detected but no CI gate. Add a CI workflow that runs lint + typecheck + tests to catch rule violations at merge time.",
    );
  }

  breakdown.gapCoverage = roundTenth(clamp01(gapCoverageScore));
  if (breakdown.gapCoverage < 0.6) {
    recommendations.push(
      "🔴 Gap coverage is weak against observed failures. Prioritize rules for recurring PR-derived themes and critical baseline categories.",
    );
  } else if (breakdown.gapCoverage < 0.8) {
    recommendations.push(
      "⚠️ Gap coverage is partial. Close remaining recurring failure themes before expanding optional rule scope.",
    );
  }

  breakdown.overkill = roundTenth(clamp01(overkillScore));
  if (breakdown.overkill < 0.5) {
    recommendations.push(
      "🔴 Overkill/noise pressure is high. Consolidate redundant rules, reduce always-on load, and resolve conflicting guidance.",
    );
  } else if (breakdown.overkill < 0.7) {
    recommendations.push(
      "⚠️ Overkill/noise pressure is moderate. Trim low-yield rules and keep always-on guidance lean.",
    );
  }

  const avg =
    Object.values(breakdown).reduce((a, b) => a + b, 0) /
    Object.values(breakdown).length;
  const ruleScore5 = Math.round(avg * 5 * 10) / 10;
  const ruleScore100 = Math.round(avg * 100);

  return {
    ruleScore5,
    ruleScore100,
    breakdown,
    recommendations,
    diagnostics: {
      noWhyCount,
      noExamplesCount,
      overBudgetCount,
      undatedCount,
    },
  };
}

function parseDriftSummary(stdout: string | null | undefined): DriftSummary {
  const text = stdout ?? "";
  const readNum = (label: string): number => {
    const match = text.match(new RegExp(`${label}:\\s*(\\d+)`, "i"));
    return match ? Number.parseInt(match[1], 10) : 0;
  };

  return {
    pathIssues: readNum("Path drift"),
    dateIssues: readNum("Date drift"),
    notes: readNum("Non-drift path notes"),
  };
}

function extractGitHubRepoSlug(remoteUrl: string): string | null {
  const input = remoteUrl.trim();
  for (const pattern of GITHUB_REMOTE_PATTERNS) {
    const match = input.match(pattern);
    const owner = match?.groups?.owner?.trim();
    const repo = match?.groups?.repo?.trim();
    if (owner && repo) {
      return `${owner}/${repo}`;
    }
  }
  return null;
}

export function resolveGitHubRepoSlug(projectRoot: string): {
  repo: string | null;
  reason: string | null;
} {
  const repoCheck = spawnSync(
    "git",
    ["-C", projectRoot, "rev-parse", "--is-inside-work-tree"],
    {
      encoding: "utf8",
    },
  );
  if (repoCheck.status !== 0 || !/\btrue\b/i.test(repoCheck.stdout ?? "")) {
    return {
      repo: null,
      reason: "Target path is not inside a git repository.",
    };
  }

  const topLevel = spawnSync(
    "git",
    ["-C", projectRoot, "rev-parse", "--show-toplevel"],
    {
      encoding: "utf8",
    },
  );
  const topLevelRaw = (topLevel.stdout ?? "").trim();
  if (topLevel.status !== 0 || !topLevelRaw) {
    return { repo: null, reason: "Unable to resolve git repository root." };
  }
  const topLevelPath = resolve(topLevelRaw);
  if (topLevelPath !== resolve(projectRoot)) {
    return {
      repo: null,
      reason:
        "PR mining was not evaluated for this scoped audit target because the path is nested inside a larger git repository. Re-run the audit at the repo root to include parent-repo PR signal.",
    };
  }

  const remote = spawnSync(
    "git",
    ["-C", projectRoot, "remote", "get-url", "origin"],
    {
      encoding: "utf8",
    },
  );
  if (remote.status !== 0) {
    return { repo: null, reason: "Git remote `origin` is not configured." };
  }

  const slug = extractGitHubRepoSlug(remote.stdout ?? "");
  if (!slug) {
    return {
      repo: null,
      reason:
        "Origin remote is not a GitHub URL. PR mining currently supports github.com remotes.",
    };
  }

  return { repo: slug, reason: null };
}

async function minePrInsights(
  projectRoot: string,
  artifactsDir: string,
  scoringRuleFiles: RuleFile[],
): Promise<PrMiningInsight> {
  const repoResolution = resolveGitHubRepoSlug(projectRoot);
  if (!repoResolution.repo) {
    return {
      status: "unavailable",
      repo: null,
      reason: repoResolution.reason,
      analyzedPrs: 0,
      reviewedComments: 0,
      substantiveComments: 0,
      candidateCount: 0,
      findings: [],
      artifactPath: null,
    };
  }

  const repo = repoResolution.repo;
  const [owner, name] = repo.split("/");

  try {
    const { prs, comments } = await fetchMergedPRComments(
      owner,
      name,
      PR_MINING_LIMIT,
    );
    const { kept, skipped } = filterComments(comments);
    const clusters = clusterAndScore(kept);

    const ruleCorpus: RuleCorpusEntry[] = scoringRuleFiles
      .map((rf) => {
        let content = "";
        try {
          content = readFileSync(rf.path, "utf8");
        } catch {
          content = "";
        }
        return {
          relativePath: rf.relativePath,
          content,
          tokens: new Set(tokenizeForAlignment(content)),
        };
      })
      .filter((entry) => entry.content.trim().length > 0);
    const scoringContent = ruleCorpus.map((entry) => entry.content).join("\n");
    const themeCoverage = scoreThemeMatches(scoringContent);

    const findings: PrFinding[] = clusters.map((cluster) => {
      const alignment = evaluateCommentAlignment(
        cluster.comments.slice(0, 12),
        ruleCorpus,
      );
      const alignmentStatus = classifyAlignmentStatus(alignment.rate);
      const coverageStatus =
        cluster.theme === "general"
          ? ("unknown" as const)
          : themeCoverage.has(cluster.theme)
            ? ("match" as const)
            : ("missing" as const);

      return {
        theme: cluster.theme,
        label: themeDisplay(cluster.theme),
        frequency: cluster.comments.length,
        score: Math.round(cluster.score * 10) / 10,
        uniquePrs: cluster.uniquePRs.size,
        severity: summarizeSeverity(cluster),
        representativeness: summarizeRepresentativeness(cluster),
        coverageStatus,
        commentAlignmentRate: roundTenth(alignment.rate),
        commentAlignmentStatus: alignmentStatus,
        samplePaths: unique(
          cluster.comments.map((comment) => comment.path ?? "").filter(Boolean),
        ).slice(0, 3),
      };
    });

    const artifactPath = join(artifactsDir, "pr-rule-candidates.md");
    const markdown = buildPrMiningMarkdown(
      repo,
      prs.length,
      comments.length,
      skipped,
      clusters,
    );
    writeFileSync(artifactPath, markdown, "utf8");

    return {
      status: "available",
      repo,
      reason: null,
      analyzedPrs: prs.length,
      reviewedComments: comments.length,
      substantiveComments: kept.length,
      candidateCount: clusters.length,
      findings,
      artifactPath,
    };
  } catch (error) {
    return {
      status: "unavailable",
      repo,
      reason: (error as Error).message,
      analyzedPrs: 0,
      reviewedComments: 0,
      substantiveComments: 0,
      candidateCount: 0,
      findings: [],
      artifactPath: null,
    };
  }
}

function clamp<T>(list: T[], max: number): T[] {
  return list.slice(0, max);
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function humanJoin(items: string[], conjunction = "and"): string {
  const filtered = unique(items);
  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2)
    return `${filtered[0]} ${conjunction} ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")}, ${conjunction} ${filtered[filtered.length - 1]}`;
}

function summarizeStrongestWeakest(
  strongest: [string, number] | null,
  weakest: [string, number] | null,
  equalSummary: (score: number) => string,
  distinctSummary: (strongestLabel: string, weakestLabel: string) => string,
): string | null {
  if (!strongest || !weakest) return null;
  if (strongest[1] === weakest[1]) {
    return equalSummary(strongest[1]);
  }
  return distinctSummary(strongest[0], weakest[0]);
}

const RULE_SCORE_LABELS: Record<string, string> = {
  presence: "rule file presence",
  format: "format quality",
  tiers: "loading tier assignment",
  hygiene: "hygiene / validation dates",
  coverage: "community baseline coverage",
  enforcement: "enforcement layer",
  gapCoverage: "gap coverage",
  overkill: "overkill / noise control",
};

function buildWeakestRatchetLanes(input: {
  scoreBreakdown: Record<string, number>;
  guardrail: GuardrailScoreResult;
}): string[] {
  const weakestRuleDimension = Object.entries(input.scoreBreakdown)
    .filter((entry) => entry[1] < 1)
    .sort((a, b) => a[1] - b[1])[0];
  const weakestGuardrail = (
    [
      ["CI discipline", input.guardrail.breakdown.ciDiscipline],
      ["type safety", input.guardrail.breakdown.typeSafety],
      ["test relevance / depth", input.guardrail.breakdown.testDepth],
      ["code quality policy", input.guardrail.breakdown.codeQuality],
      ["review / ownership", input.guardrail.breakdown.reviewOwnership],
      ["security guardrails", input.guardrail.breakdown.security],
      ["drift resilience", input.guardrail.breakdown.driftResilience],
    ] as Array<[string, number | null]>
  )
    .filter(
      (entry): entry is [string, number] => entry[1] !== null && entry[1] < 5,
    )
    .sort((a, b) => a[1] - b[1])[0];

  const weakestGuardrailLabel = weakestGuardrail
    ? weakestGuardrail[0] === "type safety" && weakestGuardrail[1] === 4
      ? "type safety (4/5 — 5/5 needs type-aware ESLint or a dedicated extra-strict TS lane in CI)"
      : `${weakestGuardrail[0]} (${weakestGuardrail[1]}/5)`
    : null;

  return [
    weakestRuleDimension
      ? `${RULE_SCORE_LABELS[weakestRuleDimension[0]] ?? weakestRuleDimension[0]} (${weakestRuleDimension[1]}/1)`
      : null,
    weakestGuardrailLabel,
  ].filter((lane): lane is string => Boolean(lane));
}

type SectionGuidance = {
  what: string;
  why?: string;
  helpfulTerm?: string;
  likelyFix?: string;
};

function pushGuidance(lines: string[], guidance: SectionGuidance): void {
  lines.push(`*What this means:* ${guidance.what}`);
  if (guidance.why) {
    lines.push(`*Why this matters:* ${guidance.why}`);
  }
  if (guidance.helpfulTerm) {
    lines.push(`*Helpful term:* ${guidance.helpfulTerm}`);
  }
  if (guidance.likelyFix) {
    lines.push(`*Likely fix:* ${guidance.likelyFix}`);
  }
  lines.push("");
}

function pushExplainer(lines: string[], text: string): void {
  lines.push(`*What this means:* ${text}`);
  lines.push("");
}

function mirrorGroupPlainEnglish(group: MirrorGroup): string {
  if (group.status === "drifted") {
    return `The same rule exists in multiple agent formats, but those copies no longer match: ${group.memberPaths.join(" | ")}. Practical risk: different agents may follow different instructions. Fix: choose one source-of-truth file, update it, and regenerate or sync the copies.`;
  }

  if (group.status === "orphan-projection") {
    return `A projected/copied rule file exists without a source-of-truth rule behind it: ${group.memberPaths.join(" | ")}. Practical risk: this file can drift silently because there is no canonical file to compare or regenerate from. Fix: either create the source rule file and keep this as a projection, or stop treating this file as a projection and make it the source of truth.`;
  }

  if (group.status === "source-only") {
    return `A source rule exists without any projected copies: ${group.memberPaths.join(" | ")}. This is usually fine unless other agent formats are expected to receive the same rule.`;
  }

  return `Rule mirrors are healthy for: ${group.memberPaths.join(" | ")}.`;
}

export type PortfolioActionInput = {
  scoringRuleFiles: RuleFile[];
  inventory: RuleInventory;
  diagnostics: {
    noWhyCount: number;
    noExamplesCount: number;
    overBudgetCount: number;
    undatedCount: number;
  };
  coverageGaps: CoverageCategory[];
  prMining: PrMiningInsight;
  stageC: StageResult;
  stageD: StageResult;
  surfacePosture?: SurfacePostureAssessment;
};

export function buildRulePortfolioActions(
  input: PortfolioActionInput,
): RulePortfolioActions {
  const changeExisting: RulePortfolioAction[] = [];
  const addNew: RulePortfolioAction[] = [];
  const reduceOverkill: RulePortfolioAction[] = [];

  const toolNativeFirst = input.surfacePosture?.posture === "tool-native-first";

  const missingWhy = input.scoringRuleFiles.filter(
    (ruleFile) => !ruleFile.hasWhySection,
  );
  if (missingWhy.length > 0) {
    changeExisting.push({
      title: toolNativeFirst
        ? "Add rationale sections for cross-tool portability"
        : "Add explicit Why (failure mode) sections",
      detail: toolNativeFirst
        ? "The native rule surface is already carrying the repo, but adding rationale would make the guidance easier to port and audit across tools."
        : "Several canonical rules lack the failure-mode statement needed for reliable compliance.",
      priority: toolNativeFirst ? "medium" : "high",
      targets: missingWhy.map((ruleFile) => ruleFile.relativePath).slice(0, 5),
      evidence: [
        `${missingWhy.length} scoring rule file(s) missing Why sections`,
      ],
    });
  }

  const missingExamples = input.scoringRuleFiles.filter(
    (ruleFile) => !ruleFile.hasExamplesSection,
  );
  if (missingExamples.length > 0) {
    changeExisting.push({
      title: toolNativeFirst
        ? "Add examples to improve portability"
        : "Add concrete DO/DON'T examples",
      detail: toolNativeFirst
        ? "The tool-native surface remains usable without these examples, but examples would make the rules easier to transfer and explain."
        : "Rules without concrete examples are harder for agents to apply consistently.",
      priority: toolNativeFirst ? "medium" : "high",
      targets: missingExamples
        .map((ruleFile) => ruleFile.relativePath)
        .slice(0, 5),
      evidence: [
        `${missingExamples.length} scoring rule file(s) missing examples`,
      ],
    });
  }

  const undated = input.scoringRuleFiles.filter(
    (ruleFile) => !ruleFile.hasLastValidated,
  );
  if (undated.length > 0) {
    changeExisting.push({
      title: "Add Last validated dates",
      detail:
        "Freshness metadata is required to keep guidance aligned with current code reality.",
      priority: "high",
      targets: undated.map((ruleFile) => ruleFile.relativePath).slice(0, 5),
      evidence: [
        `${undated.length} scoring rule file(s) missing validation dates`,
      ],
    });
  }

  const weakAlignmentThemes = input.prMining.findings
    .filter(
      (finding) =>
        finding.commentAlignmentStatus === "weak" ||
        finding.commentAlignmentStatus === "partial",
    )
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 3);
  if (weakAlignmentThemes.length > 0) {
    changeExisting.push({
      title: "Refine rule wording to match real review language",
      detail:
        "Comment-to-rule alignment is weak for recurring themes; existing wording is likely too abstract.",
      priority: "medium",
      targets: input.scoringRuleFiles
        .map((ruleFile) => ruleFile.relativePath)
        .slice(0, 3),
      evidence: weakAlignmentThemes.map(
        (theme) =>
          `${theme.label}: ${theme.frequency} comments, alignment ${Math.round(theme.commentAlignmentRate * 100)}%`,
      ),
    });
  }

  if (input.prMining.status === "available") {
    const missingSignalThemes = input.prMining.findings
      .filter((finding) => finding.coverageStatus === "missing")
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);
    for (const theme of missingSignalThemes) {
      addNew.push({
        title: `Add focused rule for ${theme.label}`,
        detail:
          "Recurring PR feedback has no clear canonical signal match; add an explicit, scoped rule.",
        priority: theme.severity === "high" ? "high" : "medium",
        targets: theme.samplePaths,
        evidence: [
          `${theme.frequency} comments across ${theme.uniquePrs} PRs`,
          `severity=${theme.severity}`,
        ],
      });
    }
  }

  if (addNew.length === 0 && input.prMining.status === "available") {
    const sparseRuleSurface = input.scoringRuleFiles.length <= 3;
    const overloadedRuleSurface = input.scoringRuleFiles.some(
      (ruleFile) => ruleFile.linesOverBudget,
    );
    const lowYieldPressure = toolNativeFirst
      ? input.stageD.checks.some(
          (check) => check.id === "low-yield-rules" && check.status === "fail",
        )
      : input.stageD.status === "fail" ||
        input.scoringRuleFiles.some(
          (ruleFile) => !ruleFile.hasWhySection || !ruleFile.hasExamplesSection,
        );
    const sparseSurfaceNeedsExtraction =
      sparseRuleSurface && weakAlignmentThemes.length > 0;

    if (
      sparseSurfaceNeedsExtraction ||
      overloadedRuleSurface ||
      lowYieldPressure
    ) {
      const extractThemes = input.prMining.findings
        .filter((finding) => {
          if (finding.theme === "general") {
            return false;
          }

          if (overloadedRuleSurface || lowYieldPressure) {
            return true;
          }

          return (
            finding.commentAlignmentStatus === "weak" ||
            finding.commentAlignmentStatus === "partial"
          );
        })
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 4);

      for (const theme of extractThemes) {
        addNew.push({
          title: `Create focused ${theme.label} rule file`,
          detail:
            overloadedRuleSurface || lowYieldPressure
              ? "Theme appears in recurring PR feedback, and the current rule surface is already overloaded or low-yield. Add a dedicated, scoped rule file."
              : "Theme appears in recurring PR feedback, but the current sparse rule surface only partially matches that review language. Extract a dedicated, scoped rule file for the weakly aligned theme.",
          priority: theme.severity === "high" ? "high" : "medium",
          targets: theme.samplePaths,
          evidence: [
            `${theme.frequency} comments across ${theme.uniquePrs} PRs`,
            `alignment=${Math.round(theme.commentAlignmentRate * 100)}% (${theme.commentAlignmentStatus})`,
            `surface=${input.scoringRuleFiles.length} scoring files; oversized=${overloadedRuleSurface ? "yes" : "no"}; lowYield=${lowYieldPressure ? "yes" : "no"}`,
          ],
        });
      }
    }
  }

  if (addNew.length === 0) {
    // Skip notApplicable conditional gaps (e.g., Multi-Agent Topology for non-orchestrator repos)
    const missingBaseline = input.coverageGaps
      .filter((gap) => !gap.present && !gap.notApplicable)
      .slice(0, 4);
    for (const gap of missingBaseline) {
      const isMultiAgentTopology = gap.name === "Multi-Agent Topology";
      addNew.push({
        title: isMultiAgentTopology
          ? "Add multi-agent topology declaration (role, delegation contract, Rule-of-Two security state)"
          : `Add baseline rule for ${gap.name}`,
        detail: isMultiAgentTopology
          ? "This project uses explicit delegation/orchestration signals but no agent declares its topology role. See docs/patterns/subagent-boundary-declaration.md for the 4-component template (role, delegation contract, security state, context isolation policy)."
          : "Community baseline category is uncovered.",
        priority: CRITICAL_COVERAGE_CATEGORIES.has(gap.name)
          ? "high"
          : "medium",
        targets: [],
        evidence: isMultiAgentTopology
          ? [
              "Delegation/orchestration signals detected but no topology declaration found in rule files",
              "Ref: Anthropic Multi-Agent Research System (June 2025) — vague delegation is #1 coordination failure mode",
              "Ref: Meta Rule of Two (Oct 2025) — [A+B+C] state requires human-in-loop declaration",
              "Pattern: docs/patterns/subagent-boundary-declaration.md",
            ]
          : ["No matching signals in canonical scoring rules"],
      });
    }
  }

  if (input.inventory.accidentalDuplicateGroups.length > 0) {
    const duplicateTargets = unique(
      input.inventory.accidentalDuplicateGroups
        .flatMap((group) => group.memberPaths)
        .slice(0, 8),
    );
    reduceOverkill.push({
      title: "Remove accidental duplicate rule files",
      detail:
        "Duplicate sources increase drift risk and instruction noise without adding new guidance.",
      priority: "high",
      targets: duplicateTargets,
      evidence: [
        `${input.inventory.accidentalDuplicateGroups.length} accidental duplicate group(s)`,
      ],
    });
  }

  if (input.inventory.mirrorOrphanProjectionCount > 0) {
    const orphanTargets = input.inventory.mirrorGroups
      .filter((group) => group.status === "orphan-projection")
      .flatMap((group) => group.memberPaths)
      .slice(0, 8);
    reduceOverkill.push({
      title: "Remove or backfill orphan mirror projections",
      detail:
        "Orphan projections create stale instructions and confusion across agent surfaces.",
      priority: "high",
      targets: orphanTargets,
      evidence: [
        `${input.inventory.mirrorOrphanProjectionCount} orphan projection group(s)`,
      ],
    });
  }

  const oversized = input.scoringRuleFiles.filter(
    (ruleFile) => ruleFile.linesOverBudget,
  );
  if (oversized.length > 0) {
    reduceOverkill.push({
      title: "Split oversized rules into focused files",
      detail:
        "Large rules reduce precision and are harder to maintain; split by concern and scope.",
      priority: "medium",
      targets: oversized.map((ruleFile) => ruleFile.relativePath).slice(0, 5),
      evidence: oversized
        .map(
          (ruleFile) => `${ruleFile.relativePath}: ${ruleFile.sizeLines} lines`,
        )
        .slice(0, 3),
    });
  }

  const lowYieldCandidates = input.scoringRuleFiles.filter(
    (ruleFile) => !ruleFile.hasWhySection || !ruleFile.hasExamplesSection,
  );
  if (lowYieldCandidates.length > 0) {
    reduceOverkill.push({
      title: "Simplify or retire low-yield rules",
      detail:
        "Rules missing Why/Examples should be rewritten or removed if redundant.",
      priority: input.stageD.status === "fail" ? "high" : "medium",
      targets: lowYieldCandidates
        .map((ruleFile) => ruleFile.relativePath)
        .slice(0, 5),
      evidence: [
        `${lowYieldCandidates.length}/${input.scoringRuleFiles.length} scoring rules are low-yield`,
      ],
    });
  }

  return {
    changeExisting: changeExisting.slice(0, 6),
    addNew: addNew.slice(0, 6),
    reduceOverkill: reduceOverkill.slice(0, 6),
  };
}

// ─── Report Generation ────────────────────────────────────────────────────────

function assessHighRiskStaleAlwaysOnRules(
  ruleFiles: RuleFile[],
): Array<{ path: string; reasons: string[] }> {
  return ruleFiles
    .map((rf) => {
      const isRootCanonical = /(^|\/)(AGENTS|CLAUDE)\.md$/i.test(
        rf.relativePath,
      );
      const isUntieredAlwaysOn = !rf.hasAlwaysApply && !rf.hasGlob;
      const rootLoaded =
        rf.hasAlwaysApply || isRootCanonical || isUntieredAlwaysOn;
      const reasons: string[] = [];
      if (!rootLoaded) return null;
      if (!rf.hasLastValidated) reasons.push("missing Last validated");
      if (rf.linesOverBudget) reasons.push("oversized always-on file");
      if (!rf.hasWhySection) reasons.push("missing Why/failure mode");
      if (!rf.hasExamplesSection) reasons.push("missing examples");
      return reasons.length >= 2 ? { path: rf.relativePath, reasons } : null;
    })
    .filter(
      (item): item is { path: string; reasons: string[] } => item !== null,
    );
}

// ─── Executive Summary Layer ─────────────────────────────────────────────────

type Verdict = "PASS" | "NEEDS WORK" | "CRITICAL";

function deriveVerdict(result: AuditResult): Verdict {
  if (result.stageA.status === "fail") return "CRITICAL";
  const anyFail = [result.stageB, result.stageC, result.stageD].some(
    (s) => s.status === "fail",
  );
  if (anyFail || result.ruleScore100 < 50) return "NEEDS WORK";
  return "PASS";
}

function verdictEmoji(verdict: Verdict): string {
  if (verdict === "PASS") return "✅";
  if (verdict === "CRITICAL") return "🔴";
  return "🟡";
}

function formatRemediationOwnerDue(task: RemediationTask): string {
  const owner = task.owner.trim();
  const due = task.dueDate.trim();
  if (!owner && !due) return "";
  if (owner && due) return ` (${owner} · due ${due})`;
  if (owner) return ` (${owner})`;
  return ` (due ${due})`;
}

function summarizeFreshnessReasons(reasons: string[]): string {
  return reasons.slice(0, 2).join(" + ");
}

function deriveEarliestFailingStageAction(result: AuditResult): string | null {
  const stages = [result.stageA, result.stageB, result.stageC, result.stageD];
  const firstFailingStage = stages.find((stage) => stage.status === "fail");
  if (!firstFailingStage) return null;

  const firstFailingCheck =
    firstFailingStage.checks.find((check) => check.status === "fail") ??
    firstFailingStage.checks.find((check) => check.status === "warn");

  const titleByStage: Record<StageResult["name"], string> = {
    "Stage A": "Restore Stage A structural trust",
    "Stage B": "Raise Stage B content quality",
    "Stage C": "Close Stage C coverage gaps",
    "Stage D": "Reduce Stage D noise",
  };

  const startWith = firstFailingCheck
    ? ` — start with ${firstFailingCheck.label}`
    : "";
  return `🔴 [${titleByStage[firstFailingStage.name]}](#process-stages)${startWith}`;
}

function deriveFixFirst(
  result: AuditResult,
  highRiskStaleAlwaysOn: Array<{ path: string; reasons: string[] }>,
): string | null {
  if (result.stageA.status === "fail") {
    return "Fix first: restore Stage A structural trust before treating later scores as decision-grade.";
  }

  const firstBlockingTask = (result.remediationPack?.tasks ?? []).find(
    (task) => task.issueClass === "blocking",
  );
  if (firstBlockingTask) {
    return `Fix first: ${firstBlockingTask.title}${formatRemediationOwnerDue(firstBlockingTask)}.`;
  }

  if (result.stageB.status === "fail") {
    return "Fix first: raise Stage B content quality so the core rules are credible before deeper optimization.";
  }

  if (result.stageC.status === "fail") {
    return "Fix first: close Stage C coverage gaps so the rules reflect real PR failure modes.";
  }

  if (result.stageD.status === "fail") {
    return "Fix first: reduce Stage D noise so engineers can apply the rules without instruction overload.";
  }

  if (highRiskStaleAlwaysOn.length > 0) {
    return `Fix first: validate or split \`${highRiskStaleAlwaysOn[0]?.path}\` so stale always-on guidance stops dominating the remediation path.`;
  }

  // When effectiveness is the bottleneck, connect Fix-first directly to the instrumentation candidate
  // so the reader knows exactly what to do and what changes measurably when they do it.
  const eff = result.ruleEffectiveness;
  if (
    eff &&
    (eff.status === "Unmeasured" || eff.status === "Flat") &&
    eff.instrumentationCandidate?.missing.length
  ) {
    const { fileName, missing } = eff.instrumentationCandidate;
    const outcome =
      eff.status === "Unmeasured"
        ? "the rule surface becomes measurable for the first time"
        : "the effectiveness signal switches from flat to a measurable trend";
    return `Fix first: instrument \`${fileName}\` — add ${missing.join(", ")}. Once complete, ${outcome}.`;
  }

  const firstTask = result.remediationPack?.tasks?.[0];
  if (firstTask) {
    return `Fix first: ${firstTask.title}${formatRemediationOwnerDue(firstTask)}.`;
  }

  const firstSuggestion = (result.aiSynthesis?.suggestions ?? []).find(
    (suggestion) =>
      suggestion.title !== "Verify the remaining score delta is actionable",
  );
  if (firstSuggestion) {
    return `Fix first: ${firstSuggestion.title}.`;
  }

  return null;
}

/** Derive up to 3 top actions from remediation tasks or AI suggestions. */
function deriveTop3Actions(
  result: AuditResult,
  highRiskStaleAlwaysOn: Array<{ path: string; reasons: string[] }>,
): string[] {
  const actions: string[] = [];
  const addedTitles = new Set<string>();

  const earliestFailingStageAction = deriveEarliestFailingStageAction(result);
  if (earliestFailingStageAction) {
    actions.push(earliestFailingStageAction);
    addedTitles.add("__earliest_failing_stage__");
  }

  const staleAction =
    highRiskStaleAlwaysOn.length > 0
      ? (() => {
          const stalePreview = highRiskStaleAlwaysOn
            .slice(0, 2)
            .map((item) => `\`${item.path}\``)
            .join(", ");
          const firstReason = summarizeFreshnessReasons(
            highRiskStaleAlwaysOn[0]?.reasons ?? [],
          );
          return `🚩 [Validate or split stale always-on rules](#freshness-risk) — start with ${stalePreview}${firstReason ? ` (${firstReason})` : ""}`;
        })()
      : null;

  // Prefer remediation pack tasks (already ordered by expected impact)
  const tasks = result.remediationPack?.tasks ?? [];
  if (tasks.length > 0) {
    for (const t of tasks) {
      if (actions.length >= 3) break;
      if (addedTitles.has(t.title)) continue;
      if (
        t.title === "Validate or split stale always-on rules" &&
        staleAction
      ) {
        actions.push(staleAction);
        addedTitles.add(t.title);
        continue;
      }
      const classTag =
        t.issueClass === "blocking"
          ? "🔴"
          : t.issueClass === "hygiene"
            ? "🟠"
            : "🟡";
      const delta =
        t.expectedRuleDelta > 0
          ? ` · +${t.expectedRuleDelta} rule pts`
          : t.expectedGuardrailDelta > 0
            ? ` · +${t.expectedGuardrailDelta} guardrail pts`
            : "";
      const ownerDue = formatRemediationOwnerDue(t);
      actions.push(
        `${classTag} [${t.title}](#remediation-pack) (task #${t.order}${ownerDue}${delta})`,
      );
      addedTitles.add(t.title);
    }
    return actions.slice(0, 3);
  }

  if (staleAction) {
    actions.push(staleAction);
    addedTitles.add("Validate or split stale always-on rules");
  }

  // Fallback: use AI synthesis suggestions
  const suggestions = (result.aiSynthesis?.suggestions ?? []).filter(
    (suggestion) =>
      suggestion.title !== "Verify the remaining score delta is actionable",
  );
  for (const s of suggestions) {
    if (actions.length >= 3) break;
    const pTag =
      s.priority === "high" ? "🔴" : s.priority === "medium" ? "🟠" : "🟡";
    actions.push(
      `${pTag} [${s.title}](#ai-top-5-improvements) — ${s.why.slice(0, 80).trimEnd()}`,
    );
  }
  return actions.slice(0, 3);
}

function detectExplicitEffectivenessStatus(
  content: string,
): RuleEffectivenessStatus | null {
  const match = content.match(
    /(?:^|\n)\s*(?:[-*]\s*)?\|?\s*(?:\*\*)?(?:current |effectiveness )?status(?:\*\*)?\s*[:|]\s*(?:\*\*)?(improving|flat|regressing)\b/im,
  );
  if (!match) return null;
  const value = match[1]?.toLowerCase();
  if (value === "regressing") return "Regressing";
  if (value === "flat") return "Flat";
  if (value === "improving") return "Improving";
  return null;
}

export function assessRuleEffectiveness(
  scoringRuleFiles: RuleFile[],
): RuleEffectivenessAssessment {
  const evidence: string[] = [];
  let failureModeRuleCount = 0;
  let baselineRuleCount = 0;
  let signalRuleCount = 0;
  let reviewIntervalRuleCount = 0;
  let instrumentedRuleCount = 0;
  let explicitFlat = false;
  let explicitRegressing = false;
  let explicitImproving = false;

  // Track the best candidate for instrumentation (most ticks already present)
  let bestCandidate: {
    fileName: string;
    missing: string[];
    ticks: number;
  } | null = null;

  for (const file of scoringRuleFiles) {
    let content = "";
    try {
      content = readFileSync(file.path, "utf8");
    } catch {
      continue;
    }

    const lower = content.toLowerCase();
    const hasFailureMode =
      file.hasWhySection ||
      /failure mode|recurring mistake|recurring failure|anti-pattern|prevents?|avoid(s|ing)?\s/.test(
        lower,
      );
    const hasBaseline =
      /\bbaseline\b|before the rule|before adoption|prior to the rule|baseline missing/.test(
        lower,
      );
    const hasSignal =
      /review recurrence|violation trend|quality metric|cleanup burden|primary signal|effectiveness signal/.test(
        lower,
      );
    const hasReviewInterval =
      /review interval|check again|re-check|follow-up|next audit cycle|quarterly pr-mining pass|quarterly pr mining pass/.test(
        lower,
      );

    if (hasFailureMode) failureModeRuleCount++;
    if (hasBaseline) baselineRuleCount++;
    if (hasSignal) signalRuleCount++;
    if (hasReviewInterval) reviewIntervalRuleCount++;
    if (hasFailureMode && hasBaseline && hasSignal && hasReviewInterval) {
      instrumentedRuleCount++;
    }

    // Track best instrumentation candidate
    const fileName = file.relativePath.split("/").pop() ?? file.relativePath;
    const ticks = [
      hasFailureMode,
      hasBaseline,
      hasSignal,
      hasReviewInterval,
    ].filter(Boolean).length;
    const missing: string[] = [];
    if (!hasFailureMode) missing.push("failure mode / why-section");
    if (!hasBaseline) missing.push("baseline");
    if (!hasSignal) missing.push("primary signal");
    if (!hasReviewInterval) missing.push("review interval");
    if (!bestCandidate || ticks > bestCandidate.ticks) {
      bestCandidate = { fileName, missing, ticks };
    }

    const explicitStatus = detectExplicitEffectivenessStatus(content);
    explicitImproving ||= explicitStatus === "Improving";
    explicitFlat ||= explicitStatus === "Flat";
    explicitRegressing ||= explicitStatus === "Regressing";
  }

  const totalRuleCount = scoringRuleFiles.length;
  let status: RuleEffectivenessStatus = "Unmeasured";
  if (explicitRegressing) {
    status = "Regressing";
  } else if (explicitFlat) {
    status = "Flat";
  } else if (explicitImproving) {
    status = "Improving";
  } else if (instrumentedRuleCount > 0) {
    status = "Instrumented";
  }

  evidence.push(
    `${instrumentedRuleCount}/${totalRuleCount} canonical rule file(s) show the minimum instrumentation loop`,
  );
  evidence.push(
    `${failureModeRuleCount}/${totalRuleCount} name a failure mode or clear why-section`,
  );
  evidence.push(`${baselineRuleCount}/${totalRuleCount} mention a baseline`);
  evidence.push(
    `${signalRuleCount}/${totalRuleCount} mention an effectiveness signal`,
  );
  evidence.push(
    `${reviewIntervalRuleCount}/${totalRuleCount} mention a review interval or follow-up point`,
  );

  const note =
    status === "Regressing"
      ? "Explicit regression language appears in the current rule/report surface. Treat affected rules as failing and revise them quickly."
      : status === "Flat"
        ? "The current rule/report surface includes flat effectiveness language. Rules with no movement after the review interval should be rewritten or escalated."
        : status === "Improving"
          ? "The current rule/report surface includes explicit improvement language. Keep measuring so the gain stays real, not anecdotal."
          : status === "Instrumented"
            ? "At least one canonical rule file includes the minimum effectiveness loop: failure mode, baseline, signal, and review interval."
            : "No canonical rule file currently shows the full effectiveness loop. Add a failure mode, baseline, primary signal, and follow-up interval before claiming rule effectiveness.";

  return {
    status,
    instrumentedRuleCount,
    totalRuleCount,
    failureModeRuleCount,
    baselineRuleCount,
    signalRuleCount,
    reviewIntervalRuleCount,
    evidence,
    note,
    instrumentationCandidate: bestCandidate
      ? { fileName: bestCandidate.fileName, missing: bestCandidate.missing }
      : undefined,
  };
}

function deriveEffectivenessCoverageLabel(
  effectiveness: RuleEffectivenessAssessment,
): string | null {
  if (
    effectiveness.status !== "Instrumented" ||
    effectiveness.totalRuleCount === 0
  ) {
    return null;
  }

  const hasCoverageGap =
    effectiveness.instrumentedRuleCount < effectiveness.totalRuleCount ||
    effectiveness.baselineRuleCount < effectiveness.totalRuleCount ||
    effectiveness.signalRuleCount < effectiveness.totalRuleCount ||
    effectiveness.reviewIntervalRuleCount < effectiveness.totalRuleCount;

  if (!hasCoverageGap) {
    return null;
  }

  return `full loop ${effectiveness.instrumentedRuleCount}/${effectiveness.totalRuleCount}; baseline ${effectiveness.baselineRuleCount}/${effectiveness.totalRuleCount}; signal ${effectiveness.signalRuleCount}/${effectiveness.totalRuleCount}; review ${effectiveness.reviewIntervalRuleCount}/${effectiveness.totalRuleCount}`;
}

export function buildSummaryLayer(result: AuditResult): string[] {
  const lines: string[] = [];
  const verdict = deriveVerdict(result);
  const emoji = verdictEmoji(verdict);
  const highRiskStaleAlwaysOn = assessHighRiskStaleAlwaysOnRules(
    result.scoringRuleFiles,
  );
  const effectivenessCoverageLabel = deriveEffectivenessCoverageLabel(
    result.ruleEffectiveness,
  );
  const heuristicRatchetLanes = buildWeakestRatchetLanes({
    scoreBreakdown: result.scoreBreakdown,
    guardrail: result.guardrail,
  });
  const nearMaxOnly =
    heuristicRatchetLanes.length > 0 &&
    heuristicRatchetLanes.every(isNearMaxRatchetLane);
  const top3 = deriveTop3Actions(result, highRiskStaleAlwaysOn);
  const fixFirst = deriveFixFirst(result, highRiskStaleAlwaysOn);

  const blockingCount = result.processIssues.filter(
    (i) => i.issueClass === "blocking",
  ).length;
  const hygieneCount = result.processIssues.filter(
    (i) => i.issueClass === "hygiene",
  ).length;
  const backlogCount = result.processIssues.filter(
    (i) => i.issueClass === "backlog",
  ).length;
  const issueLabel =
    blockingCount + hygieneCount + backlogCount === 0
      ? "none"
      : [
          blockingCount > 0 ? `${blockingCount} 🔴` : null,
          hygieneCount > 0 ? `${hygieneCount} 🟠` : null,
          backlogCount > 0 ? `${backlogCount} 🟡` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const blockingTasks = (result.remediationPack?.tasks ?? []).filter(
    (task) => task.issueClass === "blocking",
  ).length;
  const hygieneTasks = (result.remediationPack?.tasks ?? []).filter(
    (task) => task.issueClass === "hygiene",
  ).length;
  const backlogTasks = (result.remediationPack?.tasks ?? []).filter(
    (task) => task.issueClass === "backlog",
  ).length;
  const remediationLabel =
    blockingTasks + hygieneTasks + backlogTasks === 0
      ? "none"
      : [
          blockingTasks > 0 ? `${blockingTasks} 🔴` : null,
          hygieneTasks > 0 ? `${hygieneTasks} 🟠` : null,
          backlogTasks > 0 ? `${backlogTasks} 🟡` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  const hasActionBacklog =
    blockingCount + hygieneCount + backlogCount > 0 ||
    blockingTasks + hygieneTasks + backlogTasks > 0;
  const remainingScoreDeltaLabel =
    nearMaxOnly && !hasActionBacklog
      ? `near-max: ${humanJoin(heuristicRatchetLanes)}; optional unless ${heuristicRatchetLanes.length > 1 ? "one blocks" : "it blocks"} a real outcome`
      : null;

  const driftBacklog =
    (result.driftSummary?.pathIssues ?? 0) +
    (result.driftSummary?.dateIssues ?? 0);

  const authorWritten = result.ruleInventory.canonicalGovernanceFiles.length;

  lines.push(`### ${emoji} Verdict: ${verdict}`);
  lines.push(
    `${scoreHeadlineLabel(result.auditMode)}: **${result.ruleScore100}/100** · Guardrail Score: **${result.guardrail.total}/35** (${result.guardrail.maturity})`,
  );
  if (fixFirst) {
    lines.push(fixFirst);
  }

  if (result.ruleEffectiveness.status === "Improving") {
    lines.push(
      "Repeat-audit read: the main blockers may still be present, but this run carries fresh evidence of improvement. Treat it as proof of movement, not a stale rerun.",
    );
  } else if (result.ruleEffectiveness.status === "Flat") {
    lines.push(
      "Repeat-audit read: the blocker story is still flat. This run is useful fresh evidence, but it does not yet show that the current remediation path is lifting outcomes.",
    );
  } else if (result.ruleEffectiveness.status === "Regressing") {
    lines.push(
      "Repeat-audit read: the blocker story is getting worse. Escalate the affected rules quickly instead of treating this as routine churn.",
    );
  }

  lines.push("");

  if (top3.length > 0) {
    lines.push(`### Top ${top3.length} Action${top3.length === 1 ? "" : "s"}`);
    top3.forEach((action, idx) => {
      lines.push(`${idx + 1}. ${action}`);
    });
    lines.push("");
  }

  lines.push("### At a Glance");
  lines.push(`| What | Value |`);
  lines.push(`|------|-------|`);
  lines.push(`| Rules scored | ${result.scoringRuleFiles.length} |`);
  lines.push(`| Issues found | ${issueLabel} |`);
  lines.push(`| Remediation tasks | ${remediationLabel} |`);
  lines.push(`| Drift backlog | ${driftBacklog} |`);
  lines.push(
    `| High-risk stale rules | ${highRiskStaleAlwaysOn.length === 0 ? "none" : `🚩 ${highRiskStaleAlwaysOn.length}`} |`,
  );
  if (remainingScoreDeltaLabel) {
    lines.push(`| Remaining score delta | ${remainingScoreDeltaLabel} |`);
  }
  lines.push(`| Effectiveness status | ${result.ruleEffectiveness.status} |`);
  if (effectivenessCoverageLabel) {
    lines.push(`| Effectiveness coverage | ${effectivenessCoverageLabel} |`);
  }
  lines.push(`| Author-written rule files | ${authorWritten} |`);
  lines.push(
    `| Stage A | ${result.stageA.status === "pass" ? "✅" : result.stageA.status === "fail" ? "❌" : "⏸️"} ${result.stageA.status} |`,
  );
  lines.push(
    `| Stage B | ${result.stageB.status === "pass" ? "✅" : result.stageB.status === "fail" ? "❌" : "⏸️"} ${result.stageB.status} |`,
  );
  lines.push(
    `| Stage C | ${result.stageC.status === "pass" ? "✅" : result.stageC.status === "fail" ? "❌" : "⏸️"} ${result.stageC.status} |`,
  );
  lines.push(
    `| Stage D | ${result.stageD.status === "pass" ? "✅" : result.stageD.status === "fail" ? "❌" : "⏸️"} ${result.stageD.status} |`,
  );
  lines.push("");

  if (highRiskStaleAlwaysOn.length > 0) {
    const preview = highRiskStaleAlwaysOn
      .slice(0, 2)
      .map((item) => `\`${item.path}\``)
      .join(", ");
    const firstReason = summarizeFreshnessReasons(
      highRiskStaleAlwaysOn[0]?.reasons ?? [],
    );
    lines.push(
      `**Freshness alert:** ${highRiskStaleAlwaysOn.length} high-risk stale always-on rule file(s) need visibility in the remediation path${preview ? ` — start with ${preview}` : ""}${firstReason ? ` (${firstReason})` : ""}.`,
    );
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────

type BuildReportOptions = {
  reportPath?: string | null;
  targetDisplayPath?: string | null;
};

function defaultAuditReportOutputPath(
  projectName: string,
  auditDate: string,
): string {
  return join(
    process.cwd(),
    "docs",
    "audits",
    `${projectName}-audit-${auditDate}.md`,
  );
}

function defaultArtifactsDirForReport(
  reportPath: string,
  projectName: string,
  auditDate: string,
): string {
  return join(dirname(reportPath), "artifacts", `${projectName}-${auditDate}`);
}

function formatPathForReport(path: string, reportPath: string | null): string {
  if (!reportPath) return path;

  const rel = relative(dirname(reportPath), path).split(sep).join("/");
  if (rel === "") return ".";
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function formatArtifactEntry(
  label: string,
  artifactPath: string,
  reportPath: string | null,
): string {
  if (!reportPath) {
    return `- ${label}: \`${artifactPath}\``;
  }

  const displayPath = formatPathForReport(artifactPath, reportPath);
  return `- ${label}: [\`${displayPath}\`](${displayPath})`;
}

function escapeMarkdownTableCell(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/g, "<br>");
}

export function buildReport(
  result: AuditResult,
  options: BuildReportOptions = {},
): string {
  const lines: string[] = [];
  const reportPath = options.reportPath ? resolve(options.reportPath) : null;
  const scoringPaths = new Set(
    result.scoringRuleFiles.map((rf) => rf.relativePath),
  );
  const classEmoji: Record<IssueClass, string> = {
    blocking: "🔴",
    hygiene: "🟠",
    backlog: "🟡",
  };
  const stageStatusLabel = (stage: StageResult): string => {
    if (stage.status === "pass") return "✅ pass";
    if (stage.status === "fail") return "❌ fail";
    return "⏸️ skipped";
  };
  const failedStages = [
    result.stageA,
    result.stageB,
    result.stageC,
    result.stageD,
  ].filter((stage) => stage.status === "fail");
  const weakestRuleDimension =
    Object.entries(result.scoreBreakdown).sort((a, b) => a[1] - b[1])[0] ??
    null;
  const strongestRuleDimension =
    Object.entries(result.scoreBreakdown).sort((a, b) => b[1] - a[1])[0] ??
    null;
  const guardrailEntries: Array<[string, number]> = [
    ["CI discipline", result.guardrail.breakdown.ciDiscipline],
    ["type safety", result.guardrail.breakdown.typeSafety],
    ["test relevance / depth", result.guardrail.breakdown.testDepth],
    ["code quality policy", result.guardrail.breakdown.codeQuality],
    ["review / ownership", result.guardrail.breakdown.reviewOwnership],
    ["security guardrails", result.guardrail.breakdown.security],
    ["drift resilience", result.guardrail.breakdown.driftResilience],
  ].filter((entry): entry is [string, number] => entry[1] !== null);
  const weakestGuardrail =
    guardrailEntries.slice().sort((a, b) => a[1] - b[1])[0] ?? null;
  const strongestGuardrail =
    guardrailEntries.slice().sort((a, b) => b[1] - a[1])[0] ?? null;
  const missingCoverage = result.coverageGaps.filter((gap) => !gap.present);
  const highRiskStaleAlwaysOn = assessHighRiskStaleAlwaysOnRules(
    result.scoringRuleFiles,
  );
  const effectiveness = result.ruleEffectiveness;
  const stageExplainer = (stage: StageResult): string => {
    const failingChecks = stage.checks
      .filter((check) => check.status === "fail")
      .map((check) => check.label);
    const warningChecks = stage.checks
      .filter((check) => check.status === "warn")
      .map((check) => check.label);

    if (stage.name === "Stage A") {
      if (stage.status === "fail") {
        return `Stage A checks whether the rule system is structurally trustworthy before deeper scoring. It is currently blocked by ${humanJoin(failingChecks.slice(0, 4))}, so the later scores should be read as diagnostic rather than clean.`;
      }
      return "Stage A checks whether the rule system is structurally trustworthy before deeper scoring. Passing here means the surface is clean enough to interpret later sections with confidence.";
    }

    if (stage.name === "Stage B") {
      if (stage.status === "fail") {
        return `Stage B is the content-quality score for the canonical rules that actually matter. It is failing on ${humanJoin(failingChecks.slice(0, 4))}.`;
      }
      if (warningChecks.length > 0) {
        return `Stage B is the content-quality score for the canonical rules that actually matter. It passed, but ${humanJoin(warningChecks.slice(0, 3))} means you should read the score with some caution.`;
      }
      return "Stage B is the content-quality score for the canonical rules that actually matter. A pass here means the content itself is in reasonable shape, independent of repo process issues.";
    }

    if (stage.name === "Stage C") {
      if (stage.status === "fail") {
        return `Stage C checks whether the rules cover the failure modes engineers actually see in PRs. It is failing on ${humanJoin(failingChecks.slice(0, 4))}, which usually means the rules are present but not fresh or not grounded enough.`;
      }
      return "Stage C checks whether the rules cover the failure modes engineers actually see in PRs. Passing here means the rules are aligned with real review pain rather than imagined gaps.";
    }

    if (stage.status === "fail") {
      return `Stage D checks whether the rule set is getting noisy, redundant, or hard to apply. It is failing on ${humanJoin(failingChecks.slice(0, 4))}, ${stageDPressureNarrative(result.ruleInventory, result.overkill.keywordConflictCount)}`;
    }
    return "Stage D checks whether the rule set is getting noisy, redundant, or hard to apply. Passing here means the rule set is still lean enough to be useful.";
  };

  const targetDisplayPath =
    options.targetDisplayPath?.trim() ||
    formatPathForReport(result.projectPath, reportPath);

  lines.push(`# Anvil Audit — ${result.projectName}`);
  lines.push(`*Date: ${result.auditDate}*`);
  lines.push(`*Target: \`${targetDisplayPath}\`*`);
  lines.push(`*Generated by: Anvil audit.ts*`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");

  // ── Executive summary layer (verdict + top 3 actions + at-a-glance) ──────
  for (const line of buildSummaryLayer(result)) {
    lines.push(line);
  }

  const hasRemediationTasks = result.remediationPack.tasks.length > 0;
  const hasProcessIssues = result.processIssues.length > 0;

  if (hasRemediationTasks) {
    lines.push("## Remediation Pack");
    lines.push("");
    pushExplainer(
      lines,
      `This is the suggested fix order for the audit findings. It sits immediately after the executive summary so reviewers can move from verdict to action without hunting through score diagnostics first. This run produced ${result.remediationPack.tasks.length} tasks sequenced for expected score lift.`,
    );
    lines.push(`Strategy: ${result.remediationPack.strategy}`);
    if (highRiskStaleAlwaysOn.length > 0) {
      const stalePreview = highRiskStaleAlwaysOn
        .slice(0, 2)
        .map((item) => `\`${item.path}\``)
        .join(", ");
      lines.push(
        `Freshness focus: validate or split ${stalePreview} first so stale always-on guidance does not stay buried below the summary path.`,
      );
    }
    lines.push("");
    lines.push(
      `| # | Task | Class | Owner | Due | Expected Rule Δ | Expected Guardrail Δ | Example evidence |`,
    );
    lines.push(
      `|---|------|-------|-------|-----|------------------|---------------------|------------------|`,
    );
    for (const task of result.remediationPack.tasks) {
      const evidencePreview =
        (task.exampleEvidence ?? []).length > 0
          ? (task.exampleEvidence ?? [])
              .map((entry) => escapeMarkdownTableCell(entry))
              .join("; ")
          : "—";
      lines.push(
        `| ${task.order} | ${task.title} | ${classEmoji[task.issueClass]} ${task.issueClass} | ${task.owner} | ${task.dueDate} | +${task.expectedRuleDelta} | +${task.expectedGuardrailDelta} | ${evidencePreview} |`,
      );
    }
    lines.push("");
  }

  if (hasProcessIssues) {
    lines.push("## Process Issue Queue");
    lines.push("");
    pushExplainer(
      lines,
      `This converts major findings into trackable operational issues with owners and due dates. It stays adjacent to the remediation pack so the report's action path remains together before the deeper diagnostics. This run generated ${result.processIssues.length} issues so the audit can turn into scheduled work instead of a static report.`,
    );
    lines.push(`| ID | Class | Owner | SLA | Due | Title |`);
    lines.push(`|----|-------|-------|-----|-----|-------|`);
    for (const issue of result.processIssues) {
      lines.push(
        `| \`${issue.id}\` | ${classEmoji[issue.issueClass]} ${issue.issueClass} | ${issue.owner} | ${issue.slaDays}d | ${issue.dueDate} | ${issue.title} |`,
      );
    }
    lines.push("");
    lines.push("Evidence examples:");
    for (const issue of result.processIssues.slice(0, 3)) {
      const evidencePreview =
        issue.evidence.length > 0 ? issue.evidence.join("; ") : issue.detail;
      lines.push(`- \`${issue.id}\` → ${evidencePreview}`);
    }
    lines.push("");
  }

  // ── Detail summary (scores + stage list) ─────────────────────────────────
  lines.push("### Diagnostic Navigation");
  lines.push("");
  lines.push("- [Summary](#summary)");
  if (hasRemediationTasks) {
    lines.push("- [Remediation Pack](#remediation-pack)");
  }
  if (hasProcessIssues) {
    lines.push("- [Process Issue Queue](#process-issue-queue)");
  }
  if (!hasRemediationTasks && !hasProcessIssues) {
    lines.push(
      "- Action path: none generated for this run; use the supporting diagnostics below if you need the evidence behind the pass verdict.",
    );
  }
  lines.push(
    failedStages.length === 0
      ? "- Stage status: all stages passing; use the sections below for supporting detail."
      : `- Stage status: blockers in ${humanJoin(failedStages.map((stage) => stage.name))}; prioritize those checks in [Process Stages](#process-stages).`,
  );
  lines.push("");

  lines.push("### Score Snapshot");
  lines.push("");
  lines.push(
    `**${scoreHeadlineLabel(result.auditMode)}: ${result.ruleScore100}/100** (${result.ruleScore5}/5)`,
  );
  lines.push(
    `**Guardrail Readiness Score: ${result.guardrail.total}/35** (${result.guardrail.maturity})`,
  );
  if (result.auditConfig.present) {
    lines.push(
      `**Guardrail profile:** \`${result.guardrail.profile}\` via \`${result.auditConfig.path.replace(`${result.projectPath}/`, "") || ".anvil/config.yml"}\` (raw baseline ${result.guardrail.rawTotal}/35)`,
    );
  }
  lines.push(`**Stage A: ${stageStatusLabel(result.stageA)}**`);
  lines.push(`**Stage B: ${stageStatusLabel(result.stageB)}**`);
  lines.push(`**Stage C: ${stageStatusLabel(result.stageC)}**`);
  lines.push(`**Stage D: ${stageStatusLabel(result.stageD)}**`);
  lines.push(
    `**Scoring surface: ${result.scoringRuleFiles.length} canonical file(s)** (governance=${result.ruleInventory.canonicalGovernanceFiles.length}, generated=${result.ruleInventory.canonicalGeneratedFiles.length})`,
  );
  if (highRiskStaleAlwaysOn.length > 0) {
    lines.push(
      `**High-risk stale always-on rules: ${highRiskStaleAlwaysOn.length}**`,
    );
  }
  lines.push("");

  lines.push("### Process Stages");
  lines.push("");
  pushGuidance(lines, {
    what: "These four stages tell you where to start: Stage A checks structural trust, Stage B scores rule quality, Stage C checks alignment with real PR failures, and Stage D checks for noise.",
    why: "The first failing stage is usually the right place to start fixing, because later scores often depend on it.",
  });
  for (const stage of [
    result.stageA,
    result.stageB,
    result.stageC,
    result.stageD,
  ]) {
    lines.push(`#### ${stage.name}`);
    lines.push(stageExplainer(stage));
    lines.push("");
    lines.push(stage.summary);
    lines.push("");
    lines.push(`| Check | Status | Detail |`);
    lines.push(`|-------|--------|--------|`);
    for (const check of stage.checks) {
      const mark =
        check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
      lines.push(
        `| ${check.label} | ${mark} ${check.status} | ${check.detail} |`,
      );
    }
    lines.push("");
  }

  lines.push("### Rule Surface Segmentation");
  lines.push("");
  pushGuidance(lines, {
    what:
      result.ruleInventory.canonicalGeneratedFiles.length > 0
        ? `This shows how many rule files exist versus how many actually count after de-duplication and governance/generated separation. In this repo, the meaningful scoring surface is ${result.scoringRuleFiles.length} canonical files, while ${result.ruleInventory.canonicalGeneratedFiles.length} generated files exist mainly for distribution or mirroring.`
        : `This shows how many rule files exist versus how many actually count after de-duplication. In this repo, the meaningful scoring surface is ${result.scoringRuleFiles.length} canonical files.`,
    why: "This matters because a repo can have many copies, generated files, or projections, while only a smaller set actually represents the true rule system.",
    helpfulTerm:
      "The canonical scoring surface is the set of rule files Anvil treats as the source of truth for scoring after removing duplicates and mirrored copies.",
  });
  lines.push(`| Surface | Count |`);
  lines.push(`|---------|-------|`);
  lines.push(`| Discovered (raw) | ${result.ruleInventory.allFiles.length} |`);
  lines.push(
    `| Canonical unique | ${result.ruleInventory.canonicalFiles.length} |`,
  );
  lines.push(
    `| Canonical governance | ${result.ruleInventory.canonicalGovernanceFiles.length} |`,
  );
  lines.push(
    `| Canonical generated | ${result.ruleInventory.canonicalGeneratedFiles.length} |`,
  );
  lines.push(
    `| Duplicate mirrors removed | ${result.ruleInventory.duplicateMirrorCount} |`,
  );
  lines.push(
    `| Expected mirrors (cross-agent projections) | ${result.ruleInventory.expectedDuplicateMirrorCount} |`,
  );
  lines.push(
    `| Accidental duplicate mirrors | ${result.ruleInventory.accidentalDuplicateMirrorCount} |`,
  );
  lines.push(
    `| Duplication rate | ${Math.round(result.ruleInventory.duplicationRate * 100)}% |`,
  );
  lines.push(
    `| Accidental duplication rate | ${Math.round(result.ruleInventory.accidentalDuplicationRate * 100)}% |`,
  );
  lines.push("");
  if (result.ruleInventory.expectedDuplicateGroups.length > 0) {
    lines.push("Expected mirror groups:");
    for (const dup of result.ruleInventory.expectedDuplicateGroups.slice(
      0,
      5,
    )) {
      lines.push(
        `- \`${dup.canonicalPath}\` <= ${dup.memberPaths.join(" | ")}`,
      );
    }
    lines.push("");
  }
  if (result.ruleInventory.accidentalDuplicateGroups.length > 0) {
    lines.push("Accidental duplicate groups:");
    for (const dup of result.ruleInventory.accidentalDuplicateGroups.slice(
      0,
      5,
    )) {
      lines.push(
        `- \`${dup.canonicalPath}\` <= ${dup.memberPaths.join(" | ")}`,
      );
    }
    lines.push("");
  }

  lines.push("### Mirror Sync Health");
  lines.push("");
  const hasMirrorConfig = result.ruleInventory.mirrorConfig.hasConfig;
  const hasMirrorAlerts =
    result.ruleInventory.mirrorDriftedCount +
      result.ruleInventory.mirrorOrphanProjectionCount >
    0;
  const detectedMirrorFamilyCount = result.ruleInventory.mirrorGroups.length;
  const detectedMirrorFamilyLabel = `${detectedMirrorFamilyCount} mirror ${detectedMirrorFamilyCount === 1 ? "family" : "families"}`;
  pushGuidance(lines, {
    what: !hasMirrorConfig
      ? detectedMirrorFamilyCount > 0
        ? hasMirrorAlerts
          ? `This repo does not declare an ai-rules mirror surface, but Anvil still found ${detectedMirrorFamilyLabel} on disk (for example root agent instructions like AGENTS.md/CLAUDE.md). This repo currently has ${result.ruleInventory.mirrorDriftedCount} drifted mirror groups and ${result.ruleInventory.mirrorOrphanProjectionCount} orphan projections across that detected surface.`
          : `This repo does not declare an ai-rules mirror surface, but Anvil still found ${detectedMirrorFamilyLabel} on disk (for example root agent instructions like AGENTS.md/CLAUDE.md). These counts reflect that detected surface, not a configured generated projection set.`
        : "This repo does not declare a mirror/projection surface, so these counts are informational only. Anvil did not find a configured set of copied rule files to compare across agent formats."
      : hasMirrorAlerts
        ? `This checks whether the same rule is being copied across multiple agent formats cleanly. This repo currently has ${result.ruleInventory.mirrorDriftedCount} drifted mirror groups and ${result.ruleInventory.mirrorOrphanProjectionCount} orphan projections.`
        : "This checks whether the same rule is being copied across multiple agent formats cleanly. Healthy means the copies match and there is a clear source of truth.",
    why: !hasMirrorConfig
      ? detectedMirrorFamilyCount > 0
        ? hasMirrorAlerts
          ? "Even without a declared ai-rules mirror config, drift between copied instruction files can send different guidance to different tools."
          : "Even without a declared ai-rules mirror config, copied instruction files can still drift unless one file clearly owns the surface."
        : "That keeps a clean repo from sounding like it has active cross-agent mirror maintenance when it does not."
      : hasMirrorAlerts
        ? "When mirrored rule files are out of sync or missing a source of truth, different agents can follow different instructions without anyone noticing."
        : "When this section is clean, different agents should receive the same instruction set.",
    helpfulTerm: !hasMirrorConfig
      ? detectedMirrorFamilyCount > 0
        ? hasMirrorAlerts
          ? "'Drifted' means multiple copies of the same rule disagree. 'Orphan projection' means a copied rule file exists, but Anvil cannot find the canonical source file that should own it. 'Source-only' means Anvil found one side of a detected mirror family, but not a matching copy on the same surface."
          : result.ruleInventory.mirrorSourceOnlyCount > 0
            ? "'Source-only' means Anvil found one side of a detected mirror family, but not a matching copy on the same surface."
            : undefined
        : result.ruleInventory.mirrorSourceOnlyCount > 0
          ? "'Source-only' means Anvil found a rule family in one format, but there is no declared mirrored copy surface for it in this repo."
          : undefined
      : hasMirrorAlerts
        ? "'Drifted' means multiple copies of the same rule disagree. 'Orphan projection' means a copied rule file exists, but Anvil cannot find the canonical source file that should own it."
        : undefined,
    likelyFix:
      result.ruleInventory.mirrorDriftedCount > 0 ||
      result.ruleInventory.mirrorOrphanProjectionCount > 0
        ? "Pick one source-of-truth file for each mirrored rule, regenerate or sync the copies from it, and stop treating standalone files as projections unless their source file actually exists."
        : undefined,
  });
  pushSourceOnlyMirrorFamilyDetail(lines, result.ruleInventory.mirrorGroups);
  lines.push(`| Status | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Healthy | ${result.ruleInventory.mirrorHealthyCount} |`);
  lines.push(`| Drifted | ${result.ruleInventory.mirrorDriftedCount} |`);
  lines.push(
    `| Orphan projections | ${result.ruleInventory.mirrorOrphanProjectionCount} |`,
  );
  lines.push(`| Source-only | ${result.ruleInventory.mirrorSourceOnlyCount} |`);
  lines.push("");
  const mirrorAlertGroups = result.ruleInventory.mirrorGroups.filter(
    (group) =>
      group.status === "drifted" || group.status === "orphan-projection",
  );
  if (mirrorAlertGroups.length > 0) {
    lines.push("Mirror sync alerts:");
    for (const group of mirrorAlertGroups.slice(0, 8)) {
      lines.push(`- \`${group.key}\`: ${mirrorGroupPlainEnglish(group)}`);
    }
    lines.push("");
  }

  lines.push("### Rule Quality Breakdown");
  lines.push("");
  pushGuidance(lines, {
    what:
      summarizeStrongestWeakest(
        strongestRuleDimension,
        weakestRuleDimension,
        (score) =>
          `These are the ingredients of the rule quality score. All measured rule-quality lanes are tied at ${score}/1, so no single dimension is dragging the overall score down.`,
        (strongestLabel, weakestLabel) =>
          `These are the ingredients of the rule quality score. The current strongest area is ${RULE_SCORE_LABELS[strongestLabel] ?? strongestLabel}, while the weakest is ${RULE_SCORE_LABELS[weakestLabel] ?? weakestLabel}.`,
      ) ??
      "These are the ingredients of the rule quality score. A low number here tells you which aspect of the rules is dragging the overall score down.",
    why: "This matters because it separates 'the repo scored low' from 'this specific property of the rules is what pulled the score down.'",
    helpfulTerm:
      result.surfacePosture?.posture === "tool-native-first"
        ? "For tool-native-first repos, the format lane weights agent-fit evidence ahead of governance-style clarity. Missing Why/examples still show up, but mostly as portability uplift rather than core health failure."
        : "The format/helpfulness lane scores the canonical rule surface for clarity signals like rationale, examples, and size. It is not a requirement that every repo adopt AGENTS.md, CLAUDE.md, or Anvil-style headings everywhere.",
  });
  lines.push(`| Dimension | Score |`);
  lines.push(`|-----------|-------|`);
  for (const [dim, score] of Object.entries(result.scoreBreakdown)) {
    const label =
      {
        presence: "Rule File Presence",
        format:
          result.surfacePosture?.posture === "tool-native-first"
            ? "Agent-Fit / Canonical Clarity"
            : "Canonical Rule Helpfulness (Why/Examples/Size)",
        tiers: "Loading Tier Assignment",
        hygiene: "Hygiene (Validation Dates)",
        coverage: "Community Coverage Baseline",
        enforcement: "Enforcement Layer",
        gapCoverage: "Gap Coverage (Observed Failure Modes)",
        overkill: "Overkill/Noise Control",
      }[dim] ?? dim;
    lines.push(`| ${label} | ${score}/1 |`);
  }
  lines.push("");

  lines.push("### Gap & Overkill Metrics");
  lines.push("");
  pushGuidance(lines, {
    what:
      result.overkill.score < 0.5 || result.gapCoverage.score < 0.5
        ? `This section balances two failure modes: missing rules versus too much noisy guidance. The current weak spots are gap coverage ${result.gapCoverage.score}/1 and overkill control ${result.overkill.score}/1.`
        : "This section balances two failure modes: missing rules versus too much noisy guidance. Healthy scores here mean the rules cover real problems without becoming instruction clutter.",
    helpfulTerm:
      result.overkill.lowYieldRules > 0
        ? result.surfacePosture?.posture === "tool-native-first"
          ? "For tool-native-first repos, low-yield means the native rules could be clearer or more portable. It does not automatically mean the surface is unhealthy when duplication, conflict, and context load remain controlled."
          : "A low-yield rule is a rule file that exists, but is weakly useful because it lacks enough rationale or examples to guide behavior reliably."
        : undefined,
    likelyFix:
      result.overkill.score < 0.5 || result.overkill.lowYieldRules > 0
        ? result.surfacePosture?.posture === "tool-native-first"
          ? "Keep the native surface lean, then add rationale/examples only where you want stronger portability or easier audit review."
          : "Strengthen or remove low-yield rules first, then split large always-on files so the rule set stays useful without overloading context."
        : undefined,
  });
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Gap coverage score | ${result.gapCoverage.score}/1 |`);
  lines.push(`| PR theme coverage | ${result.gapCoverage.prCoverageScore}/1 |`);
  lines.push(
    `| Comment-to-rule alignment | ${result.gapCoverage.commentAlignmentScore}/1 |`,
  );
  lines.push(
    `| Critical baseline coverage | ${result.gapCoverage.criticalCoverageScore}/1 |`,
  );
  lines.push(
    `| High-severity theme coverage | ${result.gapCoverage.highSeverityCoverageScore}/1 |`,
  );
  lines.push(
    `| Freshness coverage | ${result.gapCoverage.freshnessCoverageScore}/1 |`,
  );
  lines.push(`| Overkill control score | ${result.overkill.score}/1 |`);
  lines.push(
    `| Redundancy pressure | ${result.overkill.redundancyPressure}/1 |`,
  );
  lines.push(`| Conflict pressure | ${result.overkill.conflictPressure}/1 |`);
  lines.push(
    `| Context load pressure | ${result.overkill.contextLoadPressure}/1 (${result.overkill.alwaysOnLines} always-on lines) |`,
  );
  lines.push(
    `| Low-yield pressure | ${result.overkill.lowYieldPressure}/1 (${result.overkill.lowYieldRules} files) |`,
  );
  lines.push("");

  lines.push("### Freshness Risk");
  lines.push("");
  pushExplainer(
    lines,
    highRiskStaleAlwaysOn.length > 0
      ? `This highlights the most dangerous stale-rule shape: always-on guidance that is old or weakly maintained. These files are costly because they load on every task while also showing multiple freshness risk signals.`
      : "This highlights the most dangerous stale-rule shape: always-on guidance that is old or weakly maintained. No high-risk stale always-on files were detected in the scoring surface.",
  );
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(
    `| High-risk stale always-on files | ${highRiskStaleAlwaysOn.length} |`,
  );
  lines.push(
    `| Undated scoring files | ${result.scoringRuleFiles.filter((rf) => !rf.hasLastValidated).length} |`,
  );
  lines.push(
    `| Oversized scoring files | ${result.scoringRuleFiles.filter((rf) => rf.linesOverBudget).length} |`,
  );
  lines.push("");
  if (highRiskStaleAlwaysOn.length > 0) {
    lines.push("Priority freshness risks:");
    for (const item of highRiskStaleAlwaysOn.slice(0, 8)) {
      lines.push(`- \`${item.path}\` — ${item.reasons.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("### Guardrail Breakdown");
  lines.push("");
  pushGuidance(lines, {
    what:
      summarizeStrongestWeakest(
        strongestGuardrail,
        weakestGuardrail,
        (score) =>
          `This measures the engineering safety net around the rules: CI, tests, ownership, security, and drift resilience. All measured guardrail dimensions are tied at ${score}/5, so no single area is currently weaker than the rest.`,
        (strongestLabel, weakestLabel) =>
          `This measures the engineering safety net around the rules: CI, tests, ownership, security, and drift resilience. The strongest area is ${strongestLabel}, while the weakest is ${weakestLabel}.`,
      ) ??
      "This measures the engineering safety net around the rules: CI, tests, ownership, security, and drift resilience.",
    why: "A strong rule set is still fragile if the surrounding engineering guardrails do not enforce it or keep it fresh.",
  });
  lines.push(`| Dimension | Score |`);
  lines.push(`|-----------|-------|`);
  const guardrailRows: Array<
    [string, keyof typeof result.guardrail.breakdown]
  > = [
    ["CI Discipline", "ciDiscipline"],
    ["Type Safety", "typeSafety"],
    ["Test Relevance / Depth", "testDepth"],
    ["Code Quality Policy", "codeQuality"],
    ["Review / Ownership", "reviewOwnership"],
    ["Security Guardrails", "security"],
    ["Drift Resilience", "driftResilience"],
  ];
  for (const [label, key] of guardrailRows) {
    const score = result.guardrail.breakdown[key];
    const applicability = result.guardrail.applicability[key];
    lines.push(
      `| ${label} | ${score === null ? `not applicable${applicability.reason ? ` (${applicability.reason})` : ""}` : `${score}/5`} |`,
    );
  }
  lines.push("");
  if (result.guardrail.hardGates.enabled) {
    lines.push("### Hard Gates");
    lines.push("");
    pushGuidance(lines, {
      what: "These are config-driven minimum scores that can fail the CLI even after the full report is generated.",
      why: "This lets a repo keep the full audit report while still enforcing a minimum engineering floor.",
    });
    lines.push(
      `Exit behavior: ${result.guardrail.hardGates.passed ? "pass" : `fail with exit code ${result.guardrail.hardGates.exitCode}`}`,
    );
    lines.push("");
    lines.push("| Dimension | Minimum | Actual | Status |");
    lines.push("|-----------|---------|--------|--------|");
    for (const gate of result.guardrail.hardGates.results) {
      lines.push(
        `| ${gate.dimension} | ${gate.minScore}/5 | ${gate.actualScore === null ? "not applicable" : `${gate.actualScore}/5`} | ${gate.passed ? "✅ pass" : "❌ fail"} |`,
      );
    }
    lines.push("");
  }

  const improvementsSectionTitle =
    result.aiSynthesis.mode === "ai"
      ? "## AI Top 5 Improvements"
      : "## Top 5 Improvements";
  const improvementsWhat =
    result.aiSynthesis.mode === "ai"
      ? "This is the prioritized change list synthesized from the audit evidence."
      : "This is the prioritized change list synthesized from the audit evidence using repo-local heuristics.";
  const heuristicRatchetLanes = buildWeakestRatchetLanes({
    scoreBreakdown: result.scoreBreakdown,
    guardrail: result.guardrail,
  });
  const nearMaxOnly =
    heuristicRatchetLanes.length > 0 &&
    heuristicRatchetLanes.every(isNearMaxRatchetLane);
  const emptyImprovementsCopy =
    result.aiSynthesis.mode === "ai"
      ? ["No synthesized improvements available."]
      : [
          "No heuristic improvements surfaced from this run.",
          nearMaxOnly
            ? `Remaining score delta${heuristicRatchetLanes.length > 1 ? "s are" : " is"} near-max: ${humanJoin(heuristicRatchetLanes)}. Treat ${heuristicRatchetLanes.length > 1 ? "them" : "it"} as optional unless fresh evidence shows ${heuristicRatchetLanes.length > 1 ? "one is" : "it is"} blocking a real outcome.`
            : null,
          heuristicRatchetLanes.length > 0
            ? nearMaxOnly
              ? null
              : `If you want the next ratchet, start with the weakest scored lane${heuristicRatchetLanes.length > 1 ? "s" : ""} above: ${humanJoin(heuristicRatchetLanes)}.`
            : "If you want the next ratchet, review the weakest score lanes above and tighten the next one that has real evidence behind it.",
        ].filter((line): line is string => Boolean(line));

  lines.push(improvementsSectionTitle);
  lines.push("");
  pushGuidance(lines, {
    what: improvementsWhat,
    why: "It should read like an ordered backlog, not generic best-practice advice.",
  });
  lines.push(
    `*Synthesis mode: ${result.aiSynthesis.mode}${result.aiSynthesis.model ? ` (${result.aiSynthesis.model})` : ""}*`,
  );
  lines.push("");
  if (result.aiSynthesis.suggestions.length === 0) {
    for (const line of emptyImprovementsCopy) {
      lines.push(line);
    }
  } else {
    result.aiSynthesis.suggestions.forEach((item, idx) => {
      lines.push(
        `### ${idx + 1}. ${item.title} [${item.priority}] (confidence ${Math.round(item.confidence * 100)}%, impact ${item.impact}/5)`,
      );
      lines.push(item.why);
      lines.push("");
      lines.push("Evidence:");
      for (const ev of item.evidence) {
        lines.push(`- ${ev}`);
      }
      lines.push("");
      lines.push(`Fix: ${item.fix}`);
      lines.push("");
    });
  }
  lines.push("");

  lines.push("## Rule Files");
  lines.push("");
  pushGuidance(lines, {
    what: "This is the file-by-file inventory.",
    why: "Canonical files affect the score; non-canonical files are still listed because they can create drift, duplication, or mirror-sync problems.",
    helpfulTerm:
      "A file marked 'Canonical for scoring' is one Anvil treats as part of the source-of-truth rules surface after removing duplicates and mirrored copies. Repos do not need every tool surface: missing AGENTS.md or CLAUDE.md is not automatically a gap if another canonical surface carries the repo's real instructions. On rows without that mark, starred cells are advisory inventory signals only and do not lower the score.",
  });
  if (result.ruleFiles.length === 0) {
    lines.push("*No AI rule files found in standard locations.*");
  } else {
    lines.push(
      `${result.ruleFiles.length} rule file(s) detected across ${new Set(result.ruleFiles.map((r) => r.tool)).size} tool(s).`,
    );
    lines.push("");
    lines.push(
      `| File | Tool | Authorship | Canonical for scoring | Lines | Why | Examples | Tier | Dated |`,
    );
    lines.push(
      `|------|------|------------|-----------------------|-------|-----|----------|------|-------|`,
    );
    const hasNonScoringRows = result.ruleFiles.some(
      (rf) => !scoringPaths.has(rf.relativePath),
    );
    for (const rf of result.ruleFiles) {
      const isScoring = scoringPaths.has(rf.relativePath);
      const markInventoryOnly = (value: string) =>
        isScoring ? value : `${value}*`;
      const whyMark = markInventoryOnly(rf.hasWhySection ? "✅" : "❌");
      const exMark = markInventoryOnly(rf.hasExamplesSection ? "✅" : "❌");
      const tierMark = requiresExplicitTier(rf)
        ? markInventoryOnly(rf.hasAlwaysApply || rf.hasGlob ? "✅" : "❌")
        : "n/a";
      const dateMark = markInventoryOnly(rf.hasLastValidated ? "✅" : "❌");
      const sizeFlag = markInventoryOnly(
        rf.linesOverBudget ? `⚠️ ${rf.sizeLines}` : `${rf.sizeLines}`,
      );
      lines.push(
        `| \`${rf.relativePath}\` | ${rf.tool} | ${rf.authorship} | ${isScoring ? "✅" : "—"} | ${sizeFlag} | ${whyMark} | ${exMark} | ${tierMark} | ${dateMark} |`,
      );
    }
    lines.push("");
    if (hasNonScoringRows) {
      lines.push(
        "*`*` advisory-only on non-scoring rows; these cells are inventory signals and do not lower the score.*",
      );
      lines.push("");
    }

    if (result.ruleInventory.canonicalGovernanceFiles.length > 0) {
      lines.push("Canonical governance surface:");
      for (const rf of result.ruleInventory.canonicalGovernanceFiles) {
        lines.push(`- \`${rf.relativePath}\` (${rf.sizeLines} lines)`);
      }
      lines.push("");
    }
    if (result.ruleInventory.canonicalGeneratedFiles.length > 0) {
      lines.push("Canonical generated surface:");
      for (const rf of result.ruleInventory.canonicalGeneratedFiles) {
        lines.push(`- \`${rf.relativePath}\` (${rf.sizeLines} lines)`);
      }
      lines.push("");
    }
  }

  lines.push("### Rule Effectiveness Status");
  lines.push("");
  pushGuidance(lines, {
    what: `This estimates whether the current rule surface can show measurable effectiveness instead of only intent. Current status: ${effectiveness.status}.`,
    why: "A rule that cannot name its failure mode, baseline, signal, and review point is hard to defend once the repo changes.",
    helpfulTerm:
      "Instrumented means the rule surface names a failure mode, records a baseline (or baseline missing), picks one signal, and sets a follow-up interval.",
    likelyFix:
      effectiveness.status === "Unmeasured" || effectiveness.status === "Flat"
        ? effectiveness.instrumentationCandidate?.missing.length
          ? `Start with \`${effectiveness.instrumentationCandidate.fileName}\` — it already has the most instrumentation pieces in place. Add the missing pieces: ${effectiveness.instrumentationCandidate.missing.join(", ")}. Once that file has all four, re-audit to confirm the loop closes.`
          : effectiveness.status === "Flat"
            ? "Start with one instrumented rule whose current signal is still flat. Re-check whether the baseline, signal, or enforcement path still match reality, then rewrite or escalate the rule before the next audit."
            : "Start with one promoted rule: write down the target failure mode, baseline, primary signal, and next review date in the rule or audit artifact."
        : undefined,
  });
  lines.push(`Status: **${effectiveness.status}**`);
  lines.push("");
  lines.push(`| Check | Coverage |`);
  lines.push(`|-------|----------|`);
  lines.push(
    `| Minimum instrumentation loop | ${effectiveness.instrumentedRuleCount}/${effectiveness.totalRuleCount} |`,
  );
  lines.push(
    `| Failure mode named | ${effectiveness.failureModeRuleCount}/${effectiveness.totalRuleCount} |`,
  );
  lines.push(
    `| Baseline mentioned | ${effectiveness.baselineRuleCount}/${effectiveness.totalRuleCount} |`,
  );
  lines.push(
    `| Primary signal mentioned | ${effectiveness.signalRuleCount}/${effectiveness.totalRuleCount} |`,
  );
  lines.push(
    `| Review interval mentioned | ${effectiveness.reviewIntervalRuleCount}/${effectiveness.totalRuleCount} |`,
  );
  lines.push("");
  lines.push(effectiveness.note);
  lines.push("");
  if (effectiveness.evidence.length > 0) {
    lines.push("Evidence:");
    for (const item of effectiveness.evidence.slice(0, 5)) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  lines.push("## Enforcement Layer");
  lines.push("");
  pushGuidance(lines, {
    what: "This tells you whether the rules are merely documented or actually enforced.",
    why:
      result.enforcementLayer.level === "none"
        ? "Right now the repo has text-only rules, so compliance depends on people remembering them."
        : `This repo is currently at the '${result.enforcementLayer.level}' level, so some behavior is enforced automatically instead of relying only on instructions.`,
  });
  const levelLabels: Record<EnforcementLevel, string> = {
    none: "❌ None — text-only rules (aspiration, not governance)",
    hook: "⚠️ Hook — lifecycle hooks present (Stop/PostToolUse/pre-commit)",
    "ci-gate": "✅ CI Gate — automated lint/test/typecheck gates at merge",
    "mcp-tool": "✅✅ MCP Tool — real-time enforcement via MCP server",
  };
  lines.push(`**Level: ${levelLabels[result.enforcementLayer.level]}**`);
  lines.push("");
  if (result.enforcementLayer.detected.length > 0) {
    lines.push("Enforcement signals found:");
    for (const signal of result.enforcementLayer.detected) {
      lines.push(`- ${signal}`);
    }
  } else {
    lines.push(
      "No enforcement signals found. Rules exist only as advisory text.",
    );
  }
  lines.push("");

  lines.push("## CLI Signals");
  lines.push("");
  pushGuidance(lines, {
    what: "This section only matters for repositories that behave like command-line tools.",
    why: result.cliSignals.isCliProject
      ? "It checks whether the CLI surface is predictable and safe for users."
      : "This repo does not look like a CLI project, so the result is mainly informational.",
  });
  if (!result.cliSignals.isCliProject) {
    lines.push(
      `CLI project detected: No (confidence ${Math.round(result.cliSignals.confidence * 100)}%)`,
    );
  } else {
    lines.push(
      `CLI project detected: Yes (confidence ${Math.round(result.cliSignals.confidence * 100)}%)`,
    );
    lines.push("");
    lines.push(`| Check | Status |`);
    lines.push(`|-------|--------|`);
    lines.push(
      `| Argument parsing | ${result.cliSignals.checks.argumentParsing ? "✅" : "❌"} |`,
    );
    lines.push(
      `| Help text | ${result.cliSignals.checks.helpText ? "✅" : "❌"} |`,
    );
    lines.push(
      `| Exit code hygiene | ${result.cliSignals.checks.exitCodeHygiene ? "✅" : "❌"} |`,
    );
    lines.push(
      `| Input validation | ${result.cliSignals.checks.inputValidation ? "✅" : "❌"} |`,
    );
    lines.push(
      `| Error boundary | ${result.cliSignals.checks.errorBoundary ? "✅" : "❌"} |`,
    );
  }
  lines.push("");

  lines.push("## Distribution Layer");
  lines.push("");
  pushGuidance(lines, {
    what: "This checks how the rule set is distributed across agent surfaces.",
    why: result.ruleInventory.mirrorConfig.hasConfig
      ? `This repo has an ai-rules distribution config targeting ${humanJoin(result.ruleInventory.mirrorConfig.agents)}.`
      : "Missing config here usually means mirroring and cross-agent consistency are manual.",
  });
  lines.push(`| Check | Status |`);
  lines.push(`|-------|--------|`);
  lines.push(
    `| block/ai-rules \`ai-rules/\` directory | ${result.hasAiRulesDir ? "✅ Present" : "❌ Not found"} |`,
  );
  lines.push(
    `| block/ai-rules config | ${result.hasBlockAiRules ? "✅ Configured" : "❌ Not configured"} |`,
  );
  lines.push(
    `| ai-rules target agents | ${
      result.ruleInventory.mirrorConfig.hasConfig
        ? `✅ ${result.ruleInventory.mirrorConfig.agents.join(", ") || "none listed"}`
        : "—"
    } |`,
  );
  lines.push("");

  lines.push("## Coverage Analysis");
  lines.push("");
  pushExplainer(
    lines,
    missingCoverage.length === 0
      ? "This compares the rule set against a common baseline of categories. All baseline categories are represented here, but that does not automatically mean the rules are high quality or enforced well."
      : `This compares the rule set against a common baseline of categories. The current uncovered categories are ${humanJoin(missingCoverage.map((gap) => gap.name))}.`,
  );
  lines.push(
    "Coverage against community baseline (PromptHub 130+ rule sets). Conditional categories only apply when the project has relevant signals.",
  );
  lines.push("");
  lines.push(`| Category | Status | Found Signals |`);
  lines.push(`|----------|--------|---------------|`);
  for (const cat of result.coverageGaps) {
    const mark = cat.notApplicable
      ? "— N/A (no delegation signals)"
      : cat.present
        ? "✅"
        : "❌ Gap";
    const signals =
      cat.signals.length > 0 ? `\`${cat.signals.join("`, `")}\`` : "—";
    lines.push(`| ${cat.name} | ${mark} | ${signals} |`);
  }
  lines.push("");

  lines.push("## Observed Failure Modes (PR Review Mining)");
  lines.push("");
  pushGuidance(lines, {
    what: "This section mines past PR comments to find repeated review pain that should become rules.",
    why:
      result.prMining.status === "unavailable"
        ? "It was unavailable for this run, so the report cannot use PR history as evidence."
        : `This run analyzed ${result.prMining.analyzedPrs} PRs and surfaced ${result.prMining.candidateCount} recurring rule candidates.`,
  });
  if (result.prMining.status === "unavailable") {
    lines.push(
      `Status: unavailable${result.prMining.reason ? ` — ${result.prMining.reason}` : ""}`,
    );
  } else {
    lines.push(`Repo: \`${result.prMining.repo}\``);
    lines.push(
      `PRs analyzed: ${result.prMining.analyzedPrs} · Comments reviewed: ${result.prMining.reviewedComments} · Substantive comments: ${result.prMining.substantiveComments} · Candidates: ${result.prMining.candidateCount}`,
    );
    lines.push(
      "*Note: Signal match is heuristic keyword overlap with canonical rule text. It does not prove code-level implementation or enforcement.*",
    );
    lines.push("");
    if (result.prMining.findings.length === 0) {
      lines.push("No PR-derived clusters crossed confidence thresholds.");
    } else {
      lines.push(
        `| Theme | Frequency | PR Spread | Severity | Rule Signal Match | Comment Alignment |`,
      );
      lines.push(
        `|-------|-----------|-----------|----------|-------------------|------------------|`,
      );
      for (const finding of result.prMining.findings.slice(0, 10)) {
        const coverage =
          finding.coverageStatus === "match"
            ? "🟡 signal match"
            : finding.coverageStatus === "missing"
              ? "🔴 no signal"
              : "— unknown";
        const alignment =
          finding.commentAlignmentStatus === "strong"
            ? `${Math.round(finding.commentAlignmentRate * 100)}% strong`
            : finding.commentAlignmentStatus === "partial"
              ? `${Math.round(finding.commentAlignmentRate * 100)}% partial`
              : finding.commentAlignmentStatus === "weak"
                ? `${Math.round(finding.commentAlignmentRate * 100)}% weak`
                : "— unknown";
        lines.push(
          `| ${finding.label} | ${finding.frequency} comments | ${finding.uniquePrs} PRs (${finding.representativeness}) | ${finding.severity} | ${coverage} | ${alignment} |`,
        );
      }
      lines.push("");
      const uncovered = result.prMining.findings.filter(
        (finding) => finding.coverageStatus === "missing",
      );
      if (uncovered.length > 0) {
        lines.push("PR-derived signal gaps:");
        for (const finding of uncovered.slice(0, 5)) {
          const pathHint =
            finding.samplePaths.length > 0
              ? ` · paths: ${finding.samplePaths.join(", ")}`
              : "";
          lines.push(
            `- ${finding.label}: ${finding.frequency} comments across ${finding.uniquePrs} PRs${pathHint}`,
          );
        }
      }
    }
  }
  lines.push("");

  lines.push("## Rule Portfolio Actions");
  lines.push("");
  pushGuidance(lines, {
    what: "This turns the findings into concrete rule work in three buckets: improve existing rules, add missing rule coverage, and remove noisy or stale rule surface.",
  });
  const priorityTag: Record<RuleActionPriority, string> = {
    high: "🔴 high",
    medium: "🟠 medium",
    low: "🟡 low",
  };
  const renderActionBucket = (
    title: string,
    actions: RulePortfolioAction[],
  ) => {
    lines.push(`### ${title}`);
    if (actions.length === 0) {
      lines.push("No actions identified.");
      lines.push("");
      return;
    }
    lines.push(`| Priority | Action | Targets | Evidence |`);
    lines.push(`|----------|--------|---------|----------|`);
    for (const action of actions) {
      const targets =
        action.targets.length > 0 ? `\`${action.targets.join("`, `")}\`` : "—";
      const evidence =
        action.evidence.length > 0 ? action.evidence.join("; ") : "—";
      lines.push(
        `| ${priorityTag[action.priority]} | ${action.title} | ${targets} | ${evidence} |`,
      );
      lines.push(`| — | ${action.detail} | — | — |`);
    }
    lines.push("");
  };
  renderActionBucket(
    "1. Change Existing Rules",
    result.rulePortfolio.changeExisting,
  );
  renderActionBucket("2. Add New Rules", result.rulePortfolio.addNew);
  renderActionBucket(
    "3. Remove/Simplify Overkill Rules",
    result.rulePortfolio.reduceOverkill,
  );

  lines.push("## Recommendations");
  lines.push("");
  const mergedRecommendations = unique([
    ...result.recommendations,
    ...result.cliSignals.recommendations,
    ...result.guardrail.recommendations,
    ...result.processIssues.map(
      (issue) =>
        `${classEmoji[issue.issueClass]} ${issue.title}: ${issue.detail}`,
    ),
  ]);
  pushGuidance(lines, {
    what: "This is the merged action backlog from all scoring systems.",
    why:
      mergedRecommendations.length === 0
        ? "No major issues were found."
        : "Use it as the shortest path from findings to action.",
  });

  if (mergedRecommendations.length === 0) {
    lines.push("✅ No major issues found.");
  } else {
    for (const rec of mergedRecommendations) {
      lines.push(`- ${rec}`);
    }
  }
  lines.push("");

  if (result.guardrail.missingGuardrails.length > 0) {
    lines.push("## Missing Guardrails");
    lines.push("");
    pushGuidance(lines, {
      what: "These are engineering safety controls outside the rule text that are currently absent.",
      why: "Missing guardrails increase the chance that a good rule set still fails in practice.",
    });
    for (const missing of unique(result.guardrail.missingGuardrails)) {
      lines.push(`- ${missing}`);
    }
    lines.push("");
  }

  if (result.driftReportPath) {
    lines.push("## Artifacts");
    lines.push("");
    pushGuidance(lines, {
      what: "These are the raw supporting outputs behind the report.",
      why: "Open them when you need the detailed evidence, not for the first-pass read.",
    });
    lines.push(
      formatArtifactEntry("Drift report", result.driftReportPath, reportPath),
    );
    if (result.bootstrapDraftPath) {
      lines.push(
        formatArtifactEntry(
          "Bootstrap draft",
          result.bootstrapDraftPath,
          reportPath,
        ),
      );
    }
    if (result.prMining.artifactPath) {
      lines.push(
        formatArtifactEntry(
          "PR rule candidates",
          result.prMining.artifactPath,
          reportPath,
        ),
      );
    }
    lines.push(
      `- Artifacts dir: \`${formatPathForReport(result.artifactsDir, reportPath)}\``,
    );
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "*Anvil audit pipeline — framework-agnostic AI rules + guardrails quality engine*",
  );
  lines.push(
    "*See `docs/rubric.md` and `docs/guardrail-score-pack.md` for scoring methodology.*",
  );

  return `${lines.join("\n")}\n`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runAudit(args: ParsedArgs): Promise<AuditResult> {
  const projectRoot = resolve(args.targetPath);
  if (!existsSync(projectRoot)) {
    throw new Error(`target path not found: ${projectRoot}`);
  }

  const stat = statSync(projectRoot);
  if (!stat.isDirectory()) {
    throw new Error(`target must be a directory: ${projectRoot}`);
  }

  const projectName = basename(projectRoot);
  const auditDate = new Date().toISOString().split("T")[0];

  let auditConfig: AuditConfigLoadResult;
  try {
    auditConfig = loadAuditConfig(projectRoot);
  } catch (error) {
    if (error instanceof AuditConfigError) {
      throw new TypeError(`audit config error: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }

  const outputPath = args.outputFile
    ? resolve(args.outputFile)
    : defaultAuditReportOutputPath(projectName, auditDate);
  const defaultArtifactsDir = defaultArtifactsDirForReport(
    outputPath,
    projectName,
    auditDate,
  );
  const artifactsDir = resolve(args.artifactsDir ?? defaultArtifactsDir);
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }

  const logProgress = (...values: unknown[]): void => {
    if (args.jsonOutput) {
      console.error(...values);
    } else {
      console.log(...values);
    }
  };

  logProgress(`🔍 Anvil Audit: ${projectName}`);
  logProgress(`   Target: ${projectRoot}`);
  logProgress(`   Date:   ${auditDate}`);
  logProgress(`   Artifacts: ${artifactsDir}`);
  if (auditConfig.present) {
    logProgress(
      `   Guardrail config: ${auditConfig.path} (${auditConfig.config.profile})`,
    );
  }
  logProgress("");

  logProgress("📁 Discovering rule files...");
  const ruleFiles = discoverRuleFiles(projectRoot);
  logProgress(`   Found: ${ruleFiles.length} file(s)`);
  for (const rf of ruleFiles) {
    logProgress(`   - ${rf.relativePath} (${rf.tool}, ${rf.sizeLines} lines)`);
  }
  logProgress("");

  const mirrorConfig = loadMirrorConfig(projectRoot);
  const ruleInventory = buildRuleInventory(ruleFiles, mirrorConfig);
  logProgress("🧩 Rule surface segmentation...");
  logProgress(`   Canonical unique: ${ruleInventory.canonicalFiles.length}`);
  logProgress(
    `   Governance canonical: ${ruleInventory.canonicalGovernanceFiles.length}`,
  );
  logProgress(
    `   Generated canonical: ${ruleInventory.canonicalGeneratedFiles.length}`,
  );
  if (mirrorConfig.hasConfig) {
    logProgress(
      `   Mirror config: ai-rules-config.yaml (agents: ${mirrorConfig.agents.join(", ") || "none"})`,
    );
  } else {
    logProgress("   Mirror config: not found");
  }
  logProgress(
    `   Duplicate mirrors removed for scoring: ${ruleInventory.duplicateMirrorCount}`,
  );
  logProgress(
    `   Expected mirrors: ${ruleInventory.expectedDuplicateMirrorCount}`,
  );
  logProgress(
    `   Accidental duplicates: ${ruleInventory.accidentalDuplicateMirrorCount}`,
  );
  logProgress(`   Mirror sync: ${formatMirrorSyncSummary(ruleInventory)}`);
  logProgress("");

  const hasAiRulesDir = existsSync(join(projectRoot, "ai-rules"));
  const hasBlockAiRules = existsSync(
    join(projectRoot, "ai-rules", "ai-rules-config.yaml"),
  );

  let driftReportPath: string | null = null;
  let driftSummary: DriftSummary = { pathIssues: 0, dateIssues: 0, notes: 0 };

  logProgress("🔍 Running drift detection...");
  const driftOutputPath = join(artifactsDir, "drift-report.md");
  const driftResult = spawnSync(
    "bun",
    [
      "run",
      join(SCRIPT_DIR, "drift-detect.ts"),
      projectRoot,
      "--output",
      driftOutputPath,
    ],
    { encoding: "utf8", cwd: WORKSPACE_DIR },
  );

  if (driftResult.status === 0) {
    driftReportPath = driftOutputPath;
    driftSummary = parseDriftSummary(driftResult.stdout);
    logProgress(`   Drift report: ${driftOutputPath}`);
    logProgress(`   - Path drift: ${driftSummary.pathIssues}`);
    logProgress(`   - Date drift: ${driftSummary.dateIssues}`);
    logProgress(`   - Non-drift notes: ${driftSummary.notes}`);
  } else {
    logProgress(
      `   Drift detection encountered issues: ${driftResult.stderr?.slice(0, 200) ?? "unknown error"}`,
    );
  }
  logProgress("");

  let bootstrapDraftPath: string | null = null;
  if (!args.skipBootstrap) {
    logProgress("🧬 Running bootstrap stack detection...");
    const bootstrapOutputPath = join(artifactsDir, "bootstrap-draft.md");
    const bootstrapResult = spawnSync(
      "bun",
      [
        "run",
        join(SCRIPT_DIR, "bootstrap-generate.ts"),
        projectRoot,
        "--output",
        bootstrapOutputPath,
      ],
      { encoding: "utf8", cwd: WORKSPACE_DIR },
    );

    if (bootstrapResult.status === 0) {
      bootstrapDraftPath = bootstrapOutputPath;
      logProgress(`   Bootstrap draft: ${bootstrapOutputPath}`);
      const summaryLines = (bootstrapResult.stdout ?? "")
        .split("\n")
        .filter(
          (l) =>
            l.includes("rule") || l.includes("match") || l.includes("stub"),
        );
      for (const line of summaryLines.slice(0, 3)) {
        if (line.trim()) logProgress(`   ${line.trim()}`);
      }
    } else {
      logProgress(
        `   Bootstrap detection issues: ${bootstrapResult.stderr?.slice(0, 200) ?? "unknown"}`,
      );
    }
    logProgress("");
  }

  logProgress("🧱 Stage A: structural process checks...");
  const stageA = assessStageA(ruleInventory, driftSummary);
  logProgress(`   Stage A status: ${stageA.status.toUpperCase()}`);
  for (const check of stageA.checks) {
    const marker =
      check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
    logProgress(`   ${marker} ${check.label}: ${check.detail}`);
  }
  logProgress("");

  const stageBAdvisory = stageA.status !== "pass";
  const governanceFirstTarget =
    ruleInventory.canonicalGovernanceFiles.length > 0
      ? ruleInventory.canonicalGovernanceFiles
      : ruleInventory.canonicalFiles;
  const scoringRuleFiles = governanceFirstTarget;
  const surfacePosture = classifySurfacePosture(
    scoringRuleFiles,
    ruleInventory,
    projectRoot,
  );
  const stageB: StageResult = {
    name: "Stage B",
    status: "pass",
    summary: stageBAdvisory
      ? "Stage B content scoring ran in advisory mode because Stage A failed."
      : surfacePosture.posture === "tool-native-first"
        ? "Stage B content scoring ran on a tool-native-first canonical surface."
        : "Stage B content scoring ran on canonical governance-first surface.",
    checks: [
      {
        id: "scoring-surface",
        label: "Scoring Surface",
        status: "pass",
        detail: `${scoringRuleFiles.length} canonical file(s) (${surfacePosture.posture === "tool-native-first" ? `tool-native-first: ${surfacePosture.surfaceTool ?? "native"} ${surfacePosture.surfaceRoot ?? "surface"}` : ruleInventory.canonicalGovernanceFiles.length > 0 ? "governance-first" : "fallback: canonical all"})`,
      },
      {
        id: "stageA-gate",
        label: "Stage A Gate",
        status: stageBAdvisory ? "warn" : "pass",
        detail: stageBAdvisory
          ? "Stage A has failing checks; interpret Stage B score as diagnostic until Stage A is remediated."
          : surfacePosture.posture === "tool-native-first"
            ? "Stage A passed; Stage B weights agent-fit evidence ahead of clarity uplift for this native rule surface."
            : "Stage A passed; Stage B score can be used as primary content quality signal.",
      },
    ],
  };

  logProgress("📊 Analyzing coverage gaps...");
  const coverageSurface = scoringRuleFiles;
  const coverageGaps = analyzeCoverage(coverageSurface, projectRoot);
  const applicableCoverage = coverageGaps.filter((c) => !c.notApplicable);
  const missing = applicableCoverage
    .filter((c) => !c.present)
    .map((c) => c.name);
  const notApplicableNames = coverageGaps
    .filter((c) => c.notApplicable)
    .map((c) => c.name);
  logProgress(
    `   Covered: ${applicableCoverage.filter((c) => c.present).length}/${applicableCoverage.length} applicable categories` +
      `${notApplicableNames.length > 0 ? ` (${notApplicableNames.join(", ")}: not applicable)` : ""}` +
      `${stageBAdvisory ? " — advisory mode due to Stage A fail" : ""}`,
  );
  if (missing.length > 0) {
    logProgress(`   Gaps: ${missing.join(", ")}`);
  }
  logProgress("");

  logProgress("🧾 Mining PR review comments for recurring failure modes...");
  const prMining = await minePrInsights(
    projectRoot,
    artifactsDir,
    scoringRuleFiles,
  );
  if (prMining.status === "available") {
    logProgress(`   Repo: ${prMining.repo}`);
    logProgress(`   PRs analyzed: ${prMining.analyzedPrs}`);
    logProgress(`   Comments reviewed: ${prMining.reviewedComments}`);
    logProgress(`   Candidates surfaced: ${prMining.candidateCount}`);
    if (prMining.artifactPath) {
      logProgress(`   PR candidates artifact: ${prMining.artifactPath}`);
    }
  } else {
    logProgress(`   Skipped: ${prMining.reason ?? "PR mining unavailable"}`);
  }
  logProgress("");

  logProgress("🧭 Stage C: gap coverage checks...");
  const { stage: stageC, metrics: gapCoverage } = assessStageC(
    coverageGaps,
    prMining,
    scoringRuleFiles,
  );
  logProgress(
    `   Stage C status: ${stageC.status.toUpperCase()} (score ${gapCoverage.score}/1)`,
  );
  for (const check of stageC.checks) {
    const marker =
      check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
    logProgress(`   ${marker} ${check.label}: ${check.detail}`);
  }
  logProgress("");

  logProgress("🧼 Stage D: overkill/noise checks...");
  const { stage: stageD, metrics: overkill } = assessStageD(
    ruleInventory,
    scoringRuleFiles,
    surfacePosture,
  );
  logProgress(
    `   Stage D status: ${stageD.status.toUpperCase()} (score ${overkill.score}/1)`,
  );
  for (const check of stageD.checks) {
    const marker =
      check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
    logProgress(`   ${marker} ${check.label}: ${check.detail}`);
  }
  logProgress("");

  logProgress("🔐 Detecting enforcement layer...");
  const enforcementLayer = detectEnforcementLayer(
    projectRoot,
    ruleInventory.canonicalFiles,
  );
  logProgress(`   Level: ${enforcementLayer.level}`);
  for (const signal of clamp(enforcementLayer.detected, 5)) {
    logProgress(`   ✓ ${signal}`);
  }
  if (enforcementLayer.detected.length === 0) {
    logProgress("   (none detected — rules are advisory text only)");
  }
  logProgress("");

  logProgress("🖥️ Detecting CLI quality signals...");
  const cliSignals = detectCliSignals(projectRoot);
  logProgress(
    `   CLI project: ${cliSignals.isCliProject ? "yes" : "no"} (confidence ${Math.round(cliSignals.confidence * 100)}%)`,
  );
  if (cliSignals.isCliProject && cliSignals.missingChecks.length > 0) {
    logProgress(`   Missing checks: ${cliSignals.missingChecks.join(", ")}`);
  }
  logProgress("");

  const scoreResult = scoreAudit(
    scoringRuleFiles,
    coverageGaps,
    enforcementLayer,
    gapCoverage.score,
    overkill.score,
    surfacePosture,
  );
  const { ruleScore5, ruleScore100, breakdown, recommendations, diagnostics } =
    scoreResult;

  logProgress("🛡️ Scoring guardrails...");
  const guardrail = scoreGuardrails({
    projectRoot,
    ruleFilePaths: ruleFiles.map((r) => r.path),
    driftSummary,
    auditConfig: auditConfig.config,
    configPresent: auditConfig.present,
  });
  logProgress(`   Guardrails: ${guardrail.total}/35 (${guardrail.maturity})`);
  logProgress("");

  logProgress("🧠 Synthesizing top improvements...");
  const nextRatchetLanes = buildWeakestRatchetLanes({
    scoreBreakdown: breakdown,
    guardrail,
  });
  const synthesisInput = {
    projectName,
    projectPath: projectRoot,
    ruleScore: ruleScore5,
    guardrailScore: guardrail.total,
    recommendations: unique([
      ...recommendations,
      ...guardrail.recommendations,
      ...cliSignals.recommendations,
    ]),
    coverageGaps: missing,
    enforcementLevel: enforcementLayer.level,
    driftSummary,
    cliFindings: {
      isCliProject: cliSignals.isCliProject,
      confidence: cliSignals.confidence,
      missingChecks: cliSignals.missingChecks,
      evidence: cliSignals.evidence,
    },
    guardrailFindings: {
      missingGuardrails: guardrail.missingGuardrails,
      recommendations: guardrail.recommendations,
    },
    nextRatchetLanes,
  };

  const auditMode = resolveAuditMode(args);
  const aiSynthesis: AiSynthesis =
    auditMode === "ci"
      ? {
          mode: "heuristic",
          model: null,
          suggestions: heuristicTopImprovements(synthesisInput),
        }
      : await synthesizeTopImprovements(synthesisInput, {
          provider: args.aiProvider ?? "auto",
          model: args.aiModel ?? undefined,
          timeoutMs: args.aiTimeoutMs ?? undefined,
        });

  if (auditMode === "full" && aiSynthesis.mode !== "ai") {
    throw new Error(buildAiRequiredMessage(args));
  }

  logProgress(
    `   Suggestions: ${aiSynthesis.suggestions.length} (${aiSynthesis.mode}${aiSynthesis.model ? `, ${aiSynthesis.model}` : ""})`,
  );
  logProgress("");

  if (stageBAdvisory) {
    recommendations.unshift(
      "🔴 Stage A failed; treat Stage B scoring as diagnostic until structural checks are remediated.",
    );
  }

  if (prMining.status === "available") {
    const uncovered = prMining.findings.filter(
      (finding) => finding.coverageStatus === "missing",
    );
    for (const finding of uncovered.slice(0, 3)) {
      recommendations.push(
        `🟠 PR-derived gap: ${finding.label} recurs in reviews (${finding.frequency} comments across ${finding.uniquePrs} PRs) without clear canonical rule-signal match.`,
      );
    }
  }

  const processIssues = buildProcessIssues(
    auditDate,
    stageA,
    stageB,
    stageC,
    stageD,
    scoringRuleFiles,
    ruleInventory,
    diagnostics,
    guardrail,
    coverageGaps,
    prMining,
    recommendations,
  );
  const remediationPack = buildRemediationPack(processIssues, {
    promoteStageATrustIssues: stageA.status === "fail",
  });
  const ruleEffectiveness = assessRuleEffectiveness(scoringRuleFiles);
  const rulePortfolio = buildRulePortfolioActions({
    scoringRuleFiles,
    inventory: ruleInventory,
    diagnostics,
    coverageGaps,
    prMining,
    stageC,
    stageD,
    surfacePosture,
  });
  logProgress("📦 Process issue queue + remediation pack...");
  logProgress(`   Issues: ${processIssues.length}`);
  logProgress(`   Remediation tasks: ${remediationPack.tasks.length}`);
  logProgress(
    `   Rule portfolio actions: change=${rulePortfolio.changeExisting.length}, add=${rulePortfolio.addNew.length}, simplify/remove=${rulePortfolio.reduceOverkill.length}`,
  );
  logProgress("");

  const result: AuditResult = {
    auditMode,
    projectName,
    projectPath: projectRoot,
    auditDate,
    ruleFiles,
    scoringRuleFiles,
    ruleInventory,
    surfacePosture,
    driftReportPath,
    bootstrapDraftPath,
    artifactsDir,
    coverageGaps,
    enforcementLayer,
    cliSignals,
    guardrail,
    aiSynthesis,
    hasBlockAiRules,
    hasAiRulesDir,
    ruleScore5,
    ruleScore100,
    scoreBreakdown: breakdown,
    recommendations: unique([
      ...recommendations,
      ...cliSignals.recommendations,
    ]),
    driftSummary,
    stageA,
    stageB,
    stageC,
    stageD,
    gapCoverage,
    ruleEffectiveness,
    overkill,
    prMining,
    rulePortfolio,
    processIssues,
    remediationPack,
    auditConfig,
  };

  return result;
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.noAiAliasUsed) {
    emitNoAiAliasDeprecationWarning();
  }
  const result = await runAudit(args);

  if (args.jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const outputPath =
    args.outputFile ??
    defaultAuditReportOutputPath(result.projectName, result.auditDate);
  const report = buildReport(result, {
    reportPath: outputPath,
    targetDisplayPath: args.targetPath,
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, report, "utf8");

  console.log(
    `✅ ${scoreHeadlineLabel(result.auditMode)}: ${result.ruleScore100}/100 (${result.ruleScore5}/5)`,
  );
  console.log(
    `✅ Guardrail Readiness Score: ${result.guardrail.total}/35 (${result.guardrail.maturity})`,
  );
  console.log(`✅ Audit report written: ${outputPath}`);
  if (
    result.guardrail.hardGates.enabled &&
    !result.guardrail.hardGates.passed
  ) {
    process.exit(result.guardrail.hardGates.exitCode);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    if (err instanceof Error) {
      console.error(err.message);
    } else {
      console.error("Fatal error:", err);
    }
    process.exit(1);
  });
}
