# MikroScope systemd reference

Use this with the release-based install flow in `/README.md` (section: "VM Deployment (systemd)").

## Included files

| File | Purpose |
| --- | --- |
| `mikroscope.service` | Long-running MikroScope API sidecar |
| `mikroscope-reindex.service` | One-shot full reindex operation |
| `mikroscope-reindex.timer` | Daily timer for reindex job |
| `mikroscope.env.example` | Baseline environment config |

## Install steps (VM)

1. Copy and prepare config:

```bash
sudo mkdir -p /etc/mikroscope
sudo cp deploy/systemd/mikroscope.env.example /etc/mikroscope/mikroscope.env
```

2. Install unit files:

```bash
sudo cp deploy/systemd/mikroscope.service /etc/systemd/system/
sudo cp deploy/systemd/mikroscope-reindex.service /etc/systemd/system/
sudo cp deploy/systemd/mikroscope-reindex.timer /etc/systemd/system/
```

3. Reload and enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mikroscope.service
sudo systemctl enable --now mikroscope-reindex.timer
```

## Verification

| Check | Command |
| --- | --- |
| Service status | `systemctl status mikroscope.service --no-pager` |
| Reindex timer status | `systemctl status mikroscope-reindex.timer --no-pager` |
| API health | `curl -sS http://127.0.0.1:4310/health` |
