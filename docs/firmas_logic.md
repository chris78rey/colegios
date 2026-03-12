# Logica End-to-End de Firma (OmniSwitch)

Este documento describe el flujo completo que debe implementar el nuevo proyecto para integrar firma electronica con OmniSwitch. Esta basado en el flujo que ya funciona en este repo y debe respetar el orden estricto de llamadas.

## 1. Variables de entorno
Se requieren credenciales para todos los endpoints.

- `FIRMALO_URL_BASE` (opcional). Default: `https://wsrest.firmalo.ai/api/v1`
- `FIRMALO_USER`
- `FIRMALO_PASSWORD`

Opciones seguras:
- `FIRMALO_USER_ENC` + `MASTER_KEY`
- `FIRMALO_PASSWORD_ENC` + `MASTER_KEY`
- `FIRMALO_PASSWORD_B64` o `FIRMALO_PASSWORD_B64_ENC`

Regla: si falta usuario o password, abortar y no continuar el flujo.

## 2. Endpoints usados (orden obligatorio)
1. `SolicitudeCreate` (crear solicitud)
2. `SolicitudeCreateDocument` (subir PDF base64)
3. `SolicitudeCreateSignatory` (registrar firmantes)
4. `SolicitudeSend` (disparar envio)
5. `GetSolicitudByID` (consultar estado y metadatos)
6. `SolicitudeGetDocument` (descargar PDF firmado)

Todos los endpoints requieren `UserName` y `Password` en el payload.

## 3. Manejo de IDSolicitud
- El ID de la solicitud se obtiene desde `SolicitudeCreate`.
- En pasos siguientes se debe enviar `IDSolicitud`.
- Una misma `IDSolicitud` puede agrupar multiples PDFs cuando se usa el flujo estandar.
- `SolicitudeExpress` no aplica si se necesitan multiples documentos o multiples firmantes.
- En el flujo actual se persiste en `solicitud_id.txt` para no perder estado.
- En el nuevo proyecto, persistirlo en base de datos (`requests.omni_id`) y en eventos.

## 4. Flujo detallado por paso (con payloads)

### 4.1 Crear solicitud (SolicitudeCreate)
Objetivo: crear la solicitud transaccional y obtener `IdSolicitud`.

Payload base:
```json
{
  "UserName": "...",
  "Password": "...",
  "IdProcess": 10,
  "PaymentRequired": 1,
  "amount": "1",
  "BiometricRequired": "1"
}
```

Notas:
- `PaymentRequired=1` indica cobro al firmante. Si el colegio asume el costo, enviar `PaymentRequired=0` y `amount="0"`.
- `IdProcess` debe quedar configurable por institucion si OmniSwitch define procesos distintos.
- Validar `resultCode == 0`. Si no, loggear `resultText` y marcar como `FAILED`.

Respuesta esperada:
- `IdSolicitud` o `IDSolicitud`.

### 4.2 Subir documento (SolicitudeCreateDocument)
Objetivo: cargar el PDF en base64 con coordenadas de firma.

Pre-proceso:
- Optimizar PDF si es grande (Ghostscript en el flujo actual).
- Convertir a Base64.
- Si el request tiene multiples PDFs, ejecutar este paso en loop y reutilizar la misma `IDSolicitud`.

Payload:
```json
{
  "UserName": "...",
  "Password": "...",
  "IDSolicitud": 12345,
  "NombreDocumento": "Contrato_Servicios.pdf",
  "DocumentoBase64": "<base64>",
  "numeroPagina": "1",
  "Coordenadas": "50,75"
}
```

Notas:
- `numeroPagina` y `Coordenadas` salen de la plantilla configurada por institucion.
- El origen de coordenadas es la esquina inferior izquierda del PDF.
- `numeroPagina` y `Coordenadas` pueden variar por documento dentro de la misma solicitud.
- Validar respuesta y registrar evento.

### 4.3 Registrar firmantes (SolicitudeCreateSignatory)
Objetivo: registrar uno o mas firmantes. Debe existir un firmante principal.

Payload por firmante:
```json
{
  "UserName": "...",
  "Password": "...",
  "IDSolicitud": 12345,
  "Cedula": "0000000000",
  "PrimerNombre": "NOMBRE1",
  "SegunNombre": "",
  "PrimerApellido": "APELLIDO1",
  "SegApellido": "",
  "Celular": "0990000000",
  "Email": "firmante1@example.com",
  "FirmaPrincipal": 1,
  "IdPais": 19,
  "IdProvincia": 17,
  "IdCiudad": 1701,
  "Direccion": "Ciudad"
}
```

Notas:
- Sanitizar celular: si tiene 9 digitos, anteponer `0`.
- Validar que email y cedula existan antes de enviar.
- Manejar multiples firmantes con una cola o loop controlado.
- Los firmantes se asocian a la `IDSolicitud` completa y aplican automaticamente a todos los documentos cargados.

### 4.4 Disparar envio (SolicitudeSend)
Objetivo: enviar la solicitud al/los firmantes (WhatsApp/email segun OmniSwitch).

Payload:
```json
{
  "UserName": "...",
  "Password": "...",
  "IDSolicitud": 12345
}
```

Notas:
- Antes de enviar se puede consultar `GetSolicitudByID` para verificar firmantes.
- Guardar evento `SENT` si `resultCode == 0`.

### 4.5 Consultar estado (GetSolicitudByID)
Objetivo: verificar estado de firma, firmantes y documentos.

Payload:
```json
{
  "UserName": "...",
  "Password": "...",
  "IDSolicitud": 12345
}
```

Respuesta esperada (puede venir como lista o dict):
- `Solicitudes_Firmantes` o `Firmantes`
- `Solicitudes_Documentos`

Campos usados:
- `DocAFirmar`
- `DocFirmado` (1 indica firmado)

Notas:
- La API puede devolver lista o diccionario. El parser debe soportar ambos.
- `Solicitudes_Documentos` llega como arreglo con el estado individual por archivo.

### 4.6 Descargar documento firmado (SolicitudeGetDocument)
Objetivo: obtener el PDF firmado en base64.

Payload:
```json
{
  "UserName": "...",
  "Password": "...",
  "IDSolicitud": 12345,
  "NombreDocumento": "Contrato_Servicios.pdf"
}
```

Respuesta esperada:
- `DocumentoBase64` si `resultCode == 0`.

Accion:
- Decodificar y guardar en storage (ej. `storage/org_<id>/firmados/`).

Notas:
- Este endpoint devuelve un unico documento por llamada.
- Es obligatorio enviar `NombreDocumento` exacto para descargar cada PDF firmado.
- Antes de descargar, verificar con `GetSolicitudByID` que `DocFirmado == 1`.
- `DocumentoBase64` no debe persistirse en la base de datos.
- Convertir `DocumentoBase64` a binario (`Buffer`) y guardar el archivo fisico en disco.
- Estructura sugerida de almacenamiento: `storage/{organizationId}/{requestId}/`.
- Usar un nombre estable para el firmado final, por ejemplo `signed.pdf` o `final.pdf`.
- Persistir en `Request` solo la ruta relativa (`finalDocumentPath`).
- Validar rutas y segmentos para impedir path traversal (`../`).
- Si el frontend necesita el PDF, exponer un endpoint propio que lea desde disco y responda por stream en lugar de devolver Base64.

## 5. Estados y trazabilidad
Estados recomendados:
- `PENDING` (creada localmente)
- `CREATED` (SolicitudeCreate ok)
- `DOC_UPLOADED` (SolicitudeCreateDocument ok)
- `SIGNATORIES_OK` (firmantes registrados)
- `SENT` (SolicitudeSend ok)
- `SIGNED` (DocFirmado == 1)
- `FAILED`

Registrar cada transicion en `request_events` con `resultCode/resultText`.

## 6. Anti-spam y reintentos
- Procesar solicitudes via cola (Redis + worker).
- Rate limit por institucion (ej. 10/min).
- Reintentos max 3 con backoff progresivo.
- Si hay demasiados errores consecutivos, pausar cola de esa institucion.

## 7. Carga masiva (Excel)
Regla de nomenclatura:
- Los placeholders de la plantilla HTML/DOCX deben coincidir exactamente con los nombres de columna del Excel.
- Si la plantilla usa `{{SegApellido}}`, el Excel debe tener una columna `SegApellido`.
- No introducir aliases intermedios para los campos canónicos de OmniSwitch.

Campos canónicos de firma por fila:
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

Campos mínimos que deben llenarse de ley en el Excel:
- `Cedula`
- `PrimerNombre`
- `PrimerApellido`
- `Celular`
- `Email`
- `Direccion`

Campos que pueden ir con default prellenado por institución o en el Excel ejemplo:
- `FirmaPrincipal`
- `IdPais`
- `IdProvincia`
- `IdCiudad`

Campos adicionales permitidos para el documento:
- `AlumnoNombre`
- `AlumnoApellido`
- `Curso`
- `Fecha`
- `Institucion`
- cualquier otro placeholder adicional requerido por la plantilla

Reglas:
- Sanitizar celular (agregar `0` si falta).
- Validar campos obligatorios y devolver preview de errores.
- Insertar `requests` + `signatories` en DB y luego encolar.

## 8. Manejo de pago
- Si paga el padre: `PaymentRequired=1` y `amount` con el valor.
- Si paga el colegio: `PaymentRequired=0` y `amount=0`.
- Descontar creditos internos cuando se dispare `SolicitudeSend`.

## 9. Observaciones tecnicas
- El PDF debe ser liviano; si supera limites, optimizar con Ghostscript.
- Mantener logs por `IDSolicitud` y `request_id`.
- La API de OmniSwitch puede responder con estructuras variables; no asumir un unico formato.
- La documentacion no fija un maximo numerico de documentos por solicitud, pero el timeout de ~30s limita el tamano practico del paquete.
- La cadena Base64 del firmado final es costosa en memoria; debe existir solo durante la descarga y conversion a archivo.

## 10. Checklist de implementacion
1. Validar env vars y credenciales.
2. Crear solicitud y guardar `IDSolicitud`.
3. Subir PDF con coordenadas.
4. Registrar firmantes (con celular saneado).
5. Enviar solicitud.
6. Consultar estado hasta `DocFirmado == 1`.
7. Descargar PDF firmado por `NombreDocumento`.
8. Convertir Base64 a binario y guardar en `storage/{organizationId}/{requestId}/`.
9. Persistir `finalDocumentPath` y servir el archivo por stream cuando se solicite.
