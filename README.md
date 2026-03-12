# Colegios MVP

Base de trabajo para la plataforma multi-tenant de firmas para instituciones educativas.

Contenido
- mvp_plan.md: plan completo del MVP.
- docker-compose.yml: orquestacion local (api, worker, postgres, redis).
- scripts/healthcheck.sh: verificacion rapida de servicios.
- docs/architecture.md: notas de arquitectura minima.

UI estatica (login)
- Archivo: `web/index.html`
- Vista rapida (opcion 1): `python -m http.server 5173 --directory web`
- Vista rapida (opcion 2): `npx serve web`

Docker local (compose)
- Crea un archivo .env con: CLIENT_ID=local, DOMAIN=local.test, COOLIFY_EXTERNAL_NETWORK=false
- Luego ejecuta: docker compose up --build
