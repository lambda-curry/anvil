import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

type VerificationStep = {
  command: string[];
  label: string;
};

const VERIFICATION_STEPS: VerificationStep[] = [
  {
    label: "proof-lane docs validator",
    command: ["bun", "run", "verify:proof-lane-docs"],
  },
  {
    label: "first-user-proof validator tests",
    command: ["bun", "test", "scripts/verify-first-user-proof.test.ts"],
  },
  {
    label: "proof-lane docs tests",
    command: ["bun", "test", "scripts/first-user-proof-docs.test.ts"],
  },
  {
    label: "published CLI contract tests",
    command: ["bun", "test", "scripts/published-cli-contract.test.ts"],
  },
];

function main(): void {
  for (const step of VERIFICATION_STEPS) {
    console.log(`==> ${step.label}`);

    const run = Bun.spawnSync(step.command, {
      cwd: REPO_ROOT,
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    });

    if (run.exitCode !== 0) {
      process.exit(run.exitCode);
    }
  }
}

if (import.meta.main) {
  main();
}
