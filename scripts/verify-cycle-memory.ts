#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const TZ = "America/Chicago";
const FIXED_NOW = "2026-03-21T14:05:00.000Z";

const dateAndTimeStampForTz = (tz: string, now: Date) => {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });

  const [year, month, day] = dateFormatter.format(now).split("-");
  return {
    dateStamp: `${year}-${month}-${day}`,
    timeStamp: timeFormatter.format(now),
  };
};

const verifyBootstrap = async () => {
  const repoRoot = path.resolve(import.meta.dir, "..");
  const bootstrapScript = path.resolve(
    repoRoot,
    "scripts",
    "bootstrap-cycle-memory.ts",
  );
  const tempRoot = mkdtempSync(
    path.join(os.tmpdir(), "anvil-cycle-bootstrap-"),
  );
  const validProjectRoot = path.join(tempRoot, "valid-project");
  const invalidProjectRoot = path.join(tempRoot, "invalid-project");

  mkdirSync(validProjectRoot, { recursive: true });
  mkdirSync(invalidProjectRoot, { recursive: true });

  const fixedNow = new Date(FIXED_NOW);
  const { dateStamp, timeStamp } = dateAndTimeStampForTz(TZ, fixedNow);
  const memoryPath = path.join(validProjectRoot, "memory", `${dateStamp}.md`);

  const runBootstrap = async (cwd: string, nowOverride: string) => {
    const bootstrap = Bun.spawn({
      cmd: ["bun", "run", bootstrapScript],
      cwd,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
      env: {
        ...process.env,
        CYCLE_MEMORY_NOW: nowOverride,
      },
    });

    return bootstrap.exited;
  };

  try {
    const firstExitCode = await runBootstrap(validProjectRoot, FIXED_NOW);
    if (firstExitCode !== 0) {
      console.error(`Bootstrap exited with code ${firstExitCode}`);
      process.exit(firstExitCode);
    }

    if (!existsSync(memoryPath)) {
      console.error(`Expected memory file to exist: ${memoryPath}`);
      process.exit(1);
    }

    const firstContent = readFileSync(memoryPath, "utf8");
    const requiredSnippets = [
      `# ${dateStamp}`,
      "## Sessions",
      `### ${dateStamp} ${timeStamp} CT — <cycle type> (<outcome>)`,
      "- Context:",
      "- Actions:",
      "- Follow-up:",
    ];

    const missing = requiredSnippets.filter(
      (snippet) => !firstContent.includes(snippet),
    );
    if (missing.length > 0) {
      console.error(
        `Memory file is missing expected content: ${missing.join(", ")}`,
      );
      process.exit(1);
    }

    const secondExitCode = await runBootstrap(validProjectRoot, FIXED_NOW);
    if (secondExitCode !== 0) {
      console.error(`Second bootstrap exited with code ${secondExitCode}`);
      process.exit(secondExitCode);
    }

    const secondContent = readFileSync(memoryPath, "utf8");
    if (firstContent !== secondContent) {
      console.error(
        "Expected second bootstrap run to be idempotent (file content changed)",
      );
      process.exit(1);
    }

    const invalidExitCode = await runBootstrap(
      invalidProjectRoot,
      "not-a-valid-timestamp",
    );
    if (invalidExitCode === 0) {
      console.error("Expected bootstrap to fail for invalid CYCLE_MEMORY_NOW");
      process.exit(1);
    }

    console.log(
      `Verified cycle memory bootstrap deterministically for ${dateStamp}: create + idempotent re-run + invalid timestamp rejection.`,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

const verifyHandoffGuard = async () => {
  const repoRoot = path.resolve(import.meta.dir, "..");
  const cycleModeScript = path.resolve(repoRoot, "scripts", "cycle-mode.ts");
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "anvil-cycle-handoff-"));

  const fakeWorkspaceRoot = path.join(tempRoot, "workspace");
  const fakeProjectRoot = path.join(fakeWorkspaceRoot, "projects", "anvil");
  const fakeProjectScripts = path.join(fakeProjectRoot, "scripts");
  const fakeSharedScripts = path.join(fakeWorkspaceRoot, "scripts");
  const markerDir = path.join(fakeWorkspaceRoot, "markers");

  mkdirSync(fakeProjectScripts, { recursive: true });
  mkdirSync(fakeSharedScripts, { recursive: true });
  mkdirSync(markerDir, { recursive: true });

  const bootstrapMarker = path.join(markerDir, "bootstrap.txt");
  const handoffMarker = path.join(markerDir, "handoff.json");

  const writeBootstrapScript = ({ fail }: { fail: boolean }) => {
    writeFileSync(
      path.join(fakeProjectScripts, "bootstrap-cycle-memory.ts"),
      fail
        ? `#!/usr/bin/env bun
console.error("bootstrap-failed-on-purpose");
process.exit(7);
`
        : `#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(bootstrapMarker)}, "bootstrap-ran");
`,
      "utf8",
    );
  };

  const writeSharedScript = ({ fail }: { fail: boolean }) => {
    writeFileSync(
      path.join(fakeSharedScripts, "charter-cycle-mode.ts"),
      fail
        ? `#!/usr/bin/env bun
process.exit(9);
`
        : `#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
const payload = {
  disableLocal: process.env.CHARTER_MODE_DISABLE_LOCAL ?? null,
  args: Bun.argv.slice(2),
};
writeFileSync(${JSON.stringify(handoffMarker)}, JSON.stringify(payload, null, 2));
process.exit(payload.disableLocal === "1" ? 0 : 2);
`,
      "utf8",
    );
  };

  const runProbe = async ({
    disableLocal,
    bootstrapShouldFail = false,
    sharedShouldFail = false,
    expectedExitCode = 0,
  }: {
    disableLocal: boolean;
    bootstrapShouldFail?: boolean;
    sharedShouldFail?: boolean;
    expectedExitCode?: number;
  }) => {
    rmSync(bootstrapMarker, { force: true });
    rmSync(handoffMarker, { force: true });
    writeBootstrapScript({ fail: bootstrapShouldFail });
    writeSharedScript({ fail: sharedShouldFail });

    const proc = Bun.spawn({
      cmd: ["bun", "run", cycleModeScript, "--probe-arg"],
      cwd: fakeProjectRoot,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
      env: disableLocal
        ? {
            ...process.env,
            CHARTER_MODE_DISABLE_LOCAL: "1",
          }
        : process.env,
    });

    const exitCode = await proc.exited;
    if (exitCode !== expectedExitCode) {
      console.error(
        `Expected cycle-mode to exit ${expectedExitCode}, got ${exitCode}`,
      );
      process.exit(1);
    }

    if (expectedExitCode !== 0) {
      return;
    }

    const handoffEvidence = JSON.parse(readFileSync(handoffMarker, "utf8")) as {
      disableLocal: string | null;
      args: string[];
    };

    if (handoffEvidence.disableLocal !== "1") {
      console.error(
        "Expected CHARTER_MODE_DISABLE_LOCAL=1 to be propagated to shared handoff",
      );
      process.exit(1);
    }

    if (!handoffEvidence.args.includes("--probe-arg")) {
      console.error(
        "Expected cycle-mode arguments to be forwarded to shared handoff",
      );
      process.exit(1);
    }

    const bootstrapRan = existsSync(bootstrapMarker);
    if (!disableLocal && !bootstrapRan) {
      console.error(
        "Expected bootstrap marker to confirm local bootstrap execution",
      );
      process.exit(1);
    }

    if (disableLocal && bootstrapRan) {
      console.error(
        "Expected guarded re-entry to skip the local bootstrap step",
      );
      process.exit(1);
    }
  };

  try {
    await runProbe({ disableLocal: false });
    await runProbe({ disableLocal: true });
    await runProbe({
      disableLocal: false,
      bootstrapShouldFail: true,
      expectedExitCode: 7,
    });
    await runProbe({
      disableLocal: true,
      sharedShouldFail: true,
      expectedExitCode: 9,
    });

    console.log(
      "Verified cycle-mode handoff: bootstrap runs on normal entry, skips on guarded re-entry, args forwarded, recursion guard propagated, and failure exit codes are preserved.",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

const args = new Set(Bun.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log(`Usage:
  bun run ./scripts/verify-cycle-memory.ts
  bun run ./scripts/verify-cycle-memory.ts --handoff
  bun run ./scripts/verify-cycle-memory.ts --all`);
  process.exit(0);
}

const runBootstrap = args.size === 0 || args.has("--all");
const runHandoff = args.has("--handoff") || args.has("--all");

if (!runBootstrap && !runHandoff) {
  console.error("Unsupported flags. Use --help.");
  process.exit(1);
}

if (runBootstrap) {
  await verifyBootstrap();
}

if (runHandoff) {
  await verifyHandoffGuard();
}
