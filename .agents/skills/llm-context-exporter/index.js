#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

const START_TIME = performance.now();
const OUTPUT_FILE = 'llm_project_context.md';
const MAX_FILE_SIZE_KB = 300;

// ==========================================
// 1. CONFIGURACIÓN DE FILTROS Y EXCLUSIONES
// ==========================================
// Carpetas inquebrantables a ignorar pase lo que pase
const HARD_IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', 'out', 'coverage',
  '.vercel', '.svn', '.vs', '.vscode', '.idea', 'venv', '.venv', '.venv-linux', 'env', '__pycache__', 
  '.cache', 'tmp', 'temp', 'data', 'backups', 'logs', 'vendor', 'site-packages', 'pgdata'
]);

// Archivos o extensiones inquebrantables que NUNCA queremos leer (binarios, imágenes, lock files gigantes)
const HARD_IGNORE_EXTS = new Set([
  // Binarios / Compilados
  '.exe', '.dll', '.so', '.dylib', '.class', '.jar', '.pyc', '.pyo', 
  // Medias / Assets Visuales
  '.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.webp', '.mp3', '.mp4', '.mov', '.wav', '.avi',
  // Documentos cerrados o pesados
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.tar', '.gz', '.rar', '.7z',
  // Bases de datos locales y locks
  '.sqlite', '.sqlite3', '.db', '.log', '.lock'
]);

// Archivos exactos que ignoramos preventivamente
const HARD_IGNORE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', OUTPUT_FILE, '.env', '.env.local', '.env.development', '.env.production'
]);

const cwd = process.cwd();
const ig = ignore.default();

// Si existe un .gitignore en la raíz, lo inyectamos al motor ig de inmediato
const gitignorePath = path.join(cwd, '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  ig.add(gitignoreContent);
}

// ==========================================
// 2. LÓGICA DE DETECCIÓN Y RECORRIDO DE ÁRBOL
// ==========================================
function isIgnored(itemPath, isDirectory) {
  const relativePath = path.relative(cwd, itemPath).replace(/\\/g, '/'); // Asegurar formato Linux/Unix en rutas
  if (!relativePath) return false; // En la raiz

  const basename = path.basename(itemPath);
  
  // Reglas duras (Nivel 1 de seguridad)
  if (isDirectory && HARD_IGNORE_DIRS.has(basename)) return true;
  if (!isDirectory && HARD_IGNORE_FILES.has(basename)) return true;
  
  const ext = path.extname(basename).toLowerCase();
  if (!isDirectory && HARD_IGNORE_EXTS.has(ext)) return true;

  // Ignorar archivos y carpetas ocultas (excepto .github o parecidos si fuera necesario, pero por ahora todo lo que empieza por . se asume bloqueado o manejado arriba, mejor confiar en .git para ocultos)
  if (basename.startsWith('.git')) return true;

  // Regla Gitignore (Nivel 2)
  if (ig.ignores(isDirectory ? relativePath + '/' : relativePath)) return true;

  return false;
}

const allValidFiles = [];

// Recorre carpetas para armar un string de representación en Árbol (Tree)
// Y simultáneamente rellena `allValidFiles` con los archivos a procesar
function walkDirectory(dirPath, prefix = '') {
  let treeText = '';
  let entries;
  
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    console.error(`[!] Error leyendo el directorio: ${dirPath}`, err.message);
    return treeText;
  }

  // Filtrar archivos inválidos o ignorados
  const validEntries = entries.filter(entry => !isIgnored(path.join(dirPath, entry.name), entry.isDirectory()));

  // Ordenar para que las carpetas salgan primero y tengan estructura predecible
  validEntries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  validEntries.forEach((entry, index) => {
    const isLast = index === validEntries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    treeText += `${prefix}${connector}${entry.name}\n`;
    
    const absolutePath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      const extensionPrefix = prefix + (isLast ? '    ' : '│   ');
      treeText += walkDirectory(absolutePath, extensionPrefix);
    } else {
      allValidFiles.push(absolutePath);
    }
  });

  return treeText;
}

// ==========================================
// 3. GENERACIÓN DEL ARCHIVO CONTEXTUAL
// ==========================================
console.log(`\n🔍 Escaneando directorio: ${cwd}\nRecopilando archivos seguros...`);

const projectName = path.basename(cwd);
let markdownContext = `# CONTEXTO DEL PROYECTO: ${projectName}\n`;
markdownContext += `> Archivo generado el: ${new Date().toISOString()}\n\n`;

markdownContext += `## 🌳 Estructura Jerárquica del Directorio\n`;
markdownContext += '```text\n';
markdownContext += `${projectName}/\n`;
const treeVisual = walkDirectory(cwd);
markdownContext += treeVisual;
markdownContext += '```\n\n';

markdownContext += `## 📄 Contenido de los Archivos\n`;

let totalProcessed = 0;
let totalSkippedDueToSize = 0;

for (const absolutePath of allValidFiles) {
  const relativePath = path.relative(cwd, absolutePath).replace(/\\/g, '/');
  
  // Evitar romper el límite de memoria: Validar permisos y peso
  let stats;
  try {
    stats = fs.statSync(absolutePath);
  } catch (err) {
    markdownContext += `\n### 📦 \`[OMITIDO POR ERROR DE PERMISOS]\` ${relativePath}\n`;
    markdownContext += `> El archivo no se pudo leer o está bloqueado por el sistema (${err.code}).\n\n`;
    continue;
  }
  const sizeKB = stats.size / 1024;
  
  if (sizeKB > MAX_FILE_SIZE_KB) {
    markdownContext += `\n### 📦 \`[OMITIDO POR TAMAÑO]\` ${relativePath}\n`;
    markdownContext += `> Este archivo excede el tamaño máximo permitido (${sizeKB.toFixed(2)} KB). Fue omitido para evitar colapsar la atención del modelo.\n\n`;
    totalSkippedDueToSize++;
    continue;
  }

  try {
    const fileContent = fs.readFileSync(absolutePath, 'utf8');
    const ext = path.extname(absolutePath).slice(1);
    
    markdownContext += `\n### 📁 Archivo: ${relativePath}\n`;
    // Usamos el format de bloque de codigo con backticks largos por si hay backticks en el código fuente (ej: JS template strings)
    markdownContext += '````' + ext + '\n';
    markdownContext += fileContent;
    // Si el archivo no termina en salto de línea, forzamos uno para que no colapse el markdown final
    if (!fileContent.endsWith('\n')) {
       markdownContext += '\n';
    }
    markdownContext += '````\n';
    
    totalProcessed++;
  } catch (err) {
    console.error(`[!] No se pudo leer el archivo ${relativePath}`, err.message);
  }
}

// Escribimos a disco
fs.writeFileSync(path.join(cwd, OUTPUT_FILE), markdownContext, 'utf8');

const END_TIME = performance.now();
const timeTaken = ((END_TIME - START_TIME) / 1000).toFixed(2);

console.log(`✅ ¡Misión Cumplida!`);
console.log(`----------------------------------------`);
console.log(`📄 Archivos Leídos e inyectados  : ${totalProcessed}`);
console.log(`🚫 Archivos omitidos (peso)      : ${totalSkippedDueToSize}`);
console.log(`📁 Estructura general copiada    : Sí`);
console.log(`⏲️  Tiempo total tomado           : ${timeTaken}s`);
console.log(`----------------------------------------`);
console.log(`🎉 Se ha generado el archivo '${OUTPUT_FILE}' exitosamente.`);
console.log(`💡 Puedes adjuntar este documento a cualquier chat con un LLM.`);

