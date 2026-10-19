#!/usr/bin/env bash
# Build JAVIS for macOS (dmg + zip, arm64 + x64). Run on a Mac from the repo root:
#   bash scripts/build-mac.sh
# Output: dist/JAVIS-<version>-arm64.dmg, -x64.dmg, -arm64.zip, -x64.zip, latest-mac.yml
# Never publishes (release is done separately after testing).
set -euo pipefail
cd "$(dirname "$0")/.."

[ "$(uname)" = "Darwin" ] || { echo "Run this on macOS"; exit 1; }
node -v >/dev/null || { echo "Node.js is required"; exit 1; }

npm ci --no-audit --no-fund
npm test
npm run build:renderer

for f in assets/live2d/runtime/live2dcubismcore.min.js assets/live2d/hiyori/Hiyori.model3.json \
         assets/javis-companion/ui/javis-companion.js build/icon.icns src/bundles/live2d.bundle.js; do
  [ -f "$f" ] || { echo "Missing $f"; exit 1; }
done

# Unsigned build (identity null in package.json), same as previous releases.
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --x64 --publish never

ls -lh dist/JAVIS-*.dmg dist/JAVIS-*.zip
echo "Done. Install: open the dmg, drag JAVIS to Applications, quit and delete the old 'Clawd on Desk' app."
