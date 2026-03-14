# Colegios - Base Operativa Docker Compose

Esta base prioriza soporte operativo en VPS Linux: diagnostico rapido, salud verificable, logs trazables y recuperacion simple.

## Estructura operativa
- `compose/compose.yml`: stack principal para VPS.
- `env/.env.example`: plantilla de variables obligatorias.
- `scripts/`: comandos operativos de soporte.
- `docs/OPERACION.md`: operacion diaria.
- `docs/TROUBLESHOOTING.md`: matriz de fallos comunes.
- `docs/VARIABLES.md`: catalogo de variables.
- `docs/BACKUP_RESTORE.md`: respaldo/restauracion.
- `docs/CHECKLIST_VPS.md`: checklist de despliegue en VPS.
- `monitoring/OBSERVABILIDAD.md`: estrategia de observabilidad ligera.
- `diagnostics/quick-triage.md`: secuencia de triage en 5 minutos.

## Inicio rapido
1. Crear entorno:
```bash
cp env/.env.example env/.env
```
2. Validar variables:
```bash
bash scripts/check-env.sh
```
3. Levantar stack:
```bash
bash scripts/up.sh
```
4. Ver estado y salud:
```bash
bash scripts/status.sh
bash scripts/check-health.sh
```

## Endpoints operativos
- API: `/health`, `/ready`, `/version`
- Worker: `/health`, `/ready`, `/version`
- Web: `GET /` (health por HTTP)

## Puertos
- Publicos via proxy reverso (Traefik/Coolify): `WEB_DOMAIN`, `API_DOMAIN`
- Solo loopback VPS (diagnostico): `127.0.0.1:5173`, `127.0.0.1:8080`, `127.0.0.1:8081`
- No expuestos al exterior: Postgres/Redis
