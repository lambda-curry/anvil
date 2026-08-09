import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const CLI = resolve(REPO_ROOT, "bin/anvil.ts");
const created: string[] = [];

afterAll(() => {
  for (const dir of created) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function line(n: number, text: string): string {
  return `${Array.from({ length: n }, (_, i) => `${text} ${i + 1}`).join("\n")}\n`;
}

/**
 * A repo shaped like `budgets`: an always-on root file, a chain-loaded nested
 * AGENTS.md, and a `paths:`-scoped tool-native rule. Only the root file is
 * resident at session start.
 */
function makeFixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "anvil-load-fixture-"));
  created.push(dir);

  mkdirSync(join(dir, "apps", "web"), { recursive: true });
  mkdirSync(join(dir, ".claude", "rules"), { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });

  writeFileSync(
    join(dir, "AGENTS.md"),
    `# Root rules\n\nLast validated: 2026-08-09\n\n## Why\n\nWe pin the toolchain because a floating version broke the build twice.\n\n\`\`\`bash\nbun install\n\`\`\`\n\n${line(20, "- root rule")}`,
    "utf8",
  );

  writeFileSync(
    join(dir, "apps", "web", "AGENTS.md"),
    `# Web rules\n\n${line(60, "- web rule")}`,
    "utf8",
  );

  writeFileSync(
    join(dir, ".claude", "rules", "apps-web.md"),
    `---\npaths:\n  - apps/web/**/*\n---\n# Web scoped rules\n\n${line(80, "- scoped rule")}`,
    "utf8",
  );

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2),
    "utf8",
  );
  writeFileSync(join(dir, "src", "index.ts"), "export const x = 1;\n", "utf8");

  return dir;
}

async function auditJson(target: string): Promise<{
  overkill: { alwaysOnLines: number };
}> {
  const proc = Bun.spawn(
    ["bun", CLI, "audit", "--target", target, "--ci", "--json"],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  // Drain both pipes concurrently: `--json` emits per-file progress on stderr,
  // and a full stderr buffer would deadlock the child while we read stdout.
  const [stdout] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return JSON.parse(stdout) as { overkill: { alwaysOnLines: number } };
}

test("only the root instruction file counts toward always-on load", async () => {
  const dir = makeFixtureRepo();
  const report = await auditJson(dir);

  // Root file is ~30 lines; the nested (60) and path-scoped (80+4) files are
  // lazily loaded and must not be counted. Before the loading model, this
  // reported the sum of all three.
  expect(report.overkill.alwaysOnLines).toBeGreaterThan(0);
  expect(report.overkill.alwaysOnLines).toBeLessThan(60);
}, 180_000);

test("moving the same content into root raises always-on load", async () => {
  // The counterweight: the fix must not simply make every repo pass. A repo
  // that keeps everything resident still pays for it.
  const dir = mkdtempSync(join(tmpdir(), "anvil-load-fixture-root-"));
  created.push(dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "AGENTS.md"),
    `# Root rules\n\nLast validated: 2026-08-09\n\n## Why\n\nEverything lives here because we never split it, which meant one huge file.\n\n\`\`\`bash\nbun install\n\`\`\`\n\n${line(800, "- root rule")}`,
    "utf8",
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture-root", version: "1.0.0" }, null, 2),
    "utf8",
  );
  writeFileSync(join(dir, "src", "index.ts"), "export const x = 1;\n", "utf8");

  const report = await auditJson(dir);

  expect(report.overkill.alwaysOnLines).toBeGreaterThan(700);
}, 180_000);
