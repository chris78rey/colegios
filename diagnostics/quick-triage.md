# Quick Triage (primeros 5 minutos)

Objetivo: responder rapido que esta caido/degradado y que hacer primero.

1. Estado general:
```bash
bash scripts/status.sh
```
2. Variables y salud:
```bash
bash scripts/check-env.sh
bash scripts/check-health.sh
```
3. Infraestructura base:
```bash
bash scripts/check-disk.sh
bash scripts/check-memory.sh
bash scripts/check-network.sh
bash scripts/check-volumes.sh
```
4. Logs de foco:
```bash
bash scripts/logs.sh api
bash scripts/logs.sh worker
bash scripts/logs.sh postgres
bash scripts/logs.sh redis
```
5. Accion de contencion:
```bash
bash scripts/restart.sh
```

Si no recupera, activar restore segun `docs/BACKUP_RESTORE.md`.
