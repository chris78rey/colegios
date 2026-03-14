# Troubleshooting

## Matriz de fallos operativos

| Caso | Sintomas | Comandos | Causa probable | Accion sugerida |
|---|---|---|---|---|
| Contenedor no arranca | `state=exited` | `bash scripts/status.sh`, `bash scripts/logs.sh <svc>` | error de config/comando | corregir `.env`, revisar imagen y reiniciar |
| Healthcheck `unhealthy` | `health=unhealthy` | `bash scripts/check-health.sh`, `bash scripts/logs.sh <svc>` | dependencia caida o endpoint roto | levantar dependencia y validar `/ready` |
| API 502/504 tras proxy | web ok, API no | `bash scripts/check-network.sh`, `bash scripts/logs.sh api`, `bash scripts/inspect.sh api` | label/router/red Traefik mal | verificar `API_DOMAIN`, labels y red `coolify` |
| Worker no procesa | cola pendiente, sin avance | `bash scripts/logs-follow.sh worker`, `curl -fsS http://127.0.0.1:8081/ready` | API/DB inaccesible, error logico | recuperar API/DB, corregir error worker |
| DB inaccesible | errores de conexion | `bash scripts/logs.sh postgres`, `bash scripts/exec-db.sh`, `pg_isready` | password/usuario mal o DB no lista | validar variables y salud postgres |
| Redis inaccesible | timeouts de cache/cola | `bash scripts/logs.sh redis`, `docker exec <redis> redis-cli ping` | redis caido o sin memoria | revisar limites, reiniciar redis |
| Sin espacio en disco | escritura falla | `bash scripts/check-disk.sh` | volumen lleno | liberar espacio, rotar logs, ampliar disco |
| RAM excesiva | OOM/restarts | `bash scripts/check-memory.sh`, `docker stats` | limite bajo o fuga | ajustar limites, revisar patrones de carga |
| Permisos en volumen | errores EACCES | `bash scripts/logs.sh api`, `ls -lah data/` | UID/GID incorrecto | corregir owner/permisos en host |
| Variables faltantes | arranque parcial | `bash scripts/check-env.sh` | `.env` incompleto | completar variable y reiniciar |
| DNS/dominio mal | no resuelve | `dig API_DOMAIN`, `dig WEB_DOMAIN` | registro DNS errado | corregir A/AAAA y esperar propagacion |
| Traefik no enruta | timeout o 404 proxy | `docker logs traefik`, `bash scripts/check-network.sh` | red/labels/entrypoint incorrectos | corregir labels y red externa |
| Puerto ocupado | no puede bindear | `ss -ltnp | grep :8080` | otro proceso usando puerto | liberar puerto o cambiar variable |
| Reinicios en bucle | `RestartCount` sube | `bash scripts/status.sh`, `bash scripts/logs.sh <svc>` | crash inicial/health fail | corregir causa y reiniciar |
| OOMKilled | caidas bajo carga | `docker inspect <cid> | grep -i oom` | memoria insuficiente | subir `*_MEM_LIMIT` y optimizar |
| Persistencia corrupta/no montada | datos faltan | `bash scripts/check-volumes.sh`, `bash scripts/inspect.sh postgres` | mount roto o data dañada | restaurar backup y verificar mount |

## Flujo de triage en 5 minutos
1. `bash scripts/status.sh`
2. `bash scripts/check-env.sh`
3. `bash scripts/check-health.sh`
4. `bash scripts/check-disk.sh && bash scripts/check-memory.sh`
5. `bash scripts/logs.sh api && bash scripts/logs.sh worker`
6. Si hay degradacion prolongada: `bash scripts/restart.sh`
