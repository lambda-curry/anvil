import { expect, test } from "bun:test";
import { threeLineOpener } from "./proof-lane-contract.ts";
import {
  expectedVersion,
  extractBashBlocks,
  getSectionText,
  main,
  validateCodeBlock,
  validateProofLaneDocs,
} from "./verify-proof-lane-docs.ts";

// ---------------------------------------------------------------------------
// Integration: real docs pass validation
// ---------------------------------------------------------------------------

test("public proof-lane docs keep one local-only contract", () => {
  const result = validateProofLaneDocs();
  const requiredChecks = [
    "index.mdx keeps homepage first-audit block block 1 on the expected wrapped command lines",
    "first-audit.md contains not for pinned proof collection",
    `first-user-proof.md contains ${threeLineOpener[0]}`,
    "first-user-proof-packet.md contains repo-root saved-report command",
    `cli.md contains current \`${expectedVersion}\` packet uses the public \`--ci\` spelling`,
    "llms-full.txt contains keep using the exact pinned",
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

// ---------------------------------------------------------------------------
// getSectionText
// ---------------------------------------------------------------------------

test("getSectionText extracts text between markers", () => {
  const text = "intro\n## Start\ncommand lines\n<CardGrid>";
  const result = getSectionText(text, "## Start", "<CardGrid>");
  expect(result).toBe("## Start\ncommand lines\n");
});

test("getSectionText returns null when section marker is missing", () => {
  const text = "intro\nno markers here\n";
  const result = getSectionText(text, "## Start", "<CardGrid>");
  expect(result).toBeNull();
});

test("getSectionText returns null when end marker is missing", () => {
  const text = "intro\n## Start\ncommand lines\nno end marker";
  const result = getSectionText(text, "## Start", "<CardGrid>");
  expect(result).toBeNull();
});

test("getSectionText handles markers at string boundaries", () => {
  const text = "## Start\ncontent";
  // End marker not present after start
  expect(getSectionText(text, "## Start", "## End")).toBeNull();
});

// ---------------------------------------------------------------------------
// extractBashBlocks
// ---------------------------------------------------------------------------

test("extractBashBlocks extracts plain bash blocks", () => {
  const section = "Some intro\n```bash\nbunx run foo\n```\nafter\n";
  const blocks = extractBashBlocks(section, "plain");
  expect(blocks).toEqual([["bunx run foo"]]);
});

test("extractBashBlocks extracts wrapped bash blocks", () => {
  const section = "```bash wrap\nbunx \\\n  foo \\\n  --bar\n```\n";
  const blocks = extractBashBlocks(section, "wrapped");
  expect(blocks).toEqual([["bunx \\", "  foo \\", "  --bar"]]);
});

test("extractBashBlocks returns empty array when no blocks match", () => {
  const section = "no code blocks here\njust text\n";
  expect(extractBashBlocks(section, "plain")).toEqual([]);
  expect(extractBashBlocks(section, "wrapped")).toEqual([]);
});

test("extractBashBlocks extracts multiple blocks", () => {
  const section =
    "```bash\nfirst\n```\ntext\n```bash\nsecond\n```\n```bash wrap\nthird\n```\n";
  expect(extractBashBlocks(section, "plain")).toEqual([["first"], ["second"]]);
  expect(extractBashBlocks(section, "wrapped")).toEqual([["third"]]);
});

test("extractBashBlocks does not match wrapped style in plain mode", () => {
  const section = "```bash wrap\nnot plain\n```\n";
  expect(extractBashBlocks(section, "plain")).toEqual([]);
});

test("extractBashBlocks does not match plain style in wrapped mode", () => {
  const section = "```bash\nnot wrapped\n```\n";
  expect(extractBashBlocks(section, "wrapped")).toEqual([]);
});

// ---------------------------------------------------------------------------
// validateCodeBlock
// ---------------------------------------------------------------------------

const sampleContract = {
  label: "test-block",
  path: "/fake/path.md",
  sectionMarker: "## Command",
  endMarker: "## Next",
  expectedBlocks: [["bunx run audit"]],
  style: "plain" as const,
};

test("validateCodeBlock passes when block matches", () => {
  const text = "## Command\n```bash\nbunx run audit\n```\n## Next\n";
  const result = validateCodeBlock(text, sampleContract);
  expect(result.failures).toEqual([]);
  expect(result.checks).toHaveLength(1);
  expect(result.checks[0]).toContain("keeps test-block block 1");
});

test("validateCodeBlock fails when section markers are missing", () => {
  const text = "no relevant section\n```bash\nbunx run audit\n```\n";
  const result = validateCodeBlock(text, sampleContract);
  expect(result.failures).toEqual([
    "/fake/path.md is missing the proof-packet section markers",
  ]);
  expect(result.checks).toEqual([]);
});

test("validateCodeBlock fails when section marker found but end marker missing", () => {
  const text = "## Command\n```bash\nbunx run audit\n```\nno end marker";
  const result = validateCodeBlock(text, sampleContract);
  expect(result.failures).toEqual([
    "/fake/path.md is missing the proof-packet section markers",
  ]);
});

test("validateCodeBlock fails when no bash blocks in section", () => {
  const text = "## Command\njust text, no blocks\n## Next\n";
  const result = validateCodeBlock(text, sampleContract);
  expect(result.failures).toEqual([
    "/fake/path.md is missing expected plain proof-lane bash blocks",
  ]);
});

test("validateCodeBlock fails when block content drifts", () => {
  const text = "## Command\n```bash\nnpx different-command\n```\n## Next\n";
  const result = validateCodeBlock(text, sampleContract);
  expect(result.failures).toEqual([
    "/fake/path.md test-block block 1 drifted from the narrow-screen command layout",
  ]);
});

test("validateCodeBlock handles multiple expected blocks", () => {
  const contract = {
    label: "multi-block",
    path: "/fake/multi.md",
    sectionMarker: "## Start",
    endMarker: "## End",
    expectedBlocks: [["command-one"], ["command-two"]],
    style: "plain" as const,
  };
  const text =
    "## Start\n```bash\ncommand-one\n```\nmid\n```bash\ncommand-two\n```\n## End\n";
  const result = validateCodeBlock(text, contract);
  expect(result.failures).toEqual([]);
  expect(result.checks).toHaveLength(2);
});

test("validateCodeBlock detects when second block drifts", () => {
  const contract = {
    label: "multi-block",
    path: "/fake/multi.md",
    sectionMarker: "## Start",
    endMarker: "## End",
    expectedBlocks: [["command-one"], ["command-two"]],
    style: "plain" as const,
  };
  const text =
    "## Start\n```bash\ncommand-one\n```\nmid\n```bash\nwrong\n```\n## End\n";
  const result = validateCodeBlock(text, contract);
  expect(result.failures).toEqual([
    "/fake/multi.md multi-block block 2 drifted from the narrow-screen command layout",
  ]);
  expect(result.checks).toHaveLength(1);
});

test("validateCodeBlock enforces maxLineLength when exceeded", () => {
  const contract = {
    label: "narrow",
    path: "/fake/narrow.md",
    sectionMarker: "## Cmd",
    endMarker: "## Done",
    expectedBlocks: [["a-very-long-command-that-exceeds-the-limit"]],
    style: "plain" as const,
    maxLineLength: 10,
  };
  const text =
    "## Cmd\n```bash\na-very-long-command-that-exceeds-the-limit\n```\n## Done\n";
  const result = validateCodeBlock(text, contract);
  expect(result.failures).toContain(
    "/fake/narrow.md proof-packet block 1 exceeds 10 chars on one line",
  );
  // Block still matched, so check is present
  expect(result.checks.some((c) => c.includes("keeps narrow block 1"))).toBe(
    true,
  );
});

test("validateCodeBlock passes maxLineLength when within bounds", () => {
  const contract = {
    label: "narrow",
    path: "/fake/narrow.md",
    sectionMarker: "## Cmd",
    endMarker: "## Done",
    expectedBlocks: [["short"]],
    style: "plain" as const,
    maxLineLength: 100,
  };
  const text = "## Cmd\n```bash\nshort\n```\n## Done\n";
  const result = validateCodeBlock(text, contract);
  expect(result.failures).toEqual([]);
  expect(result.checks).toContain(
    "/fake/narrow.md keeps narrow block 1 within 100 chars per line",
  );
});

test("validateCodeBlock works with wrapped style", () => {
  const contract = {
    label: "wrapped-block",
    path: "/fake/wrapped.md",
    sectionMarker: "## Section",
    endMarker: "## After",
    expectedBlocks: [["bunx \\", "  audit"]],
    style: "wrapped" as const,
  };
  const text = "## Section\n```bash wrap\nbunx \\\n  audit\n```\n## After\n";
  const result = validateCodeBlock(text, contract);
  expect(result.failures).toEqual([]);
  expect(result.checks[0]).toContain("keeps wrapped-block block 1");
});

test("validateCodeBlock does not enforce maxLineLength when undefined", () => {
  const contract = {
    label: "no-limit",
    path: "/fake/no-limit.md",
    sectionMarker: "## Cmd",
    endMarker: "## Done",
    expectedBlocks: [["any-length-command-here"]],
    style: "plain" as const,
  };
  const text = "## Cmd\n```bash\nany-length-command-here\n```\n## Done\n";
  const result = validateCodeBlock(text, contract);
  expect(result.failures).toEqual([]);
  // No maxLineLength check should appear
  expect(result.checks.some((c) => c.includes("within"))).toBe(false);
});

test("validateCodeBlock reports missing when fewer blocks found than expected", () => {
  const contract = {
    label: "multi",
    path: "/fake/missing.md",
    sectionMarker: "## Start",
    endMarker: "## End",
    expectedBlocks: [["first"], ["second"], ["third"]],
    style: "plain" as const,
  };
  // Only one bash block, but three expected — triggers early return
  const text = "## Start\n```bash\nfirst\n```\n## End\n";
  const result = validateCodeBlock(text, contract);
  expect(result.failures).toEqual([
    "/fake/missing.md is missing expected plain proof-lane bash blocks",
  ]);
});

test("validateCodeBlock reports per-block gap when block count passes but specific index is missing", () => {
  // Two expected blocks, two found but the second drifts —
  // exercises the drift path, not the count guard
  const contract = {
    label: "pair",
    path: "/fake/pair.md",
    sectionMarker: "## Start",
    endMarker: "## End",
    expectedBlocks: [["cmd-a"], ["cmd-b"]],
    style: "plain" as const,
  };
  const text =
    "## Start\n```bash\ncmd-a\n```\nmid\n```bash\nwrong\n```\n## End\n";
  const result = validateCodeBlock(text, contract);
  // First block passes, second drifts
  expect(result.checks).toHaveLength(1);
  expect(result.failures).toEqual([
    "/fake/pair.md pair block 2 drifted from the narrow-screen command layout",
  ]);
});

// ---------------------------------------------------------------------------
// main() direct-call tests (in-process for coverage tracking)
// ---------------------------------------------------------------------------

const originalExit = process.exit;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

test("main() logs all checks and exits normally when docs are valid", () => {
  const logs: string[] = [];
  const errors: string[] = [];
  let exitCalled = false;

  process.exit = ((_code?: number) => {
    exitCalled = true;
  }) as typeof process.exit;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    main();

    // Real docs are valid — no failures, no exit
    expect(exitCalled).toBe(false);
    expect(errors).toEqual([]);
    // Should have logged multiple check lines
    expect(logs.length).toBeGreaterThan(10);
  } finally {
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
});
