import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import AdmZip from "../services/api/node_modules/adm-zip/adm-zip.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.join(__dirname, "..", "plantillas", "ejemplos");
fs.mkdirSync(outDir, { recursive: true });

const docXmlTemplate = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {BODY}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>
`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
`;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildDocBody(lines) {
  return lines
    .map((line) => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`)
    .join("\n    ");
}

function writeDocx(filename, lines) {
  const zip = new AdmZip();
  const body = buildDocBody(lines);
  const docXml = docXmlTemplate.replace("{BODY}", body);

  zip.addFile("[Content_Types].xml", Buffer.from(contentTypes, "utf-8"));
  zip.addFile("_rels/.rels", Buffer.from(rels, "utf-8"));
  zip.addFile("word/document.xml", Buffer.from(docXml, "utf-8"));

  const outPath = path.join(outDir, filename);
  zip.writeZip(outPath);
  return outPath;
}

const files = [
  {
    name: "01_contrato_servicios.docx",
    lines: [
      "CONTRATO DE SERVICIOS EDUCATIVOS",
      "Institucion: {{institucion}}",
      "Estudiante: {{persona1_nombre}} {{persona1_apellido}} - Cedula {{persona1_cedula}}",
      "Representante: {{persona2_nombre}} {{persona2_apellido}} - Cedula {{persona2_cedula}}",
      "Email representante: {{persona2_email}}",
      "Celular representante: {{persona2_celular}}",
      "Fecha: {{fecha}}",
    ],
  },
  {
    name: "02_autorizacion_imagen.docx",
    lines: [
      "AUTORIZACION DE USO DE IMAGEN",
      "Institucion: {{institucion}}",
      "Estudiante: {{persona1_nombre}} {{persona1_apellido}}",
      "Cedula estudiante: {{persona1_cedula}}",
      "Fecha: {{fecha}}",
    ],
  },
  {
    name: "03_reglamento.docx",
    lines: [
      "ACEPTACION DEL REGLAMENTO INTERNO",
      "Institucion: {{institucion}}",
      "Estudiante: {{persona1_nombre}} {{persona1_apellido}}",
      "Representante: {{persona2_nombre}} {{persona2_apellido}}",
      "Correos: {{persona1_email}} / {{persona2_email}}",
      "Fecha: {{fecha}}",
    ],
  },
  {
    name: "04_autorizacion_salida.docx",
    lines: [
      "AUTORIZACION DE SALIDA",
      "Institucion: {{institucion}}",
      "Estudiante: {{persona1_nombre}} {{persona1_apellido}}",
      "Autorizado por: {{persona2_nombre}} {{persona2_apellido}}",
      "Celular contacto: {{persona2_celular}}",
      "Fecha: {{fecha}}",
    ],
  },
];

const outputs = files.map((file) => writeDocx(file.name, file.lines));
console.log("Plantillas generadas:");
outputs.forEach((out) => console.log(out));
