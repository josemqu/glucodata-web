#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
APP_ROOT="${SCRIPT_DIR:h}"
OUTPUT_DIR="${APP_ROOT}/dist.noindex"
APP_BUNDLE="${OUTPUT_DIR}/GlucoBadge.app"

if [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

export CLANG_MODULE_CACHE_PATH="${TMPDIR:-/tmp}/glucobadge-clang-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="${TMPDIR:-/tmp}/glucobadge-swiftpm-cache"

cd "${APP_ROOT}"
swift build -c release

mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"
cp ".build/release/GlucoBadge" "${APP_BUNDLE}/Contents/MacOS/GlucoBadge"
cp "Resources/Info.plist" "${APP_BUNDLE}/Contents/Info.plist"
cp "Resources/AppIcon.icns" "${APP_BUNDLE}/Contents/Resources/AppIcon.icns"

xcrun actool "Resources/Assets.xcassets" \
  --compile "${APP_BUNDLE}/Contents/Resources" \
  --platform macosx \
  --minimum-deployment-target 13.0 \
  --app-icon AppIcon \
  --target-device mac \
  --output-partial-info-plist "${OUTPUT_DIR}/asset-info.plist"

codesign --force --deep --sign - "${APP_BUNDLE}"

echo "${APP_BUNDLE}"
