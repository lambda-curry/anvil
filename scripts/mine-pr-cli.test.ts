import { expect, test } from "bun:test";

import {
  assertGitHubCliAvailable,
  githubCliEnv,
  parseGhGraphqlStdout,
} from "./mine-pr-rules.ts";

test("missing GitHub CLI produces actionable setup guidance", () => {
  expect(() =>
    assertGitHubCliAvailable("/definitely/missing-anvil-gh"),
  ).toThrow(
    "GitHub CLI (gh) was not found or could not run. Install it from https://cli.github.com and run `gh auth login`.",
  );
});

const PLAIN_GRAPHQL = '{"data":{"viewer":{"login":"jaruesink"}}}\n';
const COLORED_GRAPHQL =
  '\u001b[1;37m{\u001b[m\n  \u001b[1;34m"data"\u001b[m\u001b[1;37m:\u001b[m \u001b[1;37m{\u001b[m\n    \u001b[1;34m"viewer"\u001b[m\u001b[1;37m:\u001b[m \u001b[1;37m{\u001b[m\n      \u001b[1;34m"login"\u001b[m\u001b[1;37m:\u001b[m \u001b[32m"jaruesink"\u001b[m\n    \u001b[1;37m}\u001b[m\n  \u001b[1;37m}\u001b[m\n\u001b[1;37m}\u001b[m\n';

test("parseGhGraphqlStdout accepts plain JSON", () => {
  expect(parseGhGraphqlStdout(PLAIN_GRAPHQL)).toEqual({
    data: { viewer: { login: "jaruesink" } },
  });
});

test("parseGhGraphqlStdout accepts ANSI-colored JSON from a FORCE_COLOR gh spawn", () => {
  expect(() => JSON.parse(COLORED_GRAPHQL)).toThrow();
  expect(parseGhGraphqlStdout(COLORED_GRAPHQL)).toEqual({
    data: { viewer: { login: "jaruesink" } },
  });
});

test("parseGhGraphqlStdout throws with a preview when stdout is not JSON", () => {
  expect(() => parseGhGraphqlStdout("not-json")).toThrow(
    'Failed to parse JSON from gh api graphql. First bytes: "not-json"',
  );
});

test("parseGhGraphqlStdout throws when stdout is empty", () => {
  expect(() => parseGhGraphqlStdout("   ")).toThrow(
    "Failed to parse JSON from gh api graphql. stdout was empty.",
  );
});

test("githubCliEnv disables color even when the parent forced it", () => {
  const env = githubCliEnv({
    PATH: "/usr/bin",
    FORCE_COLOR: "1",
    CLICOLOR: "1",
    CLICOLOR_FORCE: "1",
    NO_COLOR: "1",
    GH_TOKEN: "secret",
  });

  expect(env.FORCE_COLOR).toBeUndefined();
  expect(env.CLICOLOR).toBeUndefined();
  expect(env.CLICOLOR_FORCE).toBeUndefined();
  expect(env.NO_COLOR).toBe("1");
  expect(env.GH_FORCE_TTY).toBe("0");
  expect(env.PATH).toBe("/usr/bin");
  expect(env.GH_TOKEN).toBe("secret");
});
