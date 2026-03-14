# Backup y Restore

## Backup Postgres
```bash
bash scripts/backup-db.sh
```
Salida por defecto: `backups/postgres_YYYYMMDD_HHMMSS.sql.gz`

## Restore Postgres
```bash
bash scripts/restore-db.sh backups/postgres_YYYYMMDD_HHMMSS.sql.gz
```
El script pide confirmacion explicita (`RESTORE`) porque sobrescribe datos lógicamente.

## Politica minima recomendada
- Diario: 1 backup completo.
- Semanal: verificar restauracion en entorno de prueba.
- Retencion: 7 diarios + 4 semanales + 3 mensuales.

## Validacion post-restore
1. `bash scripts/status.sh`
2. `bash scripts/check-health.sh`
3. `bash scripts/logs.sh api`
4. Probar endpoints `/ready` y flujo de negocio minimo.

## Backup de archivos persistentes
Para storage de archivos:
```bash
tar -czf backups/storage_$(date +%Y%m%d_%H%M%S).tgz data/storage
```

## Restore de archivos persistentes
1. Detener servicios que escriben storage:
```bash
bash scripts/down.sh
```
2. Restaurar:
```bash
tar -xzf backups/storage_YYYYMMDD_HHMMSS.tgz
```
3. Levantar:
```bash
bash scripts/up.sh
```
