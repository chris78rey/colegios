---
name: colegios-ops-compose-vps
description: Runbook operativo para despliegue, observabilidad ligera y soporte en VPS Linux con Docker Compose (api, worker, web, postgres, redis). Usar cuando se modifique compose, scripts de soporte, endpoints de salud o documentación operativa.
---

# Colegios Ops Compose VPS

## Purpose
Estandarizar operación y soporte técnico en VPS Linux para que cualquier agente pueda responder rápido:
- qué está caído
- qué está degradado
- qué consume recursos
- qué no tiene conectividad
- qué volumen o variable falló
- qué contenedor reinicia
- qué endpoint no responde

## Scope de este skill
- Compose operativo: `compose/compose.yml`
- Variables: `env/.env.example`, `.env.example`
- Endpoints de salud/versionado en app:
  - `services/api/src/index.js`
  - `services/worker/src/index.js`
- Scripts de soporte en `scripts/*.sh`
- Documentación operativa en `docs/`, `monitoring/`, `diagnostics/`

## Reglas Operativas (obligatorias)
1. Nunca exponer Postgres/Redis al exterior; solo red interna.
2. API/worker/web se publican en loopback (`127.0.0.1`) para diagnóstico local del host.
3. Todo servicio crítico debe tener healthcheck real:
   - API: HTTP `/health`
   - Worker: HTTP `/ready` (dependencia real)
   - Postgres: `pg_isready`
   - Redis: `redis-cli ping`
   - Web: `wget`/HTTP local
4. `depends_on` debe usar `condition: service_healthy` para dependencias duras.
5. Mantener límites y reservas de recursos por servicio.
6. Activar rotación de logs Docker (`json-file` con `max-size`/`max-file`).
7. Mantener `restart: unless-stopped` en servicios de runtime.
8. Mantener `security_opt: no-new-privileges:true` cuando sea viable.
9. Toda mejora operativa debe incluir actualización de docs y scripts.
10. Si cambias contrato de salud, actualiza `scripts/check-health.sh`.

## Contrato de endpoints de salud
- API:
  - `GET /health`: liveness del proceso.
  - `GET /ready`: verificación de dependencia DB (`SELECT 1`).
  - `GET /version`: `{service, version, env, now}`.
- Worker:
  - `GET /health`: liveness del proceso.
  - `GET /ready`: reachability a API (`/health`).
  - `GET /version`: `{service, version, env, now}`.

## Patrón de trazabilidad
- Aceptar `X-Request-Id` si llega desde proxy y devolverlo en respuesta.
- Si no llega, generar UUID.
- Loguear por request en JSON con:
  - `ts`, `level`, `service`, `request_id`, `method`, `path`, `status_code`, `duration_ms`.

## Flujo de diagnóstico estándar (primero esto)
1. `bash scripts/status.sh`
2. `bash scripts/check-env.sh`
3. `bash scripts/check-health.sh`
4. `bash scripts/check-disk.sh && bash scripts/check-memory.sh`
5. `bash scripts/logs.sh api && bash scripts/logs.sh worker`
6. Si sigue degradado: `bash scripts/restart.sh`

## Cambios futuros: definición de terminado
Un cambio de despliegue/operación está terminado solo si cumple:
- Compose válido (`docker compose config`).
- Scripts shell sin error (`bash -n scripts/*.sh`).
- Docs operativas alineadas (`OPERACION`, `TROUBLESHOOTING`, `VARIABLES`, `BACKUP_RESTORE`).
- Matriz de fallos actualizada cuando haya nuevo modo de fallo.

## Anti-patrones a evitar
- Healthchecks cosméticos (`exit 0` sin validación).
- Exponer DB/Redis por `ports` abiertos.
- Variables críticas no documentadas.
- Diagnóstico dependiente de conocimiento tribal.
- Logs sin timestamp/identificador de correlación.

## References
- `references/hito-operacion-compose-2026-03-14.md`
