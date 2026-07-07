import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditConfigError, loadAuditConfig } from "./lib/audit-config.ts";
import { scoreGuardrails } from "./lib/guardrail-score.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    throw error;
  }
}

test("loadAuditConfig applies profile, not-applicable dismissal, and hard-gate defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-config-"));
  try {
    mkdirSync(join(dir, ".anvil"), { recursive: true });
    writeFileSync(
      join(dir, ".anvil", "config.yml"),
      [
        "version: 1",
        "profile: production-app",
        "dimensions:",
        "  security:",
        "    applicability: not-applicable",
        '    reason: "No deployed runtime surface."',
        "hardGates:",
        "  dimensions:",
        "    reviewOwnership:",
        "      minScore: 4",
      ].join("\n"),
    );

    const loaded = loadAuditConfig(dir);
    assert.equal(loaded.present, true);
    assert.equal(loaded.config.profile, "production-app");
    assert.equal(loaded.config.hardGates.enabled, true);
    assert.equal(
      loaded.config.hardGates.dimensions.reviewOwnership?.minScore,
      4,
    );
    assert.equal(
      loaded.config.dimensions.security.applicability,
      "not-applicable",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadAuditConfig rejects not-applicable without a reason", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-config-invalid-"));
  try {
    mkdirSync(join(dir, ".anvil"), { recursive: true });
    writeFileSync(
      join(dir, ".anvil", "config.yml"),
      [
        "version: 1",
        "dimensions:",
        "  security:",
        "    applicability: not-applicable",
      ].join("\n"),
    );
    assert.throws(() => loadAuditConfig(dir), AuditConfigError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scoreGuardrails honors config-driven not-applicable and hard gates", () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-config-score-"));
  try {
    mkdirSync(join(dir, ".anvil"), { recursive: true });
    writeFileSync(
      join(dir, ".anvil", "config.yml"),
      [
        "version: 1",
        "profile: internal-tool",
        "dimensions:",
        "  security:",
        "    applicability: not-applicable",
        '    reason: "Local-only tool with no deployed secrets surface."',
        "hardGates:",
        "  enabled: true",
        "  dimensions:",
        "    ciDiscipline:",
        "      minScore: 3",
      ].join("\n"),
    );

    const config = loadAuditConfig(dir);
    const result = scoreGuardrails({
      projectRoot: dir,
      ruleFilePaths: [],
      driftSummary: { pathIssues: 0, dateIssues: 0 },
      auditConfig: config.config,
      configPresent: config.present,
    });

    assert.equal(result.profile, "internal-tool");
    assert.equal(result.breakdown.security, null);
    assert.ok(result.hardGates.failed.length >= 1);
    assert.equal(
      result.hardGates.failed.some((gate) => gate.dimension === "ciDiscipline"),
      true,
    );
    assert.equal(result.hardGates.exitCode, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
