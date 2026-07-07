import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export type ImprovementPriority = "high" | "medium" | "low";

export type ImprovementSuggestion = {
  title: string;
  why: string;
  evidence: string[];
  fix: string;
  priority: ImprovementPriority;
  confidence: number; // 0-1
  impact: number; // 1-5
};

export type SynthesisInput = {
  projectName: string;
  projectPath: string;
  ruleScore: number;
  guardrailScore: number;
  recommendations: string[];
  coverageGaps: string[];
  enforcementLevel: string;
  driftSummary: {
    pathIssues: number;
    dateIssues: number;
  };
  cliFindings: {
    isCliProject: boolean;
    confidence: number;
    missingChecks: string[];
    evidence: string[];
  };
  guardrailFindings: {
    missingGuardrails: string[];
    recommendations: string[];
  };
  nextRatchetLanes?: string[];
};

export type SynthesisResult = {
  mode: "ai" | "heuristic";
  model: string | null;
  suggestions: ImprovementSuggestion[];
};

export type AiProvider =
  | "auto"
  | "openai"
  | "codex-cli"
  | "claude-code"
  | "gemini-cli"
  | "opencode"
  | "heuristic";

export type SynthesisOptions = {
  provider?: AiProvider;
  model?: string;
  timeoutMs?: number;
  codexPath?: string;
  claudePath?: string;
  geminiPath?: string;
  opencodePath?: string;
};

const DEFAULT_MODEL = process.env.ANVIL_AI_MODEL ?? "gpt-5-mini";
const DEFAULT_PROVIDER =
  (process.env.ANVIL_AI_PROVIDER as AiProvider | undefined) ?? "auto";

const SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "why",
          "evidence",
          "fix",
          "priority",
          "confidence",
          "impact",
        ],
        properties: {
          title: { type: "string" },
          why: { type: "string" },
          evidence: { type: "array", items: { type: "string" }, minItems: 1 },
          fix: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          impact: { type: "integer", minimum: 1, maximum: 5 },
        },
      },
    },
  },
};

function sanitizeSuggestions(raw: unknown): ImprovementSuggestion[] {
  if (!Array.isArray(raw)) return [];

  const out: ImprovementSuggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const title = typeof row.title === "string" ? row.title.trim() : "";
    const why = typeof row.why === "string" ? row.why.trim() : "";
    const fix = typeof row.fix === "string" ? row.fix.trim() : "";
    const evidence = Array.isArray(row.evidence)
      ? row.evidence
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean)
      : [];

    const priorityRaw =
      typeof row.priority === "string" ? row.priority.toLowerCase() : "";
    const priority: ImprovementPriority =
      priorityRaw === "high" ||
      priorityRaw === "medium" ||
      priorityRaw === "low"
        ? (priorityRaw as ImprovementPriority)
        : "medium";
    const confidenceRaw =
      typeof row.confidence === "number" ? row.confidence : 0.6;
    const impactRaw = typeof row.impact === "number" ? row.impact : 3;
    const confidence = Math.max(0, Math.min(1, Number(confidenceRaw)));
    const impact = Math.max(1, Math.min(5, Math.round(Number(impactRaw))));

    if (!title || !why || !fix) continue;

    out.push({
      title,
      why,
      fix,
      evidence: evidence.slice(0, 4),
      priority,
      confidence,
      impact,
    });
  }

  return out.slice(0, 5);
}

function tryParseJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // continue
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRecommendationLabel(rec: string): string {
  return rec
    .replace(/^(?:[-•\s]|🔴|⚠️)+/u, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\[(?:high|medium|low)\]\s*$/iu, "")
    .trim();
}

function safeEllipsisTitle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  let inInlineCode = false;
  let lastBreak = -1;
  let idx = 0;

  while (idx < text.length) {
    const char = text[idx];
    if (char === "`") {
      inInlineCode = !inInlineCode;
    }
    if (!inInlineCode && /[\s,.;:!?)]/.test(char)) {
      lastBreak = idx;
    }
    if (idx >= maxChars && !inInlineCode) {
      break;
    }
    idx++;
  }

  const end = lastBreak > 0 ? lastBreak : Math.min(idx, text.length);
  return `${text.slice(0, end).trimEnd()}…`;
}

function buildRecommendationTitle(rec: string): string {
  const normalized = normalizeRecommendationLabel(rec);
  if (!normalized) return "Address recommendation";

  const sentenceBreak = normalized.match(/^(.+?[.!?])(?:\s|$)/u)?.[1]?.trim();
  if (sentenceBreak && sentenceBreak.length <= 72) {
    return sentenceBreak.replace(/[.!?]+$/u, "");
  }

  const clauseBreak = normalized.split(/\s+[—-]\s+/u)[0]?.trim();
  if (clauseBreak && clauseBreak.length <= 72) {
    return clauseBreak.replace(/[.!?]+$/u, "");
  }

  const preCode = normalized.split("`")[0]?.trim();
  if (preCode && preCode.length <= 72) {
    return preCode.replace(/[.!?]+$/u, "");
  }

  return safeEllipsisTitle(normalized, 72);
}

function parseRatchetLaneScore(
  lane: string,
): { score: number; max: number } | null {
  const match = lane.match(
    /\((\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(?:[^)]*)\)\s*$/u,
  );
  if (!match) return null;

  const score = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) {
    return null;
  }

  return { score, max };
}

export function isNearMaxRatchetLane(lane: string): boolean {
  const parsed = parseRatchetLaneScore(lane);
  if (!parsed) return false;

  return parsed.score / parsed.max >= 0.8;
}

export function heuristicTopImprovements(
  input: SynthesisInput,
): ImprovementSuggestion[] {
  const items: ImprovementSuggestion[] = [];
  const nextRatchetLanes = (input.nextRatchetLanes ?? []).filter(Boolean);

  if (input.enforcementLevel === "none") {
    items.push({
      title: "Add an enforcement layer for critical rules",
      why: "Text-only rules are frequently skipped on fast iterations.",
      evidence: [
        `Enforcement level: ${input.enforcementLevel}`,
        ...input.recommendations
          .filter((r) => r.toLowerCase().includes("enforcement"))
          .slice(0, 1),
      ].filter(Boolean),
      fix: "Add one blocking hook and one CI gate (lint + typecheck + test) tied to your highest-risk rules.",
      priority: "high",
      confidence: 0.85,
      impact: 5,
    });
  }

  if (input.coverageGaps.length > 0) {
    items.push({
      title: "Close high-impact rule coverage gaps",
      why: "Missing baseline categories cause repeated review churn.",
      evidence: [`Coverage gaps: ${input.coverageGaps.join(", ")}`],
      fix: "Add focused rules for the top 2 uncovered categories first, each with Why + DO/DON'T + loading tier.",
      priority: "high",
      confidence: 0.8,
      impact: 4,
    });
  }

  if (input.driftSummary.pathIssues > 0 || input.driftSummary.dateIssues > 0) {
    items.push({
      title: "Treat drift findings as active maintenance backlog",
      why: "Stale path/date references erode rule trust and model compliance.",
      evidence: [
        `Path issues: ${input.driftSummary.pathIssues}`,
        `Date issues: ${input.driftSummary.dateIssues}`,
      ],
      fix: "Resolve all high-severity drift issues first, then add CI drift checks to prevent regression.",
      priority: "medium",
      confidence: 0.75,
      impact: 4,
    });
  }

  if (input.guardrailFindings.missingGuardrails.length > 0) {
    items.push({
      title: "Raise guardrail baseline before expanding rule volume",
      why: "Without guardrails, additional rules increase complexity more than reliability.",
      evidence: [
        ...input.guardrailFindings.missingGuardrails
          .slice(0, 3)
          .map((m) => `Missing: ${m}`),
        `Guardrail score: ${input.guardrailScore}/35`,
      ],
      fix: "Implement the first two missing guardrails, re-run audit, and only then add new behavioral rules.",
      priority: "medium",
      confidence: 0.7,
      impact: 4,
    });
  }

  if (
    input.cliFindings.isCliProject &&
    input.cliFindings.missingChecks.length > 0
  ) {
    items.push({
      title: "Harden CLI reliability checks",
      why: "CLI projects need predictable argument, error, and exit behavior for automation safety.",
      evidence: [
        `CLI confidence: ${Math.round(input.cliFindings.confidence * 100)}%`,
        `Missing checks: ${input.cliFindings.missingChecks.join(", ")}`,
      ],
      fix: "Add explicit --help usage, strict argument validation, and consistent non-zero exit codes for all failure paths.",
      priority: "medium",
      confidence: 0.72,
      impact: 3,
    });
  }

  for (const rec of input.recommendations) {
    if (items.length >= 5) break;
    items.push({
      title: `Address recommendation: ${buildRecommendationTitle(rec)}`,
      why: "The audit flagged this as a current high-value issue.",
      evidence: [rec],
      fix: "Implement this change in one focused PR with a before/after audit comparison.",
      priority: rec.includes("🔴") ? "high" : "low",
      confidence: rec.includes("🔴") ? 0.78 : 0.55,
      impact: rec.includes("🔴") ? 4 : 2,
    });
  }

  if (items.length === 0 && nextRatchetLanes.length > 0) {
    const nearMaxOnly = nextRatchetLanes.every(isNearMaxRatchetLane);
    if (nearMaxOnly) {
      return items;
    }

    items.push({
      title: "Tighten the weakest scored lane next",
      why: "The audit passed cleanly, so the next useful ratchet is to sharpen the weakest still-subperfect lane instead of inventing a fake blocker.",
      evidence: nextRatchetLanes.map((lane) => `Weakest scored lane: ${lane}`),
      fix:
        nextRatchetLanes.length === 1
          ? `Start with ${nextRatchetLanes[0]} and add one verifiable improvement that raises that lane without expanding scope.`
          : `Start with ${nextRatchetLanes[0]}, then re-run the audit before deciding whether ${nextRatchetLanes[1]} still needs follow-up.`,
      priority: "low",
      confidence: 0.62,
      impact: 2,
    });
  }

  return items.slice(0, 5);
}

function isCodexAvailable(codexPath: string): boolean {
  try {
    const res = spawnSync(codexPath, ["--version"], {
      stdio: "ignore",
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

function isClaudeAvailable(claudePath: string): boolean {
  try {
    const res = spawnSync(claudePath, ["--version"], {
      stdio: "ignore",
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

function isGeminiAvailable(geminiPath: string): boolean {
  try {
    const res = spawnSync(geminiPath, ["--version"], {
      stdio: "ignore",
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

function isOpencodeAvailable(opencodePath: string): boolean {
  try {
    const res = spawnSync(opencodePath, ["run", "--help"], {
      stdio: "ignore",
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

function buildPrompt(input: SynthesisInput): string {
  const context = {
    project: {
      name: input.projectName,
      path: input.projectPath,
      basename: basename(input.projectPath),
    },
    scoring: {
      ruleQuality0to5: input.ruleScore,
      guardrailReadiness0to35: input.guardrailScore,
      enforcementLevel: input.enforcementLevel,
    },
    drift: input.driftSummary,
    coverageGaps: input.coverageGaps,
    recommendations: input.recommendations,
    cliFindings: input.cliFindings,
    guardrailFindings: input.guardrailFindings,
  };

  return [
    "You are an engineering auditor.",
    "Return exactly 5 repo-specific improvement suggestions.",
    "Each suggestion must include concrete evidence from the provided context and a practical fix.",
    'Output JSON object only: {"suggestions":[...]} (no markdown).',
    "Schema per suggestion item:",
    '{"title":"...","why":"...","evidence":["..."],"fix":"...","priority":"high|medium|low","confidence":0.0-1.0,"impact":1-5}',
    "Prioritize highest-leverage actions first.",
    "Context:",
    JSON.stringify(context),
  ].join("\n");
}

async function synthesizeWithOpenAI(
  input: SynthesisInput,
  model: string,
  timeoutMs: number,
): Promise<SynthesisResult | null> {
  const apiKey = process.env.ANVIL_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = buildPrompt(input);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: prompt,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const outputText =
      (typeof data.output_text === "string" ? data.output_text : null) ??
      (typeof data.response === "string" ? data.response : null) ??
      "";

    const arr = tryParseJsonArray(outputText);
    const suggestions = sanitizeSuggestions(arr ?? []);
    if (suggestions.length === 0) {
      throw new Error("No parseable JSON suggestions from model");
    }

    return {
      mode: "ai",
      model: `openai:${model}`,
      suggestions,
    };
  } catch {
    return null;
  }
}

async function synthesizeWithCodexCli(
  input: SynthesisInput,
  model: string | undefined,
  timeoutMs: number,
  codexPath: string,
): Promise<SynthesisResult | null> {
  const debug = process.env.ANVIL_AI_DEBUG === "1";
  if (!isCodexAvailable(codexPath)) return null;

  const tmp = mkdtempSync(join(tmpdir(), "anvil-codex-synthesis-"));
  const schemaPath = join(tmp, "schema.json");
  const outputPath = join(tmp, "output.json");
  writeFileSync(schemaPath, JSON.stringify(SUGGESTION_SCHEMA, null, 2), "utf8");

  const prompt = buildPrompt(input);
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--output-schema",
    schemaPath,
    "-o",
    outputPath,
    "-C",
    input.projectPath,
  ];

  if (model) {
    args.push("-m", model);
  }

  // Read prompt from stdin to avoid shell escaping issues for large JSON contexts.
  args.push("-");

  try {
    const run = spawnSync(codexPath, args, {
      encoding: "utf8",
      input: prompt,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (run.status !== 0) {
      if (debug) {
        console.error(
          `[anvil ai debug] codex-cli failed (status=${run.status})`,
        );
        if (run.stderr) console.error(run.stderr.slice(0, 1200));
      }
      return null;
    }

    const output = readFileSync(outputPath, "utf8");
    let arr: unknown[] | null = null;
    try {
      const parsed = JSON.parse(output) as Record<string, unknown>;
      if (Array.isArray(parsed.suggestions)) {
        arr = parsed.suggestions;
      }
    } catch {
      arr = tryParseJsonArray(output);
    }
    const suggestions = sanitizeSuggestions(arr ?? []);
    if (suggestions.length === 0) {
      if (debug) {
        console.error(
          "[anvil ai debug] codex-cli returned unparsable suggestions",
        );
        console.error(output.slice(0, 1200));
      }
      return null;
    }

    return {
      mode: "ai",
      model: `codex-cli:${model ?? "default"}`,
      suggestions,
    };
  } catch {
    return null;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function synthesizeWithClaudeCode(
  input: SynthesisInput,
  model: string | undefined,
  timeoutMs: number,
  claudePath: string,
): Promise<SynthesisResult | null> {
  const debug = process.env.ANVIL_AI_DEBUG === "1";
  if (!isClaudeAvailable(claudePath)) return null;

  const prompt = buildPrompt(input);
  const args = [
    "--print",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(SUGGESTION_SCHEMA),
    "--no-session-persistence",
    "-C",
    input.projectPath,
  ];

  if (model) {
    args.push("--model", model);
  }

  // Pass prompt as final positional argument
  args.push(prompt);

  try {
    const run = spawnSync(claudePath, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (run.status !== 0) {
      if (debug) {
        console.error(
          `[anvil ai debug] claude-code failed (status=${run.status})`,
        );
        if (run.stderr) console.error(run.stderr.slice(0, 1200));
      }
      return null;
    }

    // Claude --output-format json returns a JSON envelope.
    // The model output is in result[].content or similar paths.
    const output = run.stdout.trim();
    let suggestionsText = output;

    try {
      const parsed = JSON.parse(output) as Record<string, unknown>;
      // Claude JSON envelope: { result: [{ content: [{ type: "text", text: "..." }] }] }
      if (Array.isArray(parsed.result)) {
        const textBlock = (parsed.result as Record<string, unknown>[])
          .flatMap((block) =>
            typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
                ? (block.content as Record<string, unknown>[])
                    .filter(
                      (c) => c.type === "text" && typeof c.text === "string",
                    )
                    .map((c) => c.text as string)
                : [],
          )
          .join("");
        if (textBlock) suggestionsText = textBlock;
      }
    } catch {
      // Not JSON envelope — use raw output
    }

    const arr = tryParseJsonArray(suggestionsText);
    const suggestions = sanitizeSuggestions(arr ?? []);
    if (suggestions.length === 0) {
      if (debug) {
        console.error(
          "[anvil ai debug] claude-code returned unparsable suggestions",
        );
        console.error(output.slice(0, 1200));
      }
      return null;
    }

    return {
      mode: "ai",
      model: `claude-code:${model ?? "default"}`,
      suggestions,
    };
  } catch {
    return null;
  }
}

async function synthesizeWithGeminiCli(
  input: SynthesisInput,
  model: string | undefined,
  timeoutMs: number,
  geminiPath: string,
): Promise<SynthesisResult | null> {
  const debug = process.env.ANVIL_AI_DEBUG === "1";
  if (!isGeminiAvailable(geminiPath)) return null;

  const prompt = buildPrompt(input);
  const args = [
    "--prompt",
    prompt,
    "--output-format",
    "json",
    "--sandbox",
    "-C",
    input.projectPath,
  ];

  if (model) {
    args.push("--model", model);
  }

  try {
    const run = spawnSync(geminiPath, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (run.status !== 0) {
      if (debug) {
        console.error(
          `[anvil ai debug] gemini-cli failed (status=${run.status})`,
        );
        if (run.stderr) console.error(run.stderr.slice(0, 1200));
      }
      return null;
    }

    const output = run.stdout.trim();
    let suggestionsText = output;

    // Gemini --output-format json may wrap in an envelope
    try {
      const parsed = JSON.parse(output) as Record<string, unknown>;
      if (typeof parsed.responseText === "string") {
        suggestionsText = parsed.responseText;
      } else if (typeof parsed.text === "string") {
        suggestionsText = parsed.text;
      } else if (typeof parsed.response === "string") {
        suggestionsText = parsed.response;
      }
    } catch {
      // Not JSON envelope — use raw output
    }

    const arr = tryParseJsonArray(suggestionsText);
    const suggestions = sanitizeSuggestions(arr ?? []);
    if (suggestions.length === 0) {
      if (debug) {
        console.error(
          "[anvil ai debug] gemini-cli returned unparsable suggestions",
        );
        console.error(output.slice(0, 1200));
      }
      return null;
    }

    return {
      mode: "ai",
      model: `gemini-cli:${model ?? "default"}`,
      suggestions,
    };
  } catch {
    return null;
  }
}

async function synthesizeWithOpencode(
  input: SynthesisInput,
  model: string | undefined,
  timeoutMs: number,
  opencodePath: string,
): Promise<SynthesisResult | null> {
  const debug = process.env.ANVIL_AI_DEBUG === "1";
  if (!isOpencodeAvailable(opencodePath)) return null;

  const prompt = buildPrompt(input);
  const args = ["run", "--format", "json", "-C", input.projectPath, prompt];

  if (model) {
    args.push("--model", model);
  }

  try {
    const run = spawnSync(opencodePath, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (run.status !== 0) {
      if (debug) {
        console.error(
          `[anvil ai debug] opencode failed (status=${run.status})`,
        );
        if (run.stderr) console.error(run.stderr.slice(0, 1200));
      }
      return null;
    }

    const output = run.stdout.trim();
    let suggestionsText = output;

    // opencode --format json may wrap in an envelope
    try {
      const parsed = JSON.parse(output) as Record<string, unknown>;
      if (typeof parsed.response === "string") {
        suggestionsText = parsed.response;
      } else if (typeof parsed.text === "string") {
        suggestionsText = parsed.text;
      } else if (typeof parsed.content === "string") {
        suggestionsText = parsed.content;
      }
    } catch {
      // Not JSON envelope — use raw output
    }

    const arr = tryParseJsonArray(suggestionsText);
    const suggestions = sanitizeSuggestions(arr ?? []);
    if (suggestions.length === 0) {
      if (debug) {
        console.error(
          "[anvil ai debug] opencode returned unparsable suggestions",
        );
        console.error(output.slice(0, 1200));
      }
      return null;
    }

    return {
      mode: "ai",
      model: `opencode:${model ?? "default"}`,
      suggestions,
    };
  } catch {
    return null;
  }
}

export async function synthesizeTopImprovements(
  input: SynthesisInput,
  options: SynthesisOptions = {},
): Promise<SynthesisResult> {
  const provider = options.provider ?? DEFAULT_PROVIDER;
  const model = options.model ?? DEFAULT_MODEL;
  const envTimeout = Number.parseInt(process.env.ANVIL_AI_TIMEOUT_MS ?? "", 10);
  const hasEnvTimeout = Number.isFinite(envTimeout) && envTimeout > 0;
  const openaiTimeoutMs =
    options.timeoutMs ?? (hasEnvTimeout ? envTimeout : 20_000);
  const cliTimeoutMs =
    options.timeoutMs ?? (hasEnvTimeout ? envTimeout : 60_000);
  const codexPath =
    options.codexPath ?? process.env.ANVIL_CODEX_PATH ?? "codex";
  const claudePath =
    options.claudePath ?? process.env.ANVIL_CLAUDE_PATH ?? "claude";
  const geminiPath =
    options.geminiPath ?? process.env.ANVIL_GEMINI_PATH ?? "gemini";
  const opencodePath =
    options.opencodePath ?? process.env.ANVIL_OPENCODE_PATH ?? "opencode";

  if (provider === "heuristic") {
    return {
      mode: "heuristic",
      model: null,
      suggestions: heuristicTopImprovements(input),
    };
  }

  if (provider === "openai") {
    const openaiResult = await synthesizeWithOpenAI(
      input,
      model,
      openaiTimeoutMs,
    );
    if (openaiResult) return openaiResult;
    return {
      mode: "heuristic",
      model: `openai:${model}`,
      suggestions: heuristicTopImprovements(input),
    };
  }

  if (provider === "codex-cli") {
    const codexResult = await synthesizeWithCodexCli(
      input,
      options.model,
      cliTimeoutMs,
      codexPath,
    );
    if (codexResult) return codexResult;
    return {
      mode: "heuristic",
      model: `codex-cli:${options.model ?? "default"}`,
      suggestions: heuristicTopImprovements(input),
    };
  }

  if (provider === "claude-code") {
    const claudeResult = await synthesizeWithClaudeCode(
      input,
      options.model,
      cliTimeoutMs,
      claudePath,
    );
    if (claudeResult) return claudeResult;
    return {
      mode: "heuristic",
      model: `claude-code:${options.model ?? "default"}`,
      suggestions: heuristicTopImprovements(input),
    };
  }

  if (provider === "gemini-cli") {
    const geminiResult = await synthesizeWithGeminiCli(
      input,
      options.model,
      cliTimeoutMs,
      geminiPath,
    );
    if (geminiResult) return geminiResult;
    return {
      mode: "heuristic",
      model: `gemini-cli:${options.model ?? "default"}`,
      suggestions: heuristicTopImprovements(input),
    };
  }

  if (provider === "opencode") {
    const opencodeResult = await synthesizeWithOpencode(
      input,
      options.model,
      cliTimeoutMs,
      opencodePath,
    );
    if (opencodeResult) return opencodeResult;
    return {
      mode: "heuristic",
      model: `opencode:${options.model ?? "default"}`,
      suggestions: heuristicTopImprovements(input),
    };
  }

  // auto: try OpenAI API key first, then local CLIs in order, then heuristic fallback.
  const hasOpenAIKey = Boolean(
    process.env.ANVIL_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
  );
  if (hasOpenAIKey) {
    const openaiResult = await synthesizeWithOpenAI(
      input,
      model,
      openaiTimeoutMs,
    );
    if (openaiResult) return openaiResult;
  }

  // Try local AI coding CLIs — first available wins
  const localProviders: [string, () => Promise<SynthesisResult | null>][] = [
    [
      "claude-code",
      () =>
        synthesizeWithClaudeCode(
          input,
          options.model,
          cliTimeoutMs,
          claudePath,
        ),
    ],
    [
      "codex-cli",
      () =>
        synthesizeWithCodexCli(input, options.model, cliTimeoutMs, codexPath),
    ],
    [
      "gemini-cli",
      () =>
        synthesizeWithGeminiCli(input, options.model, cliTimeoutMs, geminiPath),
    ],
    [
      "opencode",
      () =>
        synthesizeWithOpencode(
          input,
          options.model,
          cliTimeoutMs,
          opencodePath,
        ),
    ],
  ];

  for (const [name, fn] of localProviders) {
    const result = await fn();
    if (result) return result;
    if (process.env.ANVIL_AI_DEBUG === "1") {
      console.error(
        `[anvil ai debug] auto: ${name} not available, trying next`,
      );
    }
  }

  return {
    mode: "heuristic",
    model: hasOpenAIKey ? `openai:${model}` : null,
    suggestions: heuristicTopImprovements(input),
  };
}
