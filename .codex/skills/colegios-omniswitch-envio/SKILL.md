---
name: colegios-omniswitch-envio
description: Envio de PDFs por registro del Excel hacia OmniSwitch/Firmalo con el flujo de 4 pasos (crear solicitud, cargar documento, registrar firmante, disparar envio). Usar cuando se necesite integrar el pipeline de firma en el proyecto colegios, especialmente al procesar lotes y generar un envio por cada request.
---

# Colegios OmniSwitch Envio

## Overview

Guia para integrar el envio OmniSwitch por cada registro procesado, usando los 4 pasos del proyecto `G:\opencode\firmas_omniswitch`.

## Workflow

1. Detectar cuando el PDF final de un `Request` ya existe (post-procesamiento de lote).
2. Por cada `Request`, ejecutar el flujo OmniSwitch completo en orden estricto.
3. Guardar el `omniId` en el `Request` para evitar reenvios.
4. Si el envio falla, registrar error y continuar con el resto del lote (no bloquear el batch).

## OmniSwitch Paso a Paso (por registro)

Referencia: leer `references/omniswitch-steps.md`.

1. **Crear solicitud**: `SolicitudeCreate`
2. **Cargar documento**: `SolicitudeCreateDocument` con PDF en Base64
3. **Registrar firmante**: `SolicitudeCreateSignatory`
4. **Disparar envio**: `SolicitudeSend`
5. **(Post-firma) Descargar PDF firmado**: `SolicitudeGetDocument` cuando `GetSolicitudByID` indique `DocFirmado="1"`.

## Integracion en Colegios

- Trigger recomendado: despues de generar/optimizar el PDF dentro de `processBatch`, por cada `Request`.
- No enviar si:
  - El request ya tiene `omniId`
  - Faltan credenciales OmniSwitch/Firmalo
  - Falta el PDF
- Usar datos del `Signatory` del request (cedula, nombre, email, celular).
- Sanitizar `Celular` (10 digitos, con 0 inicial).
- Usar defaults configurables para coordenadas, pagina y ubicacion.
- Recomendar optimizacion de PDF (Ghostscript) para evitar timeouts (~30s).

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

## References

Leer `references/omniswitch-steps.md` para payloads, orden y ejemplos.
