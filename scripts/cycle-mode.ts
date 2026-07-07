#!/usr/bin/env bun
const disableLocal = process.env.CHARTER_MODE_DISABLE_LOCAL === "1";

if (!disableLocal) {
  const bootstrap = Bun.spawn({
    cmd: ["bun", "run", "./scripts/bootstrap-cycle-memory.ts"],
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  const bootstrapExitCode = await bootstrap.exited;
  if (bootstrapExitCode !== 0) {
    process.exit(bootstrapExitCode);
  }
}

// Intentionally resolve the shared selector relative to the active project cwd.
// In Scout's workspace layout, charters run from <workspace>/projects/<project>,
// so ../../scripts/charter-cycle-mode.ts must follow the workspace layout rather
// than this file's checkout path.
const proc = Bun.spawn({
  cmd: [
    "bun",
    "run",
    "../../scripts/charter-cycle-mode.ts",
    ...Bun.argv.slice(2),
  ],
  cwd: process.cwd(),
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
  env: {
    ...process.env,
    CHARTER_MODE_DISABLE_LOCAL: "1",
  },
});

const exitCode = await proc.exited;
process.exit(exitCode);
