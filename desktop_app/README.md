# App local PySide6

MVP local para preparar lotes multi-plantilla a partir de un solo Excel sin tocar el flujo web actual.

## Objetivo actual

- Seleccionar hasta 4 plantillas `.docx` o `.html`
- Cargar un `.xlsx` o `.csv`
- Extraer placeholders de las plantillas
- Validar la union de columnas requeridas
- Mostrar los registros del Excel
- Generar PDFs locales desde plantillas HTML
- Exportar un lote local con `manifest.json` preservando la relacion:
  - `row_index`
  - `group_key`
  - `template_name`
  - `template_path`
  - `output_name`

## Alcance de este MVP

- No modifica el sistema web existente
- Puede subir el lote generado al backend web
- No envia nada a OmniSwitch todavia
- Genera PDFs solo para plantillas `.html` / `.htm`
- Las plantillas `.docx` quedan registradas en el lote pero no se renderizan todavia

## Ejecutar

```bash
cd desktop_app
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

En Windows PowerShell:

```powershell
cd desktop_app
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
py main.py
```

## Perfilar rendimiento de generacion

Puedes medir en que etapa se va el tiempo sin abrir la UI:

```powershell
cd G:\codex_projects\colegios\desktop_app
.venv\Scripts\Activate.ps1
py profile_generation.py --excel "C:\ruta\archivo.xlsx" --template "C:\ruta\plantilla1.html" --template "C:\ruta\plantilla2.html"
```

Opciones utiles:

- `--limit-rows 5`: procesa solo las primeras filas para comparar rapido
- `--output-root "C:\ruta\salida"`: cambia la carpeta de salida del profiling
- `--json-out "C:\ruta\reporte.json"`: guarda el reporte completo en JSON

La herramienta reporta tiempos de:

- carga del Excel
- carga de plantillas
- construccion del lote
- exportacion de estructura
- generacion total
- tiempo por documento y tiempo del `write_pdf`

## Generar ejecutable para Windows

Debes hacerlo desde Windows, no desde WSL/Linux.

En PowerShell:

```powershell
cd G:\codex_projects\colegios\desktop_app
.\build.ps1
```

Que hace el script:

- crea o reutiliza `.venv`
- instala dependencias y `pyinstaller`
- detecta el runtime GTK usado por WeasyPrint
- construye `dist\ColegiosDesktop`
- ejecuta un smoke test real del `.exe` fuera del arbol fuente

El ejecutable quedara en:

```text
desktop_app\dist\ColegiosDesktop\ColegiosDesktop.exe
```

La carpeta de salida de documentos en modo app o ejecutable sera:

```text
Documentos\Colegios Desktop Output
```

Si el runtime GTK no esta en la ruta esperada, puedes indicarlo manualmente:

```powershell
.\build.ps1 -GtkRuntimeDir "C:\Program Files\GTK3-Runtime Win64\bin"
```

Tambien puedes omitir el smoke test:

```powershell
.\build.ps1 -SkipSmokeTest
```

Para generar tambien el instalador con Inno Setup:

```powershell
.\build.ps1 -BuildInstaller
```

Si `ISCC.exe` no esta en una ruta conocida:

```powershell
.\build.ps1 -BuildInstaller -InnoCompilerPath "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
```

## Prueba manual del ejecutable

1. Copia `desktop_app\dist\ColegiosDesktop\` a una carpeta fuera del repo.
2. Abre `ColegiosDesktop.exe`.
3. Verifica que la ventana principal abra sin depender de Python ni del codigo fuente.
4. Carga una plantilla HTML y un Excel.
5. Pulsa `Generar documentos`.
6. Confirma que el lote quede en `Documentos\Colegios Desktop Output\...` y que se creen `.html`, `.pdf` y `manifest.json`.

## Prueba automatizada del ejecutable

El build ya ejecuta una verificacion interna del `.exe`:

- copia `dist\ColegiosDesktop` a una carpeta temporal fuera del repo
- copia un Excel y una plantilla de ejemplo
- ejecuta `ColegiosDesktop.exe --smoke-test ...`
- valida que se genere al menos un PDF y un reporte JSON

El reporte del smoke test queda en una ruta temporal bajo `%TEMP%`.

## Manejo de errores de arranque

Si el ejecutable falla al iniciar, la app muestra un mensaje claro y guarda un log tecnico en:

```text
Documentos\Colegios Desktop Output\logs\
```

## Distribucion a usuarios

Para distribuir, entrega la carpeta completa:

```text
dist\ColegiosDesktop\
```

No entregues solo `ColegiosDesktop.exe`, porque PyInstaller deja DLLs y recursos necesarios dentro de `_internal\`.

Si prefieres una instalacion clasica para usuarios no tecnicos, compila el instalador Inno Setup definido en:

```text
desktop_app\installer.iss
```

Ese instalador:

- copia la app a `Program Files\Colegios Desktop`
- crea acceso directo en menu Inicio
- puede crear acceso directo en escritorio
- agrega desinstalador

## Instalador opcional

Despues de estabilizar `dist\`, una siguiente mejora razonable es empaquetar esa carpeta con Inno Setup para:

- acceso directo en escritorio
- entrada en menu Inicio
- desinstalador
- instalacion en `Program Files`

No es necesario para validar el ejecutable distribuible base.

## Salida del lote

Al exportar o generar, la app crea una carpeta dentro de `Documentos/Colegios Desktop Output/`:

- `manifest.json`
- `rows/row-0001/`
- `rows/row-0002/`

Cada documento planificado conserva la referencia del registro original para que luego se pueda:

- generar PDF localmente
- subir el lote a la web
- agrupar varios PDFs bajo una misma solicitud para OmniSwitch

## Imagenes en plantillas HTML

Las imagenes locales funcionan si la plantilla HTML las referencia con rutas relativas correctas, porque el render usa
como base la carpeta real de la plantilla.

## Subida al sistema web

Despues de generar los documentos:

1. conecta la app al sistema web con URL, correo y contrasena
2. pulsa `Subir documentos al sistema`
3. el backend guarda el lote importado y sus PDFs preservando `row_index`, `group_key` y `template_name`

## Recordar conexion local

En la tarjeta `Sistema web`, la app puede recordar localmente:

- URL del sistema
- correo
- contrasena

Activa `Recordar datos` para que esos campos reaparezcan al volver a abrir la app. La configuracion se guarda por usuario en una carpeta local separada de la salida de documentos.
