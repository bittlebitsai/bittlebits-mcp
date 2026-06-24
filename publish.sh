#!/usr/bin/env bash
# publish.sh — Build, version-bump, and publish @bittlebits.ai/mcp to npm.
#
# Usage:
#   ./publish.sh          # default: patch bump (0.1.4 → 0.1.5)
#   ./publish.sh minor    # minor bump (0.1.4 → 0.2.0)
#   ./publish.sh major    # major bump (0.1.4 → 1.0.0)
#
# Prerequisites:
#   - npm token saved:  npm config set //registry.npmjs.org/:_authToken <token>
#   - Clean working tree (no uncommitted changes)
#
# What this script does:
#   1. Verifies the working tree is clean
#   2. Removes old build artefacts (dist/, *.tgz)
#   3. Installs/refreshes dependencies
#   4. Compiles TypeScript → dist/
#   5. Bumps the version (patch/minor/major), creates a git tag
#   6. Pushes the commit + tag to origin
#   7. Publishes to npm with public access

set -euo pipefail

BUMP="${1:-patch}"

# ── Helpers ──────────────────────────────────────────────────────────────────
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
step()   { echo; yellow "▶ $*"; }

# ── 1. Validate bump type ─────────────────────────────────────────────────────
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
    red "Invalid bump type: '$BUMP'. Use patch, minor, or major."
    exit 1
fi

# ── 2. Ensure clean working tree ──────────────────────────────────────────────
step "Checking working tree"
if [[ -n "$(git status --porcelain)" ]]; then
    red "Working tree is dirty. Commit or stash your changes before publishing."
    git status --short
    exit 1
fi
green "Working tree is clean."

# ── 3. Clean old build artefacts ─────────────────────────────────────────────
step "Cleaning old build artefacts"
rm -rf dist/
rm -f  *.tgz
green "Cleaned dist/ and any leftover .tgz files."

# ── 4. Install / refresh dependencies ────────────────────────────────────────
step "Installing dependencies"
npm install
green "Dependencies up to date."

# ── 5. Build ──────────────────────────────────────────────────────────────────
step "Building TypeScript"
npm run build
green "Build succeeded."

# ── 6. Bump version + create git tag ─────────────────────────────────────────
step "Bumping version ($BUMP)"
NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version)   # update package.json only
git add package.json package-lock.json 2>/dev/null || true
git commit -m "release $NEW_VERSION"
git tag "$NEW_VERSION"
green "Version bumped to $NEW_VERSION."

# ── 7. Push commit + tag ──────────────────────────────────────────────────────
step "Pushing to origin"
git push
git push origin "$NEW_VERSION"
green "Pushed commit and tag $NEW_VERSION."

# ── 8. Publish to npm ────────────────────────────────────────────────────────
step "Publishing to npm"
npm publish --access public
green "Published $(node -p "require('./package.json').name")@$(node -p "require('./package.json').version") 🎉"
