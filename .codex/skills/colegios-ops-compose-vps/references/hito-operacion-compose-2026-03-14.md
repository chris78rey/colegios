# Hito Operación Compose VPS - 2026-03-14

## Cambios técnicos consolidados

### 1) Arquitectura de runtime orientada a soporte
- Se creó `compose/compose.yml` como base operativa.
- Topología: `api`, `worker`, `web`, `postgres`, `redis`.
- Se separó red `internal` (aislada) de red `public` (Traefik/Coolify).
- Postgres/Redis quedan sin puertos públicos.
- Puertos de diagnóstico se limitan a loopback:
  - API `127.0.0.1:8080`
  - Worker `127.0.0.1:8081`
  - Web `127.0.0.1:5173`

### 2) Salud real por componente
- API: healthcheck HTTP real a `/health`.
- Worker: healthcheck HTTP real a `/ready`.
- Postgres: `pg_isready`.
- Redis: `redis-cli ping`.
- Web: `wget` a `/`.

### 3) Lógica de readiness/versionado en app
- API (`services/api/src/index.js`):
  - `/ready` valida DB via `SELECT 1`.
  - `/version` expone versión/env/timestamp.
- Worker (`services/worker/src/index.js`):
  - `/ready` valida reachability de API `/health`.
  - `/version` expone versión/env/timestamp.

### 4) Manejo de errores y trazabilidad
- API adopta log estructurado por request con duración y status code.
- Se define patrón de correlación con `x-request-id`.
- Respuestas de readiness distinguen `ready` vs `not_ready` con checks explícitos.

### 5) Operación estandarizada por scripts
Se creó set operativo:
- ciclo de vida: `up/down/restart/status`
- observación: `logs/logs-follow/inspect`
- diagnóstico infra: `check-env/check-network/check-disk/check-memory/check-volumes`
- diagnóstico app: `check-health`
- acceso runtime: `exec-api/exec-worker/exec-db`
- continuidad: `backup-db/restore-db`

### 6) Contrato de documentación operativa
Se incorporaron runbooks obligatorios:
- `docs/OPERACION.md`
- `docs/TROUBLESHOOTING.md`
- `docs/VARIABLES.md`
- `docs/BACKUP_RESTORE.md`
- `docs/CHECKLIST_VPS.md`
- `monitoring/OBSERVABILIDAD.md`
- `diagnostics/quick-triage.md`

## Nuevas reglas de ingeniería derivadas
1. Todo cambio de compose debe acompañarse de actualización de scripts/docs.
2. Todo endpoint de salud debe ser verificable desde host o contenedor sin pasos manuales.
3. El triage base siempre inicia con `status + check-env + check-health`.
4. Ningún secreto va hardcodeado en compose o documentación.
5. Toda degradación debe mapearse a comando reproducible en `TROUBLESHOOTING`.

## Riesgos identificados para próximos hitos
- Requiere disciplina de mantener `env/.env` actualizado contra `.env.example`.
- Si cambia contrato de `/ready`, puede romper healthchecks y `check-health.sh`.
- Si Traefik cambia de red/entrypoint, labels deben sincronizarse.
