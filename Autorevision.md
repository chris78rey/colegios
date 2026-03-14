# 1) Resumen arquitectonico
Arquitectura operativa basada en Docker Compose para VPS Linux con 5 servicios: pi, worker, web, postgres, edis.

Pilares de operacion:
- Diagnostico rapido por scripts estandarizados en scripts/.
- Salud real por healthchecks de app y dependencias.
- Trazabilidad por logs con timestamp y equest_id.
- Persistencia con volumenes bind (data/) y backups en ackups/.
- Separacion de red interna/publica y exposure minima (DB/Redis no publicos).
- Compatibilidad con Traefik/Coolify via labels y red externa.

# 2) Supuestos adoptados
- VPS Linux con Docker Engine + Docker Compose plugin.
- Proxy reverso externo (Traefik/Coolify) ya desplegado y red coolify existente.
- DNS de WEB_DOMAIN y API_DOMAIN apuntando al VPS.
- Operador con acceso shell y permisos de Docker.
- No se usa Kubernetes.
- Zona horaria operativa: America/Guayaquil.

# 3) Estructura de carpetas propuesta
`	ext
.
├─ compose/
│  └─ compose.yml
├─ env/
│  ├─ .env
│  └─ .env.example
├─ scripts/
│  ├─ _common.sh
│  ├─ up.sh
│  ├─ down.sh
│  ├─ restart.sh
│  ├─ status.sh
│  ├─ logs.sh
│  ├─ logs-follow.sh
│  ├─ inspect.sh
│  ├─ check-env.sh
│  ├─ check-network.sh
│  ├─ check-disk.sh
│  ├─ check-memory.sh
│  ├─ check-health.sh
│  ├─ check-volumes.sh
│  ├─ exec-api.sh
│  ├─ exec-worker.sh
│  ├─ exec-db.sh
│  ├─ backup-db.sh
│  └─ restore-db.sh
├─ docs/
│  ├─ OPERACION.md
│  ├─ TROUBLESHOOTING.md
│  ├─ VARIABLES.md
│  ├─ BACKUP_RESTORE.md
│  └─ CHECKLIST_VPS.md
├─ monitoring/
│  └─ OBSERVABILIDAD.md
├─ diagnostics/
│  └─ quick-triage.md
├─ backups/
├─ logs/
└─ data/
   ├─ postgres/
   ├─ redis/
   └─ storage/
`

# 4) docker-compose.yml completo
Archivo implementado: compose/compose.yml

`yaml
name: ${COMPOSE_PROJECT_NAME:-colegios_ops}

x-logging: &default-logging
  driver: "json-file"
  options:
    max-size: "20m"
    max-file: "5"

services:
  api:
    build:
      context: ../services/api
      dockerfile: Dockerfile
    image: ${API_IMAGE:-colegios_api:local}
    restart: unless-stopped
    env_file:
      - ../env/.env
    environment:
      TZ: ${TZ:-America/Guayaquil}
      NODE_ENV: ${APP_ENV:-production}
      PORT: 8080
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379
      STORAGE_PATH: /data/storage
      API_BASE_URL: http://api:8080
      APP_VERSION: ${APP_VERSION:-dev}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    volumes:
      - ../data/storage:/data/storage
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - internal
      - public
    expose:
      - "8080"
    ports:
      - "127.0.0.1:${API_HOST_PORT:-8080}:8080"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 20s
    mem_limit: ${API_MEM_LIMIT:-768m}
    mem_reservation: ${API_MEM_RESERVATION:-256m}
    cpus: ${API_CPUS:-1.0}
    security_opt:
      - no-new-privileges:true
    labels:
      - traefik.enable=true
      - traefik.docker.network=${TRAEFIK_DOCKER_NETWORK:-coolify}
      - traefik.http.routers.${CLIENT_ID:-colegios}-api.rule=Host(`${API_DOMAIN}`)
      - traefik.http.routers.${CLIENT_ID:-colegios}-api.entrypoints=websecure
      - traefik.http.routers.${CLIENT_ID:-colegios}-api.tls=true
      - traefik.http.routers.${CLIENT_ID:-colegios}-api.tls.certresolver=${TRAEFIK_CERT_RESOLVER:-letsencrypt}
      - traefik.http.services.${CLIENT_ID:-colegios}-api.loadbalancer.server.port=8080
    logging: *default-logging

  worker:
    build:
      context: ../services/worker
      dockerfile: Dockerfile
    image: ${WORKER_IMAGE:-colegios_worker:local}
    restart: unless-stopped
    env_file:
      - ../env/.env
    environment:
      TZ: ${TZ:-America/Guayaquil}
      NODE_ENV: ${APP_ENV:-production}
      PORT: 8081
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379
      STORAGE_PATH: /data/storage
      API_BASE_URL: http://api:8080
      APP_VERSION: ${APP_VERSION:-dev}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    volumes:
      - ../data/storage:/data/storage
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      api:
        condition: service_healthy
    networks:
      - internal
    expose:
      - "8081"
    ports:
      - "127.0.0.1:${WORKER_HOST_PORT:-8081}:8081"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8081/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 20s
    mem_limit: ${WORKER_MEM_LIMIT:-512m}
    mem_reservation: ${WORKER_MEM_RESERVATION:-128m}
    cpus: ${WORKER_CPUS:-0.75}
    security_opt:
      - no-new-privileges:true
    logging: *default-logging

  web:
    image: nginx:1.27-alpine
    restart: unless-stopped
    env_file:
      - ../env/.env
    depends_on:
      api:
        condition: service_healthy
    volumes:
      - ../web:/usr/share/nginx/html:ro
    networks:
      - internal
      - public
    expose:
      - "80"
    ports:
      - "127.0.0.1:${WEB_HOST_PORT:-5173}:80"
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://127.0.0.1/ || exit 1"]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 10s
    mem_limit: ${WEB_MEM_LIMIT:-192m}
    mem_reservation: ${WEB_MEM_RESERVATION:-64m}
    cpus: ${WEB_CPUS:-0.50}
    security_opt:
      - no-new-privileges:true
    labels:
      - traefik.enable=true
      - traefik.docker.network=${TRAEFIK_DOCKER_NETWORK:-coolify}
      - traefik.http.routers.${CLIENT_ID:-colegios}-web.rule=Host(`${WEB_DOMAIN}`)
      - traefik.http.routers.${CLIENT_ID:-colegios}-web.entrypoints=websecure
      - traefik.http.routers.${CLIENT_ID:-colegios}-web.tls=true
      - traefik.http.routers.${CLIENT_ID:-colegios}-web.tls.certresolver=${TRAEFIK_CERT_RESOLVER:-letsencrypt}
      - traefik.http.services.${CLIENT_ID:-colegios}-web.loadbalancer.server.port=80
    logging: *default-logging

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file:
      - ../env/.env
    environment:
      TZ: ${TZ:-America/Guayaquil}
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes:
      - ../data/postgres:/var/lib/postgresql/data
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB} -h 127.0.0.1 || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 6
      start_period: 15s
    mem_limit: ${POSTGRES_MEM_LIMIT:-1024m}
    mem_reservation: ${POSTGRES_MEM_RESERVATION:-256m}
    cpus: ${POSTGRES_CPUS:-1.0}
    security_opt:
      - no-new-privileges:true
    logging: *default-logging

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "${REDIS_MAXMEMORY:-256mb}", "--maxmemory-policy", "allkeys-lru"]
    volumes:
      - ../data/redis:/data
    networks:
      - internal
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 15s
      timeout: 5s
      retries: 6
      start_period: 10s
    mem_limit: ${REDIS_MEM_LIMIT:-320m}
    mem_reservation: ${REDIS_MEM_RESERVATION:-64m}
    cpus: ${REDIS_CPUS:-0.50}
    security_opt:
      - no-new-privileges:true
    logging: *default-logging

networks:
  internal:
    name: ${COMPOSE_PROJECT_NAME:-colegios_ops}_internal
    driver: bridge
    internal: true
  public:
    name: ${TRAEFIK_DOCKER_NETWORK:-coolify}
    external: true

`

# 5) .env.example
Archivo implementado: env/.env.example (sin secretos reales)

`dotenv
# Proyecto
COMPOSE_PROJECT_NAME=colegios_ops
APP_ENV=production
APP_VERSION=2026.03.14
TZ=America/Guayaquil
LOG_LEVEL=info

# Dominios / proxy reverso
CLIENT_ID=colegios
WEB_DOMAIN=app.example.com
API_DOMAIN=api.example.com
TRAEFIK_DOCKER_NETWORK=coolify
TRAEFIK_CERT_RESOLVER=letsencrypt
API_HOST_PORT=8080
WORKER_HOST_PORT=8081
WEB_HOST_PORT=5173

# Base de datos
POSTGRES_DB=colegios
POSTGRES_USER=colegios_user
POSTGRES_PASSWORD=change_me_strong

# Recursos por servicio
API_MEM_LIMIT=768m
API_MEM_RESERVATION=256m
API_CPUS=1.0

WORKER_MEM_LIMIT=512m
WORKER_MEM_RESERVATION=128m
WORKER_CPUS=0.75

WEB_MEM_LIMIT=192m
WEB_MEM_RESERVATION=64m
WEB_CPUS=0.50

POSTGRES_MEM_LIMIT=1024m
POSTGRES_MEM_RESERVATION=256m
POSTGRES_CPUS=1.0

REDIS_MEM_LIMIT=320m
REDIS_MEM_RESERVATION=64m
REDIS_CPUS=0.50
REDIS_MAXMEMORY=256mb

# App (rellenar segun stack)
DESKTOP_WEB_TOKEN_SECRET=replace_desktop_token
OMNISWITCH_MODE=mock
OMNISWITCH_API_URL=
OMNISWITCH_USER=
OMNISWITCH_PASSWORD=

`

# 6) Scripts operativos
Implementados en scripts/:
- up.sh: levanta stack con build.
- down.sh: detiene stack.
- estart.sh: reinicia stack completo.
- status.sh: estado, health y restart count por servicio.
- logs.sh [servicio]: ultimas 200 lineas.
- logs-follow.sh [servicio]: seguimiento en vivo.
- inspect.sh <servicio>: docker inspect del servicio.
- check-env.sh: valida faltantes y vacios contra .env.example.
- check-network.sh: valida redes interna/publica.
- check-disk.sh [umbral]: uso de disco y exit code si supera umbral.
- check-memory.sh [umbral]: uso de RAM y exit code si supera umbral.
- check-health.sh: endpoints + estado docker + health por servicio.
- check-volumes.sh: presencia y tamano de volumenes persistentes.
- exec-api.sh: shell en API.
- exec-worker.sh: shell en worker.
- exec-db.sh: shell en Postgres.
- ackup-db.sh [ruta]: backup Postgres comprimido.
- estore-db.sh <archivo.sql.gz>: restore con confirmacion explicita.

# 7) Endpoints de health/readiness/version
Aplicado en codigo:
- API: services/api/src/index.js
  - GET /health -> proceso vivo.
  - GET /ready -> valida DB (SELECT 1).
  - GET /version -> servicio/version/env/timestamp.
- Worker: services/worker/src/index.js
  - GET /health -> proceso vivo.
  - GET /ready -> valida reachability de API /health.
  - GET /version -> servicio/version/env/timestamp.
- Web:
  - Healthcheck por HTTP local GET / desde contenedor nginx.

# 8) Guia de troubleshooting
Implementada en:
- docs/TROUBLESHOOTING.md (matriz de fallos con sintomas, comandos, causa probable, accion sugerida).
- diagnostics/quick-triage.md (flujo de 5 minutos para responder rapido que esta caido/degradado).

Casos incluidos:
- contenedor no arranca
- unhealthy
- 502/504 proxy
- worker sin proceso
- DB/Redis inaccesible
- disco lleno
- RAM alta y OOMKilled
- permisos de volumen
- variables faltantes
- DNS/Traefik/Coolify
- puertos ocupados
- reinicios en bucle
- persistencia no montada/corrupta

# 9) Checklist de despliegue en VPS
Implementado en docs/CHECKLIST_VPS.md:
- prerequisitos de host
- hardening minimo del servidor
- secuencia de despliegue
- verificacion final de salud
- comportamiento tras reboot del host
- timezone y consistencia de logs

# 10) Recomendaciones de endurecimiento y mejora futura
Aplicables sin sobredimensionar:
1. Activar usuario no-root en imagenes de pi y worker si Dockerfiles lo permiten.
2. Agregar firma/version de imagen inmutable (APP_VERSION atado a commit/tag).
3. Configurar rotacion de backups y prueba automatica de restore semanal.
4. Implementar alertas basicas (correo/slack) sobre unhealthy, RestartCount y disco >85%.
5. Añadir endpoint /metrics solo si hay necesidad real de series temporales.
6. Ajustar limites de CPU/RAM con datos reales (docker stats + carga de negocio).
7. Reducir superficie de secretos usando archivos/secret manager de plataforma.
8. Ejecutar escaneo de imagenes y actualizacion de parches base de forma mensual.
