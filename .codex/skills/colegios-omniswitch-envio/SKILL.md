---
name: colegios-omniswitch-envio
description: Envio y recuperacion de PDFs por registro del Excel hacia OmniSwitch/Firmalo con el flujo estandar (crear solicitud, cargar documento, registrar firmante, disparar envio, consultar estado, descargar firmado y persistirlo localmente). Usar cuando se necesite integrar el pipeline de firma en el proyecto colegios, especialmente al procesar lotes, generar un envio por cada request, agrupar multiples PDFs dentro de una misma `IDSolicitud` o guardar el firmado final en `storage/`.
---

# Colegios OmniSwitch Envio

## Overview

Guia para integrar el envio OmniSwitch por cada registro procesado, usando como referencia practica el ejemplo externo en `/mnt/g/opencode/firmas_omniswitch/scripts/flow` y el detalle de payloads en `references/omniswitch-steps.md`.

## Cuando usar esta skill

- Cuando haya que enviar a firma uno o varios PDFs generados por `Request`.
- Cuando se necesite recuperar el PDF ya firmado y persistirlo en `storage/`.
- Cuando el usuario mencione OmniSwitch, Firmalo, `IDSolicitud`, `SolicitudeCreate*`, o el ejemplo de `firmas_omniswitch`.
- Cuando se vaya a implementar o ajustar el pipeline post-batch para firma electronica.

## Referencia externa obligatoria

Antes de implementar o depurar, abrir estos scripts del ejemplo externo:

1. `/mnt/g/opencode/firmas_omniswitch/scripts/flow/1_crear_solicitud.py`
2. `/mnt/g/opencode/firmas_omniswitch/scripts/flow/2_cargar_documento.py`
3. `/mnt/g/opencode/firmas_omniswitch/scripts/flow/3_registrar_firmantes.py`
4. `/mnt/g/opencode/firmas_omniswitch/scripts/flow/4_disparar_envio.py`
5. `/mnt/g/opencode/firmas_omniswitch/scripts/flow/5_recuperar_documento_firmado.py`

Usar esos scripts para confirmar nombres de endpoints, campos de payload y orden exacto. No inventar variantes del flujo sin compararlas contra esa referencia.

## Workflow

1. Detectar cuando el PDF final de un `Request` ya existe (post-procesamiento de lote).
2. Por cada `Request`, ejecutar el flujo OmniSwitch completo en orden estricto.
3. Si el request tiene varios PDFs, agruparlos en la misma `IDSolicitud` usando el flujo estandar.
4. Guardar el `omniId` en el `Request` para evitar reenvios.
5. Cuando `DocFirmado="1"`, descargar cada PDF firmado, persistirlo en disco y actualizar `finalDocumentPath`.
6. Si el envio o la recuperacion fallan, registrar error y continuar con el resto del lote (no bloquear el batch).

## OmniSwitch Paso a Paso (por registro)

Referencia: leer `references/omniswitch-steps.md`.

1. **Crear solicitud**: `SolicitudeCreate`.
   Script espejo: `1_crear_solicitud.py`.
2. **Cargar documento(s)**: `SolicitudeCreateDocument` con PDF en Base64. Si hay multiples PDFs, repetir este paso usando la misma `IDSolicitud`.
   Script espejo: `2_cargar_documento.py`.
3. **Registrar firmante(s)**: `SolicitudeCreateSignatory` una vez que todos los documentos esten cargados.
   Script espejo: `3_registrar_firmantes.py`.
4. **Disparar envio**: `SolicitudeSend`.
   Script espejo: `4_disparar_envio.py`.
5. **Consultar estado**: `GetSolicitudByID` para leer `Solicitudes_Documentos`.
6. **(Post-firma) Descargar PDF firmado**: `SolicitudeGetDocument` una vez por documento cuando `DocFirmado="1"` para ese archivo.
   Script espejo: `5_recuperar_documento_firmado.py`.
7. **Persistir activo**: decodificar `DocumentoBase64`, guardar archivo binario en `storage/{organizationId}/{requestId}/` y persistir solo la ruta relativa en DB.

## Campos confirmados por el ejemplo externo

- `SolicitudeCreate`: `IdProcess`, `PaymentRequired`, `amount`, `BiometricRequired`.
- `SolicitudeCreateDocument`: `IDSolicitud`, `NombreDocumento`, `DocumentoBase64`, `numeroPagina`, `Coordenadas`.
- `SolicitudeCreateSignatory`: `Cedula`, `PrimerNombre`, `SegunNombre`, `PrimerApellido`, `SegApellido`, `Celular`, `Email`, `FirmaPrincipal`, `IdPais`, `IdProvincia`, `IdCiudad`, `Direccion`.
- `SolicitudeSend`: al menos `IDSolicitud` mas autenticacion.
- `SolicitudeGetDocument`: requiere `IDSolicitud` y `NombreDocumento`.

## Integracion en Colegios

- Trigger recomendado: despues de generar/optimizar el PDF dentro de `processBatch`, por cada `Request`.
- En el flujo actual del proyecto, el firmante principal debe salir preferentemente de los campos canónicos del Excel/placeholder:
  - `Cedula`
  - `PrimerNombre`
  - `SegunNombre`
  - `PrimerApellido`
  - `SegApellido`
  - `Celular`
  - `Email`
  - `Direccion`
- Si un request produce varios PDFs, usar una sola `IDSolicitud` y subir cada archivo en loop antes de registrar firmantes.
- Para firmados recuperados, guardar en disco con ruta estable por organizacion y request; no guardar Base64 en la base de datos.
- No enviar si:
  - El request ya tiene `omniId`
  - Faltan credenciales OmniSwitch/Firmalo
  - Falta el PDF
- Usar datos del `Signatory` del request (cedula, nombre, email, celular).
- Mantener compatibilidad con aliases legacy solo como fallback; no crear nuevos aliases si ya existe el campo canónico.
- Sanitizar `Celular` (10 digitos, con 0 inicial).
- Usar defaults configurables para coordenadas, pagina y ubicacion.
- Recomendar optimizacion de PDF (Ghostscript) para evitar timeouts (~30s).

## Secuencia de implementacion recomendada en este repo

1. Crear un cliente OmniSwitch reutilizable en `services/api` o `services/worker`.
2. Encapsular helpers para auth, `post_api`, subida de PDF y descarga del firmado.
3. Integrar el envio despues de generar el PDF del `Request`, guardando `omniId`.
4. Integrar una rutina de polling o recuperacion diferida para descargar firmados cuando `DocFirmado="1"`.
5. Persistir archivos firmados en `storage/{organizationId}/{requestId}/` y solo guardar rutas en DB.
6. Registrar eventos o logs por paso para poder reanudar o depurar por `Request`.

## Regla de memoria operativa

Si en una conversacion futura el usuario dice "usa el ejemplo de `G:\\opencode\\firmas_omniswitch\\scripts\\flow`" o menciona OmniSwitch/Firmalo, asumir que esta skill debe abrirse y que esa carpeta externa es la referencia principal del flujo.

## Variables de Entorno Minimas

- `FIRMALO_USER`
- `FIRMALO_PASSWORD` o `FIRMALO_PASSWORD_B64`
- `FIRMALO_URL_BASE` (opcional, default API oficial)

## Manejo de Errores

- Si un paso falla, log y continuar con otros registros.
- No reintentar en el mismo batch sin un mecanismo de idempotencia.

## Notas operativas (validadas)
- Timeout API aprox 30s: PDF pesado puede fallar si no se optimiza.
- Coordenadas (X,Y) se miden desde la esquina inferior izquierda (0,0).
- Si no se envian coordenadas, OmniSwitch usa posiciones por defecto para firmas.
- `SolicitudeExpress` solo sirve para 1 documento y 1 firmante.
- `SolicitudeCreate` puede agrupar multiples PDFs dentro de una sola `IDSolicitud` cuando se usa el flujo estandar.
- `SolicitudeCreateDocument` se invoca una vez por PDF, siempre con la misma `IDSolicitud`.
- `numeroPagina` y `Coordenadas` pueden variar por documento.
- `SolicitudeCreateSignatory` aplica los firmantes a todos los documentos asociados a la solicitud.
- `GetSolicitudByID` devuelve el detalle por documento en `Solicitudes_Documentos`.
- `SolicitudeGetDocument` descarga cada PDF firmado por separado y exige `NombreDocumento`.
- `DocumentoBase64` solo debe existir en transito; decodificarlo y persistir el binario.
- Guardar el firmado en `storage/{organizationId}/{requestId}/` y persistir solo `finalDocumentPath`.
- Validar rutas para bloquear path traversal (`../`).
- Exponer el PDF desde un endpoint propio leyendo desde disco y respondiendo por stream, no con Base64.

## References

Leer `references/omniswitch-steps.md` para payloads, orden y ejemplos.
