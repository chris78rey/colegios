# Arquitectura Mínima (MVP)

## Servicios
- API: Node.js + TypeScript. Expone endpoints de carga Excel, plantillas y seguimiento.
- Worker: procesa cola (Redis) con rate limit y reintentos.
- PostgreSQL: multi-tenant con organization_id.
- Redis: cola y rate limiting.

## Storage
- Filesystem local bajo `colegios/data/storage/` organizado por institución.

## Timezone
- Persistir en UTC y convertir a UTC-5 (Ecuador) en reportes.
