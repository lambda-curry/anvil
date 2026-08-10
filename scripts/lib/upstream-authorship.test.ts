import { afterAll, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveUpstreamRef,
  upstreamAuthoredFiles,
} from "./upstream-authorship.ts";
import {
  cleanupFixtures,
  commitFile,
  gitOrThrow,
  makeRepo,
  makeTempDir,
} from "../__tests__/git-fixtures.ts";

afterAll(() => {
  cleanupFixtures();
});

/** A fork with an `upstream` remote pointing at a local bare repo. */
function makeFork(): { fork: string } {
  const upstream = makeTempDir("anvil-upstream-");
  gitOrThrow(upstream, ["init", "--bare", "--initial-branch", "main", "-q"]);

  const seed = makeRepo();
  commitFile(seed, "CLAUDE.md", "# Upstream rules\n\nTheirs.\n", "docs: rules");
  gitOrThrow(seed, ["remote", "add", "origin", upstream]);
  gitOrThrow(seed, ["push", "-q", "-u", "origin", "main"]);

  const fork = makeTempDir("anvil-fork-");
  gitOrThrow(fork, ["clone", "-q", upstream, "."]);
  gitOrThrow(fork, ["config", "user.name", "Anvil Fixture"]);
  gitOrThrow(fork, ["config", "user.email", "fixture@example.invalid"]);
  gitOrThrow(fork, ["remote", "add", "upstream", upstream]);
  gitOrThrow(fork, ["fetch", "-q", "upstream"]);
  return { fork };
}

test("no upstream remote means the check never fires", () => {
  const plain = makeRepo();

  expect(resolveUpstreamRef(plain)).toBeNull();
  expect(upstreamAuthoredFiles(plain).size).toBe(0);
});

test("an untouched upstream file is upstream-authored", () => {
  const { fork } = makeFork();

  expect(upstreamAuthoredFiles(fork).has("CLAUDE.md")).toBe(true);
});

test("a file we renamed but did not write is still upstream's", () => {
  // Our own contract: rename CLAUDE.md -> AGENTS.md on every fork so Codex can
  // read it. That gives the file a local commit and no counterpart at its own
  // path upstream, so path-and-history alone calls upstream's document ours.
  const { fork } = makeFork();
  gitOrThrow(fork, ["mv", "CLAUDE.md", "AGENTS.md"]);
  gitOrThrow(fork, ["commit", "-q", "-m", "chore: make AGENTS.md canonical"]);

  const authored = upstreamAuthoredFiles(fork);

  expect(authored.has("AGENTS.md")).toBe(true);
});

test("editing one character drops the exemption", () => {
  // The bound comes from construction: git's blob hash IS the content, so any
  // edit diverges the hash and the file becomes ours to answer for.
  const { fork } = makeFork();
  gitOrThrow(fork, ["mv", "CLAUDE.md", "AGENTS.md"]);
  writeFileSync(join(fork, "AGENTS.md"), "# Upstream rules\n\nOurs now.\n");
  gitOrThrow(fork, ["add", "--", "AGENTS.md"]);
  gitOrThrow(fork, ["commit", "-q", "-m", "docs: our own guidance"]);

  expect(upstreamAuthoredFiles(fork).has("AGENTS.md")).toBe(false);
});

test("a file we authored ourselves is never exempt", () => {
  const { fork } = makeFork();
  commitFile(fork, "OURS.md", "# Ours\n", "docs: ours");

  expect(upstreamAuthoredFiles(fork).has("OURS.md")).toBe(false);
});
