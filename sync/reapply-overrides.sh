#!/usr/bin/env bash
# reapply-overrides.sh
# Reapplies all Reactor Desktop customisations after an upstream merge.
# Run from the repo root.
#
# Usage:
#   bash sync/reapply-overrides.sh [UPSTREAM_VERSION]
#
# UPSTREAM_VERSION: the new upstream tag (e.g. v0.1.10).
#   If omitted, the version from sync/upstream-version.txt is used.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERRIDES_DIR="$REPO_ROOT/sync/overrides"

cd "$REPO_ROOT"

UPSTREAM_VERSION="${1:-$(cat sync/upstream-version.txt)}"
# Strip leading 'v' to get semver (e.g. 0.1.10)
SEMVER="${UPSTREAM_VERSION#v}"

echo "==> Reapplying Reactor Desktop overrides for upstream $UPSTREAM_VERSION"

# -----------------------------------------------------------------------
# 1. Copy full-file overrides (files we own entirely)
# -----------------------------------------------------------------------
echo "  Copying full-file overrides..."

cp "$OVERRIDES_DIR/src-tauri/src/lib.rs"        src-tauri/src/lib.rs
cp "$OVERRIDES_DIR/src-tauri/src/main.rs"       src-tauri/src/main.rs
cp "$OVERRIDES_DIR/src-tauri/Cargo.toml"        src-tauri/Cargo.toml
cp "$OVERRIDES_DIR/src-tauri/tauri.conf.json"   src-tauri/tauri.conf.json
cp "$OVERRIDES_DIR/package.json"                package.json
cp "$OVERRIDES_DIR/src/desktop-updates.ts"      src/desktop-updates.ts
cp "$OVERRIDES_DIR/.github/workflows/release.yml" .github/workflows/release.yml
cp "$OVERRIDES_DIR/.github/workflows/ci.yml"    .github/workflows/ci.yml
cp "$OVERRIDES_DIR/README.md"                   README.md
cp "$OVERRIDES_DIR/LICENSE"                     LICENSE

# -----------------------------------------------------------------------
# 2. Bump version in our owned config files to match upstream
# -----------------------------------------------------------------------
echo "  Bumping version to $SEMVER in config files..."

# package.json  (we own this file, but update the version field)
python3 - <<PYEOF
import json, sys
with open('package.json', 'r') as f:
    d = json.load(f)
d['version'] = '$SEMVER'
with open('package.json', 'w') as f:
    json.dump(d, f, indent='\t')
    f.write('\n')
PYEOF

# src-tauri/Cargo.toml
sed -i.bak "s/^version = \".*\"/version = \"$SEMVER\"/" src-tauri/Cargo.toml
rm -f src-tauri/Cargo.toml.bak

# src-tauri/tauri.conf.json
python3 - <<PYEOF
import json
with open('src-tauri/tauri.conf.json', 'r') as f:
    d = json.load(f)
d['version'] = '$SEMVER'
with open('src-tauri/tauri.conf.json', 'w') as f:
    json.dump(d, f, indent='\t')
    f.write('\n')
PYEOF

# -----------------------------------------------------------------------
# 3. String substitutions on upstream-sourced files
#    Replace all visible "Pi Desktop" occurrences with "Reactor Desktop"
# -----------------------------------------------------------------------
echo "  Applying Pi Desktop -> Reactor Desktop string substitutions..."

# Files that get new content from upstream and need visible string patching
PATCH_FILES=(
    "index.html"
    "src/main.ts"
    "src/components/settings-panel.ts"
    "src/components/packages-view.ts"
    "src/components/extension-ui-handler.ts"
    "src/components/chat-view.ts"
    "src/recommended-packages.ts"
    "src-tauri/capabilities/default.json"
    "CONTRIBUTING.md"
    "RELEASE_CRITERIA.md"
    "ROADMAP_V1.md"
    "TODO.md"
    "FEATURE_MAPPING.md"
    "SECURITY.md"
    "CHANGELOG.md"
    ".github/RELEASE_TEMPLATE.md"
    ".github/ISSUE_TEMPLATE/bug_report.md"
    "docs/ARCHITECTURE.md"
    "docs/CAPABILITY_MODEL.md"
    "docs/ICONS.md"
    "docs/PACKAGES.md"
    "docs/PERMISSIONS.md"
    "docs/RELEASES.md"
    "docs/THEMES_DESKTOP_MAPPING.md"
    "docs/PACKAGE_CAPABILITY_TEMPLATE.md"
)

for FILE in "${PATCH_FILES[@]}"; do
    if [ -f "$FILE" ]; then
        sed -i.bak 's/Pi Desktop/Reactor Desktop/g' "$FILE"
        rm -f "${FILE}.bak"
    fi
done

# index.html title tag
if [ -f "index.html" ]; then
    sed -i.bak 's/<title>Reactor Desktop<\/title>/<title>Reactor Desktop<\/title>/g' index.html
    sed -i.bak 's/<title>Pi Desktop<\/title>/<title>Reactor Desktop<\/title>/g' index.html
    rm -f index.html.bak
fi

# Fix the extension-ui-handler.ts syntax that upstream uses (|| and ternary)
# The upstream file has: || "Pi Desktop" and : "Pi Desktop"
# After our sed substitution "Pi Desktop" becomes "Reactor Desktop" correctly,
# but we must also make sure we haven't broken the JS operators.
# Check and fix if needed:
if grep -q '"Reactor Desktop"' src/components/extension-ui-handler.ts 2>/dev/null; then
    # Ensure the operators are intact (|| and :)
    python3 - <<'PYEOF'
import re

with open('src/components/extension-ui-handler.ts', 'r') as f:
    content = f.read()

# Fix pattern: `something) "Reactor Desktop"` -> `something) || "Reactor Desktop"`
# This handles cases where || was stripped by a previous bad sed
content = re.sub(r'(\.trim\(\))\s+"Reactor Desktop"', r'\1 || "Reactor Desktop"', content)
# Fix pattern: `rawTitle "Reactor Desktop"` -> `rawTitle : "Reactor Desktop"`  
content = re.sub(r'(rawTitle)\s+"Reactor Desktop"', r'\1 : "Reactor Desktop"', content)

with open('src/components/extension-ui-handler.ts', 'w') as f:
    f.write(content)
PYEOF
fi

# -----------------------------------------------------------------------
# 4. Replace icons with our custom Reactor Desktop icons
# -----------------------------------------------------------------------
echo "  Restoring Reactor Desktop icons..."

ICONS_SRC="sync/icons"
ICONS_DEST="src-tauri/icons"

if [ -d "$ICONS_SRC" ]; then
    # Copy all icon files we have stored
    find "$ICONS_SRC" -type f | while read -r src_file; do
        rel="${src_file#$ICONS_SRC/}"
        dest="$ICONS_DEST/$rel"
        mkdir -p "$(dirname "$dest")"
        cp "$src_file" "$dest"
    done
    echo "  Icons restored from sync/icons/"
else
    echo "  WARNING: sync/icons/ not found — icons not updated"
fi

# Also restore the branding SVG
if [ -f "sync/assets/pi-desktop-icon.svg" ]; then
    cp sync/assets/pi-desktop-icon.svg assets/branding/pi-desktop-icon.svg
fi

# -----------------------------------------------------------------------
# 5. Update the tracked upstream version
# -----------------------------------------------------------------------
echo "$UPSTREAM_VERSION" > sync/upstream-version.txt

echo "==> Done. All Reactor Desktop overrides applied for $UPSTREAM_VERSION."
