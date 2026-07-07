import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GuardrailDimensionKey } from "./guardrail-score.ts";

export const GUARDRAIL_DIMENSIONS: GuardrailDimensionKey[] = [
  "ciDiscipline",
  "typeSafety",
  "testDepth",
  "codeQuality",
  "reviewOwnership",
  "security",
  "driftResilience",
];

export type AuditProfile =
  | "library"
  | "internal-tool"
  | "production-app"
  | "prototype";

export type Applicability = "applicable" | "not-applicable";

export type DimensionConfig = {
  applicability: Applicability;
  reason: string | null;
  weight: number;
  minScoreHint: number | null;
};

export type HardGateDimension = {
  minScore: number;
};

export type HardGatesConfig = {
  enabled: boolean;
  exitCode: number;
  dimensions: Partial<Record<GuardrailDimensionKey, HardGateDimension>>;
};

export type AuditConfig = {
  version: 1;
  profile: AuditProfile;
  hardGates: HardGatesConfig;
  dimensions: Record<GuardrailDimensionKey, DimensionConfig>;
};

export type AuditConfigLoadResult = {
  path: string;
  present: boolean;
  config: AuditConfig;
};

const PROFILE_PRESETS: Record<AuditProfile, Partial<AuditConfig>> = {
  library: {
    hardGates: {
      enabled: true,
      exitCode: 2,
      dimensions: {
        ciDiscipline: { minScore: 3 },
        typeSafety: { minScore: 4 },
        testDepth: { minScore: 3 },
        driftResilience: { minScore: 3 },
      },
    },
    dimensions: {
      ciDiscipline: {
        applicability: "applicable",
        reason: null,
        weight: 1,
        minScoreHint: null,
      },
      typeSafety: {
        applicability: "applicable",
        reason: null,
        weight: 1.5,
        minScoreHint: null,
      },
      testDepth: {
        applicability: "applicable",
        reason: null,
        weight: 1.25,
        minScoreHint: null,
      },
      codeQuality: {
        applicability: "applicable",
        reason: null,
        weight: 1.25,
        minScoreHint: null,
      },
      reviewOwnership: {
        applicability: "applicable",
        reason: null,
        weight: 1,
        minScoreHint: null,
      },
      security: {
        applicability: "applicable",
        reason: null,
        weight: 0.75,
        minScoreHint: null,
      },
      driftResilience: {
        applicability: "applicable",
        reason: null,
        weight: 1,
        minScoreHint: null,
      },
    },
  },
  "internal-tool": {
    hardGates: {
      enabled: true,
      exitCode: 2,
      dimensions: {
        ciDiscipline: { minScore: 3 },
        typeSafety: { minScore: 3 },
        driftResilience: { minScore: 3 },
      },
    },
    dimensions: {
      ciDiscipline: {
        applicability: "applicable",
        reason: null,
        weight: 1,
        minScoreHint: null,
      },
      typeSafety: {
        applicability: "applicable",
        reason: null,
        weight: 1.25,
        minScoreHint: null,
      },
      testDepth: {
        applicability: "applicable",
        reason: null,
        weight: 1,
        minScoreHint: null,
      },
      codeQuality: {
        applicability: "applicable",
        reason: null,
        weight: 1,
        minScoreHint: null,
      },
      reviewOwnership: {
        applicability: "applicable",
        reason: null,
        weight: 0.75,
        minScoreHint: null,
      },
      security: {
        applicability: "applicable",
        reason: null,
        weight: 0.75,
        minScoreHint: null,
      },
      driftResilience: {
        applicability: "applicable",
        reason: null,
        weight: 1.25,
        minScoreHint: null,
      },
    },
  },
  "production-app": {
    hardGates: {
      enabled: true,
      exitCode: 2,
      dimensions: {
        ciDiscipline: { minScore: 4 },
        typeSafety: { minScore: 4 },
        testDepth: { minScore: 4 },
        codeQuality: { minScore: 3 },
        reviewOwnership: { minScore: 3 },
        security: { minScore: 3 },
        driftResilience: { minScore: 3 },
      },
    },
    dimensions: {
      ciDiscipline: {
        applicability: "applicable",
        reason: null,
        weight: 1.25,
        minScoreHint: null,
      },
      typeSafety: {
        applicability: "applicable",
        reason: null,
        weight: 1.25,
        minScoreHint: null,
      },
      testDepth: {
        applicability: "applicable",
        reason: null,
        weight: 1.25,
        minScoreHint: null,
      },
      codeQuality: {
        applicability: "applicable",
        reason: null,
        weight: 1,
        minScoreHint: null,
      },
      reviewOwnership: {
        applicability: "applicable",
        reason: null,
        weight: 1.25,
        minScoreHint: null,
      },
      security: {
        applicability: "applicable",
        reason: null,
        weight: 1.5,
        minScoreHint: null,
      },
      driftResilience: {
        applicability: "applicable",
        reason: null,
        weight: 1,
        minScoreHint: null,
      },
    },
  },
  prototype: {
    hardGates: { enabled: false, exitCode: 2, dimensions: {} },
    dimensions: {
      ciDiscipline: {
        applicability: "applicable",
        reason: null,
        weight: 0.75,
        minScoreHint: null,
      },
      typeSafety: {
        applicability: "applicable",
        reason: null,
        weight: 0.75,
        minScoreHint: null,
      },
      testDepth: {
        applicability: "applicable",
        reason: null,
        weight: 0.5,
        minScoreHint: null,
      },
      codeQuality: {
        applicability: "applicable",
        reason: null,
        weight: 0.75,
        minScoreHint: null,
      },
      reviewOwnership: {
        applicability: "applicable",
        reason: null,
        weight: 0.5,
        minScoreHint: null,
      },
      security: {
        applicability: "applicable",
        reason: null,
        weight: 1,
        minScoreHint: null,
      },
      driftResilience: {
        applicability: "applicable",
        reason: null,
        weight: 0.75,
        minScoreHint: null,
      },
    },
  },
};

export class AuditConfigError extends Error {}

function baseConfig(): AuditConfig {
  return {
    version: 1,
    profile: "internal-tool",
    hardGates: { enabled: false, exitCode: 2, dimensions: {} },
    dimensions: Object.fromEntries(
      GUARDRAIL_DIMENSIONS.map((key) => [
        key,
        {
          applicability: "applicable",
          reason: null,
          weight: 1,
          minScoreHint: null,
        },
      ]),
    ) as Record<GuardrailDimensionKey, DimensionConfig>,
  };
}

function cloneConfig(config: AuditConfig): AuditConfig {
  return structuredClone(config);
}

function ensureObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuditConfigError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function ensureInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new AuditConfigError(
      `${path} must be an integer between ${min} and ${max}`,
    );
  }
  return value as number;
}

function ensureNumber(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    Number.isNaN(value) ||
    value < min ||
    value > max
  ) {
    throw new AuditConfigError(
      `${path} must be a number between ${min} and ${max}`,
    );
  }
  return value;
}

function mergeConfig(
  base: AuditConfig,
  overrides: Partial<AuditConfig>,
): AuditConfig {
  const merged = cloneConfig(base);
  if (overrides.profile) merged.profile = overrides.profile;
  if (overrides.hardGates) {
    merged.hardGates = {
      ...merged.hardGates,
      ...overrides.hardGates,
      dimensions: {
        ...merged.hardGates.dimensions,
        ...overrides.hardGates.dimensions,
      },
    };
  }
  if (overrides.dimensions) {
    for (const key of GUARDRAIL_DIMENSIONS) {
      const patch = overrides.dimensions[key];
      if (!patch) continue;
      merged.dimensions[key] = { ...merged.dimensions[key], ...patch };
    }
  }
  return merged;
}

function validateMergedConfig(config: AuditConfig): AuditConfig {
  for (const key of GUARDRAIL_DIMENSIONS) {
    const dimension = config.dimensions[key];
    if (
      dimension.applicability === "not-applicable" &&
      !dimension.reason?.trim()
    ) {
      throw new AuditConfigError(
        `dimensions.${key}.reason is required when applicability is not-applicable`,
      );
    }
    if (dimension.applicability === "applicable") {
      config.dimensions[key].reason = null;
    }
    if (
      config.hardGates.dimensions[key] &&
      dimension.applicability === "not-applicable"
    ) {
      delete config.hardGates.dimensions[key];
    }
  }
  return config;
}

export function loadAuditConfig(projectRoot: string): AuditConfigLoadResult {
  const path = join(projectRoot, ".anvil", "config.yml");
  const base = baseConfig();
  if (!existsSync(path)) {
    return { path, present: false, config: base };
  }

  const text = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(text);
  } catch (error) {
    throw new AuditConfigError(
      `Invalid YAML in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const root = ensureObject(parsed, "config");
  ensureInteger(root.version, "version", 1, 1);
  const profile = root.profile ?? "internal-tool";
  if (
    !["library", "internal-tool", "production-app", "prototype"].includes(
      String(profile),
    )
  ) {
    throw new AuditConfigError(
      "profile must be one of: library, internal-tool, production-app, prototype",
    );
  }

  let merged = mergeConfig(base, {
    profile: profile as AuditProfile,
    version: 1,
  });
  merged = mergeConfig(
    merged,
    PROFILE_PRESETS[profile as AuditProfile] as Partial<AuditConfig>,
  );

  if (root.dimensions !== undefined) {
    const dimensions = ensureObject(root.dimensions, "dimensions");
    const dimensionOverrides: Partial<
      Record<GuardrailDimensionKey, Partial<DimensionConfig>>
    > = {};
    for (const [key, value] of Object.entries(dimensions)) {
      if (!GUARDRAIL_DIMENSIONS.includes(key as GuardrailDimensionKey)) {
        throw new AuditConfigError(
          `dimensions.${key} is not a known guardrail dimension`,
        );
      }
      const dimension = ensureObject(value, `dimensions.${key}`);
      const override: Partial<DimensionConfig> = {};
      if (dimension.applicability !== undefined) {
        if (
          dimension.applicability !== "applicable" &&
          dimension.applicability !== "not-applicable"
        ) {
          throw new AuditConfigError(
            `dimensions.${key}.applicability must be applicable or not-applicable`,
          );
        }
        override.applicability = dimension.applicability;
      }
      if (dimension.reason !== undefined) {
        if (typeof dimension.reason !== "string" || !dimension.reason.trim()) {
          throw new AuditConfigError(
            `dimensions.${key}.reason must be a non-empty string`,
          );
        }
        override.reason = dimension.reason.trim();
      }
      if (dimension.weight !== undefined) {
        override.weight = ensureNumber(
          dimension.weight,
          `dimensions.${key}.weight`,
          0,
          2,
        );
      }
      if (dimension.minScoreHint !== undefined) {
        override.minScoreHint = ensureInteger(
          dimension.minScoreHint,
          `dimensions.${key}.minScoreHint`,
          0,
          5,
        );
      }
      dimensionOverrides[key as GuardrailDimensionKey] = override;
    }
    merged = mergeConfig(merged, {
      dimensions: dimensionOverrides as AuditConfig["dimensions"],
    });
  }

  if (root.hardGates !== undefined) {
    const hardGates = ensureObject(root.hardGates, "hardGates");
    const hardGateOverrides: Partial<HardGatesConfig> = {};
    if (hardGates.enabled !== undefined) {
      if (typeof hardGates.enabled !== "boolean") {
        throw new AuditConfigError("hardGates.enabled must be a boolean");
      }
      hardGateOverrides.enabled = hardGates.enabled;
    } else {
      hardGateOverrides.enabled = true;
    }
    if (hardGates.exitCode !== undefined) {
      hardGateOverrides.exitCode = ensureInteger(
        hardGates.exitCode,
        "hardGates.exitCode",
        1,
        255,
      );
    }
    if (hardGates.dimensions !== undefined) {
      const dimensions = ensureObject(
        hardGates.dimensions,
        "hardGates.dimensions",
      );
      const gateDimensions: Partial<
        Record<GuardrailDimensionKey, HardGateDimension>
      > = {};
      for (const [key, value] of Object.entries(dimensions)) {
        if (!GUARDRAIL_DIMENSIONS.includes(key as GuardrailDimensionKey)) {
          throw new AuditConfigError(
            `hardGates.dimensions.${key} is not a known guardrail dimension`,
          );
        }
        const gate = ensureObject(value, `hardGates.dimensions.${key}`);
        gateDimensions[key as GuardrailDimensionKey] = {
          minScore: ensureInteger(
            gate.minScore,
            `hardGates.dimensions.${key}.minScore`,
            0,
            5,
          ),
        };
      }
      hardGateOverrides.dimensions = gateDimensions;
    }
    merged = mergeConfig(merged, {
      hardGates: hardGateOverrides as HardGatesConfig,
    });
  }

  merged.version = 1;
  return { path, present: true, config: validateMergedConfig(merged) };
}
