import { expect, test } from "bun:test";

import { assertGitHubCliAvailable } from "./mine-pr-rules.ts";

test("missing GitHub CLI produces actionable setup guidance", () => {
  expect(() =>
    assertGitHubCliAvailable("/definitely/missing-anvil-gh"),
  ).toThrow(
    "GitHub CLI (gh) was not found or could not run. Install it from https://cli.github.com and run `gh auth login`.",
  );
});
