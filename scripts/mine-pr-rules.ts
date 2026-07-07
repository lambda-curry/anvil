#!/usr/bin/env bun
/* eslint-disable no-console */

export type CliArgs = {
  repo: string;
  limit: number;
  outputDir: string;
  dryRun: boolean;
};

export type ReviewComment = {
  body: string;
  path: string | null;
  createdAt: string;
};

export type PRNode = {
  number: number;
  title: string;
  reviews: {
    nodes: Array<{
      comments: {
        nodes: ReviewComment[];
      };
    } | null>;
  };
};

export type GraphQLResponse = {
  data?: {
    repository?: {
      pullRequests: {
        pageInfo: {
          hasPreviousPage: boolean;
          startCursor: string | null;
        };
        nodes: PRNode[];
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
};

export type NormalizedComment = {
  prNumber: number;
  prTitle: string;
  body: string;
  path: string | null;
  createdAt: string;
};

export type Theme =
  | "error-handling"
  | "naming"
  | "testing"
  | "types"
  | "components"
  | "imports"
  | "performance"
  | "async"
  | "security"
  | "structure"
  | "documentation"
  | "style"
  | "general";

export type Cluster = {
  theme: Theme;
  comments: NormalizedComment[];
  severitySignals: number;
  uniquePRs: Set<number>;
  score: number;
};

type ExtractedCodeBlock = {
  code: string;
  start: number;
  end: number;
  fenceInfo: string;
};

const DEFAULT_LIMIT = 50;
const DEFAULT_OUTPUT_DIR = "data/rule-candidates";
const PAGE_SIZE = 50;

const THEME_KEYWORDS: Record<Theme, string[]> = {
  "error-handling": [
    "error",
    "catch",
    "throw",
    "exception",
    "try",
    "handle",
    "fail",
    "null",
    "undefined",
  ],
  naming: [
    "name",
    "variable",
    "function",
    "class",
    "const",
    "let",
    "rename",
    "camel",
    "pascal",
    "prefix",
  ],
  testing: [
    "test",
    "spec",
    "mock",
    "assert",
    "expect",
    "coverage",
    "unit",
    "integration",
  ],
  types: [
    "type",
    "interface",
    "generic",
    "any",
    "unknown",
    "cast",
    "assertion",
    "typescript",
  ],
  components: [
    "component",
    "props",
    "render",
    "hook",
    "usestate",
    "useeffect",
    "jsx",
  ],
  imports: ["import", "export", "require", "module", "barrel", "index"],
  performance: [
    "memo",
    "usememo",
    "usecallback",
    "performance",
    "optimize",
    "re-render",
    "cache",
  ],
  async: [
    "async",
    "await",
    "promise",
    "fetch",
    "loading",
    "race condition",
    "side effect",
  ],
  security: [
    "auth",
    "token",
    "secret",
    "env",
    "credential",
    "sanitize",
    "validate",
    "injection",
  ],
  structure: [
    "file",
    "folder",
    "directory",
    "organize",
    "separate",
    "split",
    "extract",
    "refactor",
  ],
  documentation: ["comment", "doc", "jsdoc", "readme", "describe", "explain"],
  style: [
    "style",
    "css",
    "classname",
    "tailwind",
    "format",
    "lint",
    "prettier",
  ],
  general: [],
};

const SEVERITY_TERMS = [
  "crash",
  "bug",
  "broken",
  "fail",
  "error",
  "security",
  "vulnerability",
  "unsafe",
];

const APPROVAL_PATTERNS = [
  /^lgtm!?$/i,
  /^looks good!?$/i,
  /^nice!?$/i,
  /^thanks!?$/i,
  /^great work!?$/i,
  /^approved!?$/i,
  /^ship it!?$/i,
  /^[\p{Emoji}\p{Extended_Pictographic}\s+]+$/u,
];

export function parseArgs(argv: string[]): CliArgs {
  if (argv.length < 3) {
    printUsageAndExit(1);
  }

  if (argv[2] === "--help" || argv[2] === "-h") {
    printUsageAndExit(0);
  }

  const repo = argv[2];
  let limit = DEFAULT_LIMIT;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let dryRun = false;

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") {
      const val = argv[i + 1];
      if (!val || Number.isNaN(Number(val)) || Number(val) <= 0) {
        console.error("Invalid --limit value. Must be a positive number.");
        process.exit(1);
      }
      limit = Number(val);
      i++;
    } else if (arg === "--output") {
      const val = argv[i + 1];
      if (!val) {
        console.error("Invalid --output value.");
        process.exit(1);
      }
      outputDir = val;
      i++;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsageAndExit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsageAndExit(1);
    }
  }

  if (!repo.includes("/")) {
    console.error("Repo must be in owner/name format.");
    process.exit(1);
  }

  return { repo, limit, outputDir, dryRun };
}

export function printUsageAndExit(code: number): never {
  console.log(
    "Usage:\n  bun run scripts/mine-pr-rules.ts <owner/repo> [--limit <N>] [--output <dir>] [--dry-run]\n\nExample:\n  bun run scripts/mine-pr-rules.ts block/ai-rules --limit 100",
  );
  process.exit(code);
}

const QUERY = `
query($owner: String!, $repo: String!, $pageSize: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequests(states: MERGED, last: $pageSize, before: $cursor) {
      pageInfo { hasPreviousPage startCursor }
      nodes {
        number
        title
        reviews(first: 50) {
          nodes {
            comments(first: 50) {
              nodes {
                body
                path
                createdAt
              }
            }
          }
        }
      }
    }
  }
}
`;

export async function runGhGraphql(
  owner: string,
  repo: string,
  pageSize: number,
  cursor: string | null,
): Promise<GraphQLResponse> {
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${QUERY}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `repo=${repo}`,
    "-F",
    `pageSize=${pageSize}`,
  ];

  if (cursor) {
    args.push("-F", `cursor=${cursor}`);
  }

  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const msg = stderr.trim() || stdout.trim() || "Unknown gh error";
    if (msg.includes("gh auth login")) {
      throw new Error("GitHub CLI not authenticated. Run: gh auth login");
    }
    if (msg.toLowerCase().includes("not found")) {
      throw new Error(`Repository not found or inaccessible: ${owner}/${repo}`);
    }
    throw new Error(`gh api graphql failed: ${msg}`);
  }

  try {
    return JSON.parse(stdout) as GraphQLResponse;
  } catch {
    throw new Error("Failed to parse JSON from gh api graphql.");
  }
}

export async function fetchMergedPRComments(
  owner: string,
  repo: string,
  limit: number,
): Promise<{ prs: PRNode[]; comments: NormalizedComment[] }> {
  let cursor: string | null = null;
  let hasPreviousPage = true;
  const prs: PRNode[] = [];

  while (hasPreviousPage && prs.length < limit) {
    const remaining = Math.min(PAGE_SIZE, limit - prs.length);
    const res = await runGhGraphql(owner, repo, remaining, cursor);

    if (res.errors?.length) {
      throw new Error(
        `GraphQL error: ${res.errors.map((e) => e.message).join("; ")}`,
      );
    }

    const prConnection = res.data?.repository?.pullRequests;
    if (!prConnection) {
      throw new Error(`No pull request data returned for ${owner}/${repo}.`);
    }

    prs.push(...prConnection.nodes);
    hasPreviousPage = prConnection.pageInfo.hasPreviousPage;
    cursor = prConnection.pageInfo.startCursor ?? null;
  }

  const comments: NormalizedComment[] = [];
  for (const pr of prs) {
    for (const review of pr.reviews.nodes) {
      if (!review) continue;
      for (const comment of review.comments.nodes) {
        comments.push({
          prNumber: pr.number,
          prTitle: pr.title,
          body: comment.body ?? "",
          path: comment.path ?? null,
          createdAt: comment.createdAt,
        });
      }
    }
  }

  return { prs, comments };
}

export function isApproval(body: string): boolean {
  const text = body.trim().toLowerCase();
  return APPROVAL_PATTERNS.some((re) => re.test(text));
}

export function isQuestionOnly(body: string): boolean {
  const text = body.trim();
  if (!text.endsWith("?")) return false;
  const suggestionHints = [
    "should",
    "consider",
    "prefer",
    "use",
    "avoid",
    "please",
    "could you",
    "can you",
    "let's",
  ];
  const lower = text.toLowerCase();
  return !suggestionHints.some((hint) => lower.includes(hint));
}

export function hasSuggestionSignal(body: string): boolean {
  const lower = body.toLowerCase();
  const signals = [
    "should",
    "use ",
    "use:",
    "consider",
    "prefer",
    "avoid",
    "we always",
    "don't use",
    "do not use",
    "per our convention",
    "see our docs",
    "consistent with",
    "need to",
    "must",
  ];
  return signals.some((s) => lower.includes(s));
}

export function filterComments(comments: NormalizedComment[]) {
  const skipped = {
    tooShort: 0,
    approvals: 0,
    questionOnly: 0,
    lowSignal: 0,
  };

  const kept = comments.filter((c) => {
    const body = c.body.trim();
    if (body.length < 25) {
      skipped.tooShort++;
      return false;
    }
    if (isApproval(body)) {
      skipped.approvals++;
      return false;
    }
    if (isQuestionOnly(body)) {
      skipped.questionOnly++;
      return false;
    }
    if (!hasSuggestionSignal(body) && body.length < 40) {
      skipped.lowSignal++;
      return false;
    }
    return true;
  });

  return { kept, skipped };
}

export function scoreThemeMatches(text: string): Map<Theme, number> {
  const lower = text.toLowerCase();
  const scores = new Map<Theme, number>();

  (Object.keys(THEME_KEYWORDS) as Theme[]).forEach((theme) => {
    if (theme === "general") return;
    let hits = 0;
    for (const kw of THEME_KEYWORDS[theme]) {
      if (lower.includes(kw)) hits++;
    }
    if (hits > 0) scores.set(theme, hits);
  });

  if (scores.size === 0) scores.set("general", 1);
  return scores;
}

export function primaryThemeForComment(c: NormalizedComment): Theme {
  const scores = scoreThemeMatches(c.body);
  let best: Theme = "general";
  let bestScore = -1;
  for (const [theme, score] of scores) {
    if (score > bestScore) {
      best = theme;
      bestScore = score;
    }
  }
  return best;
}

export function countSeveritySignals(text: string): number {
  const lower = text.toLowerCase();
  return SEVERITY_TERMS.reduce(
    (acc, term) => (lower.includes(term) ? acc + 1 : acc),
    0,
  );
}

export function spreadScore(uniquePRCount: number): number {
  if (uniquePRCount > 3) return 1.0;
  if (uniquePRCount >= 2) return 0.5;
  return 0.2;
}

export function clusterAndScore(comments: NormalizedComment[]): Cluster[] {
  const map = new Map<Theme, Cluster>();

  for (const comment of comments) {
    const theme = primaryThemeForComment(comment);
    if (!map.has(theme)) {
      map.set(theme, {
        theme,
        comments: [],
        severitySignals: 0,
        uniquePRs: new Set<number>(),
        score: 0,
      });
    }
    const cluster = map.get(theme);
    if (!cluster) {
      continue;
    }
    cluster.comments.push(comment);
    cluster.uniquePRs.add(comment.prNumber);
    cluster.severitySignals += countSeveritySignals(comment.body);
  }

  const clusters = [...map.values()].map((c) => {
    const frequency = c.comments.length;
    const spread = spreadScore(c.uniquePRs.size);
    c.score = frequency * 0.6 + c.severitySignals * 0.3 + spread * 0.1;
    return c;
  });

  return clusters
    .filter((c) => c.comments.length >= 3 && c.score > 2.0)
    .sort((a, b) => b.score - a.score);
}

export function themeDisplay(theme: Theme): string {
  switch (theme) {
    case "error-handling":
      return "Error Handling";
    case "naming":
      return "Naming";
    case "testing":
      return "Testing";
    case "types":
      return "Types";
    case "components":
      return "Components";
    case "imports":
      return "Imports";
    case "performance":
      return "Performance";
    case "async":
      return "Async";
    case "security":
      return "Security";
    case "structure":
      return "Structure";
    case "documentation":
      return "Documentation";
    case "style":
      return "Style";
    case "general":
      return "General";
  }
}

export function summarizeSeverity(cluster: Cluster): "low" | "medium" | "high" {
  if (cluster.severitySignals >= 8) return "high";
  if (cluster.severitySignals >= 3) return "medium";
  return "low";
}

export function representativeness(
  cluster: Cluster,
): "high" | "medium" | "low" {
  if (cluster.uniquePRs.size >= 4) return "high";
  if (cluster.uniquePRs.size >= 2) return "medium";
  return "low";
}

export function draftRuleForTheme(theme: Theme): string {
  const drafts: Record<Theme, string> = {
    "error-handling":
      "Handle failure paths explicitly. For async calls and risky operations, wrap with try/catch (or equivalent) and surface actionable errors instead of allowing silent failures.",
    naming:
      "Use descriptive, convention-aligned names for variables, functions, and classes. Favor consistency with existing project naming standards.",
    testing:
      "Add or update tests when behavior changes. Prefer tests that assert observable behavior and cover likely regressions.",
    types:
      "Prefer precise types over `any` and unsafe assertions. Model contracts with interfaces/types so invalid states are caught at compile time.",
    components:
      "Keep component responsibilities narrow. Extract complex logic/hooks and avoid patterns that make render behavior hard to reason about.",
    imports:
      "Use consistent import/export structure and avoid ambiguous barrel patterns when they reduce clarity or create coupling.",
    performance:
      "Apply memoization and render optimizations only where re-render churn is likely; document why optimization is needed.",
    async:
      "Guard async flows against race conditions and unhandled rejections. Keep loading/error states explicit.",
    security:
      "Treat auth, secrets, and user input as security-sensitive. Validate input and avoid exposing credentials or unsafe assumptions.",
    structure:
      "Organize files by responsibility and extract overloaded modules. Prefer small, composable units over large multi-purpose files.",
    documentation:
      "Document intent when behavior is non-obvious. Keep README/comments aligned with current code behavior.",
    style:
      "Follow established formatting and styling conventions (lint/formatter/CSS patterns) to reduce review churn.",
    general:
      "Capture recurring review guidance as explicit rules to reduce repeated feedback in future PRs.",
  };
  return drafts[theme];
}

export function extractCodeBlocks(text: string): string[] {
  return extractCodeBlockMatches(text).map((block) => block.code);
}

function extractCodeBlockMatches(text: string): ExtractedCodeBlock[] {
  return [...text.matchAll(/```([^\n`]*)\n?([\s\S]*?)```/g)].map((match) => ({
    fenceInfo: (match[1] ?? "").trim().toLowerCase(),
    code: (match[2] ?? "").trim(),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function truncateWithEllipsis(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}...`;
}

function truncateCodeLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length > maxLines) {
    return [...lines.slice(0, maxLines), "// ... (truncated)"].join("\n");
  }
  return lines.slice(0, maxLines).join("\n");
}

function inferLanguageFromPath(path: string | null): string {
  if (!path) return "";
  const file = path.split("/").pop() ?? "";
  const dotIdx = file.lastIndexOf(".");
  if (dotIdx === -1 || dotIdx === file.length - 1) return "";
  return file.slice(dotIdx + 1);
}

function formatCodeFence(code: string, language: string): string {
  if (language) {
    return `\`\`\`${language}\n${code}\n\`\`\``;
  }
  return `\`\`\`\n${code}\n\`\`\``;
}

function scopeForTheme(theme: Theme): string {
  switch (theme) {
    case "error-handling":
    case "security":
    case "types":
    case "async":
    case "naming":
    case "structure":
    case "documentation":
    case "general":
      return "alwaysApply: true";
    case "testing":
      return 'globs: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.tsx"]';
    case "components":
      return 'globs: ["**/*.tsx", "**/*.jsx"]';
    case "imports":
      return 'globs: ["**/*.ts", "**/*.tsx", "**/*.js"]';
    case "performance":
      return 'globs: ["**/*.tsx", "**/*.jsx", "**/*.ts"]';
    case "style":
      return 'globs: ["**/*.css", "**/*.scss", "**/*.tsx"]';
  }
}

const DO_CUE_PATTERN =
  /\b(instead do|replace with|prefer|should be|use(?:\s+this)?|suggest(?:ed)?|fix(?:ed)?|correct(?:ed)?|recommended)\b/i;
const DONT_CUE_PATTERN =
  /\b(instead of|current|existing|avoid|don't|do not|anti-pattern|problem|wrong|buggy|bad)\b/i;

type CodeCandidate = {
  code: string;
  language: string;
  role: "do" | "dont" | "unknown";
};

function blockFenceLanguage(block: ExtractedCodeBlock): string {
  return block.fenceInfo.split(/\s+/)[0] ?? "";
}

function resolveBlockLanguage(
  block: ExtractedCodeBlock,
  path: string | null,
): string {
  const fenceLanguage = blockFenceLanguage(block);
  if (
    fenceLanguage &&
    !["diff", "patch", "suggestion"].includes(fenceLanguage)
  ) {
    return fenceLanguage;
  }
  return inferLanguageFromPath(path);
}

function isDiffLikeBlock(block: ExtractedCodeBlock): boolean {
  const fenceLanguage = blockFenceLanguage(block);
  if (fenceLanguage === "diff" || fenceLanguage === "patch") {
    return true;
  }

  const lines = block.code.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return false;
  }

  const signedLines = lines.filter(
    (line) =>
      (/^[+-]/.test(line) && !/^(?:\+\+\+|---)/.test(line)) ||
      line.startsWith("@@"),
  );

  return signedLines.length >= 2;
}

function cleanDiffLines(lines: string[], marker: "+" | "-"): string {
  return lines
    .filter(
      (line) => line.startsWith(marker) && !line.startsWith(marker.repeat(3)),
    )
    .map((line) => line.slice(1))
    .join("\n")
    .trim();
}

function scoreCodeCandidate(candidate: CodeCandidate): number {
  let score = 0;
  const nonEmptyLines = candidate.code
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (candidate.role !== "unknown") {
    score += 2;
  }
  if (nonEmptyLines.length >= 1 && nonEmptyLines.length <= 16) {
    score += 1;
  }
  if (!/\[insert .*?\]/i.test(candidate.code)) {
    score += 1;
  }
  if (/[A-Za-z]/.test(candidate.code)) {
    score += 1;
  }

  return score;
}

function surroundingText(
  text: string,
  block: ExtractedCodeBlock,
): { before: string; after: string } {
  return {
    before: text
      .slice(Math.max(0, block.start - 160), block.start)
      .toLowerCase(),
    after: text
      .slice(block.end, Math.min(text.length, block.end + 160))
      .toLowerCase(),
  };
}

function classifyCodeRole(
  text: string,
  block: ExtractedCodeBlock,
): "do" | "dont" | "unknown" {
  const context = surroundingText(text, block);
  const before = context.before;
  const after = context.after;

  if (DO_CUE_PATTERN.test(after)) {
    return "dont";
  }
  if (DONT_CUE_PATTERN.test(after)) {
    return "dont";
  }
  if (DO_CUE_PATTERN.test(before)) {
    return "do";
  }
  if (DONT_CUE_PATTERN.test(before)) {
    return "dont";
  }
  return "unknown";
}

function extractCodeCandidates(comment: NormalizedComment): CodeCandidate[] {
  const blocks = extractCodeBlockMatches(comment.body);
  const candidates: CodeCandidate[] = [];

  for (const [index, block] of blocks.entries()) {
    const language = resolveBlockLanguage(block, comment.path);

    if (isDiffLikeBlock(block)) {
      const lines = block.code.split("\n");
      const added = cleanDiffLines(lines, "+");
      const removed = cleanDiffLines(lines, "-");

      if (removed) {
        candidates.push({
          code: truncateCodeLines(removed, 20),
          language,
          role: "dont",
        });
      }

      if (added) {
        candidates.push({
          code: truncateCodeLines(added, 20),
          language,
          role: "do",
        });
      }

      if (removed || added) {
        continue;
      }
    }

    let role = classifyCodeRole(comment.body, block);
    const next = blocks[index + 1];

    if (role === "dont" && next) {
      const after = comment.body.slice(block.end, next.start).toLowerCase();
      if (DO_CUE_PATTERN.test(after)) {
        candidates.push({
          code: truncateCodeLines(block.code, 20),
          language,
          role: "dont",
        });
        continue;
      }
    }

    if (role === "unknown" && index > 0) {
      const previous = blocks[index - 1];
      const between = comment.body
        .slice(previous.end, block.start)
        .toLowerCase();
      if (DO_CUE_PATTERN.test(between)) {
        role = "do";
      }
    }

    candidates.push({
      code: truncateCodeLines(block.code, 20),
      language,
      role,
    });
  }

  return candidates;
}

function chooseExamplePair(comments: NormalizedComment[]): {
  doCode: string;
  doLanguage: string;
  dontCode: string;
  dontLanguage: string;
} {
  const perCommentCandidates = comments.map((comment) =>
    extractCodeCandidates(comment),
  );

  const bestSameCommentPair = perCommentCandidates
    .map((candidates) => {
      const dos = candidates.filter((candidate) => candidate.role === "do");
      const donts = candidates.filter((candidate) => candidate.role === "dont");
      let bestPair: {
        doCandidate: CodeCandidate;
        dontCandidate: CodeCandidate;
        score: number;
      } | null = null;

      for (const doCandidate of dos) {
        for (const dontCandidate of donts) {
          if (doCandidate.code === dontCandidate.code) {
            continue;
          }

          const score =
            scoreCodeCandidate(doCandidate) +
            scoreCodeCandidate(dontCandidate) +
            2;

          if (!bestPair || score > bestPair.score) {
            bestPair = { doCandidate, dontCandidate, score };
          }
        }
      }

      return bestPair;
    })
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
    .sort((a, b) => b.score - a.score)[0];

  if (bestSameCommentPair) {
    return {
      doCode: bestSameCommentPair.doCandidate.code,
      doLanguage: bestSameCommentPair.doCandidate.language,
      dontCode: bestSameCommentPair.dontCandidate.code,
      dontLanguage: bestSameCommentPair.dontCandidate.language,
    };
  }

  const allCandidates = perCommentCandidates.flat();
  const explicitDo = [...allCandidates]
    .filter((candidate) => candidate.role === "do")
    .sort((a, b) => scoreCodeCandidate(b) - scoreCodeCandidate(a))[0];
  const explicitDont = [...allCandidates]
    .filter((candidate) => candidate.role === "dont")
    .sort((a, b) => scoreCodeCandidate(b) - scoreCodeCandidate(a))[0];
  const unknownCandidates = allCandidates.filter(
    (candidate) => candidate.role === "unknown",
  );

  if (explicitDo && explicitDont && explicitDo.code !== explicitDont.code) {
    return {
      doCode: explicitDo.code,
      doLanguage: explicitDo.language,
      dontCode: explicitDont.code,
      dontLanguage: explicitDont.language,
    };
  }

  if (explicitDont) {
    const fallbackDo =
      allCandidates.find((candidate) => candidate.code !== explicitDont.code) ??
      unknownCandidates[0];
    return {
      doCode: fallbackDo?.code ?? "// Example: [insert preferred pattern here]",
      doLanguage: fallbackDo?.language ?? "",
      dontCode: explicitDont.code,
      dontLanguage: explicitDont.language,
    };
  }

  if (explicitDo) {
    const fallbackDont =
      allCandidates.find((candidate) => candidate.code !== explicitDo.code) ??
      unknownCandidates[0];
    return {
      doCode: explicitDo.code,
      doLanguage: explicitDo.language,
      dontCode:
        fallbackDont?.code ?? "// Anti-pattern: [insert pattern to avoid]",
      dontLanguage: fallbackDont?.language ?? "",
    };
  }

  const first = allCandidates[0];
  const second = allCandidates[1];

  return {
    doCode: first?.code ?? "// Example: [insert preferred pattern here]",
    doLanguage: first?.language ?? "",
    dontCode: second?.code ?? "// Anti-pattern: [insert pattern to avoid]",
    dontLanguage: second?.language ?? "",
  };
}

export function formatRuleExample(
  cluster: Cluster,
  analyzedPRs: number,
): string {
  const suggestionComment = cluster.comments.find((c) =>
    hasSuggestionSignal(c.body),
  );
  const whySource = suggestionComment ?? cluster.comments[0];
  const firstSentence = (whySource?.body ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(". ")[0];
  const why = truncateWithEllipsis(
    firstSentence ||
      "Recurring review feedback indicates a preventable failure mode.",
    120,
  );
  const { doCode, doLanguage, dontCode, dontLanguage } = chooseExamplePair(
    cluster.comments,
  );

  const frequency = cluster.comments.length;
  const pct = ((frequency / Math.max(analyzedPRs, 1)) * 100).toFixed(1);
  const evidenceCount = Math.min(4, frequency);
  const lines: string[] = [];

  lines.push(`### Candidate Rule — ${themeDisplay(cluster.theme)}`);
  lines.push("");
  lines.push(`**Why (failure mode):** ${why}`);
  lines.push("");
  lines.push(`**The Rule:** ${draftRuleForTheme(cluster.theme)}`);
  lines.push("");
  lines.push(`**✅ DO:** ${formatCodeFence(doCode, doLanguage)}`);
  lines.push("");
  lines.push(`**❌ DON'T:** ${formatCodeFence(dontCode, dontLanguage)}`);
  lines.push("");
  lines.push(`**Scope:** ${scopeForTheme(cluster.theme)}`);
  lines.push("");
  lines.push(
    `*Candidate rule — review before adopting. Frequency=${frequency} in ${analyzedPRs} PRs (${pct}%). Evidence: ${evidenceCount} PR comments shown above.*`,
  );

  return lines.join("\n");
}

export function buildMarkdown(
  repo: string,
  analyzedPRs: number,
  reviewedComments: number,
  skipped: {
    tooShort: number;
    approvals: number;
    questionOnly: number;
    lowSignal: number;
  },
  clusters: Cluster[],
): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`# Rule Candidates — ${repo}`);
  lines.push(
    `*Mined: ${date} · PRs analyzed: ${analyzedPRs} · Comments reviewed: ${reviewedComments} · Candidates surfaced: ${clusters.length}*`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  if (clusters.length === 0) {
    lines.push(
      "No clusters met thresholds (`score > 2.0` and `frequency >= 3`).",
    );
    lines.push("");
  }

  for (const cluster of clusters) {
    const frequency = cluster.comments.length;
    const sev = summarizeSeverity(cluster);
    const repr = representativeness(cluster);
    lines.push(
      `## Theme: ${themeDisplay(cluster.theme)} (${frequency} comments, score ${cluster.score.toFixed(1)})`,
    );
    lines.push("");
    lines.push(
      `### Candidate: ${draftRuleForTheme(cluster.theme).split(".")[0]}`,
    );
    lines.push(
      `*Frequency: ${frequency} · Severity signals: ${sev} · Representativeness: ${repr}*`,
    );
    lines.push("");
    lines.push("**Supporting comments:**");

    const sorted = [...cluster.comments].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const top = sorted.slice(0, 4);
    for (const c of top) {
      const snippet = c.body.replace(/\s+/g, " ").trim();
      lines.push(`- PR #${c.prNumber}: "${snippet}"`);
    }

    const remainder = frequency - top.length;
    if (remainder > 0) {
      lines.push(`- [+${remainder} more]`);
    }

    lines.push("");
    lines.push(formatRuleExample(cluster, analyzedPRs));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("## Skipped (low signal)");
  lines.push(`- ${skipped.tooShort} comments below length threshold`);
  lines.push(`- ${skipped.approvals} pure approvals`);
  lines.push(`- ${skipped.questionOnly} questions without suggestions`);
  if (skipped.lowSignal > 0) {
    lines.push(`- ${skipped.lowSignal} low-signal comments`);
  }
  lines.push("");

  return lines.join("\n");
}

export function repoToFileName(repo: string): string {
  const [owner, name] = repo.split("/");
  const date = new Date().toISOString().slice(0, 10);
  return `${owner}-${name}-${date}.md`;
}

export async function ensureDir(path: string) {
  const proc = Bun.spawn(["mkdir", "-p", path], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
}

export async function main() {
  const args = parseArgs(process.argv);
  const [owner, name] = args.repo.split("/");

  try {
    const { prs, comments } = await fetchMergedPRComments(
      owner,
      name,
      args.limit,
    );
    const { kept, skipped } = filterComments(comments);
    const clusters = clusterAndScore(kept);

    const markdown = buildMarkdown(
      args.repo,
      prs.length,
      comments.length,
      skipped,
      clusters,
    );

    if (!args.dryRun) {
      await ensureDir(args.outputDir);
      const outPath = `${args.outputDir}/${repoToFileName(args.repo)}`;
      await Bun.write(outPath, markdown);
      console.log(`Wrote rule candidates: ${outPath}`);
    }

    console.log(
      [
        `Repo: ${args.repo}`,
        `PRs analyzed: ${prs.length}`,
        `Comments reviewed: ${comments.length}`,
        `Substantive comments kept: ${kept.length}`,
        `Candidates surfaced: ${clusters.length}`,
        `Dry run: ${args.dryRun ? "yes" : "no"}`,
      ].join(" | "),
    );
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
