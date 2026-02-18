#!/usr/bin/env sh
set -eu

REPO_OWNER="${MIKROSCOPE_REPO_OWNER:-mikaelvesavuori}"
REPO_NAME="${MIKROSCOPE_REPO_NAME:-mikroscope}"
LATEST_RELEASE_API="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"

say() {
  printf "%s\n" "$*"
}

warn() {
  printf "warning: %s\n" "$*" >&2
}

die() {
  printf "error: %s\n" "$*" >&2
  exit 1
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

download() {
  url="$1"
  destination="$2"
  is_github_api="0"
  case "$url" in
    https://api.github.com/*) is_github_api="1" ;;
  esac

  if has_cmd curl; then
    if [ "$is_github_api" = "1" ]; then
      curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: mikroscope-installer" "$url" -o "$destination"
    else
      curl -fsSL "$url" -o "$destination"
    fi
    return
  fi
  if has_cmd wget; then
    if [ "$is_github_api" = "1" ]; then
      wget -qO "$destination" --header="Accept: application/vnd.github+json" --header="User-Agent: mikroscope-installer" "$url"
    else
      wget -qO "$destination" "$url"
    fi
    return
  fi
  die "curl or wget is required"
}

prompt_value() {
  label="$1"
  default_value="$2"

  if [ "${MIKROSCOPE_INSTALL_NONINTERACTIVE:-}" = "1" ]; then
    printf "%s" "$default_value"
    return
  fi

  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    if [ -n "$default_value" ]; then
      printf "%s [%s]: " "$label" "$default_value" >/dev/tty
    else
      printf "%s: " "$label" >/dev/tty
    fi
    IFS= read -r response </dev/tty || response=""
    if [ -z "$response" ]; then
      response="$default_value"
    fi
    printf "%s" "$response"
    return
  fi

  printf "%s" "$default_value"
}

escape_single_quotes() {
  printf "%s" "$1" | sed "s/'/'\\\\''/g"
}

verify_checksum() {
  sums_file="$1"
  archive_file="$2"
  asset_name="$3"

  expected="$(grep " ${asset_name}\$" "$sums_file" | awk '{print $1}' | head -n1 || true)"
  if [ -z "$expected" ]; then
    warn "No checksum entry found for ${asset_name}; skipping checksum verification."
    return
  fi

  if has_cmd sha256sum; then
    actual="$(sha256sum "$archive_file" | awk '{print $1}')"
  elif has_cmd shasum; then
    actual="$(shasum -a 256 "$archive_file" | awk '{print $1}')"
  else
    warn "sha256sum/shasum is not available; skipping checksum verification."
    return
  fi

  if [ "$actual" != "$expected" ]; then
    die "Checksum mismatch for ${asset_name}"
  fi
}

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t mikroscope-install)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

say "Fetching latest MikroScope release metadata..."
RELEASE_JSON="$TMP_DIR/release.json"
ARCHIVE_URL="${MIKROSCOPE_RELEASE_URL:-}"
SUMS_URL="${MIKROSCOPE_CHECKSUM_URL:-}"
TAG_NAME="${MIKROSCOPE_RELEASE_TAG:-}"

if [ -z "$ARCHIVE_URL" ]; then
  if ! download "$LATEST_RELEASE_API" "$RELEASE_JSON"; then
    die "Could not fetch latest release metadata. If this repo has no published release yet, publish a tagged release first."
  fi

  TAG_NAME="$(grep -Eo '"tag_name"[[:space:]]*:[[:space:]]*"[^"]+"' "$RELEASE_JSON" | head -n1 | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)"
  TAR_ARCHIVE_URL="$(grep -Eo 'https://[^"]*mikroscope-[^"]*\.tar\.gz' "$RELEASE_JSON" | head -n1 || true)"
  ZIP_ARCHIVE_URL="$(grep -Eo 'https://[^"]*mikroscope-[^"]*\.zip' "$RELEASE_JSON" | head -n1 || true)"
  ARCHIVE_URL="$TAR_ARCHIVE_URL"
  if [ -z "$ARCHIVE_URL" ]; then
    ARCHIVE_URL="$ZIP_ARCHIVE_URL"
  fi
  SUMS_URL="$(grep -Eo 'https://[^"]*SHA256SUMS\.txt' "$RELEASE_JSON" | head -n1 || true)"
fi

[ -n "$ARCHIVE_URL" ] || die "Could not locate release archive URL. Set MIKROSCOPE_RELEASE_URL to a direct .tar.gz or .zip asset URL."
[ -n "$TAG_NAME" ] || TAG_NAME="latest"

ARCHIVE_NAME="$(basename "$ARCHIVE_URL")"
ARCHIVE_FILE="$TMP_DIR/$ARCHIVE_NAME"

say "Downloading ${ARCHIVE_NAME} (${TAG_NAME})..."
download "$ARCHIVE_URL" "$ARCHIVE_FILE"

if [ -n "$SUMS_URL" ]; then
  SUMS_FILE="$TMP_DIR/SHA256SUMS.txt"
  download "$SUMS_URL" "$SUMS_FILE"
  verify_checksum "$SUMS_FILE" "$ARCHIVE_FILE" "$ARCHIVE_NAME"
fi

HOME_DIR="${HOME:-$PWD}"
DEFAULT_INSTALL_DIR="${MIKROSCOPE_INSTALL_DIR:-$HOME_DIR/.local/share/mikroscope}"
DEFAULT_BIN_DIR="${MIKROSCOPE_BIN_DIR:-$HOME_DIR/.local/bin}"
DEFAULT_CONFIG_FILE="${MIKROSCOPE_CONFIG_FILE:-$HOME_DIR/.config/mikroscope/mikroscope.env}"

INSTALL_DIR="$(prompt_value "Install directory" "$DEFAULT_INSTALL_DIR")"
BIN_DIR="$(prompt_value "Binary wrapper directory" "$DEFAULT_BIN_DIR")"
CONFIG_FILE="$(prompt_value "Config file path" "$DEFAULT_CONFIG_FILE")"

DEFAULT_HOST="${MIKROSCOPE_HOST:-127.0.0.1}"
DEFAULT_PORT="${MIKROSCOPE_PORT:-4310}"
DEFAULT_LOGS_PATH="${MIKROSCOPE_LOGS_PATH:-$INSTALL_DIR/logs}"
DEFAULT_DB_PATH="${MIKROSCOPE_DB_PATH:-$INSTALL_DIR/data/mikroscope.db}"
DEFAULT_API_TOKEN="${MIKROSCOPE_API_TOKEN:-}"
DEFAULT_INGEST_PRODUCERS="${MIKROSCOPE_INGEST_PRODUCERS:-}"
DEFAULT_CORS="${MIKROSCOPE_CORS_ALLOW_ORIGIN:-*}"

HOST="$(prompt_value "MIKROSCOPE_HOST" "$DEFAULT_HOST")"
PORT="$(prompt_value "MIKROSCOPE_PORT" "$DEFAULT_PORT")"
LOGS_PATH="$(prompt_value "MIKROSCOPE_LOGS_PATH" "$DEFAULT_LOGS_PATH")"
DB_PATH="$(prompt_value "MIKROSCOPE_DB_PATH" "$DEFAULT_DB_PATH")"
API_TOKEN="$(prompt_value "MIKROSCOPE_API_TOKEN (optional)" "$DEFAULT_API_TOKEN")"
INGEST_PRODUCERS="$(prompt_value "MIKROSCOPE_INGEST_PRODUCERS (optional)" "$DEFAULT_INGEST_PRODUCERS")"
CORS_ALLOW_ORIGIN="$(prompt_value "MIKROSCOPE_CORS_ALLOW_ORIGIN" "$DEFAULT_CORS")"

say "Extracting release..."
case "$ARCHIVE_NAME" in
  *.tar.gz|*.tgz)
    tar -xzf "$ARCHIVE_FILE" -C "$TMP_DIR"
    ;;
  *.zip)
    if has_cmd unzip; then
      unzip -q "$ARCHIVE_FILE" -d "$TMP_DIR"
    elif has_cmd bsdtar; then
      bsdtar -xf "$ARCHIVE_FILE" -C "$TMP_DIR"
    else
      die "unzip (or bsdtar) is required to extract .zip archives."
    fi
    ;;
  *)
    die "Unsupported archive format: ${ARCHIVE_NAME}. Expected .tar.gz, .tgz, or .zip."
    ;;
esac
PACKAGE_DIR="$(find "$TMP_DIR" -maxdepth 1 -type d -name 'mikroscope-*' | head -n1 || true)"
[ -n "$PACKAGE_DIR" ] || die "Could not locate extracted package directory."

mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$(dirname "$CONFIG_FILE")" "$LOGS_PATH" "$(dirname "$DB_PATH")"
cp -R "$PACKAGE_DIR"/. "$INSTALL_DIR"/
chmod +x "$INSTALL_DIR/mikroscope"

cat >"$CONFIG_FILE" <<EOF
MIKROSCOPE_HOST='$(escape_single_quotes "$HOST")'
MIKROSCOPE_PORT='$(escape_single_quotes "$PORT")'
MIKROSCOPE_LOGS_PATH='$(escape_single_quotes "$LOGS_PATH")'
MIKROSCOPE_DB_PATH='$(escape_single_quotes "$DB_PATH")'
MIKROSCOPE_API_TOKEN='$(escape_single_quotes "$API_TOKEN")'
MIKROSCOPE_INGEST_PRODUCERS='$(escape_single_quotes "$INGEST_PRODUCERS")'
MIKROSCOPE_CORS_ALLOW_ORIGIN='$(escape_single_quotes "$CORS_ALLOW_ORIGIN")'
EOF

WRAPPER_PATH="$BIN_DIR/mikroscope"
cat >"$WRAPPER_PATH" <<EOF
#!/usr/bin/env sh
set -eu
MIKROSCOPE_HOME='$(escape_single_quotes "$INSTALL_DIR")'
MIKROSCOPE_ENV='$(escape_single_quotes "$CONFIG_FILE")'

if [ -f "\$MIKROSCOPE_ENV" ]; then
  # shellcheck disable=SC1090
  . "\$MIKROSCOPE_ENV"
fi

if [ "\$#" -eq 0 ]; then
  exec "\$MIKROSCOPE_HOME/mikroscope" serve --host "\${MIKROSCOPE_HOST:-127.0.0.1}" --port "\${MIKROSCOPE_PORT:-4310}" --logs "\${MIKROSCOPE_LOGS_PATH:-\$MIKROSCOPE_HOME/logs}" --db "\${MIKROSCOPE_DB_PATH:-\$MIKROSCOPE_HOME/data/mikroscope.db}"
fi

exec "\$MIKROSCOPE_HOME/mikroscope" "\$@"
EOF
chmod +x "$WRAPPER_PATH"

say ""
say "MikroScope ${TAG_NAME} installed."
say "Install dir: ${INSTALL_DIR}"
say "Config file: ${CONFIG_FILE}"
say "Wrapper: ${WRAPPER_PATH}"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    say ""
    warn "${BIN_DIR} is not in PATH."
    warn "Add this to your shell profile:"
    warn "  export PATH=\"${BIN_DIR}:\$PATH\""
    ;;
esac

say ""
say "Run now:"
say "  ${WRAPPER_PATH}"
say "Or run commands directly:"
say "  ${WRAPPER_PATH} query --limit 10"
