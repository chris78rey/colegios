#!/usr/bin/env bash
set -euo pipefail

RESOURCE_UUID="${RESOURCE_UUID:-${1:-}}"
ACTION="${2:-}"

if [[ -n "${RESOURCE_UUID:-}" && "${RESOURCE_UUID}" =~ ^(menu|status|services|health|api-env|api-logs|worker-logs|web-logs|postgres-env|postgres-check|ports|restart)$ ]]; then
  ACTION="${RESOURCE_UUID}"
  RESOURCE_UUID=""
fi

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }
err() { printf '[ERROR] %s\n' "$*" >&2; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Comando requerido no encontrado: $1"
    exit 127
  fi
}

require_cmd docker

usage() {
  cat <<'EOF'
Uso:
  bash scripts/vps-debug.sh [RESOURCE_UUID] [ACTION]

Actions:
  menu            Menu interactivo
  services        Lista contenedores detectados
  status          Resumen de estado/salud
  health          Igual que status con resumen corto
  api-env         Variables relevantes del api
  api-logs        Ultimas 120 lineas del api
  worker-logs     Ultimas 120 lineas del worker
  web-logs        Ultimas 120 lineas del web
  postgres-env    Variables relevantes de postgres
  postgres-check  Prueba TCP a Postgres desde el contenedor postgres
  ports           Puertos publicados y listeners locales
  restart         Reinicia api, worker y web

Ejemplos:
  bash scripts/vps-debug.sh
  bash scripts/vps-debug.sh status
  RESOURCE_UUID=kog0wcwocwcsok8cwc4gc80g bash scripts/vps-debug.sh api-env
  bash scripts/vps-debug.sh kog0wcwocwcsok8cwc4gc80g postgres-check
EOF
}

container_name() {
  local service="$1"
  local pattern="^${service}-"
  if [[ -n "${RESOURCE_UUID:-}" ]]; then
    pattern="^${service}-${RESOURCE_UUID}-"
  fi
  docker ps -a --format '{{.Names}}' | grep -E "$pattern" | head -n 1 || true
}

require_container() {
  local service="$1"
  local name
  name="$(container_name "$service")"
  if [[ -z "$name" ]]; then
    if [[ -n "${RESOURCE_UUID:-}" ]]; then
      err "No se encontro contenedor para ${service} con RESOURCE_UUID=${RESOURCE_UUID}"
    else
      err "No se encontro contenedor para ${service}"
    fi
    exit 4
  fi
  printf '%s\n' "$name"
}

show_services() {
  local grep_pattern='^(api|worker|web|postgres|redis)-'
  if [[ -n "${RESOURCE_UUID:-}" ]]; then
    grep_pattern="^(api|worker|web|postgres|redis)-${RESOURCE_UUID}-"
  fi
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep -E "$grep_pattern|^NAMES" || true
}

show_status() {
  printf '%-10s %-55s %-12s %-12s %-8s\n' "service" "container" "state" "health" "restart"
  for service in api worker web postgres redis; do
    local name state health restarts
    name="$(container_name "$service")"
    if [[ -z "$name" ]]; then
      printf '%-10s %-55s %-12s %-12s %-8s\n' "$service" "-" "missing" "-" "-"
      continue
    fi
    state="$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || true)"
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$name" 2>/dev/null || true)"
    restarts="$(docker inspect -f '{{.RestartCount}}' "$name" 2>/dev/null || true)"
    printf '%-10s %-55s %-12s %-12s %-8s\n' "$service" "$name" "$state" "$health" "$restarts"
  done
}

show_filtered_env() {
  local service="$1"
  local pattern="$2"
  local name
  name="$(require_container "$service")"
  info "Variables de $service ($name)"
  docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E "$pattern" || warn "No hubo coincidencias"
}

show_logs() {
  local service="$1"
  local lines="${2:-120}"
  local name
  name="$(require_container "$service")"
  info "Logs de $service ($name)"
  docker logs "$name" --tail "$lines"
}

postgres_check() {
  local name user pass db
  name="$(require_container "postgres")"
  user="$(docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^POSTGRES_USER=' | cut -d= -f2-)"
  pass="$(docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^POSTGRES_PASSWORD=' | cut -d= -f2-)"
  db="$(docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^POSTGRES_DB=' | cut -d= -f2-)"
  info "Probando TCP a Postgres con user=$user db=$db"
  docker exec "$name" sh -lc "PGPASSWORD='$pass' psql -h 127.0.0.1 -U '$user' -d '$db' -c '\\l'"
}

show_ports() {
  info "Puertos Docker publicados"
  docker ps -a --format 'table {{.Names}}\t{{.Ports}}' | grep -E '^(api|worker|web)-|^NAMES' || true
  printf '\n'
  info "Listeners locales relevantes"
  ss -ltnp 2>/dev/null | grep -E ':(8080|8081|5173|18080|18081|15173|5432|6379)\b' || true
}

restart_app() {
  local names=()
  local service name
  for service in api worker web; do
    name="$(container_name "$service")"
    [[ -n "$name" ]] && names+=("$name")
  done
  if [[ "${#names[@]}" -eq 0 ]]; then
    err "No hay contenedores app para reiniciar"
    exit 5
  fi
  info "Reiniciando: ${names[*]}"
  docker restart "${names[@]}"
}

menu() {
  PS3="Selecciona una opcion: "
  select option in \
    "services" \
    "status" \
    "api-env" \
    "api-logs" \
    "worker-logs" \
    "web-logs" \
    "postgres-env" \
    "postgres-check" \
    "ports" \
    "restart" \
    "salir"; do
    case "$option" in
      services) show_services ;;
      status) show_status ;;
      api-env) show_filtered_env "api" 'POSTGRES|DATABASE_URL|REDIS|APP_ENV|LOG_LEVEL|WEB_APP_URL|CORS_ORIGIN|OMNI|FIRMALO' ;;
      api-logs) show_logs "api" ;;
      worker-logs) show_logs "worker" ;;
      web-logs) show_logs "web" ;;
      postgres-env) show_filtered_env "postgres" 'POSTGRES|PGDATA|TZ' ;;
      postgres-check) postgres_check ;;
      ports) show_ports ;;
      restart) restart_app ;;
      salir) break ;;
      *) warn "Opcion invalida" ;;
    esac
  done
}

case "${ACTION:-menu}" in
  menu) menu ;;
  services) show_services ;;
  status|health) show_status ;;
  api-env) show_filtered_env "api" 'POSTGRES|DATABASE_URL|REDIS|APP_ENV|LOG_LEVEL|WEB_APP_URL|CORS_ORIGIN|OMNI|FIRMALO' ;;
  api-logs) show_logs "api" ;;
  worker-logs) show_logs "worker" ;;
  web-logs) show_logs "web" ;;
  postgres-env) show_filtered_env "postgres" 'POSTGRES|PGDATA|TZ' ;;
  postgres-check) postgres_check ;;
  ports) show_ports ;;
  restart) restart_app ;;
  -h|--help|help) usage ;;
  *)
    err "Accion no reconocida: ${ACTION}"
    usage
    exit 2
    ;;
esac
