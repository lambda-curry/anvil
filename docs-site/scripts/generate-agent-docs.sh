#!/usr/bin/env bash
# Generate llms.txt and llms-full.txt for agent consumption.
# https://llmstxt.org convention — gives AI agents clean markdown docs.
#
# Output:
#   public/llms.txt      — concise index with section summaries
#   public/llms-full.txt  — full combined documentation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTENT_DIR="$SCRIPT_DIR/src/content/docs"
LLMS_TXT="$SCRIPT_DIR/public/llms.txt"
LLMS_FULL="$SCRIPT_DIR/public/llms-full.txt"

# Remove old export if it exists
rm -f "$SCRIPT_DIR/public/anvil-agent-docs.md"

# Order matters — put getting-started first, then guides, then reference
SECTIONS=(
  "getting-started/installation.md"
  "getting-started/first-audit.md"
  "guides/configuration.md"
  "guides/byok-trust-model.md"
  "guides/first-user-proof.md"
  "guides/first-user-proof-packet.md"
  "guides/drift-detection.md"
  "guides/bootstrap.md"
  "guides/mine-pr.md"
  "reference/cli.md"
  "reference/rubric.md"
  "reference/agent-skill.md"
)

# ── Helper: extract body (strip frontmatter + leading h1) ──
body() {
  awk '/^---$/{n++; next} n>=2' "$1" | awk 'NR==1 && /^# /{next} {print}'
}

# ── Helper: make copied llms-full links portable outside page context ──
rewrite_portable_links() {
  sed -E 's#\]\(/anvil/([^)]*)\)#](https://lambda-curry.github.io/anvil/\1)#g'
}

# ── Helper: extract frontmatter title ──
fm_title() {
  local t
  t=$(grep '^title:' "$1" | head -1 | sed 's/^title: *//')
  if [ -n "$t" ]; then echo "$t"; return; fi
  # Fallback: derive from filename
  basename "$1" .md | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1'
}

# ── Helper: extract description from frontmatter ──
fm_desc() {
  grep '^description:' "$1" | head -1 | sed 's/^description: *//'
}

# ══════════════════════════════════════════════════════════
# Generate llms-full.txt
# ══════════════════════════════════════════════════════════

cat > "$LLMS_FULL" << 'HEADER'
# Anvil

> AI rules audit engine — score, detect drift, and improve rules in any AI-assisted codebase.

HEADER

echo "> Source: https://lambda-curry.github.io/anvil/" >> "$LLMS_FULL"
echo "> Generated: $(date -u +%Y-%m-%d)" >> "$LLMS_FULL"
echo "" >> "$LLMS_FULL"

for page in "${SECTIONS[@]}"; do
  file="$CONTENT_DIR/$page"
  if [ -f "$file" ]; then
    title=$(fm_title "$file")
    echo "## $title" >> "$LLMS_FULL"
    echo "" >> "$LLMS_FULL"
    body "$file" | rewrite_portable_links >> "$LLMS_FULL"
    echo "" >> "$LLMS_FULL"
  fi
done

if grep -nE '\]\(/anvil/' "$LLMS_FULL" >/dev/null; then
  echo "Error: llms-full.txt still contains root-relative /anvil/ links" >&2
  exit 1
fi

# ══════════════════════════════════════════════════════════
# Generate llms.txt
# ══════════════════════════════════════════════════════════

cat > "$LLMS_TXT" << 'INDEX_HEADER'
# Anvil

> AI rules audit engine — score, detect drift, and improve rules in any AI-assisted codebase.

Anvil audits CLAUDE.md, .cursor/rules, AGENTS.md, and other AI rule files for coverage gaps, drift, conflicts, and format compliance. Zero-install, no API keys required for the baseline audit. Works with any codebase.

INDEX_HEADER

echo "" >> "$LLMS_TXT"

for page in "${SECTIONS[@]}"; do
  file="$CONTENT_DIR/$page"
  if [ -f "$file" ]; then
    title=$(fm_title "$file")
    desc=$(fm_desc "$file")
    # Use relative URLs — agents can resolve against the base
    slug="${page%.md}"
    echo "- [$title](https://lambda-curry.github.io/anvil/${slug}): $desc" >> "$LLMS_TXT"
  fi
done

echo "" >> "$LLMS_TXT"
echo "[Full documentation as a single file](https://lambda-curry.github.io/anvil/llms-full.txt)" >> "$LLMS_TXT"

for url in \
  "https://lambda-curry.github.io/anvil/getting-started/first-audit/" \
  "https://lambda-curry.github.io/anvil/guides/configuration/" \
  "https://lambda-curry.github.io/anvil/guides/byok-trust-model/" \
  "https://lambda-curry.github.io/anvil/guides/first-user-proof/" \
  "https://lambda-curry.github.io/anvil/guides/first-user-proof-packet/" \
  "https://lambda-curry.github.io/anvil/guides/mine-pr/"
do
  if grep -F "$url" "$LLMS_FULL" "$LLMS_TXT" >/dev/null; then
    echo "Error: generated docs still contain trailing-slash public URLs: $url" >&2
    exit 1
  fi
done

echo "Generated:"
echo "  $(wc -l < "$LLMS_TXT" | tr -d ' ') lines  llms.txt"
echo "  $(wc -l < "$LLMS_FULL" | tr -d ' ') lines  llms-full.txt"
