# MikroScope ops runbook

This runbook covers day-2 operations for production deployments.

## Scope

| Data type | Typical path | Recovery notes |
| --- | --- | --- |
| Raw logs (source of truth) | `./logs/**/*.ndjson` | Keep these protected/backed up |
| SQLite index | `./data/mikroscope.db` (+ `-wal`, `-shm`) | Rebuildable from raw logs |

## Health checks

Primary health call:

```bash
curl -sS http://127.0.0.1:4310/health | jq .
```

| Field | Expected |
| --- | --- |
| `ok` | `true` |
| `ingest.lastError` | empty |
| `maintenance.lastError` | empty |
| `alerting.lastError` | empty |
| `storage.*FreeBytes` | above your operating threshold |

## Backup policy

Minimum backup set:

| Path | Required |
| --- | --- |
| `logs/` | Yes |
| `logs/audit/` (if used) | Yes |
| `data/mikroscope.db` | Yes |
| `data/mikroscope.db-wal` (if present) | Yes |
| `data/mikroscope.db-shm` (if present) | Yes |

Recommended cadence:

| Item | Cadence |
| --- | --- |
| Logs | Continuous replication or hourly snapshots |
| SQLite index | Daily snapshot |

Snapshot example:

```bash
SNAPSHOT_DIR="/var/backups/mikroscope/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SNAPSHOT_DIR"
cp -a logs "$SNAPSHOT_DIR/logs"
cp -a data "$SNAPSHOT_DIR/data"
```

## Restore procedures

### Option A: restore from logs only (preferred)

1. Stop MikroScope.
2. Remove or archive current DB files (`.db`, `.db-wal`, `.db-shm`).
3. Start MikroScope.
4. Trigger full reindex:

```bash
curl -sS -X POST http://127.0.0.1:4310/api/reindex \
  -H "Authorization: Bearer $MIKROSCOPE_API_TOKEN" | jq .
```

5. Verify `/health` and sample `/api/logs` responses.

### Option B: restore logs + DB snapshot

1. Stop MikroScope.
2. Restore snapshot files into `logs/` and `data/`.
3. Ensure ownership/permissions match runtime user.
4. Start MikroScope.
5. Verify `/health`.
6. Run `POST /api/reindex` if reconciliation is required.

## Incident playbook

| Symptom | Checks | Typical action |
| --- | --- | --- |
| API responds but no new logs appear | `/health` -> `ingest.lastError`, disk space, raw log writes | Fix ingest/disk issue, then run `/api/reindex` if index is stale |
| Alert webhooks not delivering | `/health` -> `alerting.lastError`, webhook reachability | Fix webhook/network, then tune retry/timeout/backoff if needed |

## Post-restore verification

```bash
curl -sS http://127.0.0.1:4310/health | jq .
curl -sS "http://127.0.0.1:4310/api/logs?limit=50" \
  -H "Authorization: Bearer $MIKROSCOPE_API_TOKEN" | jq .
```

| Check | Expected |
| --- | --- |
| API errors | None |
| Recent logs | Present |
| Pagination fields | `hasMore`, `limit`, `nextCursor` are coherent |
