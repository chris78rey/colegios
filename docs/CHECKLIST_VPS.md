# Checklist VPS

## Pre-requisitos del servidor
- Docker Engine + Docker Compose plugin.
- Usuario con permisos Docker.
- DNS apuntando al VPS.
- Proxy reverso operativo (Traefik/Coolify).
- Reloj/ntp sincronizado.

## Hardening minimo del host
- Firewall: permitir solo `22`, `80`, `443` (y puertos internos solo localhost).
- Actualizaciones de seguridad al dia.
- Swap configurado moderado para amortiguar picos.
- Monitoreo de disco con alertas basicas.

## Despliegue
1. `cp env/.env.example env/.env`
2. Editar secretos y dominios.
3. `bash scripts/check-env.sh`
4. `bash scripts/up.sh`
5. `bash scripts/status.sh`
6. `bash scripts/check-health.sh`

## Verificaciones finales
- `https://$WEB_DOMAIN` responde 200.
- `https://$API_DOMAIN/health` responde 200.
- `https://$API_DOMAIN/ready` responde 200.
- `RestartCount` estable en 0 o bajo.

## Reinicio del host
- `restart: unless-stopped` recupera servicios automaticamente.
- Tras reboot: validar con `bash scripts/status.sh` y `bash scripts/check-health.sh`.

## Timezone
- `TZ=America/Guayaquil` en todos los servicios para trazabilidad consistente.
