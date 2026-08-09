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

async function lowYieldDetail(target: string): Promise<string> {
  const proc = Bun.spawn(
    ["bun", CLI, "audit", "--target", target, "--ci", "--json"],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  const report = JSON.parse(stdout) as {
    stageD: { checks: Array<{ id: string; detail: string }> };
  };
  const check = report.stageD.checks.find((c) => c.id === "low-yield-rules");
  return check?.detail ?? "";
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

  const detail = await lowYieldDetail(dir);

  // Denominator is 1, not 2: the pointer left the set entirely rather than
  // being counted and forgiven.
  expect(detail).toContain("0/1 scoring files");
}, 180_000);

test("an equally short non-pointer file is still scored", async () => {
  // The guard against 'exclude short files'. This one is the same size as the
  // shim and has neither Why nor examples, so it must still count and fail.
  const dir = makeRepo(THIN_RULE_DOC, "anvil-shim-thin-");

  const detail = await lowYieldDetail(dir);

  expect(detail).toContain("1/2 scoring files");
}, 180_000);
