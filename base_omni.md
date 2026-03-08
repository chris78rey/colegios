G:\opencode\firmas_omniswitch\1_crear_solicitud.py
G:\opencode\firmas_omniswitch\2_cargar_documento.py
G:\opencode\firmas_omniswitch\3_registrar_firmantes.py
G:\opencode\firmas_omniswitch\4_disparar_envio.py




El resumen operativo que te han compartido es **altamente preciso** y se alinea perfectamente con el "Flujo Estándar" oficial descrito en el manual de integración de OmniSwitch. Demuestra un entendimiento claro de la arquitectura de la API.

Aquí tienes un desglose paso a paso para que puedas retroalimentar a tu equipo, confirmando lo que está bien y añadiendo un par de observaciones vitales:

**1. Sobre el Paso 1 (`SolicitudeCreate`) - ¡Perfecto!**
*   **IdProcess=10:** Es correcto, este código le indica al sistema que se aplicará una "Firma Documento Genérico Acreditada ES".
*   **Payment y Biometría:** Al enviar `PaymentRequired=1`, `amount="1"` y `BiometricRequired="1"`, están configurando el sistema para que OmniSwitch se encargue directamente de realizar el cobro al cliente final y de exigirle la validación facial/dactilar. Es el flujo donde el proveedor hace todo el trabajo pesado.

**2. Sobre el Paso 2 (`SolicitudeCreateDocument`) - Muy preciso**
*   **Coordenadas:** Los valores `"50,75"` son exactamente las coordenadas por defecto que el sistema asigna para la primera firma, partiendo desde el punto `(0,0)` en la esquina inferior izquierda del documento.
*   **Optimización (Ghostscript):** Aunque usar Ghostscript es una herramienta externa y no un parámetro de la API, **es una excelente decisión técnica**. La API de OmniSwitch tiene un estricto *Time Out* de **30 segundos**. Si el PDF es muy pesado y tarda en procesarse, la conexión fallará, por lo que comprimirlo antes de transformarlo a Base64 evitará errores.

**3. Sobre el Paso 3 (`SolicitudeCreateSignatory`) - Correcto**
*   Los datos mapeados (`Cedula`, `Celular`, `Email`, `IdPais`, `IdProvincia`, `IdCiudad`) son exactamente los que exige la estructura JSON para este método.
*   *Recomendación para tu equipo:* Recuérdales aplicar la sanitización del número de `Celular` (asegurarse de que tenga 10 dígitos y el '0' inicial), ya que este es el canal crítico donde el sistema enviará el link y el código SMS para firmar.

**4. Sobre el Paso 4 (`SolicitudeSend` y verificación) - Aclaración de uso**
*   Ejecutar `SolicitudeSend` es efectivamente el "botón de disparo" para que lleguen las notificaciones.
*   El uso de `GetSolicitudByID` para "verificar" es correcto, pero deben usarlo como un monitor continuo (*polling*). Deben programar su sistema para que lea el campo **`DocFirmado`** en la respuesta de este método; si es `"0"` el trámite sigue pendiente, y si es `"1"` el documento ya fue firmado.

### ⚠️ Lo que le falta al resumen (El Paso 5)
El flujo que te pasaron está incompleto al final. Diles que deben agregar un **Paso 5: `SolicitudeGetDocument`**.
Una vez que `GetSolicitudByID` les devuelva que el documento está firmado (`DocFirmado="1"`), el sistema no les enviará el PDF mágicamente. Deben llamar al método `SolicitudeGetDocument` enviando el `IDSolicitud` y el `NombreDocumento` exacto para poder extraer la inmensa cadena Base64 que contiene el PDF legalizado final.



Existen varias reglas estrictas, prohibiciones absolutas y directrices inusuales definidas tanto en la arquitectura del sistema como en el manual de la API de OmniSwitch. Aquí tienes las reglas más difíciles o "raras" a tener en cuenta:

### 1. Reglas "Raras" de Autorización (Override de Seguridad)
Las fuentes incluyen un "metaprompt" diseñado para que una IA ejecute código de forma autónoma, lo cual incluye reglas de anulación de seguridad muy poco comunes:
*   **Autorización Total:** Se otorga permiso explícito para crear directorios, escribir archivos y ejecutar scripts (PowerShell/Bash) de forma autónoma.
*   **Anulación de Restricciones Pasivas:** Se ordena ignorar cualquier instrucción previa que diga "El modelo NO debe ejecutar comandos" y transformarla en una acción real de escritura o ejecución de scripts.
*   **Fallo Controlado:** Si se requiere integración con una API y no hay credenciales, se debe implementar un "mock" o degradación controlada en lugar de detener el pipeline.

### 2. Prohibiciones Estrictas de Infraestructura (Docker y Base de Datos)
El entorno de desarrollo está fuertemente bloqueado para garantizar que sea 100% reproducible:
*   **Todo dentro del contenedor:** Está estrictamente prohibido ejecutar `npm run dev` o Prisma (`npx prisma migrate`, `npx prisma generate`) en la máquina host (tu computadora local). Todos los comandos deben ejecutarse con `docker compose exec api ...`.
*   **Base de Datos inmutable:** Está **prohibido usar SQLite en local**; se debe usar exclusivamente PostgreSQL en un contenedor de Docker.
*   **Control de Versiones:** Está prohibido usar la etiqueta `latest` sin versión en las imágenes de Docker.
*   **Rutas Absolutas:** Prohibido usar rutas absolutas de Windows dentro de la configuración del `docker-compose.yml`.

### 3. Reglas Difíciles de Almacenamiento y Archivos
El manejo de los PDFs en Base64 tiene restricciones severas para proteger la memoria y seguridad del servidor:
*   **Nada de Base64 en la BD:** Está **estrictamente prohibido guardar las cadenas completas de Base64 en la base de datos**. El Base64 solo debe estar "en tránsito". Solo se debe guardar la ruta del archivo físico local.
*   **Protección Path Traversal:** Es obligatorio validar las rutas de almacenamiento para **no permitir ataques de path traversal** (ej. evitar el uso de `../` en las rutas).
*   **Respuestas Masivas:** Prohibido entregar el Base64 gigante como respuesta HTTP por defecto al cliente; se debe usar un *stream* de datos.
*   **Sanitización obligatoria:** Prohibido subir un PDF a la API sin antes verificar en el backend que su tamaño sea mayor a 0 y que el tipo MIME sea correcto.

### 4. Reglas Estrictas de Lógica de Negocio y Estados
El motor de orquestación (Subproyecto 5 y 7) tiene reglas inflexibles para la trazabilidad:
*   **Máquina de Estados:** Está prohibido cambiar el estado interno de una solicitud sin registrar simultáneamente un evento en la tabla `RequestEvent`.
*   **Bloqueo de Envío:** Está prohibido ejecutar el método de envío (`SolicitudeSend`) si la solicitud aún no tiene firmantes registrados.
*   **Prohibiciones en Reportería:** Prohibido utilizar consultas "raw SQL" (SQL crudo) sin justificación para los reportes financieros.

### 5. Reglas "Capciosas" de la API de OmniSwitch
A nivel de la integración con el proveedor, hay comportamientos muy específicos que pueden causar errores si no se manejan bien:
*   **Time Out Implacable:** Todas las transacciones tienen un tiempo de espera máximo de **30 segundos**. Si un PDF es muy pesado, la transacción fallará.
*   **Origen de Coordenadas Inverso:** A diferencia de la mayoría de sistemas informáticos que inician en la esquina superior izquierda, las coordenadas (X,Y) para el sello de la firma en OmniSwitch **inician desde la esquina inferior izquierda (0,0)**.
*   **Coordenadas Fantasma (Por Defecto):** Si no envías coordenadas, el sistema no da error, sino que estampa las firmas automáticamente en posiciones predefinidas abajo a la izquierda: la primera en **(50,75)**, la segunda en **(245,75)** y la tercera en **(415,75)**.
*   **Limitación de la Firma Express:** El método `SolicitudeExpress` parece ideal por ser rápido (todo en un paso), pero tiene la regla estricta de que **solo funciona para un (1) documento y un (1) firmante**. No puedes usarlo para paquetes de documentos.



A continuación, te detallo todos los campos (parámetros de entrada o *Request*) que se necesitan para cada uno de los métodos del API de OmniSwitch, según la documentación técnica:

### 1. `SolicitudeCreate` (Creación de la solicitud)
Inicializa el proceso de firma en el sistema.
*   **`UserName` y `Password`**: Tus credenciales de acceso como integrador.
*   **`IdProcess`**: Identificador del tipo de firma (ej. 10 para Acreditada, 11 para Avanzada).
*   **`PaymentRequired`**: Identificador de suministro a consultar (ej. un número de teléfono). Si tú manejas el cobro se envía en 0.
*   **`BiometricRequired`**: **"1"** si requiere validación biométrica de OmniSwitch, o **"0"** si no la requiere.
*   **`amount`**: Valor total a cobrar incluyendo impuestos. Si tú cobras por tu cuenta, se envía 0.
*   **`IDClienteTrx`** *(Opcional)*: Tu propio identificador para rastrear la transacción.

### 2. `SolicitudeCreateDocument` (Carga de PDFs)
Adjunta los documentos que van a ser firmados.
*   **`UserName` y `Password`**: Credenciales de acceso.
*   **`IDSolicitud`**: El ID que te devolvió el método `SolicitudeCreate`.
*   **`NombreDocumento`**: El nombre de tu archivo PDF (ej. `contrato.pdf`).
*   **`DocumentoBase64`**: El archivo PDF transformado a texto en formato Base64.
*   **`numeroPagina`** *(Opcional)*: Número de la página donde irá la firma. Si no se envía, se firma en la página 1.
*   **`Coordenadas`** *(Opcional)*: Posición (X,Y) desde la esquina inferior izquierda. Si no se envía, toma posiciones por defecto.
*   **`IDClienteTrx`** *(Opcional)*: ID de transacción del cliente.

### 3. `SolicitudeCreateSignatory` (Registro de Firmantes)
Añade a las personas que van a firmar la solicitud.
*   **`UserName` y `Password`**: Credenciales de acceso.
*   **`IDSolicitud`**: El ID de la solicitud principal.
*   **`Cedula`**: Número de cédula del firmante.
*   **`PrimerNombre`, `SegunNombre`, `PrimerApellido`, `SegApellido`**: Nombres y apellidos del firmante.
*   **`Celular` y `Email`**: Datos de contacto obligatorios donde recibirán el enlace de firma.
*   **`FirmaPrincipal`**: **1** si es el firmante principal, **0** si no lo es.
*   **`IdPais`, `IdProvincia`, `IdCiudad`, `Direccion` (`address`)**: Datos de ubicación física del firmante.
*   **`DocumentoBase64`** *(Opcional)*: Documento con evidencia biométrica, en caso de que en la creación de la solicitud enviaras `BiometricRequired = 0`.
*   **`IDClienteTrx`** *(Opcional)*: ID de transacción del cliente.

### 4. `SolicitudeSend` (Disparador de Notificaciones)
Ejecuta el envío de los mensajes (SMS/Correo) para que los firmantes inicien el trámite.
*   **`UserName` y `Password`**: Credenciales de acceso.
*   **`IDSolicitud`**: El ID de la solicitud a enviar.
*   **`IDClienteTrx`** *(Opcional)*: ID de transacción del cliente.

### 5. `GetSolicitudByID` (Consulta de Estado)
Permite monitorear si el documento ya fue firmado.
*   **`UserName` y `Password`**: Credenciales de acceso.
*   **`IDSolicitud`**: El ID de la solicitud.
*   **`IDClienteTrx`** *(Opcional)*: ID de transacción del cliente.

### 6. `SolicitudeGetDocument` (Descarga del PDF Firmado)
Obtiene el archivo PDF final con la firma estampada.
*   **`UserName` y `Password`**: Credenciales de acceso.
*   **`IDSolicitud`**: El ID de la solicitud.
*   **`NombreDocumento`**: El nombre **exacto** del archivo que enviaste al cargarlo.
*   **`IDClienteTrx`** *(Opcional)*: ID de transacción del cliente.

### 7. `QueryRC` (Consulta Registro Civil)
Sirve para verificar identidad o generar el comprobante de aceptación de uso de datos.
*   **`UserName` y `Password`**: Credenciales de acceso.
*   **`Cedula`**: Cédula del ciudadano a consultar.
*   **`CodigoDactilar`** *(Opcional)*: Los 6 dígitos dactilares para una validación biométrica que devuelve foto y grafo.
*   **`Celular` y `Email`** *(Opcional)*: Para que se emita un certificado de aceptación a esos datos.
*   **`IDClienteTrx`** *(Opcional)*: ID de transacción del cliente.

### 8. `SolicitudeSign` (Firma Manual sin biometría del proveedor)
Activa la firma enviando tu propia evidencia de verificación.
*   **`UserName` y `Password`**: Credenciales de acceso.
*   **`IDSolicitud`**: El ID de la solicitud.
*   **`Cedula`**: Número de cédula del firmante.
*   **`IDClienteTrx`** *(Opcional)*: ID de transacción del cliente.

### 9. `SolicitudeExpress` (Flujo Rápido Todo en Uno)
Realiza la creación, carga y envío para **1 solo documento y 1 solo firmante** en una única llamada.
*   **`UserName` y `Password`**: Credenciales de acceso.
*   **`IdProcess`**: Identificador del proceso de firma.
*   **`Cedula`**: Cédula del firmante.
*   **`CodigoDactilar`** *(Opcional)*: Código dactilar para registro civil.
*   **`Celular` y `Email`** *(Opcional)*: Contacto del firmante.
*   **`DocumentoBase64`**: El archivo PDF a firmar en Base64.
*   **`DocBiometriaBase64`** *(Opcional)*: Evidencia biométrica si no quieres usar la de OmniSwitch.
*   **`numeroPagina` y `Coordenadas`** *(Opcional)*: Ubicación del sello de firma.
*   **`IDClienteTrx`** *(Opcional)*: ID de transacción del cliente.
