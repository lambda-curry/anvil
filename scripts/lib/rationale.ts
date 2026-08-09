/**
 * Detection of *stated rationale* in a rule file.
 *
 * The original check tested for a heading literally named Why/Background/
 * Motivation/Context. That measures format compliance, not quality: across a
 * 15-file human-labeled corpus of real rule files — including several judged
 * high quality — the heading test matched **zero** of them, while adding a
 * `## Why` heading to a file flipped fail to pass without changing a word of
 * substance.
 *
 * What separates a file that explains itself from one that only issues orders
 * is not a heading. It is repeated, varied causal language: this is deliberate,
 * we do X rather than Y, otherwise Z breaks, it silently passed for the wrong
 * reason. A single keyword is not enough — a terse file says "Do not silently
 * change the envelope", which is an imperative with a keyword in it, not an
 * explanation. Requiring signals from two distinct families is what separates
 * the two, and that threshold was chosen by measurement, not taste:
 *
 *   threshold 1 → 12/15 agreement (terse files with one stray keyword pass)
 *   threshold 2 → 15/15 agreement
 *   threshold 3 → 14/15 agreement (a genuinely explanatory file drops out)
 */

/**
 * Words that mean "rationale" wherever they appear as a label, so anything may
 * follow them: `## Why we pin the toolchain`.
 */
const STRONG_LABELS = "Why|Rationale|Motivation|Reasoning";

/**
 * Words that are ordinary nouns as often as they are labels. `### Context
 * Patterns` is a React heading and `## Background jobs` is a subsystem, so these
 * only count when the label stands alone or is punctuated.
 */
const WEAK_LABELS = "Background|Context";

/** Trailing context allowed after a weak label: nothing, or punctuation. */
const WEAK_TAIL = `(?:[ \\t]*(?:[:—–-]|\\*\\*|__)|[ \\t]*$)`;

/**
 * An explicit rationale *label*, in the spellings people actually write.
 *
 * The old pattern accepted `## Why` and the exact string `**Why**`. arbor writes
 * `**Why:**` — the colon sits inside the bold markers — so four of the
 * best-documented rule files in the fleet missed by a single character.
 *
 * Matching is deliberately lenient about decoration and strict about being a
 * label: a heading, or an emphasised run that is either the bare label word or
 * ends in a colon. That last condition is what stops `**Context switching is
 * expensive**` from reading as a rationale section.
 */
export const WHY_LABEL = new RegExp(
  [
    // `## Why`, `### Why — the incident`, `#### Rationale: ...`
    `^[ \\t]*#{1,6}[ \\t]+(?:${STRONG_LABELS})\\b`,
    // `## Context`, `## Background —` but not `### Context Patterns`
    `^[ \\t]*#{1,6}[ \\t]+(?:${WEAK_LABELS})\\b${WEAK_TAIL}`,
    // `**Why**`, `**Why:**`, `**Why this file:**`, `- __Rationale:__`
    `^[ \\t]*(?:[-*+>][ \\t]+)?(?:\\*\\*|__)[ \\t]*(?:${STRONG_LABELS})\\b(?:[^*_\\n]{0,40}:)?[ \\t]*(?:\\*\\*|__)`,
    // `**Context:**` — the colon is what makes a weak word a label
    `^[ \\t]*(?:[-*+>][ \\t]+)?(?:\\*\\*|__)[ \\t]*(?:${WEAK_LABELS})[ \\t]*:[ \\t]*(?:\\*\\*|__)`,
    // `> Why ...`
    `^[ \\t]*>[ \\t]*(?:${STRONG_LABELS})\\b`,
    // `Why: ...` on its own line
    `^[ \\t]*(?:${STRONG_LABELS})[ \\t]*:`,
  ].join("|"),
  "im",
);

/**
 * Families of rationale language. Each family is one *way* of explaining, so
 * matching several is evidence of explanation rather than of vocabulary.
 */
export const RATIONALE_FAMILIES: Readonly<Record<string, RegExp>> =
  Object.freeze({
    /** States a cause: "because", "so that", "otherwise". */
    causal:
      /\b(because|so that|which is why|that is why|the reason|otherwise|or it will|hence)\b/i,
    /** Rejects an alternative: "rather than", "instead of". */
    contrastive: /\b(rather than|instead of|as opposed to|no substitute)\b/i,
    /** Names a purpose: "exists to", "in order to". */
    purposive:
      /\b(exists to|in order to|the point is|the whole reason|meant to)\b/i,
    /** Marks a choice as considered: "this is deliberate", "by design". */
    deliberate:
      /\b(deliberate|deliberately|intentionally|on purpose|by design|not an accident|is structural)\b/i,
    /** Cites what went wrong: "broke", "silently passed", "the exact bug". */
    failure:
      /\b(broke|broken|cost us|struck twice|the exact bug|nearly shipped|went wrong|footgun|silently \w+|fails closed|invites)\b/i,
    /** Names the outcome of ignoring the rule: "will fail", "which meant". */
    consequence:
      /\b(will fail|would hide|makes it a worse|ends up|reads as|leads to|results in|which meant|meant that)\b/i,
  });

/** Signals from this many distinct families count as stated rationale. */
export const RATIONALE_FAMILY_THRESHOLD = 2;

/**
 * Prose only, whitespace collapsed.
 *
 * Both steps are load-bearing. Rule files are hard-wrapped, so `silently\nreconciles`
 * and `rather\nthan` defeat every multi-word pattern unless newlines are collapsed —
 * that alone was misclassifying a file whose rationale is among the strongest in the
 * corpus. Fenced code is dropped because a `because` in a shell comment is not the
 * document explaining itself.
 */
export function extractProse(content: string): string {
  return content.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ");
}

/** Names of the rationale families present in `content`. */
export function rationaleFamilies(content: string): string[] {
  const prose = extractProse(content);
  return Object.entries(RATIONALE_FAMILIES)
    .filter(([, pattern]) => pattern.test(prose))
    .map(([name]) => name);
}

/** Whether the file explains itself in prose, independent of its headings. */
export function hasStatedRationale(content: string): boolean {
  return rationaleFamilies(content).length >= RATIONALE_FAMILY_THRESHOLD;
}

/**
 * Whether a rule file gives its reader the "why".
 *
 * A rationale heading still counts, so no file that passed before starts
 * failing; prose rationale now counts too.
 */
export function hasWhy(content: string): boolean {
  return WHY_LABEL.test(content) || hasStatedRationale(content);
}
