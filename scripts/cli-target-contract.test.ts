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
    artifactsDir: null,
  });
  expect(parseDriftArgs(["bun", "drift", "./repo"])).toEqual({
    projectPath: "./repo",
    extraSkipDirs: [],
    outputFile: null,
    artifactsDir: null,
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

test("drift accepts --artifacts-dir, and --output still wins", () => {
  // audit already had --artifacts-dir; drift only had --output, so the default
  // landed in whatever directory you happened to be standing in.
  expect(
    parseDriftArgs(["bun", "drift", "./repo", "--artifacts-dir", "/tmp/out"]),
  ).toEqual({
    projectPath: "./repo",
    extraSkipDirs: [],
    outputFile: null,
    artifactsDir: "/tmp/out",
  });

  const both = parseDriftArgs([
    "bun",
    "drift",
    "./repo",
    "--artifacts-dir",
    "/tmp/out",
    "--output",
    "/tmp/exact.md",
  ]);
  expect(both.outputFile).toBe("/tmp/exact.md");
  expect(both.artifactsDir).toBe("/tmp/out");
});
