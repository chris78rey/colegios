# Benchmark de PDFs

## Objetivo
Medir el throughput real del pipeline HTML -> PDF con Playwright para estimar si una meta como `700 PDFs en 30 segundos` es alcanzable en tu infraestructura.

## Script
- Archivo: `services/api/scripts/benchmark_pdf_pipeline.js`
- Usa Playwright real.
- Genera HTMLs de prueba, los convierte a PDF y reporta:
  - `totalSeconds`
  - `msPerPdf`
  - `pdfsPerSecond`
  - `projectedAt30s`
  - `projectedSecondsFor700`

## Comando base
Ejecutar dentro del contenedor `api`:

```bash
docker compose exec api node scripts/benchmark_pdf_pipeline.js --count 200 --concurrency 4
```

## Barrido recomendado
Probar al menos estas concurrencias:

```bash
docker compose exec api node scripts/benchmark_pdf_pipeline.js --count 200 --concurrency 1
docker compose exec api node scripts/benchmark_pdf_pipeline.js --count 200 --concurrency 2
docker compose exec api node scripts/benchmark_pdf_pipeline.js --count 200 --concurrency 4
docker compose exec api node scripts/benchmark_pdf_pipeline.js --count 200 --concurrency 8
```

Luego, con la mejor concurrencia observada:

```bash
docker compose exec api node scripts/benchmark_pdf_pipeline.js --count 700 --concurrency 8
```

## Con plantilla real
Si quieres acercarte al costo de una plantilla real HTML, apunta a un archivo accesible dentro del contenedor:

```bash
docker compose exec api node scripts/benchmark_pdf_pipeline.js \
  --count 200 \
  --concurrency 8 \
  --template /data/storage/templates/<organizationId>/<archivo>.html
```

## Cómo leer el resultado
Ejemplo de salida:

```json
{
  "count": 200,
  "concurrency": 8,
  "successCount": 200,
  "totalSeconds": 18.4,
  "msPerPdf": 92.0,
  "pdfsPerSecond": 10.87,
  "projectedAt30s": 326,
  "projectedSecondsFor700": 64.42
}
```

Interpretación:
- `pdfsPerSecond`: throughput real medido
- `projectedAt30s`: cuántos PDFs producirías en 30 segundos al mismo ritmo
- `projectedSecondsFor700`: cuántos segundos tardarías en llegar a 700 PDFs

## Regla de decisión
- Si `projectedAt30s >= 700`, la meta es factible en esa configuración.
- Si no, todavía no llegas y necesitas:
  - más concurrencia
  - HTMLs más livianos
  - más CPU/RAM
  - varios workers / escalado horizontal

## Advertencias
- Este benchmark mide principalmente el costo de render HTML -> PDF.
- Si tu flujo real incluye DOCX -> HTML, validación pesada o postproceso extra, el tiempo real será peor.
- No saques conclusiones con una sola corrida; repite 2 o 3 veces por concurrencia.
