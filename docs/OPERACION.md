# Operacion diaria

## 1) Levantar / bajar / reiniciar
```bash
bash scripts/up.sh
bash scripts/down.sh
bash scripts/restart.sh
```

## 2) Estado y salud
```bash
bash scripts/status.sh
bash scripts/check-health.sh
```

Indicadores clave:
- `state=running` en todos los servicios.
- `health=healthy` en `api`, `worker`, `web`, `postgres`, `redis`.
- `restarts` estable (si aumenta, investigar).

## 3) Logs
```bash
bash scripts/logs.sh
bash scripts/logs.sh api
bash scripts/logs-follow.sh worker
```

Prioridad de inspeccion:
1. `api` y `worker` por errores de negocio/colas.
2. `postgres` por rechazos/conexiones.
3. `redis` por disponibilidad de cola/cache.
4. `web` por 502/504 o contenido.

## 4) Acceso a contenedores
```bash
bash scripts/exec-api.sh
bash scripts/exec-worker.sh
bash scripts/exec-db.sh
```

## 5) Red, disco, RAM y volumenes
```bash
bash scripts/check-network.sh
bash scripts/check-disk.sh 85
bash scripts/check-memory.sh 85
bash scripts/check-volumes.sh
```

## 6) Inspeccion puntual
```bash
bash scripts/inspect.sh api
bash scripts/inspect.sh postgres
```

## 6.1) Soporte VPS interactivo
Para diagnostico rapido en VPS con contenedores de Coolify:
```bash
bash scripts/vps-debug.sh
RESOURCE_UUID=kog0wcwocwcsok8cwc4gc80g bash scripts/vps-debug.sh status
RESOURCE_UUID=kog0wcwocwcsok8cwc4gc80g bash scripts/vps-debug.sh api-env
RESOURCE_UUID=kog0wcwocwcsok8cwc4gc80g bash scripts/vps-debug.sh postgres-check
```

Atajos utiles:
- `api-env`: muestra `POSTGRES_*`, `DATABASE_URL`, `REDIS_*`, `OMNI*`, `FIRMALO*`.
- `api-logs`: saca las ultimas lineas del `api`.
- `postgres-check`: valida acceso TCP real a Postgres con las credenciales del contenedor.
- `ports`: revisa puertos Docker publicados y listeners locales del host.

## 7) Recuperacion rapida recomendada
1. `bash scripts/status.sh`
2. `bash scripts/check-env.sh`
3. `bash scripts/check-health.sh`
4. `bash scripts/logs.sh api` y `bash scripts/logs.sh worker`
5. Si persiste: `bash scripts/restart.sh`
6. Si hay dano de datos: seguir `docs/BACKUP_RESTORE.md`
