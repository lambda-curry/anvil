#!/usr/bin/env bun
/**
 * bootstrap-generate.ts — Rule Generator (Phase 1b)
 *
 * Reads a project directory, runs stack detection, maps detected signals to
 * rule templates, and writes a draft additions file clearly marked DRAFT.
 *
 * Does NOT modify existing AGENTS.md or TOOLS.md — output is advisory only.
 *
 * Usage:
 *   bun run scripts/bootstrap-generate.ts --target <project-path> [--output <file>]
 *   bun run scripts/bootstrap-generate.ts <project-path> [--output <file>]
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { detectStack, type StackSignals } from "./bootstrap-detect.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

type LoadingTier = "alwaysApply" | "glob" | "on-demand";

export type RuleTemplate = {
  id: string;
  title: string;
  signal: string; // what stack signal triggers this
  failureMode: string;
  rule: string;
  doExample?: string;
  dontExample?: string;
  tier: LoadingTier;
  glob?: string; // for glob-matched rules
  seeAlso?: string[];
};

// ─── Rule Templates ──────────────────────────────────────────────────────────
// Each template is grounded in a documented failure mode (Anvil rubric §Part 4).
// Templates use placeholders like {{PACKAGE_MANAGER}}, {{TEST_RUNNER}} etc.

// Hardcoded fallback — used only when docs/bootstrap-templates/ directory doesn't exist
const RULE_TEMPLATES_HARDCODED: RuleTemplate[] = [
  // ── TypeScript: strict mode ─────────────────────────────────────────────
  {
    id: "ts-no-any",
    title: "No `any` — use `unknown` and narrow explicitly",
    signal: "typescript.strict",
    failureMode:
      "`any` is contagious. Once introduced, it disables type checking for every value it touches and spreads through calling code. Type errors that would have been caught at compile time surface as runtime crashes — often in production.",
    rule: `Do not use \`any\`. If a type is genuinely unknown at authorship time, use \`unknown\` and narrow it with a type guard or assertion before use.

Unsafe casts (\`as SomeType\` without narrowing) are also forbidden — they are \`any\` with extra steps.`,
    doExample: `// ✅ DO: unknown + narrowing
function parseResponse(raw: unknown): User {
  if (!isUser(raw)) throw new Error("Invalid user shape");
  return raw;
}`,
    dontExample: `// ❌ DON'T: any bypasses all checking
function parseResponse(raw: any): User {
  return raw; // crashes at runtime if shape is wrong
}`,
    tier: "alwaysApply",
    seeAlso: ["tsconfig.json strict: true"],
  },

  {
    id: "ts-esm-only",
    title: "ESM only — no CommonJS `require()`",
    signal: "typescript.esm",
    failureMode:
      "Mixing CommonJS `require()` with ESM `import` in an ESNext/Node16+ project produces runtime errors that are opaque and hard to trace. The error messages (`ERR_REQUIRE_ESM`, `__dirname is not defined`) are confusing and waste debugging time.",
    rule: `This project uses ESM. Use \`import\`/\`export\` syntax throughout. Do not use \`require()\`, \`module.exports\`, or \`__dirname\`/\`__filename\` (use \`import.meta.url\` instead).`,
    doExample: `// ✅ DO
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));`,
    dontExample: `// ❌ DON'T
const { join } = require("path");
const __dirname = __dirname; // not defined in ESM`,
    tier: "alwaysApply",
  },

  // ── Package manager ─────────────────────────────────────────────────────
  {
    id: "bun-commands",
    title: "Use bun — not npm or yarn",
    signal: "packageManager:bun",
    failureMode:
      "Running `npm install` or `yarn add` in a bun project creates or modifies the wrong lockfile (`package-lock.json` or `yarn.lock` instead of `bun.lockb`). This silently breaks reproducibility — the next `bun install` may resolve different package versions.",
    rule: `This project uses bun. Always use bun commands for package management and script execution:
- Install: \`bun install\`
- Add package: \`bun add <package>\`
- Remove: \`bun remove <package>\`
- Run script: \`bun run <script>\`

Never use \`npm\`, \`npx\` (prefer \`bunx\`), or \`yarn\` in this project.`,
    tier: "alwaysApply",
  },

  {
    id: "pnpm-commands",
    title: "Use pnpm — not npm or yarn",
    signal: "packageManager:pnpm",
    failureMode:
      "Running npm or yarn commands in a pnpm project modifies the wrong lockfile and breaks the workspace structure. pnpm's symlinked node_modules will silently diverge from what npm/yarn would install.",
    rule: `This project uses pnpm. Always use pnpm commands:
- Install: \`pnpm install\`
- Add: \`pnpm add <package>\`
- Remove: \`pnpm remove <package>\`
- Run: \`pnpm run <script>\` or \`pnpm <script>\`

Never use npm or yarn.`,
    tier: "alwaysApply",
  },

  // ── Next.js ─────────────────────────────────────────────────────────────
  {
    id: "nextjs-server-client-boundary",
    title: "Server vs. client component boundary (App Router)",
    signal: "framework:nextjs:app",
    failureMode:
      "Server components that accidentally use browser APIs (`window`, `localStorage`, `document`, React hooks) cause a runtime crash in production with a cryptic error. The boundary is invisible in the code — it must be enforced by convention.",
    rule: `**Server components** (default in App Router): no browser APIs, no \`useState\`, no \`useEffect\`, no event handlers. They run on the server — no DOM exists.

**Client components**: add \`'use client'\` as the first line of the file. Keep client components as leaf nodes — push interactivity down, keep data fetching up.

When in doubt: if it needs state or events, it's a client component. Add \`'use client'\` and move the file to a \`_client/\` subfolder or suffix it \`.client.tsx\`.`,
    doExample: `// ✅ DO: client component clearly marked
'use client';
import { useState } from 'react';
export function Counter() { /* ... */ }`,
    dontExample: `// ❌ DON'T: server component using browser API
export default async function Page() {
  const stored = localStorage.getItem('key'); // crashes: no DOM on server
}`,
    tier: "glob",
    glob: "**/*.tsx,**/*.ts",
    seeAlso: ["Next.js App Router docs"],
  },

  // ── React ────────────────────────────────────────────────────────────────
  {
    id: "react-hooks-deps",
    title: "useEffect dependencies must be explicit and correct",
    signal: "ui:react",
    failureMode:
      "Stale closures in useEffect are a primary source of subtle bugs: effects read outdated state, event handlers fire on unmounted components, and infinite re-render loops are triggered by missing or incorrect deps arrays. ESLint's `exhaustive-deps` rule catches many of these but not all.",
    rule: `Always provide a complete, accurate dependency array for \`useEffect\`, \`useMemo\`, and \`useCallback\`. Never suppress the exhaustive-deps ESLint warning with a comment — fix the underlying issue instead.

If the deps array feels wrong (too many deps, unstable references), the abstraction is wrong. Extract the logic into a custom hook or useMemo.

No effects with missing deps arrays (bare \`useEffect(() => { ... })\` that should only run once — use \`[]\` explicitly and comment why).`,
    doExample: `// ✅ DO: explicit empty array + comment
useEffect(() => {
  fetchData(); // intentionally runs once on mount
}, []); // deps: empty — runs once`,
    dontExample: `// ❌ DON'T: missing deps causes stale closure
useEffect(() => {
  setResult(computeWith(value)); // value is stale
}); // missing deps array → runs every render`,
    tier: "glob",
    glob: "**/*.tsx,**/*.jsx",
  },

  // ── Prisma ──────────────────────────────────────────────────────────────
  {
    id: "prisma-migrations",
    title:
      "Schema changes require a migration — never edit the database directly",
    signal: "orm:prisma",
    failureMode:
      "Editing the Prisma schema without running `prisma migrate dev` leaves the database out of sync with the schema. The app works locally (if you manually altered the DB) but fails in CI and production where the migration hasn't been applied. This is one of the most common causes of 'works on my machine' database bugs.",
    rule: `All schema changes go through the migration workflow:
1. Edit \`prisma/schema.prisma\`
2. Run \`npx prisma migrate dev --name <description>\` (or the project's equivalent npm script)
3. Commit both the schema change AND the generated migration file together

Never use \`prisma db push\` for production or CI environments — it bypasses the migration history. Reserve \`db push\` for local prototyping only, and always follow up with a proper migration before committing.`,
    doExample: `# ✅ DO: proper migration workflow
npx prisma migrate dev --name add_user_roles`,
    dontExample: `# ❌ DON'T: skips migration history
npx prisma db push  # in production/CI`,
    tier: "glob",
    glob: "prisma/**",
    seeAlso: ["prisma/schema.prisma"],
  },

  // ── Drizzle ─────────────────────────────────────────────────────────────
  {
    id: "drizzle-type-safe-queries",
    title: "Use Drizzle's type-safe query builder — avoid raw SQL",
    signal: "orm:drizzle",
    failureMode:
      "Raw SQL strings bypass Drizzle's type inference. Column renames, table changes, or typos aren't caught until runtime. The entire point of Drizzle is compile-time safety on database queries.",
    rule: `Use Drizzle's query builder API (\`db.select().from().where()\`) for all queries. Raw SQL (\`sql\`...\`\` template literal) is only acceptable for complex aggregations or DB-specific functions that the builder can't express — document why.`,
    tier: "glob",
    glob: "**/*.ts,**/*.tsx",
  },

  // ── Zod ─────────────────────────────────────────────────────────────────
  {
    id: "zod-validate-inputs",
    title: "Validate all external inputs with Zod before use",
    signal: "validation:zod",
    failureMode:
      "Unvalidated API inputs that reach business logic or the database cause runtime crashes, data corruption, and security vulnerabilities. The shape of request bodies and query params is never guaranteed — even from trusted sources. Assuming shape without checking is an optimistic bug waiting to happen.",
    rule: `Every API route, form handler, and external data source must validate input with a Zod schema before the data is used. Colocate the schema with the handler.

\`schema.parse()\` throws on failure — use \`schema.safeParse()\` and handle errors explicitly at API boundaries.`,
    doExample: `// ✅ DO: validate at the boundary
const schema = z.object({ email: z.string().email(), name: z.string().min(1) });
const result = schema.safeParse(req.body);
if (!result.success) return res.status(400).json({ error: result.error.flatten() });
const { email, name } = result.data; // fully typed`,
    dontExample: `// ❌ DON'T: assume body shape
const { email, name } = req.body; // any type, no validation
await db.users.create({ email, name }); // corrupts DB on bad input`,
    tier: "glob",
    glob: "**/*.ts,**/*.tsx",
  },

  // ── Vitest ──────────────────────────────────────────────────────────────
  {
    id: "vitest-behavior-not-implementation",
    title: "Test observable behavior — not internal implementation",
    signal: "testing:vitest",
    failureMode:
      "Tests that assert on mocks, internal function calls, or private state break on every refactor even when behavior is correct. They slow refactoring without catching real bugs — the opposite of what tests are for.",
    rule: `Test what the function/component does from the outside — its outputs and side effects — not how it does it internally. Prefer few, high-value assertions over many fine-grained mock verifications.

When you find yourself asserting \`expect(mockFn).toHaveBeenCalledWith(...)\` more than asserting on outputs, reconsider the test design.`,
    doExample: `// ✅ DO: assert on the output
const result = formatCurrency(1234.5, 'USD');
expect(result).toBe('$1,234.50');`,
    dontExample: `// ❌ DON'T: assert on internal calls
expect(mockIntlNumberFormat).toHaveBeenCalledWith('en-US', { style: 'currency', currency: 'USD' });`,
    tier: "glob",
    glob: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx",
  },

  {
    id: "jest-behavior-not-implementation",
    title: "Test observable behavior — not internal implementation",
    signal: "testing:jest",
    failureMode:
      "Tests that assert on mocks, internal function calls, or private state break on every refactor even when behavior is correct. They slow refactoring without catching real bugs.",
    rule: `Test what the function/component does from the outside — its outputs and side effects — not how it does it internally. Prefer few, high-value assertions over many fine-grained mock verifications.`,
    tier: "glob",
    glob: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx",
  },

  // ── Tailwind ────────────────────────────────────────────────────────────
  {
    id: "tailwind-no-inline-styles",
    title: "Use Tailwind utilities — no inline styles or raw CSS for layout",
    signal: "styling:tailwind",
    failureMode:
      "Inline styles and CSS-in-JS bypass Tailwind's design system. They create one-off values that don't respond to the theme, can't be overridden by Tailwind's responsive/state variants, and accumulate into inconsistent UI. Over time, they become unmaintainable.",
    rule: `Use Tailwind utility classes for all styling. If a utility doesn't exist for your use case, extend the Tailwind theme (\`tailwind.config.ts\`) — don't add a one-off inline style or custom CSS.

Inline styles (\`style={{ ... }}\`) are only acceptable for dynamic values that cannot be expressed as Tailwind classes (e.g., truly dynamic pixel values computed at runtime).`,
    doExample: `// ✅ DO: extend the theme
// tailwind.config.ts
theme: { extend: { spacing: { '18': '4.5rem' } } }
// then in component:
<div className="mt-18">`,
    dontExample: `// ❌ DON'T: one-off inline style
<div style={{ marginTop: '72px' }}>`,
    tier: "glob",
    glob: "**/*.tsx,**/*.jsx",
  },
];

// ─── Template file loader ─────────────────────────────────────────────────────
// Loads templates from docs/bootstrap-templates/*.md when available.
// Falls back to RULE_TEMPLATES_HARDCODED if the directory doesn't exist or is empty.
// File format: standard Anvil rubric format with a *Signal: ... · Tier: ... · Glob: ...* header.

const TEMPLATES_DIR = join(
  import.meta.dir,
  "..",
  "docs",
  "bootstrap-templates",
);

export function parseTemplateFile(filePath: string): RuleTemplate | null {
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    // H1 heading → title
    const titleLine = lines.find((l) => l.startsWith("# "));
    if (!titleLine) return null;
    const title = titleLine.replace(/^# /, "").trim();

    // id from filename
    const id = basename(filePath, ".md");

    // Signal/Tier/Glob from the italic metadata line
    const metaLine = lines.find((l) => l.startsWith("*Signal:"));
    if (!metaLine) return null;
    const signalMatch = metaLine.match(/Signal:\s*([^·]+)/);
    const tierMatch = metaLine.match(/Tier:\s*([^·*]+)/);
    const globMatch = metaLine.match(/Glob:\s*([^*]+)/);
    if (!signalMatch) return null;
    const signal = signalMatch[1].trim();
    const tierRaw = tierMatch ? tierMatch[1].trim() : "alwaysApply";
    const tier: LoadingTier =
      tierRaw === "glob"
        ? "glob"
        : tierRaw === "on-demand"
          ? "on-demand"
          : "alwaysApply";
    const glob = globMatch
      ? globMatch[1].trim().replace(/\s*$/, "")
      : undefined;

    // Extract sections by heading
    function extractSection(heading: string): string {
      const startIdx = lines.findIndex((l) => l.trim() === `## ${heading}`);
      if (startIdx === -1) return "";
      const endIdx = lines.findIndex(
        (l, i) => i > startIdx && l.startsWith("## "),
      );
      const sectionLines = lines.slice(
        startIdx + 1,
        endIdx === -1 ? undefined : endIdx,
      );
      return sectionLines.join("\n").trim();
    }

    const failureMode = extractSection("Why (Failure Mode)");
    const rule = extractSection("The Rule");

    // Extract DO/DON'T examples from code blocks in the Examples section
    const examplesSection = extractSection("Examples");
    function extractCodeBlock(
      text: string,
      marker: string,
    ): string | undefined {
      const markerIdx = text.indexOf(marker);
      if (markerIdx === -1) return undefined;
      const afterMarker = text.slice(markerIdx + marker.length);
      const codeStart = afterMarker.indexOf("```");
      if (codeStart === -1) return undefined;
      const codeEnd = afterMarker.indexOf("```", codeStart + 3);
      if (codeEnd === -1) return undefined;
      return afterMarker
        .slice(codeStart + 3, codeEnd)
        .replace(/^[a-z]*\n/, "")
        .trim();
    }
    const doExample = extractCodeBlock(examplesSection, "### ✅ DO");
    const dontExample = extractCodeBlock(examplesSection, "### ❌ DON'T");

    // See Also
    const seeAlsoSection = extractSection("See Also");
    const seeAlso = seeAlsoSection
      .split("\n")
      .map((l) => l.replace(/^- /, "").trim())
      .filter((l) => l.length > 0);

    return {
      id,
      title,
      signal,
      failureMode,
      rule,
      doExample,
      dontExample,
      tier,
      glob: glob && glob !== "—" ? glob : undefined,
      seeAlso: seeAlso.length > 0 ? seeAlso : undefined,
    };
  } catch {
    return null;
  }
}

export function loadTemplatesFromFiles(): RuleTemplate[] {
  if (!existsSync(TEMPLATES_DIR)) {
    return [];
  }
  try {
    const files = readdirSync(TEMPLATES_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort();
    if (files.length === 0) return [];
    const templates: RuleTemplate[] = [];
    for (const file of files) {
      const parsed = parseTemplateFile(join(TEMPLATES_DIR, file));
      if (parsed) {
        templates.push(parsed);
      }
    }
    return templates;
  } catch {
    return [];
  }
}

// Load templates: from files if available, fall back to hardcoded
const fileTemplates = loadTemplatesFromFiles();
const RULE_TEMPLATES: RuleTemplate[] =
  fileTemplates.length > 0 ? fileTemplates : RULE_TEMPLATES_HARDCODED;

// ─── Signal matching ──────────────────────────────────────────────────────────

export function matchesSignal(
  template: RuleTemplate,
  signals: StackSignals,
): boolean {
  const sig = template.signal;

  // Direct signal checks
  if (sig === "typescript.strict") return signals.typescript.strict;
  if (sig === "typescript.esm") return signals.typescript.esm;
  if (sig === "packageManager:bun") return signals.packageManager === "bun";
  if (sig === "packageManager:pnpm") return signals.packageManager === "pnpm";
  if (sig === "framework:nextjs:app")
    return signals.framework === "nextjs" && signals.routerType === "app";
  if (sig === "ui:react") return signals.ui.includes("react");
  if (sig === "orm:prisma") return signals.orm === "prisma";
  if (sig === "orm:drizzle") return signals.orm === "drizzle";
  if (sig === "validation:zod") return signals.validation.includes("zod");
  if (sig === "testing:vitest") return signals.testing === "vitest";
  if (sig === "testing:jest") return signals.testing === "jest";
  if (sig === "styling:tailwind") return signals.styling.includes("tailwind");

  return false;
}

// ─── Output building ─────────────────────────────────────────────────────────

export function renderStackSummary(s: StackSignals): string {
  const parts: string[] = [];
  parts.push(`- Runtime: ${s.runtime === "bun" ? "Bun" : "Node.js"}`);
  parts.push(`- Package manager: ${s.packageManager}`);
  if (s.framework !== "none" && s.framework !== "unknown") {
    const fwLabel = s.framework === "nextjs" ? "Next.js" : s.framework;
    const version = s.frameworkVersion ? ` ${s.frameworkVersion}` : "";
    const router =
      s.framework === "nextjs" && s.routerType !== "unknown"
        ? ` (${s.routerType} router)`
        : "";
    parts.push(`- Framework: ${fwLabel}${version}${router}`);
  }
  if (s.ui.length > 0) parts.push(`- UI: ${s.ui.join(", ")}`);
  if (s.styling.length > 0) parts.push(`- Styling: ${s.styling.join(", ")}`);
  if (s.orm) parts.push(`- ORM: ${s.orm}`);
  if (s.validation.length > 0)
    parts.push(`- Validation: ${s.validation.join(", ")}`);
  if (s.testing) parts.push(`- Testing: ${s.testing}`);
  if (s.typescript.present) {
    const flags = [
      s.typescript.strict && "strict",
      s.typescript.paths && "path aliases",
      s.typescript.esm && "ESM",
    ]
      .filter(Boolean)
      .join(", ");
    parts.push(`- TypeScript: present${flags ? ` (${flags})` : ""}`);
  }
  if (s.configFiles.length > 0) {
    parts.push(
      `- Config files detected: ${s.configFiles.slice(0, 6).join(", ")}${s.configFiles.length > 6 ? ` +${s.configFiles.length - 6} more` : ""}`,
    );
  }
  if (s.dirPatterns.length > 0) {
    parts.push(
      `- Directory patterns: ${s.dirPatterns.slice(0, 5).join(", ")}${s.dirPatterns.length > 5 ? ` +${s.dirPatterns.length - 5} more` : ""}`,
    );
  }
  return parts.join("\n");
}

export function renderVerificationCommands(s: StackSignals): string | null {
  const pm = s.packageManager;
  const runner =
    pm === "bun" ? "bun run" : pm === "pnpm" ? "pnpm run" : "npm run";

  const relevantKeys = [
    "build",
    "typecheck",
    "type-check",
    "test",
    "lint",
    "check",
  ];
  const found = relevantKeys.filter((k) => s.scripts[k]);
  if (found.length === 0) return null;

  const lines = found.map((k) => `${runner} ${k}    # ${s.scripts[k]}`);
  return lines.join("\n");
}

export function renderRule(r: RuleTemplate, _signals: StackSignals): string {
  const lines: string[] = [];

  lines.push(`### Rule: ${r.title}`);
  lines.push(
    `*Signal: \`${r.signal}\` · Tier: ${r.tier}${r.glob ? ` · Glob: \`${r.glob}\`` : ""}*`,
  );
  lines.push("");
  lines.push("**Why (failure mode):**");
  lines.push(r.failureMode);
  lines.push("");
  lines.push("**The rule:**");
  lines.push(r.rule);

  if (r.doExample || r.dontExample) {
    lines.push("");
    if (r.doExample) {
      lines.push("```");
      lines.push(r.doExample);
      lines.push("```");
    }
    if (r.dontExample) {
      lines.push("```");
      lines.push(r.dontExample);
      lines.push("```");
    }
  }

  if (r.seeAlso && r.seeAlso.length > 0) {
    lines.push("");
    lines.push(`*See also: ${r.seeAlso.join(", ")}*`);
  }

  return lines.join("\n");
}

export function buildDraft(
  signals: StackSignals,
  matched: RuleTemplate[],
): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`# Bootstrap Draft — ${signals.projectName}`);
  lines.push(
    `*Generated: ${date} · Project: ${signals.projectPath} · Status: **DRAFT — requires human review before adoption***`,
  );
  lines.push("");
  lines.push(
    "> ⚠️ **This file is advisory only.** Do not paste these rules directly into AGENTS.md without reviewing each one.",
  );
  lines.push(
    "> Each rule is grounded in a detected stack signal — but only you know which failure modes are actually relevant to your project.",
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Detected Stack");
  lines.push("");
  lines.push(renderStackSummary(signals));
  lines.push("");
  lines.push("---");
  lines.push("");

  if (matched.length === 0) {
    lines.push("## No Rules Generated");
    lines.push("");
    lines.push(
      "No stack signals with documented failure modes were detected. This is expected for new or minimal projects.",
    );
    lines.push(
      "Add rules manually as failure modes are observed in practice (rubric §Part 4: When to Write a Rule).",
    );
  } else {
    lines.push(`## Suggested AGENTS.md Additions (${matched.length} rules)`);
    lines.push("");
    lines.push(
      "Copy the rules you want to adopt into the appropriate section of `AGENTS.md`. Validate each one against your project's actual behavior before committing.",
    );
    lines.push("");

    for (const rule of matched) {
      lines.push(renderRule(rule, signals));
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  // Verification commands
  const cmds = renderVerificationCommands(signals);
  if (cmds) {
    lines.push("## Suggested TOOLS.md Additions");
    lines.push("");
    lines.push("### Verification Commands");
    lines.push("*Add these to the verification section of TOOLS.md:*");
    lines.push("");
    lines.push("```bash");
    lines.push(cmds);
    lines.push("```");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("## Rules Not Generated (Require Human Judgment)");
  lines.push("");
  lines.push(
    "The bootstrap generator intentionally does not generate rules for:",
  );
  lines.push("- Project-specific business logic or domain conventions");
  lines.push(
    "- Team workflow preferences (branching, PR size, review process)",
  );
  lines.push("- Performance budgets (no baseline data available)");
  lines.push("- Security posture specific to your deployment environment");
  lines.push(
    "- Any pattern not yet observed as a real failure mode in this project",
  );
  lines.push("");
  lines.push(
    "*Anvil rubric: write rules from observed failures, not anticipated ones. One occurrence → note it. Three occurrences → candidate. Cross-project → pattern.*",
  );

  return lines.join("\n");
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv: string[]) {
  let projectPath: string | null = null;
  let outputFile: string | null = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--target") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        console.error("--target requires a project path");
        process.exit(1);
      }
      projectPath = value;
      i++;
    } else if (arg === "--output") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        console.error("--output requires a file path");
        process.exit(1);
      }
      outputFile = value;
      i++;
    } else if (!arg.startsWith("--") && !projectPath) {
      projectPath = arg;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!projectPath) {
    console.error(
      "Usage: bun run scripts/bootstrap-generate.ts --target <project-path> [--output <file>]\n" +
        "       bun run scripts/bootstrap-generate.ts <project-path> [--output <file>]",
    );
    process.exit(1);
  }

  return { projectPath, outputFile };
}

export async function main() {
  const args = parseArgs(process.argv);
  const root = resolve(args.projectPath);

  if (!existsSync(root)) {
    console.error(`Project path not found: ${root}`);
    process.exit(1);
  }

  let signals: StackSignals;
  try {
    signals = await detectStack(root);
  } catch (err) {
    console.error(`Detection failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // Match templates to detected signals
  const matched = RULE_TEMPLATES.filter((t) => matchesSignal(t, signals));

  const draft = buildDraft(signals, matched);

  // Determine output path
  const date = new Date().toISOString().slice(0, 10);
  const defaultOut = join(
    process.cwd(),
    "data",
    "bootstrap-drafts",
    `${signals.projectName.replace(/[^a-z0-9-]/gi, "-")}-${date}.md`,
  );
  const outPath = args.outputFile ? resolve(args.outputFile) : defaultOut;

  // Ensure output dir exists
  const outDir = outPath.split("/").slice(0, -1).join("/");
  const mkdirProc = Bun.spawn(["mkdir", "-p", outDir], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await mkdirProc.exited;

  await Bun.write(outPath, draft);

  const templateSource =
    fileTemplates.length > 0
      ? `files (${TEMPLATES_DIR})`
      : "hardcoded fallback";
  console.log(`Bootstrap draft written: ${outPath}`);
  console.log(
    `Stack signals detected: ${signals.ui.length > 0 ? signals.ui.join(", ") : "—"} | ${signals.framework} | ${signals.packageManager}`,
  );
  console.log(
    `Rules generated: ${matched.length} of ${RULE_TEMPLATES.length} templates matched (source: ${templateSource})`,
  );
  console.log(`Matched: ${matched.map((r) => r.id).join(", ") || "(none)"}`);

  // Detect stub/placeholder project and advise re-run
  if (matched.length < 3) {
    // Check for placeholder scripts ("echo 'TODO'") across package.json files (root + workspaces)
    const pkgFiles = [join(root, "package.json")];
    // Also check workspace sub-packages up to 2 levels deep
    for (const dir of ["apps", "packages", "src"]) {
      const subDir = join(root, dir);
      if (existsSync(subDir)) {
        try {
          const { readdirSync } = await import("node:fs");
          for (const entry of readdirSync(subDir)) {
            pkgFiles.push(join(subDir, entry, "package.json"));
          }
        } catch {
          /* ignore */
        }
      }
    }

    let totalStubs = 0;
    for (const pkgPath of pkgFiles) {
      if (!existsSync(pkgPath)) {
        continue;
      }
      try {
        const pkg = JSON.parse(await Bun.file(pkgPath).text());
        const scripts: Record<string, string> = pkg.scripts ?? {};
        totalStubs += Object.values(scripts).filter(
          (s) => typeof s === "string" && /echo\s+['"]?TODO/i.test(s),
        ).length;
      } catch {
        /* ignore */
      }
    }

    if (totalStubs > 0) {
      console.log(
        `\n⚠️  Stub scripts detected: ${totalStubs} placeholder(s) found (echo 'TODO...') across workspace packages.`,
      );
      console.log(
        "   Re-run bootstrap-generate.ts after wiring the real tech stack for fuller rule coverage.",
      );
    }
  }
}

if (import.meta.main) {
  await main();
}
