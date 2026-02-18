# MikroScope Ops Runbook

This runbook covers day-2 operations for MikroScope in production:

- health checks
- backup strategy
- restore and recovery procedures

## Scope

MikroScope state is split across:

- raw log files (for example `./logs/**/*.ndjson`)
- indexed SQLite files (for example `./data/mikroscope.db`, plus `-wal` and `-shm`)

Raw logs are the source of truth. The SQLite index can always be rebuilt from logs with a full reindex.

## Health Checks

Use the sidecar health endpoint:

```bash
curl -sS http://127.0.0.1:4310/health | jq .
```

Check:

- `ok` is `true`
- `ingest.lastError` is empty
- `maintenance.lastError` is empty
- `alerting.lastError` is empty
- free disk values (`storage.*FreeBytes`) are healthy

## Backup Policy

Minimum recommended backup set:

- `logs/` (including `logs/audit/` if used)
- `data/mikroscope.db`
- `data/mikroscope.db-wal` (if present)
- `data/mikroscope.db-shm` (if present)

Recommended cadence:

- logs: continuous (or hourly snapshots)
- SQLite index: daily snapshot

Example snapshot command:

```bash
SNAPSHOT_DIR="/var/backups/mikroscope/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SNAPSHOT_DIR"
cp -a logs "$SNAPSHOT_DIR/logs"
cp -a data "$SNAPSHOT_DIR/data"
```

## Restore Procedures

### Option A: Restore from logs only (preferred)

Use this when raw logs are intact and the index is missing/corrupted/stale.

1. Stop MikroScope.
2. Remove or archive existing DB files (`.db`, `.db-wal`, `.db-shm`).
3. Start MikroScope.
4. Trigger full reindex:

```bash
curl -sS -X POST http://127.0.0.1:4310/api/reindex \
  -H "Authorization: Bearer $MIKROSCOPE_API_TOKEN" | jq .
```

1. Verify `/health` and sample `/api/logs` query responses.

### Option B: Restore logs + DB from snapshot

Use this when both logs and index must be rolled back to a known snapshot.

1. Stop MikroScope.
2. Restore snapshot files into `logs/` and `data/`.
3. Ensure ownership/permissions match runtime user.
4. Start MikroScope.
5. Verify `/health`.
6. Run `POST /api/reindex` if you need to force reconciliation with current log files.

## Incident Playbook

### Symptom: API is up but no new logs appear

1. Check `/health` -> `ingest.lastError`.
2. Confirm raw logs are still being appended.
3. Confirm free disk is above policy minimum.
4. If index is stale, run `POST /api/reindex`.

### Symptom: Alert webhooks not delivering

1. Check `/health` -> `alerting.lastError`.
2. Confirm webhook URL and network egress.
3. Confirm alert thresholds and cooldown are configured as intended.
4. If endpoint is flaky, tune:
   - `MIKROSCOPE_ALERT_WEBHOOK_TIMEOUT_MS`
   - `MIKROSCOPE_ALERT_WEBHOOK_RETRY_ATTEMPTS`
   - `MIKROSCOPE_ALERT_WEBHOOK_BACKOFF_MS`

## Verification After Any Restore

Run:

```bash
curl -sS http://127.0.0.1:4310/health | jq .
curl -sS "http://127.0.0.1:4310/api/logs?limit=50" \
  -H "Authorization: Bearer $MIKROSCOPE_API_TOKEN" | jq .
```

Confirm:

- no server errors
- expected recent logs are returned
- pagination fields (`hasMore`, `limit`, `nextCursor`) look correct
