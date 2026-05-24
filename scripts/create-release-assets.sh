#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-$(node -p "JSON.parse(require('node:fs').readFileSync('${ROOT_DIR}/package.json','utf8')).version")}"
RELEASE_DIR="$ROOT_DIR/release-assets"
PACKAGE_DIR="$RELEASE_DIR/mikroscope-$VERSION"
APP_DIR="$RELEASE_DIR/mikroscope-app-$VERSION"

rm -rf "$RELEASE_DIR"
mkdir -p "$PACKAGE_DIR"
mkdir -p "$APP_DIR"

if [ ! -f "$ROOT_DIR/dist/cli.mjs" ] || [ ! -d "$ROOT_DIR/dist/app" ]; then
  echo "Missing dist/cli.mjs or dist/app. Run npm run build before creating release assets." >&2
  exit 1
fi

cp "$ROOT_DIR/README.md" "$PACKAGE_DIR/"
cp "$ROOT_DIR/LICENSE" "$PACKAGE_DIR/"
cp "$ROOT_DIR/package.json" "$PACKAGE_DIR/"
cp -R "$ROOT_DIR/dist" "$PACKAGE_DIR/dist"
cp -R "$ROOT_DIR/openapi" "$PACKAGE_DIR/openapi"
cp -R "$ROOT_DIR/deploy" "$PACKAGE_DIR/deploy"
echo "$VERSION" > "$PACKAGE_DIR/VERSION"

cp -R "$ROOT_DIR/dist/app"/. "$APP_DIR/"
cp "$ROOT_DIR/LICENSE" "$APP_DIR/"
cat > "$APP_DIR/README.md" <<EOF
# MikroScope App Bundle

This is the prebuilt optional MikroScope static console for version ${VERSION}.

Serve these files with any static web server and configure \`config.json\` to point at your MikroScope API:

\`\`\`json
{
  "apiOrigin": "https://api.example.com",
  "apiToken": ""
}
\`\`\`

The MikroScope API is released separately as the \`mikroscope\` npm package and in the full release bundle.
EOF
echo "$VERSION" > "$APP_DIR/VERSION"

cat > "$PACKAGE_DIR/mikroscope" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/dist/cli.mjs" "$@"
EOF
chmod +x "$PACKAGE_DIR/mikroscope"

cat > "$PACKAGE_DIR/mikroscope.cmd" <<'EOF'
@echo off
node "%~dp0dist\cli.mjs" %*
EOF

(
  cd "$RELEASE_DIR"
  tar -czf "mikroscope-$VERSION.tar.gz" "mikroscope-$VERSION"
  zip -qr "mikroscope-$VERSION.zip" "mikroscope-$VERSION"
  zip -qr "mikroscope_latest.zip" "mikroscope-$VERSION"
  zip -qr "mikroscope-app-$VERSION.zip" "mikroscope-app-$VERSION"
  zip -qr "mikroscope_app_latest.zip" "mikroscope-app-$VERSION"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum \
      "mikroscope-$VERSION.tar.gz" \
      "mikroscope-$VERSION.zip" \
      "mikroscope_latest.zip" \
      "mikroscope-app-$VERSION.zip" \
      "mikroscope_app_latest.zip" > SHA256SUMS.txt
  else
    shasum -a 256 \
      "mikroscope-$VERSION.tar.gz" \
      "mikroscope-$VERSION.zip" \
      "mikroscope_latest.zip" \
      "mikroscope-app-$VERSION.zip" \
      "mikroscope_app_latest.zip" > SHA256SUMS.txt
  fi
)

echo "Created release assets in: $RELEASE_DIR"
ls -lh "$RELEASE_DIR"
