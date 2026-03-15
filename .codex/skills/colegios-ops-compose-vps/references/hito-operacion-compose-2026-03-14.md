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

### 7) Patron de despliegue final en Coolify
- Dominio unico: `firma.da-tica.com`.
- Frontend publico en `/`.
- API publica en `/v1`.
- `compose/compose.yml` es la fuente operativa del deploy en Coolify.

### 8) Web estatica empaquetada
- Se abandono el bind mount `./web:/usr/share/nginx/html:ro` para Coolify.
- Se agrego `web/Dockerfile` y el servicio `web` ahora se construye como imagen.
- Motivo: el bind mount en Coolify podia apuntar a un directorio del host sin el contenido esperado y provocar `403 directory index forbidden`.

### 9) Arranque resiliente del API
- Se agrego `services/api/scripts/startup.sh`.
- El script reintenta `npx prisma migrate deploy` antes de ejecutar `seed` y arrancar la API.
- Esto evita falsos negativos cuando Postgres ya esta levantando pero aun no es utilizable desde el contenedor `api`.

### 10) Redes y aliases internos unicos
- En Coolify el stack queda conectado a varias redes (`coolify`, red de proyecto, red interna).
- Los aliases genericos `postgres`, `db`, `redis`, `cache` pueden resolver por la red equivocada.
- Regla nueva: usar aliases internos unicos:
  - `colegios-db`
  - `colegios-cache`

### 11) Labels de Traefik efectivas, no teoricas
- Si `docker inspect ... .Config.Labels` muestra placeholders `${...}` literales, Compose no esta interpolando las labels como se esperaba.
- En ese caso, para despliegues de produccion estables, hardcodear labels de Traefik con:
  - dominio real
  - nombres reales de routers/servicios
  - red real del proxy

### 12) EntryPoints reales del proxy de Coolify
- El proxy `coolify-proxy` expone entrypoints:
  - `http`
  - `https`
- No usar `web` ni `websecure` en este VPS.
- La validacion correcta se hace con:
  - `docker inspect coolify-proxy --format '{{json .Config.Cmd}}'`
  - `docker logs coolify-proxy --tail 200`

### 13) Checklist de cierre del deploy
1. `docker ps` debe mostrar `api`, `web`, `worker`, `postgres`, `redis` en `healthy`.
2. `curl -I http://127.0.0.1:${WEB_HOST_PORT}` debe responder `200`.
3. `curl -i http://127.0.0.1:${API_HOST_PORT}/health` debe responder `200`.
4. `docker inspect <web/api> --format '{{json .Config.Labels}}'` debe reflejar dominio, network y entrypoints correctos.
5. Si el dominio publico falla pero 1-4 pasan, el problema restante es Traefik/proxy, no la app.

## Nuevas reglas de ingeniería derivadas
1. Todo cambio de compose debe acompañarse de actualización de scripts/docs.
2. Todo endpoint de salud debe ser verificable desde host o contenedor sin pasos manuales.
3. El triage base siempre inicia con `status + check-env + check-health`.
4. Ningún secreto va hardcodeado en compose o documentación.
5. Toda degradación debe mapearse a comando reproducible en `TROUBLESHOOTING`.
6. En Coolify, nunca asumir nombres de entrypoints; inspeccionarlos en `coolify-proxy`.
7. Para web estática en producción, preferir imagen construida a bind mount.
8. Ante redes superpuestas, priorizar aliases internos únicos y validación con `getent hosts`.

## Riesgos identificados para próximos hitos
- Requiere disciplina de mantener `env/.env` actualizado contra `.env.example`.
- Si cambia contrato de `/ready`, puede romper healthchecks y `check-health.sh`.
- Si Traefik cambia de red/entrypoint, labels deben sincronizarse.
- El arranque `migrate + seed + start` sigue siendo útil para MVP pero conviene separarlo cuando el entorno productivo se estabilice.
