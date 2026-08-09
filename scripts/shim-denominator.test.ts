import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { isPointerDocument } from "./lib/document-role.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");
const CLI = resolve(REPO_ROOT, "bin/anvil.ts");
const created: string[] = [];

afterAll(() => {
  for (const dir of created) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A complete rule document that passes Low-Yield on its own. */
const CANONICAL = `# Working in this repo

Last validated: 2026-08-09

**Why:** we pin the toolchain because a floating version broke the build twice,
and the breakage only surfaced in the deploy step.

**DO**
\`\`\`bash
bun install --frozen-lockfile
\`\`\`

**DON'T**
\`\`\`bash
npm install
\`\`\`
`;

/** robinhood-trader's shape: an import line plus a short note. */
const POINTER = `@AGENTS.md
@data-model.md

Read \`AGENTS.md\` first — it is canonical for this repo and everything else is
linked from its map.
`;

/** Same length as the pointer, but it is a rule document, not a redirect. */
const THIN_RULE_DOC = `# Extra Claude rules

Prefer the repo formatter over your own.
Keep generated files out of review.
Run the suite before claiming done.
`;

function makeRepo(claudeBody: string, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "AGENTS.md"), CANONICAL, "utf8");
  writeFileSync(join(dir, "CLAUDE.md"), claudeBody, "utf8");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2),
    "utf8",
  );
  writeFileSync(join(dir, "src", "index.ts"), "export const x = 1;\n", "utf8");
  return dir;
}

type StageDChecks = Record<string, string>;

async function stageDChecks(target: string): Promise<StageDChecks> {
  const proc = Bun.spawn(
    ["bun", CLI, "audit", "--target", target, "--ci", "--json"],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  // `--json` writes one progress line per discovered rule file to stderr. Both
  // pipes must be drained concurrently, or a full stderr buffer deadlocks the
  // child while we are still reading stdout.
  const [stdout] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  const report = JSON.parse(stdout) as {
    stageD: { checks: Array<{ id: string; detail: string }> };
  };
  return Object.fromEntries(
    report.stageD.checks.map((check) => [check.id, check.detail]),
  );
}

test("isPointerDocument keys on the import, not on being short", () => {
  expect(isPointerDocument(POINTER)).toBe(true);
  expect(isPointerDocument(THIN_RULE_DOC)).toBe(false);
  expect(isPointerDocument(CANONICAL)).toBe(false);
  // A mention of the file is not an import of it.
  expect(isPointerDocument("See AGENTS.md for the rules.\n")).toBe(false);
});

test("an @AGENTS.md shim is not counted as a scoring file", async () => {
  const dir = makeRepo(POINTER, "anvil-shim-pointer-");

  const checks = await stageDChecks(dir);

  // Denominator is 1, not 2: the pointer left the set entirely rather than
  // being counted and forgiven.
  expect(checks["low-yield-rules"]).toContain("0/1 scoring files");
}, 180_000);

test("the excluded shim still counts toward context load", async () => {
  // The other half of the contract, and the half that would rot silently.
  // A shim is additive for Claude — it loads the shim AND what it imports — so
  // dropping pointers from the scoring surface wholesale would undercount load
  // while leaving the Low-Yield assertion above perfectly green.
  const withPointer = await stageDChecks(makeRepo(POINTER, "anvil-shim-load-"));
  const withoutClaude = mkdtempSync(join(tmpdir(), "anvil-shim-solo-"));
  created.push(withoutClaude);
  mkdirSync(join(withoutClaude, "src"), { recursive: true });
  writeFileSync(join(withoutClaude, "AGENTS.md"), CANONICAL, "utf8");
  writeFileSync(
    join(withoutClaude, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(withoutClaude, "src", "index.ts"),
    "export const x = 1;\n",
    "utf8",
  );
  const soloChecks = await stageDChecks(withoutClaude);

  const linesOf = (detail: string): number =>
    Number.parseInt(/^(\d+) always-on lines/.exec(detail)?.[1] ?? "-1", 10);

  const withShim = linesOf(withPointer["context-load-pressure"] ?? "");
  const solo = linesOf(soloChecks["context-load-pressure"] ?? "");

  expect(solo).toBeGreaterThan(0);
  // The shim's own lines are still on the session budget.
  expect(withShim).toBeGreaterThan(solo);
}, 180_000);

test("an equally short non-pointer file is still scored", async () => {
  // The guard against 'exclude short files'. This one is the same size as the
  // shim and has neither Why nor examples, so it must still count and fail.
  const dir = makeRepo(THIN_RULE_DOC, "anvil-shim-thin-");

  const checks = await stageDChecks(dir);

  expect(checks["low-yield-rules"]).toContain("1/2 scoring files");
}, 180_000);
