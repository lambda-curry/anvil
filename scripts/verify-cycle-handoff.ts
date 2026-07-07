#!/usr/bin/env bun
const proc = Bun.spawn({
  cmd: ["bun", "run", "./scripts/verify-cycle-memory.ts", "--handoff"],
  cwd: process.cwd(),
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const exitCode = await proc.exited;
process.exit(exitCode);
