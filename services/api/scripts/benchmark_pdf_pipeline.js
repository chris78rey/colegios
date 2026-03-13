import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

function parseArgs(argv) {
  const options = {
    count: 100,
    concurrency: 4,
    outputDir: path.join(os.tmpdir(), `colegios-pdf-benchmark-${Date.now()}`),
    keepFiles: false,
    templatePath: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--count" && next) {
      options.count = Math.max(1, Number(next) || options.count);
      i += 1;
    } else if (arg === "--concurrency" && next) {
      options.concurrency = Math.max(1, Number(next) || options.concurrency);
      i += 1;
    } else if (arg === "--output-dir" && next) {
      options.outputDir = path.resolve(next);
      i += 1;
    } else if (arg === "--template" && next) {
      options.templatePath = path.resolve(next);
      i += 1;
    } else if (arg === "--keep-files") {
      options.keepFiles = true;
    }
  }

  return options;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function builtInTemplate() {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 18mm; }
      body { font-family: Arial, sans-serif; color: #1f2937; font-size: 12px; line-height: 1.45; }
      .card { border: 1px solid #cbd5e1; padding: 18px; }
      h1 { font-size: 20px; margin: 0 0 10px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; margin: 16px 0; }
      .label { font-size: 10px; color: #64748b; text-transform: uppercase; }
      .value { font-size: 13px; font-weight: 600; }
      .signature-block { margin-top: 28px; padding-top: 22px; border-top: 1px solid #94a3b8; page-break-inside: avoid; break-inside: avoid-page; }
      p { margin: 0 0 10px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Documento de prueba masiva</h1>
      <p>Institucion: {{Institucion}}</p>
      <div class="grid">
        <div><div class="label">Cedula</div><div class="value">{{Cedula}}</div></div>
        <div><div class="label">Representante</div><div class="value">{{PrimerNombre}} {{SegunNombre}} {{PrimerApellido}} {{SegApellido}}</div></div>
        <div><div class="label">Celular</div><div class="value">{{Celular}}</div></div>
        <div><div class="label">Email</div><div class="value">{{Email}}</div></div>
        <div><div class="label">Alumno</div><div class="value">{{AlumnoNombre}} {{AlumnoApellido}}</div></div>
        <div><div class="label">Curso</div><div class="value">{{Curso}}</div></div>
        <div><div class="label">Fecha</div><div class="value">{{Fecha}}</div></div>
        <div><div class="label">Direccion</div><div class="value">{{Direccion}}</div></div>
      </div>
      <p>Este documento existe para medir el throughput de generacion PDF con Playwright en el pipeline actual.</p>
      <p>Fila: {{Index}}</p>
      <div class="signature-block">
        Firma del representante
      </div>
    </div>
  </body>
</html>`;
}

function sampleRow(index) {
  return {
    Index: String(index + 1),
    Cedula: `09${String(12345678 + index).padStart(8, "0")}`,
    PrimerNombre: ["Laura", "Carlos", "Maria", "Jorge", "Ana"][index % 5],
    SegunNombre: ["Maria", "Andres", "Fernanda", "Jose", "Lucia"][index % 5],
    PrimerApellido: ["Gomez", "Perez", "Ruiz", "Silva", "Castro"][index % 5],
    SegApellido: ["Lopez", "Garcia", "Mora", "Rojas", "Vega"][index % 5],
    Celular: `09${String(91234567 + index).padStart(8, "0")}`,
    Email: `registro${index + 1}@correo.com`,
    Institucion: "Colegio Benchmark",
    AlumnoNombre: ["Mateo", "Valentina", "Samuel", "Julieta", "Emilia"][index % 5],
    AlumnoApellido: ["Perez", "Gomez", "Torres", "Lopez", "Moreno"][index % 5],
    Curso: `${(index % 10) + 1}A`,
    Fecha: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
    Direccion: `Quito - Sector ${index + 1}`,
  };
}

function fillTemplate(html, row) {
  return html.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(row, key)) return String(row[key] ?? "");
    return "";
  });
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const htmlDir = path.join(options.outputDir, "html");
  const pdfDir = path.join(options.outputDir, "pdf");
  ensureDir(htmlDir);
  ensureDir(pdfDir);

  const template = options.templatePath
    ? fs.readFileSync(options.templatePath, "utf-8")
    : builtInTemplate();

  for (let i = 0; i < options.count; i += 1) {
    const html = fillTemplate(template, sampleRow(i));
    fs.writeFileSync(path.join(htmlDir, `${String(i + 1).padStart(5, "0")}.html`), html, "utf-8");
  }

  const htmlFiles = fs.readdirSync(htmlDir).filter((file) => file.endsWith(".html")).sort();
  const browser = await chromium.launch();
  const start = process.hrtime.bigint();
  let successCount = 0;

  try {
    for (let i = 0; i < htmlFiles.length; i += options.concurrency) {
      const chunk = htmlFiles.slice(i, i + options.concurrency);
      await Promise.all(
        chunk.map(async (file) => {
          const page = await browser.newPage();
          try {
            const htmlPath = path.join(htmlDir, file);
            const pdfPath = path.join(pdfDir, file.replace(/\.html$/, ".pdf"));
            const fileUrl = `file://${htmlPath.replace(/\\/g, "/")}`;
            await page.goto(fileUrl, { waitUntil: "networkidle" });
            await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
            successCount += 1;
          } finally {
            await page.close();
          }
        })
      );
    }
  } finally {
    await browser.close();
  }

  const end = process.hrtime.bigint();
  const totalSeconds = Number(end - start) / 1_000_000_000;
  const pdfsPerSecond = successCount / totalSeconds;
  const msPerPdf = (totalSeconds * 1000) / Math.max(1, successCount);
  const targetSeconds = 30;
  const targetCount = 700;
  const projectedAt30s = Math.floor(pdfsPerSecond * targetSeconds);
  const projectedSecondsFor700 = targetCount / Math.max(0.0001, pdfsPerSecond);

  const summary = {
    count: options.count,
    concurrency: options.concurrency,
    successCount,
    totalSeconds: Number(totalSeconds.toFixed(2)),
    msPerPdf: Number(msPerPdf.toFixed(2)),
    pdfsPerSecond: Number(pdfsPerSecond.toFixed(2)),
    projectedAt30s,
    projectedSecondsFor700: Number(projectedSecondsFor700.toFixed(2)),
    outputDir: options.outputDir,
    templatePath: options.templatePath || "(built-in benchmark template)",
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!options.keepFiles) {
    fs.rmSync(options.outputDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
