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
- Compose operativo: `G:\codex_projects\colegios\compose` (Entorno actual: Todo el trabajo se lanza directamente al VPS, ya no trabajamos en local).
- Variables: `env/.env.example`, `.env.example`
- Imagenes/runtime de arranque:
  - `services/api/Dockerfile`
  - `services/api/scripts/startup.sh`
  - `web/Dockerfile`
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
11. En Coolify no depender de bind mounts para `web`; el frontend estático debe salir de una imagen propia (`web/Dockerfile`).
12. En stacks conectados a varias redes Docker, usar aliases internos únicos para dependencias (`colegios-db`, `colegios-cache`) y no nombres genéricos.
13. Antes de tocar labels de Traefik, inspeccionar labels efectivas del contenedor; si aparecen `${...}` literales, hardcodear los valores operativos del deploy.
14. En este VPS con Coolify, los entrypoints válidos del proxy son `http` y `https`; no usar `web` ni `websecure`.
15. Si el API depende de Prisma al arrancar, encapsular `migrate deploy` en un script con reintentos antes de concluir que la credencial o la red fallan.

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

## Flujo cuando el stack interno esta sano pero el dominio publico falla
1. Validar salud local desde el host:
   - `curl -I http://127.0.0.1:${WEB_HOST_PORT}`
   - `curl -i http://127.0.0.1:${API_HOST_PORT}/health`
2. Confirmar `healthy` en `api`, `web`, `worker`, `postgres`, `redis`.
3. Inspeccionar labels efectivas en `web` y `api`:
   - reglas `Host(...)`
   - `traefik.docker.network`
   - `entrypoints`
4. Inspeccionar `coolify-proxy`:
   - `docker inspect coolify-proxy --format '{{json .Config.Cmd}}'`
   - `docker logs coolify-proxy --tail 200`
5. Si Traefik reporta entrypoints inexistentes o placeholders literales, corregir compose antes de cambiar codigo de aplicacion.

## Patrones operativos consolidados en este hito
- Dominio unico con API por path: `https://firma.da-tica.com` y `https://firma.da-tica.com/v1/...`.
- `api` y `web` pueden quedar sanos aunque el problema siga siendo exclusivamente de proxy; distinguir app rota de routing roto.
- El error Prisma `P1000` en Coolify puede ser sintoma de:
  - credenciales persistidas en volumen viejo
  - hostname resolviendo por red equivocada
  - arranque demasiado temprano antes de estabilizar dependencias
- Si una prueba manual con la misma imagen funciona pero el contenedor real falla, revisar primero redes, aliases y comando de entrada antes de tocar la base.

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
