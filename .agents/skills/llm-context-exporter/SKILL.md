---
name: llm-context-exporter
description: "Generador local del contexto del árbol del proyecto y código completo para Inteligencias Artificiales."
---
# Context Exporter Tool 📦🤖

Este Skill permite al desarrollador (o al Agente IA) extraer instantáneamente toda la topología de un proyecto (Front End, Back End, Configuración) en un único archivo Markdown `llm_project_context.md`. Este archivo es ideal para alimentar a modelos grandes (LLMs) que necesitan contexto absoluto del repositorio y su estado actual para poder opinar de arquitectura.

## 🛠️ Instalación Universal (Windows/Linux)
Abre la terminal en la carpeta de este Skill (`g:\codex_projects\colegios\.agents\skills\llm-context-exporter`) y ejecuta:

```bash
npm install -g .
```

Esto vinculará el comando `llm-export` en tu sistema global de forma permanente.

## 🚀 ¿Cómo usarlo?
1. Navega a **cualquier** directorio que quieras leer en tu consola (por ejemplo, `cd g:\codex_projects\colegios\services\api`).
2. Escribe en la consola:
```bash
llm-export
```
3.  ¡Boom! Se agruparán automáticamente todos los archivos fuente que NO estén en tu `.gitignore` ni sean binarios en el archivo `llm_project_context.md`.

## ⚠️ ¿Qué pasa si el comando no funciona o lanza un error sobre "ignore"?
Puedes ejecutar la herramienta en tiempo de desarrollo así (usando Node ESM):
1. `cd g:\codex_projects\colegios\.agents\skills\llm-context-exporter`
2. `npm install`
3. `node index.js` (si deseas pasarlo sobre el mismo proyecto)

Las reglas fuertes de evitación (`HARD_IGNORE_DIRS` y `HARD_IGNORE_EXTS`) están preconfiguradas en el `index.js` para asegurar que nunca se "tokenice" una imagen `.png` o se sature a la IA leyendo un volcado `.zip`.
