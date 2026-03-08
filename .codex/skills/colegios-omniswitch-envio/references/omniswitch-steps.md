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

## Paso 4: Disparar Envio

Script: `4_disparar_envio.py`

Endpoint: `SolicitudeSend`

Payload base:
- `UserName`
- `Password`
- `IDSolicitud`

## Reglas de Orden

1. Crear solicitud
2. Cargar documento
3. Registrar firmante
4. Disparar envio

No reordenar pasos.
