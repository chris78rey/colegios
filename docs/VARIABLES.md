# Variables de entorno

## Ubicacion
- Operativo: `env/.env`
- Plantilla: `env/.env.example`

## Reglas
- No commitear secretos reales.
- Mantener nombres consistentes.
- Validar siempre con `bash scripts/check-env.sh`.

## Variables criticas

### Identidad y runtime
- `COMPOSE_PROJECT_NAME`: prefijo de recursos Docker.
- `APP_ENV`: `production`/`staging`/`development`.
- `APP_VERSION`: version desplegada mostrada por `/version`.
- `TZ`: zona horaria (`America/Guayaquil`).
- `LOG_LEVEL`: `debug|info|warn|error`.

### Proxy y dominio
- `CLIENT_ID`: identificador para labels Traefik.
- `WEB_DOMAIN`: dominio frontend.
- `API_DOMAIN`: dominio API.
- `TRAEFIK_DOCKER_NETWORK`: red externa de Traefik.
- `TRAEFIK_CERT_RESOLVER`: resolvedor TLS.

### Puertos de diagnostico local
- `API_HOST_PORT`: loopback para API (default 8080).
- `WORKER_HOST_PORT`: loopback para worker (default 8081).
- `WEB_HOST_PORT`: loopback para web (default 5173).

### Postgres
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

### Recursos (limites/reservas)
- `API_MEM_LIMIT`, `API_MEM_RESERVATION`, `API_CPUS`
- `WORKER_MEM_LIMIT`, `WORKER_MEM_RESERVATION`, `WORKER_CPUS`
- `WEB_MEM_LIMIT`, `WEB_MEM_RESERVATION`, `WEB_CPUS`
- `POSTGRES_MEM_LIMIT`, `POSTGRES_MEM_RESERVATION`, `POSTGRES_CPUS`
- `REDIS_MEM_LIMIT`, `REDIS_MEM_RESERVATION`, `REDIS_CPUS`, `REDIS_MAXMEMORY`

### Aplicacion / secretos
- `DESKTOP_WEB_TOKEN_SECRET`
- `OMNISWITCH_MODE`
- `OMNISWITCH_API_URL`
- `OMNISWITCH_USER`
- `OMNISWITCH_PASSWORD`
