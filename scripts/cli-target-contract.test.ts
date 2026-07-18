import { expect, test } from "bun:test";

import { parseArgs as parseBootstrapArgs } from "./bootstrap-generate.ts";
import { parseArgs as parseDriftArgs } from "./drift-detect.ts";

test("drift accepts --target while preserving the positional form", () => {
  expect(
    parseDriftArgs([
      "bun",
      "drift",
      "--target",
      "./repo",
      "--output",
      "drift.md",
    ]),
  ).toEqual({
    projectPath: "./repo",
    extraSkipDirs: [],
    outputFile: "drift.md",
  });
  expect(parseDriftArgs(["bun", "drift", "./repo"])).toEqual({
    projectPath: "./repo",
    extraSkipDirs: [],
    outputFile: null,
  });
});

test("bootstrap accepts --target while preserving the positional form", () => {
  expect(
    parseBootstrapArgs([
      "bun",
      "bootstrap",
      "--target",
      "./repo",
      "--output",
      "draft.md",
    ]),
  ).toEqual({ projectPath: "./repo", outputFile: "draft.md" });
  expect(parseBootstrapArgs(["bun", "bootstrap", "./repo"])).toEqual({
    projectPath: "./repo",
    outputFile: null,
  });
});
