import { expect, test } from "bun:test";
import { threeLineOpener } from "./proof-lane-contract.ts";
import {
  expectedVersion,
  validateProofLaneDocs,
} from "./verify-proof-lane-docs.ts";

test("public proof-lane docs keep one local-only contract", () => {
  const result = validateProofLaneDocs();
  const requiredChecks = [
    "index.mdx keeps homepage first-audit block block 1 on the expected wrapped command lines",
    "first-audit.md contains not for pinned proof collection",
    `first-user-proof.md contains ${threeLineOpener[0]}`,
    "first-user-proof.md keeps first-user-proof guide block 1 on the expected wrapped command lines",
    "first-user-proof-packet.md contains one repo-root saved-report command",
    `cli.md contains current \`${expectedVersion}\` packet uses the public \`--ci\` spelling`,
    "llms-full.txt contains https://lambda-curry.github.io/anvil/guides/first-user-proof-packet",
    "llms-full.txt keeps llms-full first-user-proof handoff block 1 on the expected wrapped command lines",
    "llms-full.txt keeps llms-full proof-packet handoff block 1 on the expected wrapped command lines",
    "current-outside-tester-send-packet.md contains Do not swap the tester onto the floating `@alpha` tag.",
    "current-outside-tester-send-packet.md contains Send back whether it worked first try",
    "current-outside-tester-send-packet.md keeps current-outside-tester send packet block 1 on the expected plain command lines",
    "current-outside-tester-send-packet.md omits @lambdacurry/anvil@alpha",
  ];

  expect(result.failures).toEqual([]);

  for (const check of requiredChecks) {
    expect(result.checks.some((entry) => entry.includes(check))).toBe(true);
  }
});
