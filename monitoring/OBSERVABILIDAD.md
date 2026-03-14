# Observabilidad ligera

## Señales disponibles
- Estado/health Docker por servicio.
- Endpoints: `/health`, `/ready`, `/version` en API y worker.
- Logs JSON con `ts`, `service`, `request_id`, `status_code`, `duration_ms` en API.
- Rotacion de logs Docker (`20m` x 5 archivos por contenedor).

## Donde mirar primero
1. `bash scripts/status.sh`
2. `bash scripts/check-health.sh`
3. `bash scripts/logs.sh api`
4. `bash scripts/logs.sh worker`
5. `bash scripts/check-disk.sh` y `bash scripts/check-memory.sh`

## Correlacion basica
- Propagar `X-Request-Id` desde proxy a API.
- API devuelve `x-request-id` en cada respuesta.
- Reusar el mismo ID en worker cuando procese jobs asociados.

## Endpoint contract
- `/health`: proceso vivo.
- `/ready`: dependencias criticas listas.
- `/version`: version desplegada + entorno + timestamp.

## Metricas opcionales
- Solo si aporta: exponer `/metrics` de app con contadores simples.
- Mantener fuera por defecto para no aumentar complejidad operativa.
