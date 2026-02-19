#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${MIKROSCOPE_DEMO_DIR:-${TMPDIR:-/tmp}/mikroscope-alert-demo}"
LOGS_PATH="${STATE_DIR}/logs"
DATA_PATH="${STATE_DIR}/data"
WEBHOOK_LOG="${STATE_DIR}/webhook.log"
MIKROSCOPE_LOG="${STATE_DIR}/mikroscope.log"
WEBHOOK_PID_FILE="${STATE_DIR}/webhook.pid"
MIKROSCOPE_PID_FILE="${STATE_DIR}/mikroscope.pid"
MODE_FILE="${STATE_DIR}/mode"

API_HOST="${MIKROSCOPE_DEMO_HOST:-127.0.0.1}"
API_PORT="${MIKROSCOPE_DEMO_API_PORT:-4310}"
WEBHOOK_PORT="${MIKROSCOPE_DEMO_WEBHOOK_PORT:-9999}"

INGEST_TOKEN="${MIKROSCOPE_DEMO_INGEST_TOKEN:-ingest-token}"
QUERY_TOKEN="${MIKROSCOPE_DEMO_QUERY_TOKEN:-query-token}"
PRODUCER_ID="${MIKROSCOPE_DEMO_PRODUCER_ID:-manual-producer}"

say() {
  printf "%s\n" "$*"
}

die() {
  printf "error: %s\n" "$*" >&2
  exit 1
}

ensure_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

read_pid() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  cat "$pid_file"
}

is_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

resolve_mikroscope_cmd() {
  if command -v mikroscope >/dev/null 2>&1; then
    printf "mikroscope"
    return
  fi

  if [[ -f "${ROOT_DIR}/dist/cli.mjs" ]]; then
    printf "node %q" "${ROOT_DIR}/dist/cli.mjs"
    return
  fi

  printf "npx tsx %q" "${ROOT_DIR}/src/cli.ts"
}

wait_for_health() {
  local max_attempts=50
  local url="http://${API_HOST}:${API_PORT}/health"
  for ((i = 1; i <= max_attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return
    fi
    sleep 0.2
  done
  die "MikroScope did not become healthy at ${url}"
}

start_webhook_server() {
  : >"$WEBHOOK_LOG"
  WEBHOOK_PORT="$WEBHOOK_PORT" WEBHOOK_HOST="$API_HOST" node -e '
    const http = require("node:http");
    const port = Number(process.env.WEBHOOK_PORT);
    const host = process.env.WEBHOOK_HOST;
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let payload = raw;
        try {
          payload = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {}
        process.stdout.write(`\n--- webhook ${new Date().toISOString()} ---\n${payload}\n`);
        res.statusCode = 204;
        res.end();
      });
    });
    server.listen(port, host, () => {
      process.stdout.write(`Webhook catcher listening on http://${host}:${port}/webhook\n`);
    });
  ' \
    >>"$WEBHOOK_LOG" 2>&1 &

  local webhook_pid=$!
  echo "$webhook_pid" >"$WEBHOOK_PID_FILE"
}

start_mikroscope() {
  local mode="$1"
  local mikroscope_cmd
  mikroscope_cmd="$(resolve_mikroscope_cmd)"
  : >"$MIKROSCOPE_LOG"

  local mode_flags=()
  if [[ "$mode" == "nologs" ]]; then
    mode_flags=(
      --alert-error-threshold 999999
      --alert-no-logs-threshold-minutes 1
    )
  else
    mode_flags=(
      --alert-error-threshold 2
      --alert-no-logs-threshold-minutes 0
    )
  fi

  # shellcheck disable=SC2086
  eval "$mikroscope_cmd" serve \
    --host "$API_HOST" \
    --port "$API_PORT" \
    --logs "$LOGS_PATH" \
    --db "${DATA_PATH}/mikroscope.db" \
    --api-token "$QUERY_TOKEN" \
    --ingest-producers "${INGEST_TOKEN}=${PRODUCER_ID}" \
    --alert-webhook-url "http://${API_HOST}:${WEBHOOK_PORT}/webhook" \
    --alert-interval-ms 1000 \
    --alert-window-minutes 5 \
    --alert-cooldown-ms 15000 \
    "${mode_flags[@]}" \
    >"$MIKROSCOPE_LOG" 2>&1 &

  local mikroscope_pid=$!
  echo "$mikroscope_pid" >"$MIKROSCOPE_PID_FILE"
}

up() {
  local mode="${1:-error}"
  [[ "$mode" == "error" || "$mode" == "nologs" ]] || die "mode must be 'error' or 'nologs'"
  ensure_cmd curl
  ensure_cmd node

  mkdir -p "$STATE_DIR"
  rm -rf "$LOGS_PATH" "$DATA_PATH"
  mkdir -p "$LOGS_PATH" "$DATA_PATH"
  if pid="$(read_pid "$MIKROSCOPE_PID_FILE")" && is_running "$pid"; then
    die "demo already running (pid ${pid}). Use: bash scripts/manual-alert-demo.sh down"
  fi

  start_webhook_server
  start_mikroscope "$mode"
  echo "$mode" >"$MODE_FILE"
  wait_for_health

  say "Manual alert demo is running."
  say "Mode: $mode"
  say "MikroScope: http://${API_HOST}:${API_PORT}"
  say "Webhook:   http://${API_HOST}:${WEBHOOK_PORT}/webhook"
  say ""
  say "Next commands:"
  say "  bash scripts/manual-alert-demo.sh trigger-error"
  say "  bash scripts/manual-alert-demo.sh status"
  say "  bash scripts/manual-alert-demo.sh logs"
  say "  bash scripts/manual-alert-demo.sh down"
  if [[ "$mode" == "nologs" ]]; then
    say ""
    say "No-logs mode is active. Wait ~60-70s with no ingest events to receive a webhook."
  fi
}

trigger_error() {
  ensure_cmd curl
  local now
  now="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
  local ingest_url="http://${API_HOST}:${API_PORT}/api/ingest"

  curl -fsS "$ingest_url" \
    -H "Authorization: Bearer ${INGEST_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "[{\"timestamp\":\"${now}\",\"level\":\"ERROR\",\"event\":\"manual.alert.test\",\"message\":\"boom-1\"},{\"timestamp\":\"${now}\",\"level\":\"ERROR\",\"event\":\"manual.alert.test\",\"message\":\"boom-2\"}]" \
    >/dev/null

  say "Sent 2 ERROR logs to ${ingest_url}"
}

status() {
  ensure_cmd curl
  local health_url="http://${API_HOST}:${API_PORT}/health"
  if command -v jq >/dev/null 2>&1; then
    curl -fsS "$health_url" | jq '{ok, alerting, alertPolicy}'
  else
    curl -fsS "$health_url"
  fi
}

logs() {
  say "== Webhook log =="
  if [[ -f "$WEBHOOK_LOG" ]]; then
    tail -n 120 "$WEBHOOK_LOG"
  else
    say "(no webhook log yet)"
  fi

  say ""
  say "== MikroScope log =="
  if [[ -f "$MIKROSCOPE_LOG" ]]; then
    tail -n 120 "$MIKROSCOPE_LOG"
  else
    say "(no mikroscope log yet)"
  fi
}

down() {
  local stopped_any=0
  if pid="$(read_pid "$MIKROSCOPE_PID_FILE")" && is_running "$pid"; then
    kill "$pid" >/dev/null 2>&1 || true
    stopped_any=1
  fi
  if pid="$(read_pid "$WEBHOOK_PID_FILE")" && is_running "$pid"; then
    kill "$pid" >/dev/null 2>&1 || true
    stopped_any=1
  fi
  rm -f "$MIKROSCOPE_PID_FILE" "$WEBHOOK_PID_FILE" "$MODE_FILE"

  if [[ "$stopped_any" -eq 1 ]]; then
    say "Stopped manual alert demo processes."
  else
    say "No running demo processes found."
  fi
}

usage() {
  cat <<EOF
Usage: bash scripts/manual-alert-demo.sh <command> [mode]

Commands:
  up [error|nologs]  Start webhook catcher + MikroScope demo (default mode: error)
  trigger-error      Send two ERROR logs to trigger error-threshold alert
  status             Show /health alerting status
  logs               Show recent webhook and MikroScope logs
  down               Stop demo processes
EOF
}

main() {
  local cmd="${1:-help}"
  case "$cmd" in
    up)
      up "${2:-error}"
      ;;
    trigger-error)
      trigger_error
      ;;
    status)
      status
      ;;
    logs)
      logs
      ;;
    down)
      down
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      die "unknown command: $cmd (run with --help)"
      ;;
  esac
}

main "$@"
