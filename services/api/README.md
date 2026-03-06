# API - Colegios (MVP)

## Requisitos
- Node.js 20+
- PostgreSQL
- Redis

## Desarrollo local
1. Desde `colegios/`:
   - `docker compose up -d postgres redis`
   - `npm install`
   - `npm run dev`

## Prisma
1. Crear el esquema:
   - `npm run prisma:generate`
2. Migrar en local:
   - `npm run prisma:migrate`

## Endpoints
- `GET /health`
- `POST /v1/uploads/excel`
- `GET /v1/requests`

