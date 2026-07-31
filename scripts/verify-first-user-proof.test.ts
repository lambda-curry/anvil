import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expectedVersion,
  main,
  validatePacketText,
} from "./verify-first-user-proof.ts";

function writeTempPacket(
  name: string,
  markdown: string,
): { cleanup: () => void; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "anvil-proof-packet-"));
  const path = join(directory, name);
  writeFileSync(path, markdown);

  return {
    cleanup: () => rmSync(directory, { force: true, recursive: true }),
    path,
  };
}

function buildPacket(overrides: Partial<Record<string, string>> = {}): string {
  const fields: Record<string, string> = {
    Date: "2026-05-30",
    Tester: "Redacted external tester",
    "Outside Lambda Curry": "yes",
    "Repo tested": "redacted-real-repo",
    "Install path": "bunx",
    "Shell layout": "target repo root with `--target .`",
    "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} audit --target . --ci --output ./anvil-audit.md`,
    "Pinned CLI version": expectedVersion,
    "Observed `--version` output, if captured": `${expectedVersion}`,
    "First-try result": "success",
    "First failure, if any": "",
    "First useful next action named by tester":
      "Split one oversized AGENTS rule into a narrower file-level rule.",
    "Confusing wording or friction": "",
    "Short quote about usefulness or friction":
      '"The fix-first callout made the next cleanup obvious."',
    "Saved report path or screenshot link": "./anvil-audit.md",
    "Follow-up issue or doc fix created": "",
    ...overrides,
  };

  return `# Anvil first-user proof packet

- Date: ${fields.Date}
- Tester: ${fields.Tester}
- Outside Lambda Curry: ${fields["Outside Lambda Curry"]}
- Repo tested: ${fields["Repo tested"]}
- Install path: ${fields["Install path"]}
- Shell layout: ${fields["Shell layout"]}
- Exact command: ${fields["Exact command"]}
- Pinned CLI version: ${fields["Pinned CLI version"]}
- Observed \`--version\` output, if captured: ${fields["Observed `--version` output, if captured"]}
- First-try result: ${fields["First-try result"]}
- First failure, if any: ${fields["First failure, if any"]}
- First useful next action named by tester: ${fields["First useful next action named by tester"]}
- Confusing wording or friction: ${fields["Confusing wording or friction"]}
- Short quote about usefulness or friction: ${fields["Short quote about usefulness or friction"]}
- Saved report path or screenshot link: ${fields["Saved report path or screenshot link"]}
- Follow-up issue or doc fix created: ${fields["Follow-up issue or doc fix created"]}
`;
}

test("validator returns counts for a complete pinned proof packet", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket(),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
    expect(result.checks).toContain("outside tester confirmed");
    expect(result.checks).toContain("first run succeeded");
    expect(result.checks).toContain(
      "pinned CLI version anchors the saved proof lane",
    );
    expect(result.checks).toContain(
      "saved local report path matches retained --output path",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator accepts shell-continued bunx proof packets", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Exact command": `bunx \\
  @lambdacurry/anvil@${expectedVersion} \\
  audit \\
  --target . \\
  --ci \\
  --output ./anvil-audit.md`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
    expect(result.checks).toContain(
      "exact command stays on the pinned proof lane",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator still counts honest saved packets after current repo version drifts forward", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket(),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
      "0.1.0-alpha.99",
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
    expect(result.expectedVersion).toBe(expectedVersion);
    expect(result.checks).toContain(
      "exact command stays on the pinned proof lane",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator accepts global-install packets when they retain both install and run lines", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Install path": "global install",
      "Exact command": `bun add -g @lambdacurry/anvil@${expectedVersion}
anvil audit --target ./your-repo --ci --output ./your-repo/anvil-audit.md`,
      "Observed `--version` output, if captured": `anvil ${expectedVersion}`,
      "Shell layout": "parent directory with `--target ./repo`",
      "Saved report path or screenshot link": "./your-repo/anvil-audit.md",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
    expect(result.checks).toContain(
      "exact command stays on the pinned proof lane",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator accepts shell-continued global-install proof packets", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Install path": "global install",
      "Exact command": `bun add -g \\
  @lambdacurry/anvil@${expectedVersion}
anvil audit \\
  --target ./your-repo \\
  --ci \\
  --output ./your-repo/anvil-audit.md`,
      "Observed `--version` output, if captured": `anvil ${expectedVersion}`,
      "Shell layout": "parent directory with `--target ./repo`",
      "Saved report path or screenshot link": "./your-repo/anvil-audit.md",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
    expect(result.checks).toContain(
      "exact command stays on the pinned proof lane",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator accepts npx packets when the saved command uses npx too", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Install path": "npx",
      "Exact command": `npx @lambdacurry/anvil@${expectedVersion} audit --target ./your-repo --ci --output ./your-repo/anvil-audit.md`,
      "Shell layout": "parent directory with `--target ./repo`",
      "Saved report path or screenshot link": "./your-repo/anvil-audit.md",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
    expect(result.checks).toContain(
      "exact command stays on the pinned proof lane",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects --ci for the historical pinned alpha.4 proof lane", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Exact command":
        "bunx @lambdacurry/anvil@0.1.0-alpha.4 audit --target . --ci --output ./anvil-audit.md",
      "Pinned CLI version": "0.1.0-alpha.4",
      "Observed `--version` output, if captured": "0.1.0-alpha.4",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must keep the pinned 0.1.0-alpha.4 local-only spelling `--no-ai`",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator accepts indented global-install run lines from markdown continuation", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Install path": "global install",
      "Exact command": `bun add -g @lambdacurry/anvil@${expectedVersion}
  anvil audit --target ./your-repo --ci --output ./your-repo/anvil-audit.md`,
      "Observed `--version` output, if captured": `anvil ${expectedVersion}`,
      "Shell layout": "parent directory with `--target ./repo`",
      "Saved report path or screenshot link": "./your-repo/anvil-audit.md",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
    expect(result.checks).toContain(
      "exact command stays on the pinned proof lane",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose declared install path and saved launcher disagree", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Install path": "npx",
      "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} audit --target . --ci --output ./anvil-audit.md`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must use the `npx @lambdacurry/anvil@...` launcher when Install path is `npx`",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose optional version cross-check switches launchers", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} audit --target . --ci --output ./anvil-audit.md
npx @lambdacurry/anvil@${expectedVersion} --version`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must not mix `npx` lines into a `bunx` proof packet; keep the optional `--version` cross-check on the same install path",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets that retain both repo-root and parent-directory audit variants", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} audit --target . --ci --output ./anvil-audit.md
bunx @lambdacurry/anvil@${expectedVersion} audit --target ./your-repo --ci --output ./your-repo/anvil-audit.md`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must keep exactly one saved audit command; do not retain both repo-root and parent-directory variants in one proof packet",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose shell-layout field disagrees with the saved audit command", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Shell layout": "parent directory with `--target ./repo`",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Shell layout says `parent directory with --target ./repo`, but the saved audit command does not use a parent-directory `--target ./...` path",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose indented optional version cross-check switches from bunx to global anvil", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} audit --target . --ci --output ./anvil-audit.md
  anvil --version`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must not append bare `anvil` launcher lines to a `bunx` proof packet; keep every command on the declared install path",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets that do not count for the milestone gate", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Confusing wording or friction":
        "The launcher guidance still felt too internal.",
      "Exact command":
        "bunx @lambdacurry/anvil@alpha audit --target . --output ./anvil-audit.md",
      "First-try result": "failure",
      "Follow-up issue or doc fix created": "",
      "Observed `--version` output, if captured": "0.1.0-alpha.3",
      "Outside Lambda Curry": "no",
      "Pinned CLI version": "0.1.0-alpha.3",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toEqual(
      expect.arrayContaining([
        "Outside Lambda Curry must be `yes`",
        "First-try result must be `success` to count for Milestone 3",
        "Exact command must pin @lambdacurry/anvil@0.1.0-alpha.3",
        "Follow-up issue or doc fix created is required when friction is reported",
      ]),
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose saved local report path disagrees with the retained --output path", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Saved report path or screenshot link": "./different-report.md",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Saved report path or screenshot link must match the retained `--output` path when the packet keeps a local report artifact",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator still counts packets that keep an external artifact link instead of the local report path", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Saved report path or screenshot link":
        "https://example.com/proofs/redacted-anvil-audit.md",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
  } finally {
    packet.cleanup();
  }
});

test("validator rejects bunx packets that append a global anvil --version line", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} audit --target . --ci --output ./anvil-audit.md\nanvil --version`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must not append bare `anvil` launcher lines to a `bunx` proof packet; keep every command on the declared install path",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects npx packets that append a global anvil --version line", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Install path": "npx",
      "Exact command": `npx @lambdacurry/anvil@${expectedVersion} audit --target . --ci --output ./anvil-audit.md\nanvil --version`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must not append bare `anvil` launcher lines to a `npx` proof packet; keep every command on the declared install path",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects global-install packets that omit the pinned install line", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Install path": "global install",
      "Exact command":
        "anvil audit --target ./your-repo --ci --output ./your-repo/anvil-audit.md",
      "Observed `--version` output, if captured": `anvil ${expectedVersion}`,
      "Shell layout": "parent directory with `--target ./repo`",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      `Exact command must include the pinned global install line \`bun add -g @lambdacurry/anvil@${expectedVersion}\``,
    );
  } finally {
    packet.cleanup();
  }
});

// --- additional validation failure-path tests ---

test("validator rejects packets with an invalid install path", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({ "Install path": "docker" }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Install path must be one of `bunx`, `npx`, or `global install`",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose exact command is missing the audit subcommand", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} --target . --ci --output ./report.md`,
      "Saved report path or screenshot link": "./report.md",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must include the `audit` subcommand",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose exact command is missing --target and whose repo-root shell layout disagrees", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} audit --ci --output ./anvil-audit.md`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must include an explicit --target",
    );
    expect(result.failures).toContain(
      "Shell layout says `target repo root with --target .`, but the saved audit command does not use `--target .`",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose repo-root shell layout disagrees with a parent-directory audit command", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Shell layout": "target repo root with `--target .`",
      "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} audit --target ./my-repo --ci --output ./my-repo/anvil-audit.md`,
      "Saved report path or screenshot link": "./my-repo/anvil-audit.md",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Shell layout says `target repo root with --target .`, but the saved audit command does not use `--target .`",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose pinned CLI version is malformed", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Pinned CLI version": "latest",
      "Exact command": `bunx @lambdacurry/anvil@latest audit --target . --ci --output ./anvil-audit.md`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Pinned CLI version must be one exact published package version like 0.1.0-alpha.4",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose observed --version output disagrees with pinned version", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Observed `--version` output, if captured": "0.0.0-fake",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      `Observed --version output, when captured, must include ${expectedVersion}`,
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose shell layout is bare 'other'", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({ "Shell layout": "other" }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Shell layout cannot be bare `other`; describe the actual layout",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets that report success but also list a first failure", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({ "First failure, if any": "It crashed on the first run." }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "First failure, if any must stay empty when the first-try result is success",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects packets whose filename does not match the naming contract", () => {
  const packet = writeTempPacket("test-proof.md", buildPacket());

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "packet filename must match YYYY-MM-DD-<tester>-first-user-proof.md",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator reports missing required field content when a required-for-counts field is empty", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({ "First useful next action named by tester": "" }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "missing required field content: First useful next action named by tester",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator falls back to repo version when pinned CLI version is empty but flags the missing field", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({ "Pinned CLI version": "" }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "missing required field content: Pinned CLI version",
    );
    // getPinnedVersion still resolved the fallback version for downstream checks
    expect(result.expectedVersion).toBe(expectedVersion);
  } finally {
    packet.cleanup();
  }
});

test("validator falls back to repo version when pinned CLI version is the placeholder token but flags the missing field", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({ "Pinned CLI version": "<exact-version>" }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "missing required field content: Pinned CLI version",
    );
    // getPinnedVersion resolved the fallback via the placeholder path
    expect(result.expectedVersion).toBe(expectedVersion);
  } finally {
    packet.cleanup();
  }
});

test("validator counts packets with angle-bracket artifact references", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Saved report path or screenshot link": "<./anvil-audit.md>",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
  } finally {
    packet.cleanup();
  }
});

test("validator counts packets with backtick-wrapped artifact references", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Saved report path or screenshot link": "`./anvil-audit.md`",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
  } finally {
    packet.cleanup();
  }
});

test("validator rejects global-install packets missing the anvil audit run line", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Install path": "global install",
      "Exact command": `bun add -g @lambdacurry/anvil@${expectedVersion}`,
      "Observed `--version` output, if captured": `anvil ${expectedVersion}`,
      "Shell layout": "parent directory with `--target ./repo`",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must include the `anvil audit` run line for global install packets",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects global-install packets that mix in bunx launcher lines", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Install path": "global install",
      "Exact command": `bun add -g @lambdacurry/anvil@${expectedVersion}\nbunx @lambdacurry/anvil@${expectedVersion} audit --target . --ci --output ./anvil-audit.md`,
      "Observed `--version` output, if captured": `anvil ${expectedVersion}`,
      "Shell layout": "target repo root with `--target .`",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must not mix `bunx` or `npx` lines into a `global install` proof packet; keep every saved launcher line on the declared install path",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator rejects bunx packets that do not use the bunx launcher", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Install path": "bunx",
      "Exact command": `npx @lambdacurry/anvil@${expectedVersion} audit --target . --ci --output ./anvil-audit.md`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    expect(result.failures).toContain(
      "Exact command must use the `bunx @lambdacurry/anvil@...` launcher when Install path is `bunx`",
    );
  } finally {
    packet.cleanup();
  }
});

test("validator handles blank lines inside shell-continued commands without crashing", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} audit \\

--target . --ci --output ./anvil-audit.md`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("does-not-count");
    // The blank line splits the continuation, so the audit command loses --target/--ci/--output
    expect(result.failures.length).toBeGreaterThan(0);
  } finally {
    packet.cleanup();
  }
});

test("validator handles trailing backslash at end of command text", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Exact command": `bunx @lambdacurry/anvil@${expectedVersion} audit --target . --ci --output ./anvil-audit.md \\`,
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    // The trailing backslash leaves one pending logical line that still matches
    expect(result).toBeDefined();
  } finally {
    packet.cleanup();
  }
});

test("validator counts packets with screenshot artifact references instead of local report paths", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Saved report path or screenshot link": "screenshot.png",
    }),
  );

  try {
    const result = validatePacketText(
      readFileSync(packet.path, "utf8"),
      packet.path,
    );

    expect(result.result).toBe("counts");
    expect(result.failures).toEqual([]);
  } finally {
    packet.cleanup();
  }
});

// --- main() direct-call tests ---

const originalArgv = process.argv;
const originalExit = process.exit;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

test("main() logs counts result and exits 0 for a valid packet", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket(),
  );
  const outputs: string[] = [];
  let exitCode = -1;

  process.argv = ["node", "verify-first-user-proof.ts", packet.path];
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
  }) as typeof process.exit;
  console.log = (...args: unknown[]) => {
    outputs.push(args.map(String).join(" "));
  };
  console.error = (..._args: unknown[]) => {};

  try {
    main();

    expect(exitCode).toBe(0);
    const json = JSON.parse(outputs.join("\n"));
    expect(json.result).toBe("counts");
    expect(json.failures).toEqual([]);
    expect(json.packetPath).toBe(packet.path);
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    packet.cleanup();
  }
});

test("main() logs does-not-count result and exits 2 for an invalid packet", () => {
  const packet = writeTempPacket(
    "2026-05-30-redacted-first-user-proof.md",
    buildPacket({
      "Outside Lambda Curry": "no",
    }),
  );
  const outputs: string[] = [];
  let exitCode = -1;

  process.argv = ["node", "verify-first-user-proof.ts", packet.path];
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
  }) as typeof process.exit;
  console.log = (...args: unknown[]) => {
    outputs.push(args.map(String).join(" "));
  };
  console.error = (..._args: unknown[]) => {};

  try {
    main();

    expect(exitCode).toBe(2);
    const json = JSON.parse(outputs.join("\n"));
    expect(json.result).toBe("does-not-count");
    expect(json.failures.length).toBeGreaterThan(0);
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    packet.cleanup();
  }
});

test("main() exits 1 with usage when no arguments provided", () => {
  let exitCode = -1;
  const errors: string[] = [];

  process.argv = ["node", "verify-first-user-proof.ts"];
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error("process.exit");
  }) as typeof process.exit;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    expect(() => main()).toThrow("process.exit");
    expect(exitCode).toBe(1);
    expect(errors.some((e) => e.includes("Usage:"))).toBe(true);
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.error = originalConsoleError;
  }
});

test("main() exits 1 with usage when --help is passed", () => {
  let exitCode = -1;
  const errors: string[] = [];

  process.argv = ["node", "verify-first-user-proof.ts", "--help"];
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error("process.exit");
  }) as typeof process.exit;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    expect(() => main()).toThrow("process.exit");
    expect(exitCode).toBe(1);
    expect(errors.some((e) => e.includes("Usage:"))).toBe(true);
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.error = originalConsoleError;
  }
});

test("main() exits 1 with usage when -h is passed", () => {
  let exitCode = -1;

  process.argv = ["node", "verify-first-user-proof.ts", "-h"];
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error("process.exit");
  }) as typeof process.exit;
  console.error = (..._args: unknown[]) => {};

  try {
    expect(() => main()).toThrow("process.exit");
    expect(exitCode).toBe(1);
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.error = originalConsoleError;
  }
});

test("main() exits 1 with usage when too many arguments are provided", () => {
  let exitCode = -1;

  process.argv = [
    "node",
    "verify-first-user-proof.ts",
    "packet1.md",
    "packet2.md",
  ];
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error("process.exit");
  }) as typeof process.exit;
  console.error = (..._args: unknown[]) => {};

  try {
    expect(() => main()).toThrow("process.exit");
    expect(exitCode).toBe(1);
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.error = originalConsoleError;
  }
});
