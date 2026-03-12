# OmniSwitch Steps (Referencia)

Fuente operativa: scripts en `G:\opencode\firmas_omniswitch\`.

## Paso 1: Crear Solicitud

Script: `1_crear_solicitud.py`

Endpoint: `SolicitudeCreate`

Payload base:
- `UserName`
- `Password`
- `IdProcess`
- `PaymentRequired`
- `amount`
- `BiometricRequired`

Salida esperada:
- `resultCode == 0`
- `IdSolicitud` (guardar como `omniId`)

Reglas:
- Usar el flujo estandar para multiples documentos.
- Una misma `IDSolicitud` puede agrupar multiples PDFs.
- `SolicitudeExpress` no sirve para este caso porque solo acepta 1 documento y 1 firmante.

## Paso 2: Cargar Documento

Script: `2_cargar_documento.py`

Endpoint: `SolicitudeCreateDocument`

Payload base:
- `UserName`
- `Password`
- `IDSolicitud`
- `NombreDocumento`
- `DocumentoBase64`
- `numeroPagina`
- `Coordenadas`

Reglas:
- Invocar este endpoint una vez por cada PDF.
- Reutilizar exactamente la misma `IDSolicitud` en todas las cargas del mismo paquete.
- `numeroPagina` y `Coordenadas` pueden cambiar por documento.
- Considerar timeout cercano a 30s: optimizar PDFs pesados antes de convertir a Base64.

## Paso 3: Registrar Firmante

Script: `3_registrar_firmantes.py`

Endpoint: `SolicitudeCreateSignatory`

Payload base:
- `UserName`
- `Password`
- `IDSolicitud`
- `Cedula`
- `PrimerNombre`
- `SegunNombre`
- `PrimerApellido`
- `SegApellido`
- `Celular`
- `Email`
- `FirmaPrincipal`
- `IdPais`
- `IdProvincia`
- `IdCiudad`
- `Direccion`

Reglas:
- Los firmantes quedan vinculados a la `IDSolicitud`, no a un documento individual.
- La misma lista de firmantes aplica automaticamente a todos los PDFs ya cargados en la solicitud.

## Paso 4: Disparar Envio

Script: `4_disparar_envio.py`

Endpoint: `SolicitudeSend`

Payload base:
- `UserName`
- `Password`
- `IDSolicitud`

## Reglas de Orden

1. Crear solicitud
2. Cargar uno o varios documentos
3. Registrar firmante
4. Disparar envio

No reordenar pasos.

## Consulta de Estado

Endpoint: `GetSolicitudByID`

Respuesta clave:
- `Solicitudes_Documentos`: arreglo con el estado por documento
- `DocAFirmar`: nombre del archivo
- `DocFirmado`: `"0"` pendiente, `"1"` firmado

## Descarga de Firmados

Endpoint: `SolicitudeGetDocument`

Reglas:
- Descargar cada documento firmado por separado.
- Enviar `IDSolicitud` y `NombreDocumento` exacto en cada llamada.
- Esperar a que `GetSolicitudByID` marque `DocFirmado="1"` para ese archivo.

## Persistencia Local del Firmado

Reglas:
- No guardar `DocumentoBase64` en base de datos; usarlo solo en transito.
- Decodificar `DocumentoBase64` a binario (`Buffer`) en backend.
- Guardar el archivo en `storage/{organizationId}/{requestId}/` con nombre estable, por ejemplo `signed.pdf` o `final.pdf`.
- Persistir en DB solo la ruta relativa, por ejemplo en `finalDocumentPath`.
- Validar cualquier segmento de ruta para impedir path traversal.
- Para servir el PDF al frontend, leer el archivo desde disco y responder por stream.
