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

1. Detectar cuando el grupo de PDFs de una fila ya existe y esta listo para firma.
2. Si el negocio lo exige, ejecutar primero validacion de identidad con `QueryRC`.
3. Ejecutar el flujo OmniSwitch por grupo de fila, no por PDF individual.
4. Crear una sola `IDSolicitud` por fila del Excel y subir todos los PDFs de esa fila con llamadas repetidas a `SolicitudeCreateDocument`.
5. Registrar cada firmante una vez por solicitud, repitiendo `SolicitudeCreateSignatory` por cada persona.
6. Guardar el `omniId` a nivel de grupo/solicitud para evitar reenvios duplicados.
7. Cuando `DocFirmado="1"`, descargar cada PDF firmado por separado, persistirlo en disco y actualizar su ruta final.
8. Si el envio o la recuperacion fallan, registrar error y continuar con el resto del lote (no bloquear el batch).

## QueryRC (Registro Civil)

Usar `QueryRC` cuando el flujo de firma requiera validacion previa de identidad del ciudadano.

### Payload base confirmado

- `UserName`
- `Password`
- `Cedula` obligatorio
- `CodigoDactilar` opcional
- `Celular` opcional
- `Email` opcional

### Modos operativos

- `Cedula` sola:
  - consulta demografica
  - devuelve datos textuales del ciudadano
- `Cedula + CodigoDactilar`:
  - consulta biometrica
  - habilita fotografia y grafo de firma en Base64
- `Celular + Email`:
  - ademas puede generar certificado firmado de aceptacion de uso de datos

### Regla de arquitectura

- No mezclar `QueryRC` directamente con la UI de envio de documentos hasta definir politica de negocio.
- Tratar `QueryRC` como una etapa propia de validacion de identidad previa a `SolicitudeCreate`.
- Si el flujo no exige biometria, se puede operar sin `CodigoDactilar`.
- Si el flujo exige validacion biometrica/legal fuerte, `CodigoDactilar` pasa a ser obligatorio.

## OmniSwitch Paso a Paso (por registro)

Referencia: leer `references/omniswitch-steps.md`.

1. **Crear solicitud**: `SolicitudeCreate`.
   Script espejo: `1_crear_solicitud.py`.
2. **Cargar documento(s)**: `SolicitudeCreateDocument` con PDF en Base64. Si hay multiples PDFs, repetir este paso usando la misma `IDSolicitud`.
   Script espejo: `2_cargar_documento.py`.
3. **Registrar firmante(s)**: `SolicitudeCreateSignatory` una vez que todos los documentos esten cargados, repitiendo el endpoint por cada firmante.
   Script espejo: `3_registrar_firmantes.py`.
4. **Disparar envio**: `SolicitudeSend`.
   Script espejo: `4_disparar_envio.py`.
5. **Consultar estado**: `GetSolicitudByID` para leer el estado por documento usando `DocFirmado`.
6. **(Post-firma) Descargar PDF firmado**: `SolicitudeGetDocument` una vez por documento cuando `DocFirmado="1"` para ese archivo.
   Script espejo: `5_recuperar_documento_firmado.py`.
7. **Persistir activo**: decodificar `DocumentoBase64`, guardar archivo binario en `storage/{organizationId}/{requestId}/` y persistir solo la ruta relativa en DB.

## Contrato confirmado

- Todos los endpoints usan `POST`.
- Header requerido: `Content-Type: application/json`.
- No hay bearer token ni API key en headers.
- La autenticacion real se hace en cada request enviando:
  - `UserName`
  - `Password`
- `SolicitudeCreate`: `IdProcess`, `PaymentRequired`, `amount`, `BiometricRequired`, `IDClienteTrx`.
- `SolicitudeCreateDocument`: `IDSolicitud`, `NombreDocumento`, `DocumentoBase64`, `numeroPagina`, `Coordenadas`.
- `SolicitudeCreateSignatory`: `Cedula`, `PrimerNombre`, `SegunNombre`, `PrimerApellido`, `SegApellido`, `Celular`, `Email`, `FirmaPrincipal`, `IdPais`, `IdProvincia`, `IdCiudad`, `Direccion`.
- `SolicitudeSend`: al menos `IDSolicitud` mas autenticacion.
- `SolicitudeGetDocument`: requiere `IDSolicitud` y `NombreDocumento`.
- `GetSolicitudByID` devuelve un array con todos los documentos de la solicitud.
- El indicador util de firma es `DocFirmado`.
- El nombre canonico del documento en consulta es `DocAFirmar`; ese mismo valor debe usarse luego como `NombreDocumento` para descargar.
- `IdPais`, `IdProvincia` e `IdCiudad` son IDs internos del proveedor, no codigos telefonicos ni ISO.
- `QueryRC` responde exito real cuando `resultCode == "0"`, no solo por HTTP.

## Regla explicita para multiples PDFs y multiples firmantes

Aplicar siempre el flujo estandar. La variacion no cambia el orden macro; solo cambia cuantas veces se repiten los pasos de carga de documentos y registro de firmantes.

Caso validado: 2 PDFs + 2 firmantes

1. `SolicitudeCreate` una vez para obtener `IDSolicitud`.
2. `SolicitudeCreateDocument` dos veces, una por cada PDF, usando la misma `IDSolicitud`.
3. `SolicitudeCreateSignatory` dos veces, una por cada firmante, usando la misma `IDSolicitud`.
4. Marcar exactamente un firmante con `FirmaPrincipal: 1`.
5. Marcar los demas firmantes con `FirmaPrincipal: 0`.
6. `SolicitudeSend` una sola vez al final.
7. Hacer polling con `GetSolicitudByID` hasta que todos los documentos requeridos tengan `DocFirmado: "1"`.
8. Descargar cada PDF firmado con `SolicitudeGetDocument`, una llamada por documento.

Generalizacion operativa: N PDFs + M firmantes

- `SolicitudeCreate`: 1 vez por solicitud/grupo.
- `SolicitudeCreateDocument`: N veces, una por PDF.
- `SolicitudeCreateSignatory`: M veces, una por firmante.
- `SolicitudeSend`: 1 vez al final, solo despues de cargar todos los PDFs y registrar todos los firmantes.
- `GetSolicitudByID`: polling por solicitud; resolver el estado documento por documento.
- `SolicitudeGetDocument`: una vez por cada PDF firmado.

Variante con validacion previa:

- `QueryRC`: 1 vez por firmante antes de crear la solicitud, si la politica del producto lo exige.
- luego seguir el flujo normal:
  - `SolicitudeCreate`
  - `SolicitudeCreateDocument`
  - `SolicitudeCreateSignatory`
  - `SolicitudeSend`

Reglas importantes:

- Todos los PDFs del mismo caso deben compartir la misma `IDSolicitud`.
- Todos los firmantes del mismo caso deben registrarse sobre esa misma `IDSolicitud`.
- Los firmantes quedan asociados a toda la solicitud, no a un PDF especifico.
- No existe orden secuencial nativo entre firmantes; la unica prioridad expuesta por el proveedor es `FirmaPrincipal`.
- Si no se envian `Coordenadas`, la referencia validada para dos firmantes usa auto-posicionamiento con la primera firma en `(50,75)` y la segunda en `(245,75)`.
- `NombreDocumento` debe seguir siendo unico dentro de la misma `IDSolicitud`.

## Integracion en Colegios

- Trigger recomendado: despues de generar/subir el lote local, por cada grupo de fila.
- Si `QueryRC` es obligatorio para la organizacion o la plantilla, la solicitud no debe enviarse a firma hasta que la validacion de identidad haya quedado exitosa.
- En el flujo actual del proyecto, el firmante principal debe salir preferentemente de los campos canónicos del Excel/placeholder:
  - `Cedula`
  - `PrimerNombre`
  - `SegunNombre`
  - `PrimerApellido`
  - `SegApellido`
  - `Celular`
  - `Email`
  - `Direccion`
- Regla de negocio obligatoria:
  - `1 fila del Excel = 1 solicitud OmniSwitch`
  - `N plantillas/PDFs de esa fila = N documentos adjuntos a la misma solicitud`
- La unidad de agrupacion debe salir del grupo de fila (`row_index`, `group_key` o equivalente), no del PDF.
- `NombreDocumento` debe ser unico dentro de la misma `IDSolicitud`.
- Subir cada PDF en loop antes de registrar firmantes.
- Para firmados recuperados, guardar en disco con ruta estable por organizacion y request; no guardar Base64 en la base de datos.
- No enviar si:
  - El request ya tiene `omniId`
  - Faltan credenciales OmniSwitch/Firmalo
  - Falta el PDF
- Usar datos del `Signatory` del request (cedula, nombre, email, celular).
- Mantener compatibilidad con aliases legacy solo como fallback; no crear nuevos aliases si ya existe el campo canónico.
- Sanitizar `Celular` (10 digitos, con 0 inicial).
- Normalizar a mayusculas los campos de nombre/apellido al enviar al proveedor:
  - `PrimerNombre`
  - `SegunNombre`
  - `PrimerApellido`
  - `SegApellido`
  - si se arma un `fullName`, enviarlo tambien en uppercase
- Usar defaults configurables para coordenadas, pagina y ubicacion.
- Para el flujo de referencia validado en el ejemplo externo, los defaults operativos son:
  - `IdPais=19`
  - `IdProvincia=17`
  - `IdCiudad=1701`
- `IdProcess` debe ser configurable; hoy los valores confirmados son:
  - `10` firma acreditada
  - `11` firma avanzada
- Politica de cobro confirmada:
  - institucion paga: `PaymentRequired=0`, `amount=0`
  - firmante paga: `amount` exacto y `PaymentRequired` debe representar la referencia operativa exigida por el proveedor
- Recomendar optimizacion de PDF (Ghostscript) para evitar timeouts (~30s).

## Reglas UX del operador

- La operacion se hace por bloque, no por PDF:
  - un bloque visible = una fila del Excel
  - ese bloque puede contener multiples PDFs
- La pantalla de firma debe priorizar:
  - firmante visible
  - estado del bloque
  - alerta de reenvio
  - boton unico de envio
- La alerta de duplicado relevante hoy es solo por `Cedula`.
- Si el bloque ya fue enviado, confirmar de forma explicita antes de reenviar porque puede generar costo adicional.
- El primer PDF del bloque es solo referencia visual:
  - abrir en modal/popup bajo demanda
  - no obligar un visor fijo embebido si el usuario pide una interfaz mas limpia

## Diseno recomendado para QueryRC en este repo

- Mantener `QueryRC` desacoplado del cliente documental principal.
- Crear un modulo de validacion de identidad con interfaz separada, por ejemplo:
  - `queryCitizenIdentity`
  - `validateCitizenBiometric`
- Persistencia recomendada en DB:
  - modelo `RcValidation`
  - relaciones opcionales a `Organization`, `DesktopBatch`, `RequestGroup` y `OmniRequest`
  - un registro por firmante/cedula y por intento de validacion relevante
- Persistir solo referencias/rutas para activos grandes:
  - fotografia
  - grafo de firma
  - certificado de aceptacion de datos
- No guardar Base64 crudo en la base de datos salvo que sea estrictamente temporal.
- Campos minimos recomendados para `RcValidation`:
  - `cedula`
  - `fullName`
  - `queryMode`
  - `status`
  - `codigoDactilarProvided`
  - `providerRequestId`
  - `photoPath`
  - `signatureGraphPath`
  - `consentDocumentPath`
  - `consentFileName`
  - `lastResultCode`
  - `lastResultText`
  - `validatedAt`
- Estados sugeridos para la validacion:
  - `NOT_REQUIRED`
  - `PENDING`
  - `DEMOGRAPHIC_OK`
  - `BIOMETRIC_OK`
  - `ERROR`
- La politica de negocio debe decidir si `QueryRC` es:
  - obligatorio para todos los firmantes
  - obligatorio solo para el principal
  - opcional segun organizacion o plantilla

## Modo Local y Mock

- Si OmniSwitch usa whitelist por IP, el entorno local no vera la IP del VPS; vera la IP publica de la red local.
- Por eso, para desarrollo local el modo recomendado es `mock`, no `real`.
- Definir un selector explicito:
  - `OMNISWITCH_MODE=mock|real`
- En `mock`:
  - no llamar al servicio externo
  - simular `IDSolicitud`, carga de varios documentos, firmante por solicitud, `DocFirmado="0"` o `"1"` y descarga por documento
  - persistir trazas locales si conviene en `data/storage/mock-omniswitch/`
- En `real`:
  - usar la base URL del proveedor
  - asumir timeout estricto de 30s
  - tratar timeouts o rechazos de conexion como posible error de whitelist/IP
- Diseñar un cliente con interfaz estable (`createRequest`, `uploadDocument`, `registerSignatory`, `sendRequest`, `getRequestStatus`, `downloadSignedDocument`) para que el cambio de `mock` a `real` no altere el resto del pipeline.

## Secuencia de implementacion recomendada en este repo

1. Crear un cliente OmniSwitch reutilizable en `services/api` o `services/worker`.
2. Encapsular helpers para auth, `post_api`, subida de PDF y descarga del firmado.
3. Separar implementacion `MockOmniSwitchClient` y `RealOmniSwitchClient`.
4. Integrar el envio despues de agrupar los PDFs por fila, guardando `omniId`.
5. Integrar una rutina de polling por `IDSolicitud`, iterando el array de documentos para detectar cuales ya tienen `DocFirmado="1"`.
6. Descargar firmados usando `DocAFirmar` como `NombreDocumento`.
7. Persistir archivos firmados en `storage/{organizationId}/{requestId}/` y solo guardar rutas en DB.
8. Registrar eventos o logs por paso para poder reanudar o depurar por `Request`.

## Regla de memoria operativa

Si en una conversacion futura el usuario dice "usa el ejemplo de `G:\\opencode\\firmas_omniswitch\\scripts\\flow`" o menciona OmniSwitch/Firmalo, asumir que esta skill debe abrirse y que esa carpeta externa es la referencia principal del flujo.

## Variables de Entorno Minimas

- `OMNISWITCH_MODE`
- `OMNISWITCH_BASE_URL`
- `OMNISWITCH_USERNAME`
- `OMNISWITCH_PASSWORD`
- `OMNISWITCH_TIMEOUT_MS`

## Manejo de Errores

- El proveedor puede responder error funcional con HTTP 200 y `resultCode != 0`; eso debe tratarse como fallo real del paso.
- No asumir idempotencia del proveedor:
  - bloquear reenvio doble de `SolicitudeSend`
  - bloquear registro duplicado del mismo firmante en la misma `IDSolicitud`
- `SENT` no implica firmado:
  - en `mock`, se mantiene asi hasta `mock-sign` o auto-firma
  - en `real`, se mantiene asi hasta que el polling detecte cambio por documento
- Si un paso falla, log y continuar con otros registros.
- No reintentar en el mismo batch sin un mecanismo de idempotencia.

## Notas operativas (validadas)
- Timeout API aprox 30s: PDF pesado puede fallar si no se optimiza.
- Si la IP publica no esta autorizada, el error esperado no es JSON sino timeout o rechazo de conexion.
- Coordenadas (X,Y) se miden desde la esquina inferior izquierda (0,0).
- Si no se envian coordenadas, OmniSwitch usa posiciones por defecto para firmas.
- `SolicitudeExpress` solo sirve para 1 documento y 1 firmante.
- `SolicitudeCreate` puede agrupar multiples PDFs dentro de una sola `IDSolicitud` cuando se usa el flujo estandar.
- `SolicitudeCreateDocument` se invoca una vez por PDF, siempre con la misma `IDSolicitud`.
- `NombreDocumento` debe ser unico por solicitud para evitar conflictos de descarga.
- `numeroPagina` y `Coordenadas` pueden variar por documento.
- `SolicitudeCreateSignatory` aplica los firmantes a todos los documentos asociados a la solicitud.
- Se permiten multiples firmantes, pero no existe orden secuencial nativo; solo `FirmaPrincipal`.
- No inferir `IdPais`, `IdProvincia` o `IdCiudad` desde prefijos telefonicos como `593`; usar el catalogo/IDs del proveedor.
- `GetSolicitudByID` devuelve el detalle por documento y la senal minima de estado es:
  - `DocFirmado: "0"` pendiente
  - `DocFirmado: "1"` firmado
- El polling debe hacerse por solicitud y resolverse por documento dentro del array de respuesta.
- `SolicitudeGetDocument` descarga cada PDF firmado por separado y exige `NombreDocumento`.
- No intentar descargar antes de confirmar `DocFirmado: "1"`.
- `DocumentoBase64` solo debe existir en transito; decodificarlo y persistir el binario.
- Guardar el firmado en `storage/{organizationId}/{requestId}/` y persistir solo `finalDocumentPath`.
- Validar rutas para bloquear path traversal (`../`).
- Exponer el PDF desde un endpoint propio leyendo desde disco y respondiendo por stream, no con Base64.

## References

Leer `references/omniswitch-steps.md` para payloads, orden y ejemplos.
