import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export type DocsRealityDriftFailure = {
  file: string;
  line: number;
  claim: string;
};

type ClaimPattern = {
  file: string;
  pattern: RegExp;
};

// These patterns are deliberately narrow: they guard the shipped Phase 1
// drift checks without attempting general semantic documentation inference.
const STALE_SHIPPED_CLAIM_PATTERNS: ClaimPattern[] = [
  {
    file: "README.md",
    pattern:
      /\b(?:path|glob|command|date) drift(?: detection)?\b[^;|.\n]{0,40}\b(?:planned|not yet implemented)\b/i,
  },
  {
    file: "README.md",
    pattern:
      /\bfull drift detection\b[^;|.\n]{0,40}\b(?:planned|not yet implemented)\b/i,
  },
  {
    file: "docs/drift-detection-design.md",
    pattern:
      /\b(?:path|glob|command|date) drift\b\s*[-:|]\s*(?:planned|not yet implemented)\b/i,
  },
  {
    file: "docs/drift-detection-design.md",
    pattern: /\bStatus:\s*Design only\s*[—-]\s*not yet implemented\b/i,
  },
];

function lineNumberAt(lines: string[], index: number): number {
  return index + 1;
}

export function findDocsRealityDriftFailures(
  projectRoot: string,
): DocsRealityDriftFailure[] {
  const failures: DocsRealityDriftFailure[] = [];

  for (const { file, pattern } of STALE_SHIPPED_CLAIM_PATTERNS) {
    const absolutePath = resolve(projectRoot, file);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const lines = readFileSync(absolutePath, "utf8").split("\n");
    lines.forEach((claim, index) => {
      if (!pattern.test(claim)) {
        return;
      }

      failures.push({
        file: relative(projectRoot, absolutePath),
        line: lineNumberAt(lines, index),
        claim: claim.trim(),
      });
    });
  }

  return failures;
}
