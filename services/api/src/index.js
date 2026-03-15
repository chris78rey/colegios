// Minimal HTTP API skeleton for the MVP
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import AdmZip from "adm-zip";
import { chromium } from "playwright";
import XLSX from "xlsx";

const port = process.env.PORT || 8080;
const corsOrigin = process.env.CORS_ORIGIN || "*";
const prisma = new PrismaClient();
const storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), "data", "storage");
const examplesPath = path.join(process.cwd(), "plantillas", "ejemplos");
const desktopWebTokenSecret = resolveDesktopWebTokenSecret();
const omniSwitchMode = String(process.env.OMNISWITCH_MODE || "mock").trim().toLowerCase();
const omniSwitchProvider = "OMNISWITCH";
const omniSwitchApiUrl = String(
  process.env.OMNISWITCH_API_URL || process.env.FIRMALO_URL_BASE || "https://wsrest.firmalo.ai/api/v1"
).trim().replace(/\/+$/, "");
const omniSwitchUser = String(process.env.OMNISWITCH_USER || process.env.FIRMALO_USER || "").trim();
const omniSwitchPassword = resolveOmniPassword();
const omniBiometricRequired = normalizeOmniFlag(process.env.OMNISWITCH_BIOMETRIC_REQUIRED || "1");
const omniDebugEnabled = parseBooleanFlag(process.env.OMNISWITCH_DEBUG, false);
const omniDefaultCountryId = Number(process.env.OMNISWITCH_DEFAULT_COUNTRY_ID || 19);
const omniDefaultProvinceId = Number(process.env.OMNISWITCH_DEFAULT_PROVINCE_ID || 17);
const omniDefaultCityId = Number(process.env.OMNISWITCH_DEFAULT_CITY_ID || 1701);
const omniMockAutoSignMs = Math.max(0, Number(process.env.OMNISWITCH_MOCK_AUTO_SIGN_MS) || 0);
const serviceVersion = process.env.APP_VERSION || "dev";

function resolveDesktopWebTokenSecret() {
  const secret = String(process.env.DESKTOP_WEB_TOKEN_SECRET || "").trim();
  if (secret) return secret;
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") {
    throw new Error("missing_DESKTOP_WEB_TOKEN_SECRET");
  }
  return "desktop-web-token-dev-secret";
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function readBuffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function setCors(res) {
  res.setHeader("access-control-allow-origin", corsOrigin);
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  while (true) {
    const index = buffer.indexOf(delimiter, start);
    if (index === -1) break;
    parts.push(buffer.slice(start, index));
    start = index + delimiter.length;
  }
  parts.push(buffer.slice(start));
  return parts;
}

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(buffer, boundaryBuf);
  const fields = {};
  const files = [];

  for (const part of parts) {
    if (!part.length) continue;
    if (part.equals(Buffer.from("--\r\n")) || part.equals(Buffer.from("--"))) continue;

    const trimmed = part.slice(part.indexOf("\r\n") + 2);
    const headerEnd = trimmed.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headerBuf = trimmed.slice(0, headerEnd).toString("utf-8");
    const body = trimmed.slice(headerEnd + 4, trimmed.length - 2); // drop trailing \r\n

    const disposition = headerBuf
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith("content-disposition"));
    if (!disposition) continue;

    const nameMatch = /name="([^"]+)"/.exec(disposition);
    const fileMatch = /filename="([^"]*)"/.exec(disposition);
    const name = nameMatch ? nameMatch[1] : null;

    if (fileMatch && name) {
      const filename = fileMatch[1];
      const contentTypeLine = headerBuf
        .split("\r\n")
        .find((line) => line.toLowerCase().startsWith("content-type"));
      const contentType = contentTypeLine ? contentTypeLine.split(":")[1].trim() : "application/octet-stream";
      files.push({ name, filename, contentType, data: body });
    } else if (name) {
      fields[name] = body.toString("utf-8").trim();
    }
  }

  return { fields, files };
}

function extractPlaceholdersFromDocx(buffer) {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) return [];
  const xml = entry.getData().toString("utf-8");
  const regex = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;
  const found = new Set();
  let match;
  while ((match = regex.exec(xml)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

function extractPlaceholdersFromHtml(content) {
  const regex = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;
  const found = new Set();
  let match;
  while ((match = regex.exec(content)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

function replacePlaceholdersInDocx(templatePath, row, outputPath) {
  const zip = new AdmZip(templatePath);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) {
    zip.writeZip(outputPath);
    return;
  }
  const xml = entry.getData().toString("utf-8");
  const replaced = xml.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      return value === null || value === undefined ? "" : String(value);
    }
    return "";
  });
  zip.updateFile(entry.entryName, Buffer.from(replaced, "utf-8"));
  zip.writeZip(outputPath);
}

function replacePlaceholdersInHtml(templatePath, row, outputPath) {
  const html = fs.readFileSync(templatePath, "utf-8");
  const replaced = html.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      return value === null || value === undefined ? "" : String(value);
    }
    return "";
  });
  fs.writeFileSync(outputPath, replaced, "utf-8");
}

function convertDocxToPdf(docxPath, pdfDir, profileDir) {
  return new Promise((resolve, reject) => {
    execFile(
      "soffice",
      ["--headless", `-env:UserInstallation=file://${profileDir}`, "--convert-to", "pdf", "--outdir", pdfDir, docxPath],
      { stdio: "ignore" },
      (error) => {
        if (error) return reject(error);
        resolve();
      }
    );
  });
}

function convertDocxToHtml(docxPath, htmlPath) {
  return new Promise((resolve, reject) => {
    execFile("pandoc", [docxPath, "-o", htmlPath], { stdio: "ignore" }, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

async function renderHtmlToPdfBatch(htmlFiles, htmlDir, pdfDir) {
  if (!htmlFiles.length) return;
  const browser = await chromium.launch();
  try {
    const baseDir = path.resolve(htmlDir).replace(/\\/g, "/");
    for (const file of htmlFiles) {
      const page = await browser.newPage();
      const htmlPath = path.join(htmlDir, file);
      const pdfPath = path.join(pdfDir, file.replace(/\.html$/, ".pdf"));
      const fileUrl = `file:///${baseDir}/${file}`.replace(/\\/g, "/");
      await page.goto(fileUrl, { waitUntil: "networkidle" });
      await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function renderHtmlFileToPdf(htmlPath, pdfPath) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const fileUrl = `file://${htmlPath.replace(/\\/g, "/")}`;
    await page.goto(fileUrl, { waitUntil: "networkidle" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
    await page.close();
  } finally {
    await browser.close();
  }
}

function optimizePdf(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile(
      "gs",
      [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/screen",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      { stdio: "ignore" },
      (error) => {
        if (error) return reject(error);
        resolve();
      }
    );
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function runInChunks(items, chunkSize, handler) {
  const safeChunkSize = Math.max(1, Number(chunkSize) || 1);
  for (let index = 0; index < items.length; index += safeChunkSize) {
    const chunk = items.slice(index, index + safeChunkSize);
    await Promise.all(chunk.map(handler));
  }
}

function safeResolvePath(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(resolvedBase, targetPath);
  const relative = path.relative(resolvedBase, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("invalid_path");
  }
  return resolved;
}

function toFileUrl(filePath) {
  if (!filePath) return null;
  const rel = path.relative(storagePath, filePath).replace(/\\/g, "/");
  return `/v1/files?path=${encodeURIComponent(rel)}`;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".pdf")) return "application/pdf";
  if (filePath.endsWith(".zip")) return "application/zip";
  if (filePath.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (filePath.endsWith(".html") || filePath.endsWith(".htm")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function signDesktopWebToken(payload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", desktopWebTokenSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function verifyDesktopWebToken(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;
  const expectedSignature = crypto
    .createHmac("sha256", desktopWebTokenSecret)
    .update(body)
    .digest("base64url");

  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (signatureBuf.length !== expectedBuf.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuf, expectedBuf)) {
    return null;
  }
  const payload = safeJsonParse(base64UrlDecode(body), null);
  if (!payload || Number(payload.exp || 0) < Date.now()) {
    return null;
  }
  return payload;
}

function defaultWebAppUrl(req) {
  const configured = String(process.env.WEB_APP_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const host = String(req.headers.host || "localhost:8080");
  const [hostname] = host.split(":");
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5173";
  }
  return `http://${hostname}`;
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function parseIntSafe(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function basenameFromDocument(document) {
  const candidate = document?.pdf_path || document?.pdfPath || document?.output_name || document?.outputName || "";
  const rawValue = String(candidate || "").trim();
  if (!rawValue) return "";
  const normalized = rawValue.replace(/\\/g, "/");
  return path.posix.basename(normalized);
}

function normalizeOmniFlag(value) {
  return String(value || "").trim() === "1" ? "1" : "0";
}

function toDecimalString(value, fallback = "0.00") {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric.toFixed(2);
}

function normalizeOmniAmount(value, fallback = "0") {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = String(value).trim().replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric === 0) return "0";
  return String(numeric);
}

function normalizeOmniPersonName(value) {
  return String(value || "").trim().toUpperCase();
}

const OMNI_SIGNATURE_LAYOUT = {
  pageWidth: 595,
  pageHeight: 842,
  minX: 36,
  minY: 48,
  maxY: 760,
  baseY: 72,
  stampWidth: 150,
  stampHeight: 56,
  horizontalGap: 24,
};

function parseOmniCoordinates(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  const match = raw.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/);
  if (!match) return null;
  const x = Number.parseInt(match[1], 10);
  const y = Number.parseInt(match[2], 10);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: clamp(x, OMNI_SIGNATURE_LAYOUT.minX, OMNI_SIGNATURE_LAYOUT.pageWidth - OMNI_SIGNATURE_LAYOUT.stampWidth),
    y: clamp(y, OMNI_SIGNATURE_LAYOUT.minY, OMNI_SIGNATURE_LAYOUT.maxY),
  };
}

function pickFirstRowValue(row, keys) {
  if (!row || typeof row !== "object") return "";
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function resolveOmniSignaturePlacement(row, signatoryCount = 1) {
  const manualPage = parseIntSafe(pickFirstRowValue(row, ["numeroPagina", "NumeroPagina", "signPage", "paginaFirma"]), null);
  const manualCoordinates = parseOmniCoordinates(
    pickFirstRowValue(row, ["Coordenadas", "coordenadas", "signatureCoordinates", "signCoordinates"])
  );
  if (manualCoordinates) {
    return {
      numeroPagina: manualPage !== null && manualPage > 0 ? manualPage : 1,
      Coordenadas: `${manualCoordinates.x},${manualCoordinates.y}`,
      autoCalculated: false,
    };
  }

  const page = manualPage !== null && manualPage > 0 ? manualPage : 1;
  const signerSlots = clamp(Number(signatoryCount) || 1, 1, 3);
  const totalWidth =
    signerSlots * OMNI_SIGNATURE_LAYOUT.stampWidth + Math.max(0, signerSlots - 1) * OMNI_SIGNATURE_LAYOUT.horizontalGap;
  const centeredX = Math.round((OMNI_SIGNATURE_LAYOUT.pageWidth - totalWidth) / 2);
  const x = clamp(
    centeredX,
    OMNI_SIGNATURE_LAYOUT.minX,
    OMNI_SIGNATURE_LAYOUT.pageWidth - OMNI_SIGNATURE_LAYOUT.stampWidth
  );
  const y = clamp(OMNI_SIGNATURE_LAYOUT.baseY, OMNI_SIGNATURE_LAYOUT.minY, OMNI_SIGNATURE_LAYOUT.maxY);

  return {
    numeroPagina: page,
    Coordenadas: `${x},${y}`,
    autoCalculated: true,
  };
}

function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "si", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeComparisonText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim();
}

function splitPersonName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { names: "", lastNames: "" };
  if (parts.length === 1) return { names: parts[0], lastNames: "" };
  if (parts.length === 2) return { names: parts[0], lastNames: parts[1] };
  return {
    names: parts.slice(0, Math.max(1, parts.length - 2)).join(" "),
    lastNames: parts.slice(-2).join(" "),
  };
}

function combinePersonName(names, lastNames) {
  return [String(names || "").trim(), String(lastNames || "").trim()].filter(Boolean).join(" ").trim();
}

function ensureRowLength(row, length) {
  while (row.length < length) row.push("");
}

function findHeaderIndex(headers, candidates) {
  const normalizedCandidates = candidates.map((candidate) => normalizeComparisonText(candidate));
  return headers.findIndex((header) => normalizedCandidates.includes(normalizeComparisonText(header)));
}

function findHeaderIndexByIncludes(headers, fragments) {
  const normalizedFragments = fragments.map((fragment) => normalizeComparisonText(fragment));
  return headers.findIndex((header) => {
    const normalizedHeader = normalizeComparisonText(header);
    return normalizedFragments.some((fragment) => normalizedHeader.includes(fragment));
  });
}

function detectRcColumns(headers) {
  const standardCedulaIndex = findHeaderIndex(headers, ["Cedula"]);
  const standardNamesIndex = findHeaderIndex(headers, ["PrimerNombre"]);
  const standardMiddleNamesIndex = findHeaderIndex(headers, ["SegunNombre"]);
  const standardLastNamesIndex = findHeaderIndex(headers, ["PrimerApellido"]);
  const standardSecondLastNamesIndex = findHeaderIndex(headers, ["SegApellido"]);

  const cedulaIndex = findHeaderIndex(headers, [
    "Cedula",
    "cedula",
    "CedulaRepresentante",
    "cedula_representante",
    "identificacion",
    "documento",
    "persona1_cedula",
    "persona_cedula",
    "id_number",
  ]);
  const fullNameIndex = findHeaderIndex(headers, [
    "NombreCompleto",
    "nombre_completo",
    "Nombre completo",
    "fullName",
    "AlumnoNombreCompleto",
    "RepresentanteNombreCompleto",
    "persona1_nombre_completo",
    "persona_nombre_completo",
  ]);
  const namesIndex = findHeaderIndex(headers, [
    "Nombres",
    "nombres",
    "PrimerNombre",
    "PrimerosNombres",
    "representante_nombre",
    "AlumnoNombre",
    "Nombre",
    "persona1_nombre",
    "persona_nombre",
  ]);
  const lastNamesIndex = findHeaderIndex(headers, [
    "Apellidos",
    "apellidos",
    "PrimerApellido",
    "representante_apellido",
    "AlumnoApellido",
    "persona1_apellido",
    "persona_apellido",
  ]);

  const resolvedCedulaIndex =
    cedulaIndex >= 0 ? cedulaIndex : findHeaderIndexByIncludes(headers, ["cedula", "documento", "identificacion", "id number"]);
  const resolvedFullNameIndex =
    fullNameIndex >= 0 ? fullNameIndex : findHeaderIndexByIncludes(headers, ["nombre completo", "full name"]);
  const resolvedNamesIndex =
    namesIndex >= 0 ? namesIndex : findHeaderIndexByIncludes(headers, ["_nombre", " nombres", "nombre"]);
  const resolvedLastNamesIndex =
    lastNamesIndex >= 0 ? lastNamesIndex : findHeaderIndexByIncludes(headers, ["_apellido", " apellidos", "apellido"]);

  return {
    cedulaIndex: resolvedCedulaIndex,
    fullNameIndex: resolvedFullNameIndex,
    namesIndex: resolvedNamesIndex,
    lastNamesIndex: resolvedLastNamesIndex,
    middleNamesIndex: standardMiddleNamesIndex,
    secondLastNamesIndex: standardSecondLastNamesIndex,
    usesStandardHeaders:
      RC_STANDARD_HEADERS.every((header) => headers.includes(header)) &&
      standardCedulaIndex >= 0 &&
      standardNamesIndex >= 0 &&
      standardLastNamesIndex >= 0,
  };
}

function extractWorkbookRowsFromBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  const headers = (matrix[0] || []).map((value) => String(value || "").trim());
  const rows = matrix.slice(1).map((row) => row.map((value) => (value === null || value === undefined ? "" : String(value).trim())));
  return { workbook, firstSheetName, matrix, headers, rows };
}

async function fetchQueryRC(cedula) {
  const auth = {
    UserName: omniSwitchUser,
    Password: omniSwitchPassword,
  };
  const payload = { Cedula: cedula };

  const response = await fetch(`${omniSwitchApiUrl}/QueryRC`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...auth, ...payload }),
  });

  const raw = await response.text();
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = { raw };
  }
  
  if (!response.ok) {
    return {
      status: "ERROR",
      officialFullName: "",
      nombres: "",
      apellidos: "",
      profesion: "",
      estadoCivil: "",
      nacionalidad: "",
      fechaNacimiento: "",
      observation: `Provider HTTP Error ${response.status}`,
    };
  }

  if (parsed.resultCode !== 0) {
    return {
      status: "ERROR",
      officialFullName: "",
      nombres: "",
      apellidos: "",
      profesion: "",
      estadoCivil: "",
      nacionalidad: "",
      fechaNacimiento: "",
      observation: parsed.resultText || "Error del proveedor.",
    };
  }

  return {
    status: "MATCH",
    officialFullName: parsed.Nombre || combinePersonName(parsed.nombres, parsed.apellidos),
    nombres: parsed.nombres || "",
    apellidos: parsed.apellidos || "",
    profesion: parsed.profesion || "",
    estadoCivil: parsed.estadoCivil || "",
    nacionalidad: parsed.nacionalidad || "",
    fechaNacimiento: parsed.fechaNacimiento || "",
    observation: "Consulta exitosa.",
  };
}


// Eliminated compareRcResult since we don't compare names anymore.

function isValidEmail(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function validateOmniSwitchRow(rowMap) {
  const issues = [];
  const phone = sanitizePhone(rowMap.Celular || rowMap.celular || rowMap.phone || "");
  const email = String(rowMap.Email || rowMap.email || rowMap.Correo || rowMap.correo || "").trim();
  const address = String(rowMap.Direccion || rowMap.direccion || "").trim();
  const firmaPrincipal = String(rowMap.FirmaPrincipal || rowMap.firmaPrincipal || "").trim();
  const idPais = parseIntSafe(rowMap.IdPais, omniDefaultCountryId);
  const idProvincia = parseIntSafe(rowMap.IdProvincia, omniDefaultProvinceId);
  const idCiudad = parseIntSafe(rowMap.IdCiudad, omniDefaultCityId);

  if (!phone) {
    issues.push("Falta Celular.");
  } else if (phone.length < 10) {
    issues.push("Celular incompleto para OmniSwitch.");
  }

  if (!email) {
    issues.push("Falta Email.");
  } else if (!isValidEmail(email)) {
    issues.push("Email invalido para OmniSwitch.");
  }

  if (!address) {
    issues.push("Falta Direccion.");
  }

  if (firmaPrincipal && !["1", "0", "true", "false", "si", "no"].includes(firmaPrincipal.toLowerCase())) {
    issues.push("FirmaPrincipal tiene un formato no reconocido.");
  }

  if (!Number.isFinite(idPais) || idPais <= 0) issues.push("IdPais invalido.");
  if (!Number.isFinite(idProvincia) || idProvincia <= 0) issues.push("IdProvincia invalido.");
  if (!Number.isFinite(idCiudad) || idCiudad <= 0) issues.push("IdCiudad invalido.");

  return {
    ready: issues.length === 0,
    issues,
    normalized: {
      phone,
      email,
      address,
      firmaPrincipal: firmaPrincipal || "1",
      idPais: Number.isFinite(idPais) && idPais > 0 ? idPais : omniDefaultCountryId,
      idProvincia: Number.isFinite(idProvincia) && idProvincia > 0 ? idProvincia : omniDefaultProvinceId,
      idCiudad: Number.isFinite(idCiudad) && idCiudad > 0 ? idCiudad : omniDefaultCityId,
    },
  };
}

async function buildRcValidationRun({ workbookBuffer, filename, options = {} }) {
  const { workbook, firstSheetName, matrix, headers, rows } = extractWorkbookRowsFromBuffer(workbookBuffer);
  const columns = detectRcColumns(headers);
  if (columns.cedulaIndex === -1) {
    throw new Error("El Excel no tiene una columna de cedula reconocible.");
  }

  const results = [];
  let processedCount = 0;
  let matchCount = 0;
  let correctableCount = 0;
  let reviewCount = 0;
  let errorCount = 0;

  const correctedMatrix = matrix.map((row) => [...row]);
  const correctedHeaders = correctedMatrix[0] ? [...correctedMatrix[0]] : [...headers];
  if (!correctedMatrix[0]) correctedMatrix[0] = correctedHeaders;

  const auditColumnNames = [
    "nombre_completo_validado",
    "estado_validacion",
    "observacion_validacion",
    "PrimerNombre_RC",
    "Apellidos_RC",
    "Profesion",
    "EstadoCivil",
    "Nacionalidad"
  ];
  const auditIndexes = {};
  for (const auditName of auditColumnNames) {
    let index = findHeaderIndex(correctedHeaders, [auditName]);
    if (index === -1) {
      index = correctedHeaders.length;
      correctedHeaders.push(auditName);
      correctedMatrix[0].push(auditName);
    }
    auditIndexes[auditName] = index;
  }

  for (let rowOffset = 0; rowOffset < rows.length; rowOffset++) {
    const row = rows[rowOffset];
    const excelRowNumber = rowOffset + 2; // For display/logging (1-based + header row)
    const matrixIndex = rowOffset + 1; // Actual array insertion index (0 is header)
    
    const sourceRow = correctedMatrix[matrixIndex] || [];
    ensureRowLength(sourceRow, correctedHeaders.length);
    correctedMatrix[matrixIndex] = sourceRow;
    const rowMap = {};
    headers.forEach((header, index) => {
      rowMap[header] = row[index] ?? "";
    });

    const cedula = String(row[columns.cedulaIndex] || "").trim();
    if (!cedula) continue;

    processedCount += 1;
    const providerResult = await fetchQueryRC(cedula);
    const omniCheck = validateOmniSwitchRow(rowMap);

    if (providerResult.status === "MATCH") matchCount += 1;
    if (providerResult.status === "ERROR") errorCount += 1;

    const omniSuffix = omniCheck.ready
      ? " OmniSwitch listo."
      : ` OmniSwitch pendiente: ${omniCheck.issues.join(" ")}`;
      
    const actionLabel = providerResult.status === "MATCH"
      ? `Datos inyectados.${omniSuffix}`
      : `No se obtuvieron datos.${omniSuffix}`;

    const combinedObservation = [providerResult.observation, omniCheck.ready ? "" : omniCheck.issues.join(" ")]
      .filter(Boolean)
      .join(" ");

    sourceRow[auditIndexes.nombre_completo_validado] = providerResult.officialFullName;
    sourceRow[auditIndexes.estado_validacion] = providerResult.status;
    sourceRow[auditIndexes.observacion_validacion] = combinedObservation;
    sourceRow[auditIndexes.PrimerNombre_RC] = providerResult.nombres;
    sourceRow[auditIndexes.Apellidos_RC] = providerResult.apellidos;
    sourceRow[auditIndexes.Profesion] = providerResult.profesion;
    sourceRow[auditIndexes.EstadoCivil] = providerResult.estadoCivil;
    sourceRow[auditIndexes.Nacionalidad] = providerResult.nacionalidad;

    if (providerResult.status === "MATCH") {
      if (columns.fullNameIndex >= 0) {
        ensureRowLength(sourceRow, columns.fullNameIndex + 1);
        sourceRow[columns.fullNameIndex] = providerResult.officialFullName;
      }
      if (columns.namesIndex >= 0) {
        ensureRowLength(sourceRow, columns.namesIndex + 1);
        const officialNamesParts = String(providerResult.nombres || "").split(/\s+/).filter(Boolean);
        sourceRow[columns.namesIndex] = officialNamesParts[0] || providerResult.nombres;
        if (columns.middleNamesIndex >= 0) {
          ensureRowLength(sourceRow, columns.middleNamesIndex + 1);
          sourceRow[columns.middleNamesIndex] = officialNamesParts.slice(1).join(" ");
        }
      }
      if (columns.lastNamesIndex >= 0) {
        ensureRowLength(sourceRow, columns.lastNamesIndex + 1);
        const officialLastNameParts = String(providerResult.apellidos || "").split(/\s+/).filter(Boolean);
        sourceRow[columns.lastNamesIndex] = officialLastNameParts[0] || providerResult.apellidos;
        if (columns.secondLastNamesIndex >= 0) {
          ensureRowLength(sourceRow, columns.secondLastNamesIndex + 1);
          sourceRow[columns.secondLastNamesIndex] = officialLastNameParts.slice(1).join(" ");
        }
      }
    }

    // Pass data back locally to the web view for inspection
    results.push({
      rowIndex: rowOffset + 1,
      excelRowNumber,
      cedula,
      inputFullName: providerResult.officialFullName || "Consultado RC",
      officialFullName: providerResult.officialFullName,
      status: providerResult.status,
      observation: combinedObservation,
      actionLabel,
      omniReady: omniCheck.ready,
      omniIssues: omniCheck.issues,
      rcData: {
        profesion: providerResult.profesion,
        estadoCivil: providerResult.estadoCivil,
        nacionalidad: providerResult.nacionalidad,
      }
    });
  }

  const correctedSheet = XLSX.utils.aoa_to_sheet(correctedMatrix);
  correctedSheet["!cols"] = correctedHeaders.map((header) => ({ wch: Math.max(String(header || "").length + 4, 18) }));
  workbook.Sheets[firstSheetName] = correctedSheet;
  const correctedBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return {
    sourceFileName: filename,
    results,
    correctedBuffer,
    summary: {
      totalRows: rows.length,
      processedCount,
      matchCount,
      correctableCount,
      reviewCount,
      errorCount,
    },
    detectedColumns: {
      cedula: columns.cedulaIndex >= 0 ? headers[columns.cedulaIndex] : "",
      fullName: columns.fullNameIndex >= 0 ? headers[columns.fullNameIndex] : "",
      names: columns.namesIndex >= 0 ? headers[columns.namesIndex] : "",
      lastNames: columns.lastNamesIndex >= 0 ? headers[columns.lastNamesIndex] : "",
      standardMode: columns.usesStandardHeaders,
    },
  };
}

function serializeOmniDocument(document, signatoryCount = 1) {
  const placement = resolveOmniSignaturePlacement(document?.desktopDocument?.rowJson || document?.rowJson || {}, signatoryCount);
  const { desktopDocument, rowJson, ...safeDocument } = document || {};
  return {
    ...safeDocument,
    numeroPagina: placement.numeroPagina,
    Coordenadas: placement.Coordenadas,
    signaturePlacementAuto: placement.autoCalculated,
    signedPdfUrl: toFileUrl(document.signedPdfPath),
    localPdfUrl: toFileUrl(document.localPdfPath),
  };
}

function getOmniProcessId(overrideValue = null) {
  const overridden = parseIntSafe(overrideValue, null);
  if (overridden !== null) return overridden;
  return Number(process.env.OMNISWITCH_DEFAULT_ID_PROCESS || 10);
}

function getMockSignedFilePath(organizationId, omniRequestId, providerDocumentName) {
  const safeName = path.basename(String(providerDocumentName || "documento.pdf"));
  return path.join(storagePath, "omniswitch", organizationId, omniRequestId, safeName);
}

function isMockOmniMode() {
  return omniSwitchMode === "mock";
}

function decodeEnvBase64(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return Buffer.from(raw, "base64").toString("utf-8").trim();
  } catch (error) {
    return "";
  }
}

function resolveOmniPassword() {
  const encoded =
    process.env.OMNISWITCH_PASSWORD_B64 ||
    process.env.FIRMALO_PASSWORD_B64 ||
    "";
  const decoded = decodeEnvBase64(encoded);
  if (decoded) return decoded;
  return String(process.env.OMNISWITCH_PASSWORD || process.env.FIRMALO_PASSWORD || "").trim();
}

function getOmniCredentials() {
  return {
    UserName: omniSwitchUser,
    Password: omniSwitchPassword,
  };
}

function assertOmniRealConfig() {
  if (!omniSwitchApiUrl) throw new Error("omni_missing_api_url");
  if (!omniSwitchUser) throw new Error("omni_missing_user");
  if (!omniSwitchPassword) throw new Error("omni_missing_password");
}

function getOmniRequestNumericId(omniRequest) {
  const providerRequestId = String(omniRequest?.providerRequestId || "").trim();
  if (!providerRequestId) throw new Error("omni_missing_provider_request_id");
  const numericId = Number(providerRequestId);
  if (!Number.isFinite(numericId)) throw new Error("omni_invalid_provider_request_id");
  return numericId;
}

function getOmniResultCode(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(payload, "resultCode")) return null;
  const numeric = Number(payload.resultCode);
  return Number.isFinite(numeric) ? numeric : null;
}

function getOmniResultText(payload) {
  if (!payload || typeof payload !== "object") return "";
  return String(payload.resultText || payload.message || payload.error || "").trim();
}

function normalizeOmniProviderPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") return payload;
  return { raw: payload };
}

function isOmniSuccessPayload(payload, options = {}) {
  const resultCode = getOmniResultCode(payload);
  if (resultCode === null || resultCode === 0) return true;
  const resultText = getOmniResultText(payload).toLowerCase();
  if (options.allowSendResultCodeOne && resultCode === 1 && resultText.includes("enviado correctamente")) {
    return true;
  }
  return false;
}

function logOmniDebug(event, meta = {}) {
  if (!omniDebugEnabled) return;
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      service: "api",
      event,
      omni: true,
      ...meta,
    })
  );
}

async function omniPost(endpoint, payload) {
  assertOmniRealConfig();
  const requestPayload = {
    ...getOmniCredentials(),
    ...payload,
  };
  logOmniDebug("omni_request", {
    endpoint,
    api_url: omniSwitchApiUrl,
    has_username: !!requestPayload.UserName,
    has_password: !!requestPayload.Password,
    password_length: String(requestPayload.Password || "").length,
  });
  const response = await fetch(`${omniSwitchApiUrl}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestPayload),
  });
  const rawText = await response.text();
  let parsed;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { raw: rawText };
  }
  logOmniDebug("omni_response", {
    endpoint,
    http_status: response.status,
    result_code: getOmniResultCode(parsed),
    result_text: getOmniResultText(parsed),
  });
  if (!response.ok) {
    const error = new Error(`omni_http_${response.status}`);
    error.status = response.status;
    error.payload = parsed;
    throw error;
  }
  return normalizeOmniProviderPayload(parsed);
}

function assertOmniSuccess(payload, fallbackMessage = "omni_provider_error", options = {}) {
  const resultCode = getOmniResultCode(payload);
  if (isOmniSuccessPayload(payload, options)) return;
  const error = new Error(getOmniResultText(payload) || fallbackMessage);
  error.payload = payload;
  error.resultCode = resultCode;
  throw error;
}

function normalizeOmniCollection(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function parseOmniStatusPayload(payload) {
  const root = Array.isArray(payload) ? payload[0] : payload;
  if (!root || typeof root !== "object") {
    return { root: {}, documents: [], signatories: [] };
  }
  return {
    root,
    documents: normalizeOmniCollection(root.Solicitudes_Documentos || root.Documentos),
    signatories: normalizeOmniCollection(root.Solicitudes_Firmantes || root.Firmantes),
  };
}

function getOmniDocumentSignedPath(organizationId, omniRequestId, providerDocumentName) {
  const safeName = path.basename(String(providerDocumentName || "documento.pdf"));
  return path.join(storagePath, "omniswitch", organizationId, omniRequestId, "signed", safeName);
}

function encodePdfBase64(filePath) {
  return fs.readFileSync(filePath).toString("base64");
}

async function createOmniEvent(omniRequestId, type, { omniDocumentId = null, message = "", metaJson = null } = {}) {
  return prisma.omniEvent.create({
    data: {
      omniRequestId,
      omniDocumentId: omniDocumentId || undefined,
      type,
      message: message || null,
      metaJson: metaJson || undefined,
    },
  });
}

async function resolveOmniBillingForDocuments(organizationId, documents, overrides = {}) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      billingModeDefault: true,
      billingAmountDefault: true,
      billingCurrency: true,
    },
  });
  if (!organization) {
    throw new Error("organization_not_found");
  }
  const templateNames = Array.from(
    new Set(
      (documents || [])
        .map((document) => String(document?.templateName || "").trim())
        .filter(Boolean)
    )
  );
  const templates = templateNames.length
    ? await prisma.template.findMany({
        where: {
          organizationId,
          name: { in: templateNames },
          status: "active",
        },
        select: {
          id: true,
          name: true,
          billingModeOverride: true,
          billingAmountOverride: true,
        },
      })
    : [];
  const overrideTemplate = templates.find((template) => template.billingModeOverride || template.billingAmountOverride !== null);
  const billingMode = String(
    overrides.billingMode || overrideTemplate?.billingModeOverride || organization.billingModeDefault || "ORG_BALANCE"
  ).trim().toUpperCase();
  const billingAmount = toDecimalString(
    overrides.billingAmount ?? overrideTemplate?.billingAmountOverride ?? organization.billingAmountDefault ?? 0
  );
  const billingCurrency = String(overrides.billingCurrency || organization.billingCurrency || "USD").trim().toUpperCase() || "USD";
  const paymentRequired = billingMode === "SIGNER_PAYS" && Number(billingAmount) > 0;
  const paymentReference = paymentRequired ? String(overrides.paymentReference || "").trim() : "";
  if (paymentRequired && !paymentReference) {
    return { error: "missing_payment_reference" };
  }
  return {
    billingMode,
    billingAmount,
    billingCurrency,
    paymentRequired,
    paymentReference,
    paymentStatus: paymentRequired ? "PENDING" : "NOT_REQUIRED",
    sourceTemplateId: overrideTemplate?.id || null,
    sourceTemplateName: overrideTemplate?.name || null,
  };
}

async function getOmniRequestDetail(omniRequestId) {
  return prisma.omniRequest.findUnique({
    where: { id: omniRequestId },
    include: {
      documents: {
        orderBy: { createdAt: "asc" },
        include: {
          desktopDocument: {
            select: {
              rowJson: true,
            },
          },
        },
      },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}

async function syncOmniRequestStatus(omniRequestId) {
  const omniRequest = await prisma.omniRequest.findUnique({
    where: { id: omniRequestId },
    include: { documents: true },
  });
  if (!omniRequest) return null;
  const docs = omniRequest.documents || [];
  const hasError = docs.some((doc) => doc.status === "ERROR");
  const allSigned = docs.length > 0 && docs.every((doc) => normalizeOmniFlag(doc.providerSignedFlag) === "1");
  const anySigned = docs.some((doc) => normalizeOmniFlag(doc.providerSignedFlag) === "1");
  const nextStatus = hasError
    ? "ERROR"
    : allSigned
      ? "SIGNED"
      : anySigned
        ? "PARTIALLY_SIGNED"
        : omniRequest.status === "SENT"
          ? "SENT"
          : omniRequest.status;
  const updated = await prisma.omniRequest.update({
    where: { id: omniRequestId },
    data: {
      status: nextStatus,
      signedAt: allSigned ? new Date() : null,
      lastProviderStatus: nextStatus,
      lastPolledAt: new Date(),
    },
  });
  return updated;
}

async function getOmniRequestResponseItem(omniRequestId) {
  const item = await getOmniRequestDetail(omniRequestId);
  if (!item) return null;
  return {
    ...item,
    documents: item.documents.map((document) => serializeOmniDocument(document, item.signatoryCount)),
  };
}

async function mockDownloadOmniDocument(omniDocument) {
  const omniRequest = await prisma.omniRequest.findUnique({ where: { id: omniDocument.omniRequestId } });
  if (!omniRequest) throw new Error("omni_request_not_found");
  if (normalizeOmniFlag(omniDocument.providerSignedFlag) !== "1") {
    throw new Error("document_not_signed");
  }
  if (!omniDocument.localPdfPath || !fs.existsSync(omniDocument.localPdfPath)) {
    throw new Error("local_pdf_missing");
  }
  const signedPath = getMockSignedFilePath(
    omniRequest.organizationId,
    omniRequest.id,
    omniDocument.providerDocumentName
  );
  ensureDir(path.dirname(signedPath));
  fs.copyFileSync(omniDocument.localPdfPath, signedPath);
  const updated = await prisma.omniDocument.update({
    where: { id: omniDocument.id },
    data: {
      signedPdfPath: signedPath,
      downloadedAt: new Date(),
      status: "DOWNLOADED",
      lastResultCode: 0,
      lastResultText: "Operacion correcta",
    },
  });
  await createOmniEvent(omniRequest.id, "DOWNLOAD_OK", {
    omniDocumentId: omniDocument.id,
    message: "Mock signed document downloaded",
    metaJson: { providerDocumentName: omniDocument.providerDocumentName, signedPdfPath: signedPath },
  });
  return updated;
}

async function mockSignOmniDocuments(omniRequestId, targetDocumentId = "") {
  const omniRequest = await prisma.omniRequest.findUnique({
    where: { id: omniRequestId },
    include: { documents: true },
  });
  if (!omniRequest) {
    return { error: "omni_request_not_found", status: 404 };
  }
  const targets = (omniRequest.documents || []).filter((document) => !targetDocumentId || document.id === targetDocumentId);
  if (!targets.length) {
    return { error: "omni_document_not_found", status: 404 };
  }

  for (const document of targets) {
    const updatedDocument = await prisma.omniDocument.update({
      where: { id: document.id },
      data: {
        providerSignedFlag: "1",
        status: "SIGNED",
        lastResultCode: 0,
        lastResultText: "Operacion correcta",
      },
    });
    await createOmniEvent(omniRequest.id, "MOCK_SIGN_OK", {
      omniDocumentId: document.id,
      message: "Mock signature completed",
      metaJson: { providerDocumentName: document.providerDocumentName },
    });
    await mockDownloadOmniDocument(updatedDocument);
  }

  await syncOmniRequestStatus(omniRequestId);
  const item = await getOmniRequestResponseItem(omniRequestId);
  return { item, status: 200 };
}

async function processMockOmniRequest(omniRequestId) {
  const omniRequest = await prisma.omniRequest.findUnique({
    where: { id: omniRequestId },
    include: { documents: true },
  });
  if (!omniRequest) return null;
  const now = Date.now();
  for (const document of omniRequest.documents || []) {
    const ageMs = now - new Date(document.createdAt).getTime();
    if (normalizeOmniFlag(document.providerSignedFlag) === "0" && omniMockAutoSignMs > 0 && ageMs >= omniMockAutoSignMs) {
      await prisma.omniDocument.update({
        where: { id: document.id },
        data: {
          providerSignedFlag: "1",
          status: "SIGNED",
          lastResultCode: 0,
          lastResultText: "Operacion correcta",
        },
      });
      await createOmniEvent(omniRequest.id, "POLL_SIGNED", {
        omniDocumentId: document.id,
        message: "Mock document signed",
        metaJson: { providerDocumentName: document.providerDocumentName },
      });
    }
  }
  const refreshed = await prisma.omniRequest.findUnique({
    where: { id: omniRequestId },
    include: { documents: true },
  });
  if (!refreshed) return null;
  for (const document of refreshed.documents || []) {
    if (normalizeOmniFlag(document.providerSignedFlag) === "1" && !document.signedPdfPath) {
      await mockDownloadOmniDocument(document);
    }
  }
  return syncOmniRequestStatus(omniRequestId);
}

async function createMockOmniRequestsForDesktopBatch(batchId, options = {}) {
  const desktopBatch = await prisma.desktopBatch.findUnique({
    where: { id: batchId },
    include: { documents: { orderBy: [{ rowIndex: "asc" }, { createdAt: "asc" }] } },
  });
  if (!desktopBatch) {
    return { error: "batch_not_found", status: 404 };
  }
  const readyDocuments = (desktopBatch.documents || []).filter((doc) => doc.status === "READY" && doc.pdfPath);
  if (!readyDocuments.length) {
    return { error: "no_ready_documents", status: 400 };
  }
  const grouped = new Map();
  for (const document of readyDocuments) {
    const groupKey = `${document.rowIndex}::${document.groupKey || ""}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push(document);
  }

  const created = [];
  for (const documents of grouped.values()) {
    const firstDoc = documents[0];
    const existing = await prisma.omniRequest.findFirst({
      where: {
        desktopBatchId: desktopBatch.id,
        requestGroupId: null,
        documents: {
          some: {
            desktopDocumentId: firstDoc.id,
          },
        },
      },
    });
    if (existing) {
      if (!options.forceResend) {
        return {
          error: "already_sent",
          status: 409,
          existingRequestId: existing.id,
          existingProviderRequestId: existing.providerRequestId || null,
        };
      }
    }

    const providerRequestId = String(Date.now()) + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const signatories = buildSignatoriesForTemplate(OMNISWITCH_FIELDS, firstDoc.rowJson || {});
    const billing = await resolveOmniBillingForDocuments(desktopBatch.organizationId, documents, options);
    if (billing?.error) {
      return { error: billing.error, status: 400 };
    }
    const omniRequest = await prisma.omniRequest.create({
      data: {
        organizationId: desktopBatch.organizationId,
        desktopBatchId: desktopBatch.id,
        provider: omniSwitchProvider,
        providerRequestId,
        status: "SENT",
        billingMode: billing.billingMode,
        billingAmount: billing.billingAmount,
        billingCurrency: billing.billingCurrency,
        paymentRequired: billing.paymentRequired,
        paymentReference: billing.paymentReference || null,
        paymentStatus: billing.paymentStatus,
        idProcess: getOmniProcessId(options.idProcess),
        documentCount: documents.length,
        signatoryCount: signatories.length,
        sentAt: new Date(),
        lastPolledAt: new Date(),
        lastProviderStatus: "SENT",
        lastResultCode: 0,
        lastResultText: "Operacion correcta",
      },
    });

    for (const document of documents) {
      const placement = resolveOmniSignaturePlacement(document.rowJson || {}, signatories.length);
      const createdDocument = await prisma.omniDocument.create({
        data: {
          omniRequestId: omniRequest.id,
          desktopDocumentId: document.id,
          providerDocumentName: path.basename(document.outputName || path.basename(document.pdfPath)),
          localPdfPath: document.pdfPath,
          status: "UPLOADED",
          providerSignedFlag: "0",
          fileSizeBytes: fs.existsSync(document.pdfPath) ? fs.statSync(document.pdfPath).size : null,
          lastResultCode: 0,
          lastResultText: "Operacion correcta",
        },
      });
      await createOmniEvent(omniRequest.id, "DOC_UPLOAD_OK", {
        omniDocumentId: createdDocument.id,
        message: "Mock OmniSwitch document uploaded",
        metaJson: {
          providerDocumentName: createdDocument.providerDocumentName,
          numeroPagina: placement.numeroPagina,
          Coordenadas: placement.Coordenadas,
          autoCalculated: placement.autoCalculated,
        },
      });
    }

    await createOmniEvent(omniRequest.id, "CREATE_REQUEST_OK", {
      message: "Mock OmniSwitch request created",
      metaJson: {
        providerRequestId,
        billing,
        forceResend: !!options.forceResend,
        signatories: signatories.map((signatory) => ({
          idNumber: signatory.idNumber,
          fullName: normalizeOmniPersonName(signatory.fullName),
          email: signatory.email,
          phone: signatory.phone,
          isPrimary: signatory.isPrimary,
          providerCountryId: parseIntSafe(firstDoc.rowJson?.IdPais, omniDefaultCountryId),
          providerProvinceId: parseIntSafe(firstDoc.rowJson?.IdProvincia, omniDefaultProvinceId),
          providerCityId: parseIntSafe(firstDoc.rowJson?.IdCiudad, omniDefaultCityId),
        })),
        documentPlacements: documents.map((document) => ({
          providerDocumentName: path.basename(document.outputName || path.basename(document.pdfPath)),
          ...resolveOmniSignaturePlacement(document.rowJson || {}, signatories.length),
        })),
      },
    });
    await createOmniEvent(omniRequest.id, "SEND_OK", {
      message: "Mock OmniSwitch request sent",
      metaJson: { providerRequestId },
    });
    created.push(omniRequest);
  }
  return { items: created, status: 201 };
}

async function downloadRealOmniDocument(omniDocument) {
  const omniRequest = await prisma.omniRequest.findUnique({ where: { id: omniDocument.omniRequestId } });
  if (!omniRequest) throw new Error("omni_request_not_found");
  const providerDocumentName = String(omniDocument.providerDocumentName || "").trim();
  if (!providerDocumentName) throw new Error("omni_missing_document_name");
  const payload = await omniPost("SolicitudeGetDocument", {
    IDSolicitud: getOmniRequestNumericId(omniRequest),
    NombreDocumento: providerDocumentName,
  });
  assertOmniSuccess(payload, "omni_document_download_failed");
  const pdfBase64 = String(payload.DocumentoBase64 || "").trim();
  if (!pdfBase64) throw new Error("omni_missing_signed_document");
  const signedPath = getOmniDocumentSignedPath(omniRequest.organizationId, omniRequest.id, providerDocumentName);
  ensureDir(path.dirname(signedPath));
  fs.writeFileSync(signedPath, Buffer.from(pdfBase64, "base64"));
  const updated = await prisma.omniDocument.update({
    where: { id: omniDocument.id },
    data: {
      signedPdfPath: signedPath,
      downloadedAt: new Date(),
      status: "DOWNLOADED",
      lastResultCode: getOmniResultCode(payload) ?? 0,
      lastResultText: getOmniResultText(payload) || "Operacion correcta",
    },
  });
  await createOmniEvent(omniRequest.id, "DOWNLOAD_OK", {
    omniDocumentId: omniDocument.id,
    message: "OmniSwitch signed document downloaded",
    metaJson: { providerDocumentName, signedPdfPath: signedPath },
  });
  return updated;
}

async function processRealOmniRequest(omniRequestId) {
  const omniRequest = await prisma.omniRequest.findUnique({
    where: { id: omniRequestId },
    include: { documents: true },
  });
  if (!omniRequest) return null;

  const payload = await omniPost("GetSolicitudByID", {
    IDSolicitud: getOmniRequestNumericId(omniRequest),
  });
  assertOmniSuccess(payload, "omni_status_failed");
  const statusData = parseOmniStatusPayload(payload);
  const documentsByName = new Map(
    statusData.documents
      .map((item) => [String(item?.DocAFirmar || item?.NombreDocumento || "").trim(), item])
      .filter(([key]) => key)
  );

  // DEBUG: log what OmniSwitch returned vs what we have stored
  console.log("[OMNI-POLL] IDSolicitud:", getOmniRequestNumericId(omniRequest));
  console.log("[OMNI-POLL] Documentos devueltos por OmniSwitch:", JSON.stringify(
    statusData.documents.map((d) => ({
      DocAFirmar: d?.DocAFirmar,
      NombreDocumento: d?.NombreDocumento,
      DocFirmado: d?.DocFirmado,
    }))
  ));
  console.log("[OMNI-POLL] Documentos en DB:", JSON.stringify(
    (omniRequest.documents || []).map((d) => ({
      providerDocumentName: d.providerDocumentName,
      providerSignedFlag: d.providerSignedFlag,
    }))
  ));

  for (const document of omniRequest.documents || []) {
    const providerDocument = documentsByName.get(String(document.providerDocumentName || "").trim());
    if (!providerDocument) {
      console.log("[OMNI-POLL] SIN COINCIDENCIA para documento DB:", document.providerDocumentName);
      continue;
    }
    const signedFlag = normalizeOmniFlag(providerDocument.DocFirmado);
    console.log("[OMNI-POLL] Coincidencia encontrada:", document.providerDocumentName, "-> DocFirmado:", providerDocument.DocFirmado, "-> signedFlag:", signedFlag);
    const nextStatus = signedFlag === "1" ? "SIGNED" : "UPLOADED";
    const wasSigned = normalizeOmniFlag(document.providerSignedFlag) === "1";
    await prisma.omniDocument.update({
      where: { id: document.id },
      data: {
        providerSignedFlag: signedFlag,
        status: nextStatus,
        lastResultCode: getOmniResultCode(payload) ?? 0,
        lastResultText: getOmniResultText(payload) || "Operacion correcta",
      },
    });
    if (!wasSigned && signedFlag === "1") {
      await createOmniEvent(omniRequest.id, "POLL_SIGNED", {
        omniDocumentId: document.id,
        message: "OmniSwitch document signed",
        metaJson: { providerDocumentName: document.providerDocumentName },
      });
    }
  }

  const refreshed = await prisma.omniRequest.findUnique({
    where: { id: omniRequestId },
    include: { documents: true },
  });
  if (!refreshed) return null;

  for (const document of refreshed.documents || []) {
    if (normalizeOmniFlag(document.providerSignedFlag) === "1" && !document.signedPdfPath) {
      await downloadRealOmniDocument(document);
    }
  }

  await prisma.omniRequest.update({
    where: { id: omniRequestId },
    data: {
      lastPolledAt: new Date(),
      lastResultCode: getOmniResultCode(payload) ?? 0,
      lastResultText: getOmniResultText(payload) || "Operacion correcta",
    },
  });

  return syncOmniRequestStatus(omniRequestId);
}

async function createRealOmniRequestsForDesktopBatch(batchId, options = {}) {
  assertOmniRealConfig();
  const desktopBatch = await prisma.desktopBatch.findUnique({
    where: { id: batchId },
    include: { documents: { orderBy: [{ rowIndex: "asc" }, { createdAt: "asc" }] } },
  });
  if (!desktopBatch) {
    return { error: "batch_not_found", status: 404 };
  }
  const readyDocuments = (desktopBatch.documents || []).filter((doc) => doc.status === "READY" && doc.pdfPath);
  if (!readyDocuments.length) {
    return { error: "no_ready_documents", status: 400 };
  }

  const grouped = new Map();
  for (const document of readyDocuments) {
    const groupKey = `${document.rowIndex}::${document.groupKey || ""}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push(document);
  }

  const created = [];
  for (const documents of grouped.values()) {
    const firstDoc = documents[0];
    const existing = await prisma.omniRequest.findFirst({
      where: {
        desktopBatchId: desktopBatch.id,
        requestGroupId: null,
        documents: {
          some: {
            desktopDocumentId: firstDoc.id,
          },
        },
      },
    });
    if (existing && !options.forceResend) {
      return {
        error: "already_sent",
        status: 409,
        existingRequestId: existing.id,
        existingProviderRequestId: existing.providerRequestId || null,
      };
    }

    const signatories = buildSignatoriesForTemplate(OMNISWITCH_FIELDS, firstDoc.rowJson || {});
    if (!signatories.length) {
      return { error: "missing_signatories", status: 400 };
    }
    const billing = await resolveOmniBillingForDocuments(desktopBatch.organizationId, documents, options);
    if (billing?.error) {
      return { error: billing.error, status: 400 };
    }

    let omniRequest = null;
    try {
      const biometricRequired =
        options.biometricRequired !== undefined
          ? normalizeOmniFlag(options.biometricRequired)
          : omniBiometricRequired;
      const createdPayload = await omniPost("SolicitudeCreate", {
        IdProcess: getOmniProcessId(options.idProcess),
        PaymentRequired: billing.paymentRequired ? 1 : 0,
        amount: billing.paymentRequired ? normalizeOmniAmount(billing.billingAmount, "0") : "0",
        BiometricRequired: biometricRequired,
      });
      assertOmniSuccess(createdPayload, "omni_request_create_failed");
      const providerRequestId = String(createdPayload.IdSolicitud || createdPayload.IDSolicitud || "").trim();
      if (!providerRequestId) {
        throw new Error("omni_missing_request_id");
      }

      omniRequest = await prisma.omniRequest.create({
        data: {
          organizationId: desktopBatch.organizationId,
          desktopBatchId: desktopBatch.id,
          provider: omniSwitchProvider,
          providerRequestId,
          status: "CREATED",
          billingMode: billing.billingMode,
          billingAmount: billing.billingAmount,
          billingCurrency: billing.billingCurrency,
          paymentRequired: billing.paymentRequired,
          paymentReference: billing.paymentReference || null,
          paymentStatus: billing.paymentStatus,
          idProcess: getOmniProcessId(options.idProcess),
          documentCount: documents.length,
          signatoryCount: signatories.length,
          lastProviderStatus: "CREATED",
          lastResultCode: getOmniResultCode(createdPayload) ?? 0,
          lastResultText: getOmniResultText(createdPayload) || "Operacion correcta",
        },
      });

      await createOmniEvent(omniRequest.id, "CREATE_REQUEST_OK", {
        message: "OmniSwitch request created",
        metaJson: { providerRequestId, billing, forceResend: !!options.forceResend },
      });

      for (const document of documents) {
        if (!document.pdfPath || !fs.existsSync(document.pdfPath)) {
          throw new Error("omni_local_pdf_missing");
        }
        const placement = resolveOmniSignaturePlacement(document.rowJson || {}, signatories.length);
        const providerDocumentName = path.basename(document.outputName || path.basename(document.pdfPath));
        const uploadPayload = await omniPost("SolicitudeCreateDocument", {
          IDSolicitud: Number(providerRequestId),
          NombreDocumento: providerDocumentName,
          DocumentoBase64: encodePdfBase64(document.pdfPath),
          numeroPagina: placement.numeroPagina,
          Coordenadas: placement.Coordenadas,
        });
        assertOmniSuccess(uploadPayload, "omni_document_upload_failed");
        const createdDocument = await prisma.omniDocument.create({
          data: {
            omniRequestId: omniRequest.id,
            desktopDocumentId: document.id,
            providerDocumentName,
            localPdfPath: document.pdfPath,
            status: "UPLOADED",
            providerSignedFlag: "0",
            fileSizeBytes: fs.existsSync(document.pdfPath) ? fs.statSync(document.pdfPath).size : null,
            lastResultCode: getOmniResultCode(uploadPayload) ?? 0,
            lastResultText: getOmniResultText(uploadPayload) || "Operacion correcta",
          },
        });
        await createOmniEvent(omniRequest.id, "DOC_UPLOAD_OK", {
          omniDocumentId: createdDocument.id,
          message: "OmniSwitch document uploaded",
          metaJson: {
            providerDocumentName,
            numeroPagina: placement.numeroPagina,
            Coordenadas: placement.Coordenadas,
            autoCalculated: placement.autoCalculated,
          },
        });
      }

      for (const signatory of signatories) {
        const signatoryPayload = await omniPost("SolicitudeCreateSignatory", {
          IDSolicitud: Number(providerRequestId),
          Cedula: signatory.idNumber,
          PrimerNombre: normalizeOmniPersonName(signatory.firstName),
          SegunNombre: normalizeOmniPersonName(signatory.middleName),
          PrimerApellido: normalizeOmniPersonName(signatory.lastName),
          SegApellido: normalizeOmniPersonName(signatory.secondLastName),
          Celular: signatory.phone,
          Email: signatory.email,
          FirmaPrincipal: signatory.isPrimary ? 1 : 0,
          IdPais: parseIntSafe(firstDoc.rowJson?.IdPais, omniDefaultCountryId),
          IdProvincia: parseIntSafe(firstDoc.rowJson?.IdProvincia, omniDefaultProvinceId),
          IdCiudad: parseIntSafe(firstDoc.rowJson?.IdCiudad, omniDefaultCityId),
          Direccion: String(firstDoc.rowJson?.Direccion || process.env.OMNISWITCH_DEFAULT_DIRECCION || "Ciudad").trim(),
        });
        assertOmniSuccess(signatoryPayload, "omni_signatory_create_failed");
      }

      await createOmniEvent(omniRequest.id, "SIGNATORIES_OK", {
        message: "OmniSwitch signatories registered",
        metaJson: {
          signatories: signatories.map((signatory) => ({
            idNumber: signatory.idNumber,
            fullName: normalizeOmniPersonName(signatory.fullName),
            email: signatory.email,
            phone: signatory.phone,
            isPrimary: signatory.isPrimary,
          })),
        },
      });

      const sendPayload = await omniPost("SolicitudeSend", {
        IDSolicitud: Number(providerRequestId),
      });
      assertOmniSuccess(sendPayload, "omni_send_failed", { allowSendResultCodeOne: true });

      const updatedRequest = await prisma.omniRequest.update({
        where: { id: omniRequest.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          lastPolledAt: new Date(),
          lastProviderStatus: "SENT",
          lastResultCode: getOmniResultCode(sendPayload) ?? 0,
          lastResultText: getOmniResultText(sendPayload) || "Operacion correcta",
        },
      });

      await createOmniEvent(omniRequest.id, "SEND_OK", {
        message: "OmniSwitch request sent",
        metaJson: { providerRequestId },
      });
      created.push(updatedRequest);
    } catch (error) {
      if (omniRequest?.id) {
        await prisma.omniRequest.update({
          where: { id: omniRequest.id },
          data: {
            status: "ERROR",
            lastProviderStatus: "ERROR",
            lastResultCode: error.resultCode ?? error.status ?? 500,
            lastResultText: getOmniResultText(error.payload) || error.message || "omni_error",
          },
        });
        await createOmniEvent(omniRequest.id, "ERROR", {
          message: "OmniSwitch request failed",
          metaJson: {
            error: error.message,
            resultCode: error.resultCode ?? null,
            payload: error.payload || null,
          },
        });
      }
      return {
        error: error.message || "omni_request_failed",
        status: error.status || 502,
      };
    }
  }

  return { items: created, status: 201 };
}

function sanitizePhone(value) {
  return String(value || "").replace(/[^0-9]+/g, "");
}

const OMNISWITCH_FIELDS = [
  "Cedula",
  "PrimerNombre",
  "SegunNombre",
  "PrimerApellido",
  "SegApellido",
  "Celular",
  "Email",
  "FirmaPrincipal",
  "IdPais",
  "IdProvincia",
  "IdCiudad",
  "Direccion",
];

const OMNISWITCH_REQUIRED_FIELDS = [
  "Cedula",
  "PrimerNombre",
  "PrimerApellido",
  "Celular",
  "Email",
  "Direccion",
];

const RC_STANDARD_HEADERS = [
  "Cedula",
  "PrimerNombre",
  "SegunNombre",
  "PrimerApellido",
  "SegApellido",
  "Celular",
  "Email",
  "FirmaPrincipal",
  "IdPais",
  "IdProvincia",
  "IdCiudad",
  "Direccion",
];

const DEFAULT_EXAMPLE_FIELDS = [
  ...OMNISWITCH_FIELDS,
  "AlumnoNombre",
  "AlumnoApellido",
  "Curso",
  "Fecha",
  "Institucion",
];

function orderedExcelHeaders(placeholders) {
  const extraFields = placeholders.filter((field) => !OMNISWITCH_FIELDS.includes(field));
  return [...OMNISWITCH_FIELDS, ...extraFields];
}

function uniquePlaceholders(templates) {
  return Array.from(
    new Set(
      templates.flatMap((template) => (Array.isArray(template?.placeholders) ? template.placeholders : []))
    )
  );
}

function parseTemplateIdsParam(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sampleValueForExcelField(field) {
  return "";
}

function buildExampleExcelRows(headers) {
  const firstNames = ["Laura", "Carlos", "Maria", "Jorge", "Ana", "Luis", "Sofia", "Diego", "Paula", "Mateo"];
  const middleNames = ["Maria", "Andres", "Jose", "Fernanda", "Alejandra", "Xavier", "Isabel", "David", "Lucia", "Gabriel"];
  const lastNames = ["Gomez", "Perez", "Torres", "Ruiz", "Moreno", "Castro", "Silva", "Rojas", "Vega", "Lopez"];
  const secondLastNames = ["Perez", "Lopez", "Mendoza", "Garcia", "Sanchez", "Mora", "Diaz", "Ortega", "Nunez", "Herrera"];
  const studentNames = ["Mateo", "Valentina", "Samuel", "Julieta", "Emilia", "Nicolas", "Martina", "Daniel", "Lucia", "Gabriel"];
  const studentLastNames = ["Perez", "Gomez", "Ruiz", "Castro", "Vega", "Silva", "Torres", "Lopez", "Rojas", "Moreno"];
  const courses = ["1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A"];

  return Array.from({ length: 10 }, (_, index) =>
    headers.map((header) => {
      const firstName = firstNames[index];
      const middleName = middleNames[index];
      const lastName = lastNames[index];
      const secondLastName = secondLastNames[index];
      const studentName = studentNames[index];
      const studentLastName = studentLastNames[index];
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index + 1}@correo.com`;

      const samples = {
        Cedula: `09${String(12345678 + index).padStart(8, "0")}`,
        PrimerNombre: firstName,
        SegunNombre: middleName,
        PrimerApellido: lastName,
        SegApellido: secondLastName,
        Celular: `09${String(91234567 + index).padStart(8, "0")}`,
        Email: email,
        FirmaPrincipal: 1,
        IdPais: 19,
        IdProvincia: 17,
        IdCiudad: 1701,
        Direccion: `Quito - Sector ${index + 1}`,
        AlumnoNombre: studentName,
        AlumnoApellido: studentLastName,
        Curso: courses[index],
        Fecha: `2026-03-${String(index + 1).padStart(2, "0")}`,
        Institucion: "Colegio Central",
      };
      return Object.prototype.hasOwnProperty.call(samples, header) ? samples[header] : sampleValueForExcelField(header);
    })
  );
}

function buildExcelBuffer(placeholders) {
  const headers = orderedExcelHeaders(placeholders);
  const exampleRows = buildExampleExcelRows(headers);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
  sheet["!cols"] = headers.map((header) => ({ wch: Math.max(String(header).length + 4, 16) }));
  XLSX.utils.book_append_sheet(workbook, sheet, "plantilla");
  const guide = XLSX.utils.aoa_to_sheet([
    ["Guia de uso"],
    ["Campos OmniSwitch", OMNISWITCH_FIELDS.join(", ")],
    ["Campos obligatorios a llenar", OMNISWITCH_REQUIRED_FIELDS.join(", ")],
    ["Campos con default sugerido", "FirmaPrincipal, IdPais, IdProvincia, IdCiudad"],
    ["Campos auxiliares", headers.filter((field) => !OMNISWITCH_FIELDS.includes(field)).join(", ") || "Ninguno"],
    ["Regla clave", "El placeholder de la plantilla debe coincidir exactamente con el nombre de la columna del Excel."],
  ]);
  guide["!cols"] = [{ wch: 24 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(workbook, guide, "guia");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function pickRowValue(row, keys) {
  for (const key of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
  }
  return "";
}

function buildSignatoryFromKeys(
  row,
  {
    idKeys = [],
    firstNameKeys = [],
    middleNameKeys = [],
    lastNameKeys = [],
    secondLastNameKeys = [],
    fullNameKeys = [],
    emailKeys = [],
    phoneKeys = [],
    role,
    isPrimary,
  }
) {
  const idNumber = pickRowValue(row, idKeys);
  let firstName = pickRowValue(row, firstNameKeys);
  let middleName = pickRowValue(row, middleNameKeys);
  let lastName = pickRowValue(row, lastNameKeys);
  let secondLastName = pickRowValue(row, secondLastNameKeys);
  const sourceFullName =
    [firstName, middleName, lastName, secondLastName].filter(Boolean).join(" ").trim() ||
    pickRowValue(row, fullNameKeys);
  if (sourceFullName && (!firstName || !lastName)) {
    const split = splitPersonName(sourceFullName);
    const nameParts = String(split.names || "").split(/\s+/).filter(Boolean);
    const lastNameParts = String(split.lastNames || "").split(/\s+/).filter(Boolean);
    if (!firstName) firstName = nameParts[0] || "";
    if (!middleName) middleName = nameParts.slice(1).join(" ");
    if (!lastName) lastName = lastNameParts[0] || "";
    if (!secondLastName) secondLastName = lastNameParts.slice(1).join(" ");
  }
  const fullName = [firstName, middleName, lastName, secondLastName].filter(Boolean).join(" ").trim() || sourceFullName;
  const email = pickRowValue(row, emailKeys);
  const phone = pickRowValue(row, phoneKeys);
  const sanitizedPhone = sanitizePhone(phone);
  if (!idNumber && !fullName && !email && !phone) return null;
  return {
    idNumber,
    firstName,
    middleName,
    lastName,
    secondLastName,
    fullName,
    phone: sanitizedPhone || phone,
    email,
    sanitizedPhone,
    role,
    isPrimary,
  };
}

function buildPrefixedSignatory(row, prefix, role, isPrimary) {
  return buildSignatoryFromKeys(row, {
    idKeys: [`${prefix}cedula`, `${prefix}id`, `${prefix}documento`],
    firstNameKeys: [`${prefix}nombre`, `${prefix}nombres`],
    lastNameKeys: [`${prefix}apellido`, `${prefix}apellidos`],
    fullNameKeys: [`${prefix}nombre_completo`],
    emailKeys: [`${prefix}email`, `${prefix}correo`],
    phoneKeys: [`${prefix}celular`, `${prefix}telefono`],
    role,
    isPrimary,
  });
}

function buildRepresentativeSignatory(row) {
  return buildSignatoryFromKeys(row, {
    idKeys: [
      "Cedula",
      "cedula_representante",
      "representante_cedula",
      "representante_documento",
      "padre_cedula",
      "madre_cedula",
      "acudiente_cedula",
      "responsable_cedula",
      "cedula",
    ],
    firstNameKeys: [
      "PrimerNombre",
      "representante_nombre",
      "primer_nombre_representante",
      "padre_nombre",
      "madre_nombre",
      "acudiente_nombre",
      "responsable_nombre",
    ],
    middleNameKeys: ["SegunNombre"],
    lastNameKeys: [
      "PrimerApellido",
      "representante_apellido",
      "primer_apellido_representante",
      "padre_apellido",
      "madre_apellido",
      "acudiente_apellido",
      "responsable_apellido",
    ],
    secondLastNameKeys: ["SegApellido"],
    fullNameKeys: [
      "NombreFirmante",
      "representante",
      "nombre_representante",
      "representante_nombre_completo",
      "primer_nombre_representante",
      "padre",
      "nombre_padre",
      "madre",
      "nombre_madre",
      "acudiente",
      "responsable",
      "full_name",
      "fullName",
    ],
    emailKeys: [
      "Email",
      "representante_email",
      "email_representante",
      "correo_representante",
      "padre_email",
      "correo_padre",
      "madre_email",
      "correo_madre",
      "acudiente_email",
      "responsable_email",
      "email",
      "correo",
      "parent_email",
    ],
    phoneKeys: [
      "Celular",
      "representante_celular",
      "celular_representante",
      "telefono_representante",
      "padre_celular",
      "celular_padre",
      "madre_celular",
      "celular_madre",
      "acudiente_celular",
      "responsable_celular",
      "phone",
      "celular",
      "parent_phone",
    ],
    role: "REPRESENTANTE_PRINCIPAL",
    isPrimary: true,
  });
}

function buildSignatoriesForTemplate(placeholders, row) {
  const list = [];
  const hasPersona1 = placeholders.some((p) => p.startsWith("persona1_"));
  const hasPersona2 = placeholders.some((p) => p.startsWith("persona2_"));
  const hasRepresentativeFields = placeholders.some((p) =>
    [
      "Cedula",
      "PrimerNombre",
      "SegunNombre",
      "PrimerApellido",
      "SegApellido",
      "Celular",
      "Email",
      "FirmaPrincipal",
      "IdPais",
      "IdProvincia",
      "IdCiudad",
      "Direccion",
      "representante",
      "representante_nombre",
      "representante_apellido",
      "cedula_representante",
      "representante_email",
      "representante_celular",
      "primer_nombre_representante",
      "primer_apellido_representante",
      "email_representante",
      "telefono_representante",
    ].includes(p)
  );

  if (hasPersona1 || hasPersona2) {
    if (hasPersona1) {
      const signer1 = buildPrefixedSignatory(row, "persona1_", "REPRESENTANTE_PRINCIPAL", true);
      if (signer1) list.push(signer1);
    }
    if (hasPersona2) {
      const signer2 = buildPrefixedSignatory(row, "persona2_", "REPRESENTANTE_SECUNDARIO", false);
      if (signer2) list.push(signer2);
    }
  }

  if (list.length) return list;

  if (hasRepresentativeFields) {
    const representativeSigner = buildRepresentativeSignatory(row);
    if (representativeSigner) return [representativeSigner];
  }

  const representativeSigner = buildRepresentativeSignatory(row);
  if (representativeSigner) return [representativeSigner];
  return [];
}

async function processBatch(batchId) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) return;
  const claim = await prisma.batch.updateMany({
    where: { id: batch.id, status: { in: ["PENDING", "QUEUED"] } },
    data: { status: "PROCESSING" },
  });
  if (!claim.count) return;

  const template = await prisma.template.findUnique({ where: { id: batch.templateId } });
  if (!template) {
    await prisma.request.updateMany({ where: { batchId: batch.id }, data: { status: "ERROR" } });
    await prisma.batch.update({ where: { id: batch.id }, data: { status: "ERROR" } });
    return;
  }

  const batchDir = path.join(storagePath, "batches", batch.organizationId, batch.id);
  const inputPath = path.join(batchDir, "input.json");
  if (!fs.existsSync(inputPath)) {
    await prisma.request.updateMany({ where: { batchId: batch.id }, data: { status: "ERROR" } });
    await prisma.batch.update({ where: { id: batch.id }, data: { status: "ERROR" } });
    return;
  }
  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const requests = await prisma.request.findMany({
    where: { batchId: batch.id },
    orderBy: { createdAt: "asc" },
  });
  await prisma.request.updateMany({
    where: { batchId: batch.id, status: { in: ["PENDING", "QUEUED"] } },
    data: { status: "PROCESSING" },
  });

  const docxDir = path.join(batchDir, "docx");
  const htmlDir = path.join(batchDir, "html");
  const pdfDir = path.join(batchDir, "pdf");
  ensureDir(docxDir);
  ensureDir(htmlDir);
  ensureDir(pdfDir);

  const total = Math.min(rows.length, requests.length);
  const prepConcurrency = Math.max(1, Number(process.env.BATCH_PREP_CONCURRENCY) || 1);
  const batchPairs = Array.from({ length: total }, (_, i) => ({
    row: rows[i],
    request: requests[i],
  }));
  await runInChunks(batchPairs, prepConcurrency, async ({ row, request }) => {
    const ext = path.extname(template.pdfPath || "").toLowerCase();
    if (ext === ".html" || ext === ".htm") {
      const htmlPath = path.join(htmlDir, `${request.id}.html`);
      replacePlaceholdersInHtml(template.pdfPath, row, htmlPath);
    } else {
      const docxPath = path.join(docxDir, `${request.id}.docx`);
      replacePlaceholdersInDocx(template.pdfPath, row, docxPath);
      await prisma.request.update({
        where: { id: request.id },
        data: { docxPath },
      });
      const htmlPath = path.join(htmlDir, `${request.id}.html`);
      try {
        await convertDocxToHtml(docxPath, htmlPath);
      } catch (error) {
        console.error(`DOCX to HTML failed for ${docxPath}:`, error);
      }
    }
  });

  const htmlFiles = fs.readdirSync(htmlDir).filter((file) => file.endsWith(".html"));
  try {
    await renderHtmlToPdfBatch(htmlFiles, htmlDir, pdfDir);
  } catch (error) {
    console.error("HTML to PDF batch failed:", error);
    const docxFiles = fs.readdirSync(docxDir).filter((file) => file.endsWith(".docx"));
    const concurrency = Math.max(1, Number(process.env.PDF_CONCURRENCY) || 1);
    for (let i = 0; i < docxFiles.length; i += concurrency) {
      const chunk = docxFiles.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (file) => {
          try {
            const profileDir = path.join(batchDir, "lo-profile", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
            ensureDir(profileDir);
            await convertDocxToPdf(path.join(docxDir, file), pdfDir, profileDir);
            fs.rmSync(profileDir, { recursive: true, force: true });
          } catch (err) {
            console.error(`PDF conversion failed for ${file}:`, err);
          }
        })
      );
    }
  }

  const zipDir = path.join(batchDir, "zip");
  ensureDir(zipDir);
  const docxZipPath = path.join(zipDir, "docx.zip");
  const pdfZipPath = path.join(zipDir, "pdf.zip");
  const docxZip = new AdmZip();
  docxZip.addLocalFolder(docxDir);
  docxZip.writeZip(docxZipPath);

  const pdfZip = new AdmZip();
  const pdfFiles = fs.existsSync(pdfDir) ? fs.readdirSync(pdfDir).filter((file) => file.endsWith(".pdf")) : [];
  const optimizedDir = path.join(batchDir, "pdf_optimized");
  if (pdfFiles.length) {
    ensureDir(optimizedDir);
    await runInChunks(pdfFiles, prepConcurrency, async (file) => {
      const inputPath = path.join(pdfDir, file);
      const outputPath = path.join(optimizedDir, file);
      try {
        await optimizePdf(inputPath, outputPath);
      } catch (error) {
        console.error(`Ghostscript failed for ${file}:`, error);
        fs.copyFileSync(inputPath, outputPath);
      }
    });
    pdfZip.addLocalFolder(optimizedDir);
    pdfZip.writeZip(pdfZipPath);
  }

  for (const request of requests) {
    const optimizedPath = path.join(optimizedDir, `${request.id}.pdf`);
    const pdfPath = path.join(pdfDir, `${request.id}.pdf`);
    const finalPath = fs.existsSync(optimizedPath) ? optimizedPath : fs.existsSync(pdfPath) ? pdfPath : null;
    await prisma.request.update({
      where: { id: request.id },
      data: finalPath ? { pdfPath: finalPath, status: "READY" } : { status: "ERROR" },
    });
  }

  await prisma.batch.update({
    where: { id: batch.id },
    data: { status: "READY", docxZipPath, pdfZipPath },
  });
}

async function processBatchGroup(batchGroupId) {
  const batchGroup = await prisma.batchGroup.findUnique({
    where: { id: batchGroupId },
    include: {
      group: {
        include: {
          items: { include: { template: true }, orderBy: { order: "asc" } },
        },
      },
    },
  });
  if (!batchGroup) return;
  const claim = await prisma.batchGroup.updateMany({
    where: { id: batchGroup.id, status: { in: ["PENDING", "QUEUED"] } },
    data: { status: "PROCESSING" },
  });
  if (!claim.count) return;

  const items = batchGroup.group?.items || [];
  if (!items.length) {
    await prisma.requestGroup.updateMany({ where: { batchGroupId: batchGroup.id }, data: { status: "ERROR" } });
    await prisma.request.updateMany({ where: { requestGroup: { batchGroupId: batchGroup.id } }, data: { status: "ERROR" } });
    await prisma.batchGroup.update({ where: { id: batchGroup.id }, data: { status: "ERROR" } });
    return;
  }

  const batchDir = path.join(storagePath, "batch-groups", batchGroup.organizationId, batchGroup.id);
  const inputPath = path.join(batchDir, "input.json");
  if (!fs.existsSync(inputPath)) {
    await prisma.requestGroup.updateMany({ where: { batchGroupId: batchGroup.id }, data: { status: "ERROR" } });
    await prisma.request.updateMany({ where: { requestGroup: { batchGroupId: batchGroup.id } }, data: { status: "ERROR" } });
    await prisma.batchGroup.update({ where: { id: batchGroup.id }, data: { status: "ERROR" } });
    return;
  }
  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const rows = Array.isArray(input.rows) ? input.rows : [];

  const requestGroups = await prisma.requestGroup.findMany({
    where: { batchGroupId: batchGroup.id },
    include: { requests: true },
    orderBy: { rowIndex: "asc" },
  });
  await prisma.requestGroup.updateMany({
    where: { batchGroupId: batchGroup.id, status: { in: ["PENDING", "QUEUED"] } },
    data: { status: "PROCESSING" },
  });
  await prisma.request.updateMany({
    where: { requestGroup: { batchGroupId: batchGroup.id }, status: { in: ["PENDING", "QUEUED"] } },
    data: { status: "PROCESSING" },
  });

  const docxDir = path.join(batchDir, "docx");
  const htmlDir = path.join(batchDir, "html");
  const pdfDir = path.join(batchDir, "pdf");
  ensureDir(docxDir);
  ensureDir(htmlDir);
  ensureDir(pdfDir);

  const templateMap = new Map(items.map((item) => [item.templateId, item.template]));
  const prepConcurrency = Math.max(1, Number(process.env.BATCH_PREP_CONCURRENCY) || 1);
  const groupTasks = requestGroups.flatMap((groupRow) => {
    const row = rows[groupRow.rowIndex] || {};
    return groupRow.requests.map((request) => ({ row, request }));
  });
  await runInChunks(groupTasks, prepConcurrency, async ({ row, request }) => {
      const template = templateMap.get(request.templateId);
      if (!template) return;
      const ext = path.extname(template.pdfPath || "").toLowerCase();
      if (ext === ".html" || ext === ".htm") {
        const htmlPath = path.join(htmlDir, `${request.id}.html`);
        replacePlaceholdersInHtml(template.pdfPath, row, htmlPath);
      } else {
        const docxPath = path.join(docxDir, `${request.id}.docx`);
        replacePlaceholdersInDocx(template.pdfPath, row, docxPath);
        await prisma.request.update({
          where: { id: request.id },
          data: { docxPath },
        });
        const htmlPath = path.join(htmlDir, `${request.id}.html`);
        try {
          await convertDocxToHtml(docxPath, htmlPath);
        } catch (error) {
          console.error(`DOCX to HTML failed for ${docxPath}:`, error);
        }
      }
  });

  const htmlFiles = fs.readdirSync(htmlDir).filter((file) => file.endsWith(".html"));
  try {
    await renderHtmlToPdfBatch(htmlFiles, htmlDir, pdfDir);
  } catch (error) {
    console.error("HTML to PDF batch failed:", error);
    const docxFiles = fs.readdirSync(docxDir).filter((file) => file.endsWith(".docx"));
    const concurrency = Math.max(1, Number(process.env.PDF_CONCURRENCY) || 1);
    for (let i = 0; i < docxFiles.length; i += concurrency) {
      const chunk = docxFiles.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (file) => {
          try {
            const profileDir = path.join(batchDir, "lo-profile", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
            ensureDir(profileDir);
            await convertDocxToPdf(path.join(docxDir, file), pdfDir, profileDir);
            fs.rmSync(profileDir, { recursive: true, force: true });
          } catch (err) {
            console.error(`PDF conversion failed for ${file}:`, err);
          }
        })
      );
    }
  }

  const zipDir = path.join(batchDir, "zip");
  ensureDir(zipDir);
  const docxZipPath = path.join(zipDir, "docx.zip");
  const pdfZipPath = path.join(zipDir, "pdf.zip");
  const docxZip = new AdmZip();
  docxZip.addLocalFolder(docxDir);
  docxZip.writeZip(docxZipPath);

  const pdfZip = new AdmZip();
  const pdfFiles = fs.existsSync(pdfDir) ? fs.readdirSync(pdfDir).filter((file) => file.endsWith(".pdf")) : [];
  const optimizedDir = path.join(batchDir, "pdf_optimized");
  if (pdfFiles.length) {
    ensureDir(optimizedDir);
    await runInChunks(pdfFiles, prepConcurrency, async (file) => {
      const inputPath = path.join(pdfDir, file);
      const outputPath = path.join(optimizedDir, file);
      try {
        await optimizePdf(inputPath, outputPath);
      } catch (error) {
        console.error(`Ghostscript failed for ${file}:`, error);
        fs.copyFileSync(inputPath, outputPath);
      }
    });
    pdfZip.addLocalFolder(optimizedDir);
    pdfZip.writeZip(pdfZipPath);
  }

  const requests = await prisma.request.findMany({
    where: { requestGroup: { batchGroupId: batchGroup.id } },
  });
  for (const request of requests) {
    const optimizedPath = path.join(optimizedDir, `${request.id}.pdf`);
    const pdfPath = path.join(pdfDir, `${request.id}.pdf`);
    const finalPath = fs.existsSync(optimizedPath) ? optimizedPath : fs.existsSync(pdfPath) ? pdfPath : null;
    await prisma.request.update({
      where: { id: request.id },
      data: finalPath ? { pdfPath: finalPath, status: "READY" } : { status: "ERROR" },
    });
  }

  await prisma.requestGroup.updateMany({
    where: { batchGroupId: batchGroup.id },
    data: { status: "READY" },
  });

  await prisma.batchGroup.update({
    where: { id: batchGroup.id },
    data: { status: "READY", docxZipPath, pdfZipPath },
  });
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const method = req.method || "GET";
  const pathOnly = url.split("?")[0];
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  const startedAt = Date.now();
  res.setHeader("x-request-id", requestId);
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        service: "api",
        request_id: requestId,
        method,
        path: pathOnly,
        status_code: res.statusCode,
        duration_ms: Date.now() - startedAt,
      })
    );
  });

  setCors(res);
  if (method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (url === "/health") {
    return json(res, 200, { status: "ok" });
  }

  if (url === "/ready" && method === "GET") {
    return (async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return json(res, 200, { status: "ready", checks: { database: "ok" } });
      } catch (error) {
        return json(res, 503, { status: "not_ready", checks: { database: "down" } });
      }
    })();
  }

  if (url === "/version" && method === "GET") {
    return json(res, 200, {
      service: "api",
      version: serviceVersion,
      env: process.env.NODE_ENV || "unknown",
      now: new Date().toISOString(),
    });
  }

  if (pathOnly === "/v1/test/query-rc" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        
        const auth = {
          UserName: omniSwitchUser,
          Password: omniSwitchPassword,
        };

        const response = await fetch(`${omniSwitchApiUrl}/QueryRC`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...auth, ...body }),
        });
        
        const raw = await response.text();
        let parsed;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          parsed = { raw };
        }
        
        return json(res, response.status, parsed);
      } catch (error) {
        console.error("QueryRC Proxy Error:", error);
        return json(res, 500, { error: "proxy_failed", detail: error.message });
      }
    })();
  }

  if (pathOnly === "/v1/examples/template-base-html" && method === "GET") {
    return (() => {
      try {
        const filePath = path.join(examplesPath, "base_html_impresion.html");
        if (!fs.existsSync(filePath)) return json(res, 404, { error: "example_not_found" });
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": 'attachment; filename="base_html_impresion.html"',
        });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        return json(res, 500, { error: "example_download_failed" });
      }
    })();
  }

  if (pathOnly === "/v1/examples/template-matricula-html" && method === "GET") {
    return (() => {
      try {
        const filePath = path.join(examplesPath, "solicitud_matricula.html");
        if (!fs.existsSync(filePath)) return json(res, 404, { error: "example_not_found" });
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": 'attachment; filename="solicitud_matricula.html"',
        });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        return json(res, 500, { error: "example_download_failed" });
      }
    })();
  }

  if (pathOnly === "/v1/examples/excel-base" && method === "GET") {
    return (() => {
      try {
        const buffer = buildExcelBuffer(DEFAULT_EXAMPLE_FIELDS);
        res.writeHead(200, {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": 'attachment; filename="excel_ejemplo_10_registros.xlsx"',
        });
        res.end(buffer);
      } catch (error) {
        return json(res, 500, { error: "example_excel_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/template-groups") && method !== "OPTIONS") {
    return json(res, 410, {
      error: "feature_disabled",
      message: "template_groups_disabled_use_single_template",
    });
  }

  if (url.startsWith("/v1/files") && method === "GET") {
    return (() => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const relPath = query.get("path");
        if (!relPath) return json(res, 400, { error: "missing_path" });
        const fullPath = safeResolvePath(storagePath, relPath);
        if (!fs.existsSync(fullPath)) return json(res, 404, { error: "file_not_found" });
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) return json(res, 400, { error: "not_a_file" });
        res.writeHead(200, { "content-type": contentTypeFor(fullPath) });
        fs.createReadStream(fullPath).pipe(res);
      } catch (error) {
        return json(res, 400, { error: "invalid_path" });
      }
    })();
  }

  if (url === "/v1/auth/login" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const email = String(body.email || "").toLowerCase();
        const password = String(body.password || "");

        if (!email || !password) {
          return json(res, 400, { error: "missing_credentials" });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.passwordHash !== password) {
          return json(res, 401, { error: "invalid_credentials" });
        }

        return json(res, 200, {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId,
            mustChangePassword: user.mustChangePassword,
          },
        });
      } catch (error) {
        return json(res, 500, { error: "login_failed" });
      }
    })();
  }

  if (url === "/v1/auth/desktop-web-link" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const email = String(body.email || "").toLowerCase();
        const password = String(body.password || "");
        const requestedBatchId = String(body.batchId || "").trim();
        if (!email || !password) {
          return json(res, 400, { error: "missing_credentials" });
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.passwordHash !== password) {
          return json(res, 401, { error: "invalid_credentials" });
        }

        let batchId = "";
        if (requestedBatchId) {
          const batch = await prisma.desktopBatch.findFirst({
            where: {
              id: requestedBatchId,
              organizationId: user.organizationId || "",
            },
            select: { id: true },
          });
          if (!batch) return json(res, 404, { error: "desktop_batch_not_found" });
          batchId = batch.id;
        }

        const token = signDesktopWebToken({
          email: user.email,
          role: user.role,
          organizationId: user.organizationId || null,
          batchId: batchId || null,
          exp: Date.now() + 5 * 60 * 1000,
        });
        const webUrl = `${defaultWebAppUrl(req)}/admin/history.html?autoLoginToken=${encodeURIComponent(token)}${batchId ? `&batchId=${encodeURIComponent(batchId)}` : ""}`;
        return json(res, 200, { url: webUrl });
      } catch (error) {
        return json(res, 500, { error: "desktop_web_link_failed" });
      }
    })();
  }

  if (url === "/v1/auth/desktop-token/consume" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const payload = verifyDesktopWebToken(body.token);
        if (!payload) return json(res, 401, { error: "invalid_or_expired_token" });
        return json(res, 200, {
          user: {
            email: payload.email,
            role: payload.role,
            organizationId: payload.organizationId || null,
          },
          batchId: payload.batchId || null,
        });
      } catch (error) {
        return json(res, 500, { error: "desktop_token_consume_failed" });
      }
    })();
  }

  if (url === "/v1/desktop-batches/import" && method === "POST") {
    return (async () => {
      try {
        const contentType = req.headers["content-type"] || "";
        if (!contentType.includes("multipart/form-data")) {
          return json(res, 400, { error: "expected_multipart" });
        }
        const boundaryMatch = /boundary=(.+)$/.exec(contentType);
        if (!boundaryMatch) return json(res, 400, { error: "missing_boundary" });

        const buffer = await readBuffer(req);
        const { fields, files } = parseMultipart(buffer, boundaryMatch[1]);
        const organizationId = String(fields.organizationId || "").trim();
        const uploadedByEmail = String(fields.uploadedByEmail || "").trim().toLowerCase();
        const sourceExcel = String(fields.sourceExcel || "excel_local.xlsx").trim();
        const manifest = safeJsonParse(fields.manifest, null);

        if (!organizationId || !manifest || !Array.isArray(manifest.documents)) {
          return json(res, 400, { error: "invalid_desktop_batch_payload" });
        }

        const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
        if (!organization) return json(res, 404, { error: "organization_not_found" });

        const rows = Array.isArray(manifest.rows) ? manifest.rows : [];
        const readyDocuments = manifest.documents.filter((document) => {
          const status = String(document?.status || "").toUpperCase();
          return status === "READY" && basenameFromDocument(document);
        });
        if (!readyDocuments.length) {
          return json(res, 400, { error: "no_ready_documents" });
        }

        const fileMap = new Map(files.map((file) => [path.basename(file.filename || ""), file]));
        const missingFile = readyDocuments.find((document) => !fileMap.has(basenameFromDocument(document)));
        if (missingFile) {
          return json(res, 400, { error: "missing_pdf_file", file: basenameFromDocument(missingFile) });
        }

        const batch = await prisma.desktopBatch.create({
          data: {
            organizationId,
            sourceExcel,
            status: "IMPORTED",
            rowCount: rows.length,
            documentCount: readyDocuments.length,
            uploadedByEmail: uploadedByEmail || null,
            manifestJson: manifest,
          },
        });

        const batchDir = path.join(storagePath, "desktop-batches", organizationId, batch.id);
        const pdfDir = path.join(batchDir, "pdf");
        ensureDir(pdfDir);
        fs.writeFileSync(path.join(batchDir, "manifest.json"), JSON.stringify(manifest, null, 2));

        for (const document of readyDocuments) {
          const fileKey = basenameFromDocument(document);
          const uploadedFile = fileMap.get(fileKey);

          const savedName = `${Date.now()}-${Math.random().toString(16).slice(2)}-${fileKey}`;
          const pdfPath = path.join(pdfDir, savedName);
          fs.writeFileSync(pdfPath, uploadedFile.data);

          await prisma.desktopDocument.create({
            data: {
              batchId: batch.id,
              rowIndex: Number(document.row_index ?? document.rowIndex ?? 0),
              groupKey: String(document.group_key ?? document.groupKey ?? `registro-${batch.id}`),
              templateName: String(document.template_name ?? document.templateName ?? "Plantilla"),
              outputName: String(document.output_name ?? document.outputName ?? fileKey),
              status: String(document.status || "READY").toUpperCase(),
              pdfPath,
              rowJson: rows[Number(document.row_index ?? document.rowIndex ?? 0)] || null,
            },
          });
        }

        return json(res, 201, {
          batch: {
            id: batch.id,
            organizationId: batch.organizationId,
            status: batch.status,
            rowCount: batch.rowCount,
            documentCount: batch.documentCount,
          },
        });
      } catch (error) {
        console.error(error);
        return json(res, 500, { error: "desktop_batch_import_failed" });
      }
    })();
  }

  if (url.startsWith("/v1/desktop-batches") && method === "GET" && !url.includes("/documents")) {
    return (async () => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = query.get("organizationId");
        const where = organizationId ? { organizationId } : {};
        const items = await prisma.desktopBatch.findMany({
          where,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            organizationId: true,
            sourceExcel: true,
            status: true,
            rowCount: true,
            documentCount: true,
            uploadedByEmail: true,
            createdAt: true,
          },
        });
        return json(res, 200, { items });
      } catch (error) {
        return json(res, 500, { error: "desktop_batches_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/desktop-batches/") && pathOnly.endsWith("/documents") && method === "GET") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        if (!batchId) return json(res, 400, { error: "missing_batch_id" });
        const batch = await prisma.desktopBatch.findUnique({
          where: { id: batchId },
          include: { documents: { orderBy: [{ rowIndex: "asc" }, { templateName: "asc" }] } },
        });
        if (!batch) return json(res, 404, { error: "desktop_batch_not_found" });
        const items = batch.documents.map((document) => ({
          id: document.id,
          rowIndex: document.rowIndex,
          groupKey: document.groupKey,
          templateName: document.templateName,
          outputName: document.outputName,
          status: document.status,
          row: document.rowJson || {},
          pdfUrl: toFileUrl(document.pdfPath),
        }));
        return json(res, 200, { items });
      } catch (error) {
        return json(res, 500, { error: "desktop_batch_documents_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/desktop-batches/") && pathOnly.endsWith("/omni/send") && method === "POST") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        if (!batchId) return json(res, 400, { error: "missing_batch_id" });
        const body = await readJson(req);
        const result = await (isMockOmniMode() ? createMockOmniRequestsForDesktopBatch(batchId, {
          idProcess: body.idProcess,
          billingMode: body.billingMode,
          billingAmount: body.billingAmount,
          billingCurrency: body.billingCurrency,
          biometricRequired: body.biometricRequired,
          paymentReference: body.paymentReference,
          forceResend: !!body.forceResend,
        }) : createRealOmniRequestsForDesktopBatch(batchId, {
          idProcess: body.idProcess,
          billingMode: body.billingMode,
          billingAmount: body.billingAmount,
          billingCurrency: body.billingCurrency,
          biometricRequired: body.biometricRequired,
          paymentReference: body.paymentReference,
          forceResend: !!body.forceResend,
        }));
        if (result.error) return json(res, result.status || 400, { error: result.error });
        return json(res, result.status || 201, {
          mode: omniSwitchMode,
          items: result.items.map((item) => ({
            id: item.id,
            providerRequestId: item.providerRequestId,
            status: item.status,
            billingMode: item.billingMode,
            billingAmount: item.billingAmount,
            billingCurrency: item.billingCurrency,
            paymentRequired: item.paymentRequired,
            paymentReference: item.paymentReference,
            paymentStatus: item.paymentStatus,
            documentCount: item.documentCount,
            signatoryCount: item.signatoryCount,
          })),
        });
      } catch (error) {
        console.error("Desktop batch Omni send failed:", error);
        return json(res, 500, { error: "desktop_batch_omni_send_failed" });
      }
    })();
  }

  if (pathOnly === "/v1/omni-requests" && method === "GET") {
    return (async () => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const desktopBatchId = String(query.get("desktopBatchId") || "").trim();
        const organizationId = String(query.get("organizationId") || "").trim();
        const where = {};
        if (desktopBatchId) where.desktopBatchId = desktopBatchId;
        if (organizationId) where.organizationId = organizationId;
        const items = await prisma.omniRequest.findMany({
          where,
          orderBy: { createdAt: "desc" },
          include: {
            documents: {
              orderBy: { createdAt: "asc" },
              include: {
                desktopDocument: {
                  select: {
                    rowJson: true,
                  },
                },
              },
            },
          },
        });
        return json(res, 200, {
          mode: omniSwitchMode,
          items: items.map((item) => ({
            id: item.id,
            organizationId: item.organizationId,
            desktopBatchId: item.desktopBatchId,
            requestGroupId: item.requestGroupId,
            providerRequestId: item.providerRequestId,
            status: item.status,
            billingMode: item.billingMode,
            billingAmount: item.billingAmount,
            billingCurrency: item.billingCurrency,
            paymentRequired: item.paymentRequired,
            paymentReference: item.paymentReference,
            paymentStatus: item.paymentStatus,
            idProcess: item.idProcess,
            documentCount: item.documentCount,
            signatoryCount: item.signatoryCount,
            sentAt: item.sentAt,
            signedAt: item.signedAt,
            lastPolledAt: item.lastPolledAt,
            lastProviderStatus: item.lastProviderStatus,
            documents: item.documents.map((document) => serializeOmniDocument(document, item.signatoryCount)),
          })),
        });
      } catch (error) {
        console.error("Omni requests fetch failed:", error);
        return json(res, 500, { error: "omni_requests_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/omni-requests/") && method === "GET" && !pathOnly.endsWith("/poll") && !pathOnly.endsWith("/mock-sign")) {
    return (async () => {
      try {
        const omniRequestId = pathOnly.split("/")[3];
        if (!omniRequestId) return json(res, 400, { error: "missing_omni_request_id" });
        const item = await getOmniRequestResponseItem(omniRequestId);
        if (!item) return json(res, 404, { error: "omni_request_not_found" });
        return json(res, 200, {
          mode: omniSwitchMode,
          item,
        });
      } catch (error) {
        console.error("Omni request fetch failed:", error);
        return json(res, 500, { error: "omni_request_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/omni-requests/") && pathOnly.endsWith("/poll") && method === "POST") {
    return (async () => {
      try {
        const omniRequestId = pathOnly.split("/")[3];
        if (!omniRequestId) return json(res, 400, { error: "missing_omni_request_id" });
        const updated = await (isMockOmniMode() ? processMockOmniRequest(omniRequestId) : processRealOmniRequest(omniRequestId));
        if (!updated) return json(res, 404, { error: "omni_request_not_found" });
        return json(res, 200, { mode: omniSwitchMode, item: updated });
      } catch (error) {
        console.error("Omni request poll failed:", error);
        return json(res, 500, { error: "omni_request_poll_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/omni-requests/") && pathOnly.endsWith("/mock-sign") && method === "POST") {
    return (async () => {
      try {
        const omniRequestId = pathOnly.split("/")[3];
        if (!omniRequestId) return json(res, 400, { error: "missing_omni_request_id" });
        if (omniSwitchMode !== "mock") return json(res, 400, { error: "omni_mock_only" });
        const body = await readJson(req);
        const targetDocumentId = String(body.documentId || "").trim();
        const result = await mockSignOmniDocuments(omniRequestId, targetDocumentId);
        if (result.error) return json(res, result.status || 400, { error: result.error });
        return json(res, result.status || 200, { mode: omniSwitchMode, item: result.item });
      } catch (error) {
        console.error("Omni mock sign failed:", error);
        return json(res, 500, { error: "omni_mock_sign_failed" });
      }
    })();
  }

  if (url === "/v1/requests" && method === "GET") {
    return json(res, 200, { items: [] });
  }

  if (url === "/v1/organizations" && method === "GET") {
    return (async () => {
      try {
        const items = await prisma.organization.findMany({
          orderBy: { createdAt: "desc" },
          include: { credits: true },
        });
        return json(res, 200, { items });
      } catch (error) {
        return json(res, 500, { error: "orgs_failed" });
      }
    })();
  }

  if (url.startsWith("/v1/organizations/") && method === "PATCH") {
    return (async () => {
      try {
        const id = url.split("/").pop();
        const body = await readJson(req);
        const data = {};
        if (typeof body.name === "string" && body.name.trim()) {
          data.name = body.name.trim();
        }
        if (body.status) {
          data.status = body.status === "inactive" ? "inactive" : "active";
        }
        const org = await prisma.organization.update({
          where: { id },
          data,
        });
        return json(res, 200, { organization: org });
      } catch (error) {
        return json(res, 500, { error: "org_update_failed" });
      }
    })();
  }

  if (url.startsWith("/v1/organizations/") && method === "DELETE") {
    return (async () => {
      try {
        const id = url.split("/").pop();
        const org = await prisma.organization.update({
          where: { id },
          data: { status: "inactive" },
        });
        return json(res, 200, { organization: org });
      } catch (error) {
        return json(res, 500, { error: "org_delete_failed" });
      }
    })();
  }

  if (url === "/v1/organizations" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const name = String(body.name || "").trim();
        if (!name) return json(res, 400, { error: "missing_name" });
        const org = await prisma.organization.create({
          data: { name, status: body.status || "active" },
        });
        if (body.initialCredits) {
          await prisma.orgCredit.upsert({
            where: { organizationId: org.id },
            update: { balance: Number(body.initialCredits) || 0 },
            create: { organizationId: org.id, balance: Number(body.initialCredits) || 0 },
          });
        }
        return json(res, 201, { organization: org });
      } catch (error) {
        return json(res, 500, { error: "org_create_failed" });
      }
    })();
  }

  if (url === "/v1/batches/validate" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const templateId = String(body.templateId || "");
        const columns = Array.isArray(body.columns) ? body.columns.map((c) => String(c).trim()) : [];
        if (!templateId) return json(res, 400, { error: "missing_template" });
        const template = await prisma.template.findFirst({ where: { id: templateId, status: "active" } });
        if (!template) return json(res, 404, { error: "template_not_found" });
        const placeholders = Array.isArray(template.placeholders) ? template.placeholders : [];
        const missing = placeholders.filter((ph) => !columns.includes(ph));
        return json(res, 200, { placeholders, missing });
      } catch (error) {
        return json(res, 500, { error: "batch_validate_failed" });
      }
    })();
  }

  if (url === "/v1/batches" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const organizationId = String(body.organizationId || "");
        const templateId = String(body.templateId || "");
        if (!organizationId || !templateId) {
          return json(res, 400, { error: "missing_batch_fields" });
        }
        const template = await prisma.template.findFirst({ where: { id: templateId, status: "active" } });
        if (!template) return json(res, 404, { error: "template_not_found" });
        const placeholders = Array.isArray(template.placeholders) ? template.placeholders : [];
        const columns = Array.isArray(body.columns) ? body.columns.map((c) => String(c).trim()) : [];
        const missing = placeholders.filter((ph) => !columns.includes(ph));
        if (missing.length) {
          return json(res, 400, { error: "missing_placeholders", missing });
        }
        const batch = await prisma.batch.create({
          data: {
            organizationId,
            templateId,
            status: "PENDING",
            totalCount: Number(body.totalCount) || 0,
            validCount: Number(body.validCount) || 0,
            invalidCount: Number(body.invalidCount) || 0,
            mapping: body.mapping || null,
          },
        });
        return json(res, 201, { batch });
      } catch (error) {
        return json(res, 500, { error: "batch_create_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batches/") && pathOnly.endsWith("/download") && method === "GET") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const type = query.get("type");
        if (!batchId || !type) return json(res, 400, { error: "missing_download_fields" });
        const batch = await prisma.batch.findUnique({ where: { id: batchId } });
        if (!batch) return json(res, 404, { error: "batch_not_found" });
        const filePath = type === "pdf" ? batch.pdfZipPath : batch.docxZipPath;
        if (!filePath || !fs.existsSync(filePath)) return json(res, 404, { error: "file_not_found" });
        res.writeHead(200, { "content-type": "application/zip" });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        return json(res, 500, { error: "batch_download_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batches/") && pathOnly.endsWith("/files") && method === "GET") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const type = query.get("type") || "pdf";
        if (!batchId) return json(res, 400, { error: "missing_batch_id" });
        const batch = await prisma.batch.findUnique({ where: { id: batchId } });
        if (!batch) return json(res, 404, { error: "batch_not_found" });
        const batchDir = path.join(storagePath, "batches", batch.organizationId, batch.id);
        const dir = type === "docx" ? path.join(batchDir, "docx") : path.join(batchDir, "pdf");
        if (!fs.existsSync(dir)) return json(res, 404, { error: "dir_not_found" });
        const files = fs
          .readdirSync(dir)
          .filter((file) => file.endsWith(type === "docx" ? ".docx" : ".pdf"))
          .map((file) => {
            const rel = path.relative(storagePath, path.join(dir, file));
            return { name: file, url: `/v1/files?path=${encodeURIComponent(rel)}` };
          });
        return json(res, 200, { items: files });
      } catch (error) {
        return json(res, 500, { error: "batch_files_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batches/") && pathOnly.endsWith("/requests") && method === "GET") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        if (!batchId) return json(res, 400, { error: "missing_batch_id" });
        const requests = await prisma.request.findMany({
          where: { batchId },
          orderBy: { createdAt: "asc" },
          select: { id: true, pdfPath: true, docxPath: true },
        });
        return json(res, 200, { items: requests });
      } catch (error) {
        return json(res, 500, { error: "batch_requests_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batches/") && pathOnly.endsWith("/request") && method === "GET") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const index = Number(query.get("index"));
        if (!batchId || Number.isNaN(index) || index < 0) return json(res, 400, { error: "missing_index" });
        const items = await prisma.request.findMany({
          where: { batchId },
          orderBy: { createdAt: "asc" },
          skip: index,
          take: 1,
          select: { id: true, pdfPath: true, docxPath: true },
        });
        if (!items.length) return json(res, 404, { error: "request_not_found" });
        return json(res, 200, { item: items[0] });
      } catch (error) {
        return json(res, 500, { error: "batch_request_failed" });
      }
    })();
  }

  if (pathOnly === "/v1/batches" && method === "GET") {
    return (async () => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = query.get("organizationId");
        const status = query.get("status");
        const where = {};
        if (organizationId) where.organizationId = organizationId;
        if (status) where.status = status;
        const items = await prisma.batch.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });
        return json(res, 200, { items });
      } catch (error) {
        return json(res, 500, { error: "batches_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batches/") && pathOnly.endsWith("/process") && method === "POST") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        if (!batchId) return json(res, 400, { error: "missing_batch_id" });
        const batch = await prisma.batch.findUnique({ where: { id: batchId } });
        if (!batch) return json(res, 404, { error: "batch_not_found" });
        if (!["PENDING", "QUEUED"].includes(batch.status)) {
          return json(res, 409, { error: "batch_not_queued" });
        }
        setImmediate(() => {
          processBatch(batch.id).catch((error) => console.error("Batch process failed:", error));
        });
        return json(res, 202, { status: "processing" });
      } catch (error) {
        console.error(error);
        return json(res, 500, { error: "batch_process_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batches/") && method === "GET" && !pathOnly.endsWith("/download") && !pathOnly.endsWith("/files") && !pathOnly.endsWith("/requests") && !pathOnly.endsWith("/request") && !pathOnly.endsWith("/process") && !pathOnly.endsWith("/requests-detail")) {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        if (!batchId) return json(res, 400, { error: "missing_batch_id" });
        const batch = await prisma.batch.findUnique({
          where: { id: batchId },
          select: { id: true, status: true, totalCount: true, validCount: true, invalidCount: true, updatedAt: true },
        });
        if (!batch) return json(res, 404, { error: "batch_not_found" });
        return json(res, 200, { batch });
      } catch (error) {
        return json(res, 500, { error: "batch_detail_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batches/") && pathOnly.endsWith("/requests-detail") && method === "GET") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        if (!batchId) return json(res, 400, { error: "missing_batch_id" });
        const batch = await prisma.batch.findUnique({ where: { id: batchId } });
        if (!batch) return json(res, 404, { error: "batch_not_found" });
        const batchDir = path.join(storagePath, "batches", batch.organizationId, batch.id);
        const inputPath = path.join(batchDir, "input.json");
        const input = fs.existsSync(inputPath) ? JSON.parse(fs.readFileSync(inputPath, "utf-8")) : {};
        const rows = Array.isArray(input.rows) ? input.rows : [];
        const requests = await prisma.request.findMany({
          where: { batchId },
          orderBy: { createdAt: "asc" },
          select: { id: true, status: true, pdfPath: true, docxPath: true },
        });
        const items = requests.map((reqItem, index) => ({
          index,
          row: rows[index] || {},
          request: {
            id: reqItem.id,
            status: reqItem.status,
            pdfUrl: toFileUrl(reqItem.pdfPath),
            docxUrl: toFileUrl(reqItem.docxPath),
          },
        }));
        return json(res, 200, { items });
      } catch (error) {
        return json(res, 500, { error: "batch_requests_detail_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batch-groups/") && pathOnly.endsWith("/process") && method === "POST") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        if (!batchId) return json(res, 400, { error: "missing_batch_id" });
        const batch = await prisma.batchGroup.findUnique({ where: { id: batchId } });
        if (!batch) return json(res, 404, { error: "batch_not_found" });
        if (!["PENDING", "QUEUED"].includes(batch.status)) {
          return json(res, 409, { error: "batch_not_queued" });
        }
        setImmediate(() => {
          processBatchGroup(batch.id).catch((error) => console.error("Batch group process failed:", error));
        });
        return json(res, 202, { status: "processing" });
      } catch (error) {
        console.error(error);
        return json(res, 500, { error: "batch_group_process_failed" });
      }
    })();
  }

  if (url === "/v1/batches/start" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const organizationId = String(body.organizationId || "");
        const requestedTemplateIds = Array.isArray(body.templateIds)
          ? body.templateIds.map((id) => String(id || "").trim()).filter(Boolean)
          : [];
        const templateId = String(body.templateId || requestedTemplateIds[0] || "");
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (!organizationId || !templateId || !rows.length) {
          return json(res, 400, { error: "missing_batch_payload" });
        }
        const columns = Array.isArray(body.columns) ? body.columns.map((c) => String(c).trim()) : Object.keys(rows[0] || {});

        if (requestedTemplateIds.length > 1) {
          if (requestedTemplateIds.length > 4) {
            return json(res, 400, { error: "too_many_templates" });
          }
          const templates = await prisma.template.findMany({
            where: {
              id: { in: requestedTemplateIds },
              organizationId,
              status: "active",
            },
            orderBy: { createdAt: "asc" },
          });
          if (templates.length !== requestedTemplateIds.length) {
            return json(res, 404, { error: "template_not_found" });
          }
          const templateOrder = new Map(requestedTemplateIds.map((id, index) => [id, index]));
          templates.sort((a, b) => templateOrder.get(a.id) - templateOrder.get(b.id));
          const placeholders = uniquePlaceholders(templates);
          const missing = placeholders.filter((ph) => !columns.includes(ph));
          if (missing.length) {
            return json(res, 400, { error: "missing_placeholders", missing });
          }

          const tempGroup = await prisma.templateGroup.create({
            data: {
              organizationId,
              name: `__batch__${Date.now()}`,
              status: "inactive",
              items: {
                create: templates.map((template, index) => ({
                  templateId: template.id,
                  order: index,
                })),
              },
            },
            include: { items: true },
          });

          const batchGroup = await prisma.batchGroup.create({
            data: {
              organizationId,
              groupId: tempGroup.id,
              status: "QUEUED",
              totalCount: rows.length,
              validCount: rows.length,
              invalidCount: 0,
              mapping: body.mapping || null,
            },
          });

          const batchDir = path.join(storagePath, "batch-groups", organizationId, batchGroup.id);
          ensureDir(batchDir);
          fs.writeFileSync(path.join(batchDir, "input.json"), JSON.stringify({ columns, rows }, null, 2));

          for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex];
            const requestGroup = await prisma.requestGroup.create({
              data: {
                batchGroupId: batchGroup.id,
                rowIndex,
                status: "QUEUED",
              },
            });

            for (const template of templates) {
              const placeholdersForTemplate = Array.isArray(template.placeholders) ? template.placeholders : [];
              const signatories = buildSignatoriesForTemplate(placeholdersForTemplate, row);
              const requestData = {
                organizationId,
                templateId: template.id,
                requestGroupId: requestGroup.id,
                status: "QUEUED",
              };
              if (signatories.length) {
                requestData.signatories = { create: signatories };
              }
              await prisma.request.create({ data: requestData });
            }
          }

          setImmediate(() => {
            processBatchGroup(batchGroup.id).catch((error) => console.error("Batch group auto process failed:", error));
          });

          return json(res, 201, {
            batchId: batchGroup.id,
            total: rows.length,
            mode: "multi",
            templateCount: templates.length,
          });
        }

        const template = await prisma.template.findFirst({ where: { id: templateId, status: "active" } });
        if (!template) return json(res, 404, { error: "template_not_found" });
        const placeholders = Array.isArray(template.placeholders) ? template.placeholders : [];
        const missing = placeholders.filter((ph) => !columns.includes(ph));
        if (missing.length) {
          return json(res, 400, { error: "missing_placeholders", missing });
        }

        const batch = await prisma.batch.create({
          data: {
            organizationId,
            templateId,
            status: "QUEUED",
            totalCount: rows.length,
            validCount: rows.length,
            invalidCount: 0,
            mapping: body.mapping || null,
          },
        });

        const batchDir = path.join(storagePath, "batches", organizationId, batch.id);
        ensureDir(batchDir);
        fs.writeFileSync(path.join(batchDir, "input.json"), JSON.stringify({ columns, rows }, null, 2));

        const requestCreates = [];
        for (const row of rows) {
          const signatories = buildSignatoriesForTemplate(placeholders, row);
          requestCreates.push({
            organizationId,
            templateId,
            batchId: batch.id,
            status: "QUEUED",
            ...(signatories.length ? { signatories: { create: signatories } } : {}),
          });
        }

        for (const data of requestCreates) {
          await prisma.request.create({ data });
        }

        setImmediate(() => {
          processBatch(batch.id).catch((error) => console.error("Batch auto process failed:", error));
        });

        return json(res, 201, { batchId: batch.id, total: rows.length, mode: "single", templateCount: 1 });
      } catch (error) {
        console.error(error);
        return json(res, 500, { error: "batch_start_failed" });
      }
    })();
  }

  if (url === "/v1/users" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const email = String(body.email || "").toLowerCase().trim();
        const role = String(body.role || "ADMIN");
        const organizationId = body.organizationId || null;
        const password = String(body.password || "ABC123#");

        if (!email) return json(res, 400, { error: "missing_email" });
        if (role === "ADMIN" && !organizationId) {
          return json(res, 400, { error: "missing_organization" });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return json(res, 409, { error: "user_exists" });

        const user = await prisma.user.create({
          data: {
            email,
            role,
            organizationId,
            passwordHash: password,
            mustChangePassword: true,
          },
        });
        return json(res, 201, { user });
      } catch (error) {
        return json(res, 500, { error: "user_create_failed" });
      }
    })();
  }

  if (url.startsWith("/v1/users") && method === "GET") {
    return (async () => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = query.get("organizationId");
        const sort = query.get("sort");
        const order = query.get("order") === "desc" ? "desc" : "asc";
        const where = organizationId ? { organizationId } : {};
        const orderBy =
          sort === "org"
            ? [{ organizationId: order }, { email: order }]
            : sort === "email"
            ? { email: order }
            : sort === "role"
            ? { role: order }
            : { createdAt: "desc" };
        const users = await prisma.user.findMany({
          where,
          orderBy,
        });
        return json(res, 200, { items: users });
      } catch (error) {
        console.error("users_failed", error);
        return json(res, 500, { error: "users_failed" });
      }
    })();
  }

  if (url.startsWith("/v1/users/") && method === "PATCH") {
    return (async () => {
      try {
        const id = url.split("/").pop();
        const body = await readJson(req);
        const email = String(body.email || "").toLowerCase().trim();
        const data = {};
        if (email) data.email = email;
        if (body.organizationId) data.organizationId = body.organizationId;
        if (!Object.keys(data).length) return json(res, 400, { error: "missing_fields" });
        const user = await prisma.user.update({
          where: { id },
          data,
        });
        return json(res, 200, { user });
      } catch (error) {
        return json(res, 500, { error: "user_update_failed" });
      }
    })();
  }

  if (url === "/v1/templates" && method === "POST") {
    return (async () => {
      try {
        const contentType = req.headers["content-type"] || "";
        if (!contentType.includes("multipart/form-data")) {
          return json(res, 400, { error: "expected_multipart" });
        }
        const boundaryMatch = /boundary=(.+)$/.exec(contentType);
        if (!boundaryMatch) return json(res, 400, { error: "missing_boundary" });

        const buffer = await readBuffer(req);
        const { fields, files } = parseMultipart(buffer, boundaryMatch[1]);
        const organizationId = fields.organizationId;
        const role = fields.role || "ADMIN";
        const name = String(fields.name || "Plantilla").trim() || "Plantilla";
        const file = files.find((f) => f.name === "file");

        if (!organizationId || !file) {
          return json(res, 400, { error: "missing_fields" });
        }
        if (role !== "ADMIN") {
          return json(res, 403, { error: "forbidden" });
        }

        const filename = String(file.filename || "");
        const ext = path.extname(filename).toLowerCase();
        let placeholders = [];
        if (ext === ".html" || ext === ".htm") {
          placeholders = extractPlaceholdersFromHtml(file.data.toString("utf-8"));
        } else {
          placeholders = extractPlaceholdersFromDocx(file.data);
        }
        const requiredColumns = placeholders;
        const type = slugify(name || file.filename || "plantilla");

        const existing = await prisma.template.findFirst({
          where: { organizationId, name, status: "active" },
        });
        if (existing) {
          return json(res, 409, { error: "template_name_exists" });
        }

        const orgDir = path.join(storagePath, "templates", organizationId);
        ensureDir(orgDir);
        const filenameSafe = `${Date.now()}-${file.filename || "plantilla.docx"}`;
        const filePath = path.join(orgDir, filenameSafe);
        fs.writeFileSync(filePath, file.data);

        const template = await prisma.template.create({
          data: {
            organizationId,
            name,
            type,
            pdfPath: filePath,
            signX: 0,
            signY: 0,
            signPage: 1,
            placeholders,
            requiredColumns,
            status: "active",
          },
        });

        return json(res, 201, {
          template: {
            ...template,
            templateUrl: toFileUrl(template.pdfPath),
            templateExt: path.extname(template.pdfPath || "").toLowerCase(),
          },
        });
      } catch (error) {
        console.error(error);
        return json(res, 500, { error: "template_upload_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/templates/") && method === "DELETE") {
    return (async () => {
      try {
        const id = pathOnly.split("/")[3];
        if (!id) return json(res, 400, { error: "missing_template_id" });
        const template = await prisma.template.findUnique({ where: { id } });
        if (!template) return json(res, 404, { error: "template_not_found" });
        const inUse = await prisma.request.findFirst({ where: { templateId: id } });
        const inBatch = await prisma.batch.findFirst({ where: { templateId: id } });
        const inGroup = await prisma.templateGroupItem.findFirst({
          where: { templateId: id, group: { status: "active" } },
        });
        if (inUse || inBatch || inGroup) {
          return json(res, 409, { error: "template_in_use" });
        }
        if (template.pdfPath && fs.existsSync(template.pdfPath)) {
          fs.rmSync(template.pdfPath, { force: true });
        }
        await prisma.template.delete({ where: { id } });
        return json(res, 200, { deleted: true });
      } catch (error) {
        return json(res, 500, { error: "template_delete_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/templates/") && method === "PATCH") {
    return (async () => {
      try {
        const id = pathOnly.split("/")[3];
        if (!id) return json(res, 400, { error: "missing_template_id" });
        const body = await readJson(req);
        const role = String(body.role || "ADMIN");
        if (role !== "ADMIN") return json(res, 403, { error: "forbidden" });
        const status = body.status === "inactive" ? "inactive" : "active";
        const template = await prisma.template.update({
          where: { id },
          data: { status },
        });
        return json(res, 200, { template });
      } catch (error) {
        return json(res, 500, { error: "template_update_failed" });
      }
    })();
  }

  if (pathOnly === "/v1/templates/excel" && method === "GET") {
    return (async () => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = query.get("organizationId");
        const role = query.get("role");
        const templateIds = parseTemplateIdsParam(query.get("templateIds"));
        if (!templateIds.length) return json(res, 400, { error: "missing_template_ids" });
        if (!organizationId && role !== "SUPER_ADMIN") {
          return json(res, 400, { error: "organization_required" });
        }
        const where = {
          id: { in: templateIds },
          status: "active",
          ...(organizationId ? { organizationId } : {}),
        };
        const templates = await prisma.template.findMany({ where, orderBy: { createdAt: "asc" } });
        if (templates.length !== templateIds.length) return json(res, 404, { error: "template_not_found" });
        const placeholders = uniquePlaceholders(templates);
        if (!placeholders.length) return json(res, 400, { error: "no_placeholders" });
        const buffer = buildExcelBuffer(placeholders);
        res.writeHead(200, {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": 'attachment; filename="plantillas_seleccionadas.xlsx"',
        });
        res.end(buffer);
      } catch (error) {
        return json(res, 500, { error: "templates_excel_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/templates/") && pathOnly.endsWith("/excel") && method === "GET") {
    return (async () => {
      try {
        const id = pathOnly.split("/")[3];
        if (!id) return json(res, 400, { error: "missing_template_id" });
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = query.get("organizationId");
        const role = query.get("role");
        if (!organizationId && role !== "SUPER_ADMIN") {
          return json(res, 400, { error: "organization_required" });
        }
        const where = organizationId ? { id, organizationId, status: "active" } : { id, status: "active" };
        const template = await prisma.template.findFirst({ where });
        if (!template) return json(res, 404, { error: "template_not_found" });
        const placeholders = Array.isArray(template.placeholders) ? template.placeholders : [];
        if (!placeholders.length) return json(res, 400, { error: "no_placeholders" });
        const excelFields = orderedExcelHeaders(placeholders);
        if (!excelFields.length) return json(res, 400, { error: "no_excel_fields" });
        const buffer = buildExcelBuffer(placeholders);
        const safeName = slugify(template.name || "plantilla") || "plantilla";
        res.writeHead(200, {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="${safeName}-carga.xlsx"`,
        });
        res.end(buffer);
      } catch (error) {
        return json(res, 500, { error: "template_excel_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/templates/") && pathOnly.endsWith("/preview.pdf") && method === "GET") {
    return (async () => {
      try {
        const id = pathOnly.split("/")[3];
        if (!id) return json(res, 400, { error: "missing_template_id" });
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = query.get("organizationId");
        const role = query.get("role");
        if (!organizationId && role !== "SUPER_ADMIN") {
          return json(res, 400, { error: "organization_required" });
        }
        const where = organizationId ? { id, organizationId, status: "active" } : { id, status: "active" };
        const template = await prisma.template.findFirst({ where });
        if (!template) return json(res, 404, { error: "template_not_found" });
        const ext = path.extname(template.pdfPath || "").toLowerCase();
        if (ext !== ".html" && ext !== ".htm") {
          return json(res, 400, { error: "template_preview_only_for_html" });
        }
        const previewDir = path.join(storagePath, "preview", template.organizationId, template.id);
        ensureDir(previewDir);
        const pdfPath = path.join(previewDir, "preview.pdf");
        await renderHtmlFileToPdf(template.pdfPath, pdfPath);
        res.writeHead(200, { "content-type": "application/pdf" });
        fs.createReadStream(pdfPath).pipe(res);
      } catch (error) {
        console.error("template_preview_failed", error);
        return json(res, 500, { error: "template_preview_failed" });
      }
    })();
  }

  if (pathOnly === "/v1/templates" && method === "GET") {
    return (async () => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = query.get("organizationId");
        const role = query.get("role");
        if (!organizationId && role !== "SUPER_ADMIN") {
          return json(res, 400, { error: "organization_required" });
        }
        const where = organizationId ? { organizationId } : {};
        const templates = await prisma.template.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });
        const items = templates.map((template) => ({
          ...template,
          templateUrl: toFileUrl(template.pdfPath),
          templateExt: path.extname(template.pdfPath || "").toLowerCase(),
        }));
        return json(res, 200, { items });
      } catch (error) {
        return json(res, 500, { error: "templates_failed" });
      }
    })();
  }

  if (url === "/v1/batch-groups/start" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const organizationId = String(body.organizationId || "");
        const groupId = String(body.groupId || "");
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (!organizationId || !groupId || !rows.length) {
          return json(res, 400, { error: "missing_batch_payload" });
        }

        const group = await prisma.templateGroup.findFirst({
          where: { id: groupId, organizationId, status: "active" },
          include: { items: { include: { template: true }, orderBy: { order: "asc" } } },
        });
        if (!group) return json(res, 404, { error: "group_not_found" });
        if (group.items.length > 4) return json(res, 400, { error: "group_too_large" });

        const placeholders = Array.from(
          new Set(
            group.items.flatMap((item) => (Array.isArray(item.template?.placeholders) ? item.template.placeholders : []))
          )
        );
        const columns = Array.isArray(body.columns) ? body.columns.map((c) => String(c).trim()) : Object.keys(rows[0] || {});
        const missing = placeholders.filter((ph) => !columns.includes(ph));
        if (missing.length) {
          return json(res, 400, { error: "missing_placeholders", missing });
        }

        const batchGroup = await prisma.batchGroup.create({
          data: {
            organizationId,
            groupId,
            status: "PENDING",
            totalCount: rows.length,
            validCount: rows.length,
            invalidCount: 0,
            mapping: body.mapping || null,
          },
        });

        const batchDir = path.join(storagePath, "batch-groups", organizationId, batchGroup.id);
        ensureDir(batchDir);
        fs.writeFileSync(path.join(batchDir, "input.json"), JSON.stringify({ columns, rows }, null, 2));

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex];
          const requestGroup = await prisma.requestGroup.create({
            data: {
              batchGroupId: batchGroup.id,
              rowIndex,
              status: "PENDING",
            },
          });

          for (const item of group.items) {
            const template = item.template;
            const placeholdersForTemplate = Array.isArray(template.placeholders) ? template.placeholders : [];
            const signatories = buildSignatoriesForTemplate(placeholdersForTemplate, row);
            const requestData = {
              organizationId,
              templateId: template.id,
              requestGroupId: requestGroup.id,
              status: "PENDING",
            };
            if (signatories.length) {
              requestData.signatories = { create: signatories };
            }
            await prisma.request.create({ data: requestData });
          }
        }

        return json(res, 201, { batchId: batchGroup.id, total: rows.length });
      } catch (error) {
        console.error(error);
        return json(res, 500, { error: "batch_group_start_failed" });
      }
    })();
  }

  if (pathOnly === "/v1/batch-groups" && method === "GET") {
    return (async () => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = query.get("organizationId");
        const status = query.get("status");
        const where = {};
        if (organizationId) where.organizationId = organizationId;
        if (status) where.status = status;
        const items = await prisma.batchGroup.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });
        return json(res, 200, { items });
      } catch (error) {
        return json(res, 500, { error: "batch_groups_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batch-groups/") && method === "GET" && !pathOnly.endsWith("/download") && !pathOnly.endsWith("/requests-detail") && !pathOnly.endsWith("/process")) {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        if (!batchId) return json(res, 400, { error: "missing_batch_id" });
        const batch = await prisma.batchGroup.findUnique({
          where: { id: batchId },
          select: { id: true, status: true, totalCount: true, validCount: true, invalidCount: true, updatedAt: true },
        });
        if (!batch) return json(res, 404, { error: "batch_not_found" });
        return json(res, 200, { batch });
      } catch (error) {
        return json(res, 500, { error: "batch_group_detail_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batch-groups/") && pathOnly.endsWith("/download") && method === "GET") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const type = query.get("type");
        if (!batchId || !type) return json(res, 400, { error: "missing_download_fields" });
        const batch = await prisma.batchGroup.findUnique({ where: { id: batchId } });
        if (!batch) return json(res, 404, { error: "batch_not_found" });
        const filePath = type === "pdf" ? batch.pdfZipPath : batch.docxZipPath;
        if (!filePath || !fs.existsSync(filePath)) return json(res, 404, { error: "file_not_found" });
        res.writeHead(200, { "content-type": "application/zip" });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        return json(res, 500, { error: "batch_group_download_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/batch-groups/") && pathOnly.endsWith("/requests-detail") && method === "GET") {
    return (async () => {
      try {
        const batchId = pathOnly.split("/")[3];
        if (!batchId) return json(res, 400, { error: "missing_batch_id" });
        const batch = await prisma.batchGroup.findUnique({
          where: { id: batchId },
          include: {
            requestGroups: {
              include: { requests: { include: { template: true } } },
              orderBy: { rowIndex: "asc" },
            },
          },
        });
        if (!batch) return json(res, 404, { error: "batch_not_found" });
        const batchDir = path.join(storagePath, "batch-groups", batch.organizationId, batch.id);
        const inputPath = path.join(batchDir, "input.json");
        const input = fs.existsSync(inputPath) ? JSON.parse(fs.readFileSync(inputPath, "utf-8")) : {};
        const rows = Array.isArray(input.rows) ? input.rows : [];
        const items = batch.requestGroups.map((group) => ({
          index: group.rowIndex,
          row: rows[group.rowIndex] || {},
          requests: group.requests.map((reqItem) => ({
            id: reqItem.id,
            status: reqItem.status,
            templateName: reqItem.template?.name || "Plantilla",
            pdfUrl: toFileUrl(reqItem.pdfPath),
            docxUrl: toFileUrl(reqItem.docxPath),
          })),
        }));
        return json(res, 200, { items });
      } catch (error) {
        return json(res, 500, { error: "batch_group_requests_detail_failed" });
      }
    })();
  }

  if (url === "/v1/template-groups" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const organizationId = String(body.organizationId || "");
        const role = String(body.role || "ADMIN");
        const name = String(body.name || "").trim();
        if (!organizationId || !name) return json(res, 400, { error: "missing_fields" });
        if (role !== "ADMIN") return json(res, 403, { error: "forbidden" });

        const rawItems = Array.isArray(body.items) ? body.items : [];
        const templateIds = Array.isArray(body.templateIds) ? body.templateIds : [];
        const items = rawItems.length
          ? rawItems
          : templateIds.map((templateId, index) => ({ templateId, order: index }));
        if (!items.length) return json(res, 400, { error: "missing_templates" });
        if (items.length > 4) return json(res, 400, { error: "group_too_large" });

        const ids = items.map((item) => String(item.templateId || "")).filter(Boolean);
        const uniqueIds = Array.from(new Set(ids));
        if (uniqueIds.length !== ids.length) {
          return json(res, 400, { error: "duplicate_templates" });
        }

        const templates = await prisma.template.findMany({
          where: { id: { in: uniqueIds }, organizationId, status: "active" },
        });
        if (templates.length !== uniqueIds.length) {
          return json(res, 400, { error: "template_not_found" });
        }

        const group = await prisma.templateGroup.create({
          data: {
            organizationId,
            name,
            status: "active",
            items: {
              create: items.map((item, index) => ({
                templateId: String(item.templateId),
                order: Number(item.order ?? index) || 0,
              })),
            },
          },
          include: {
            items: { include: { template: true }, orderBy: { order: "asc" } },
          },
        });

        return json(res, 201, { group });
      } catch (error) {
        return json(res, 500, { error: "template_group_create_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/template-groups/") && method === "DELETE") {
    return (async () => {
      try {
        const id = pathOnly.split("/")[3];
        if (!id) return json(res, 400, { error: "missing_group_id" });
        const group = await prisma.templateGroup.findUnique({ where: { id } });
        if (!group) return json(res, 404, { error: "group_not_found" });
        const inUse = await prisma.batchGroup.findFirst({ where: { groupId: id } });
        if (inUse) return json(res, 409, { error: "group_in_use" });
        await prisma.templateGroup.update({
          where: { id },
          data: { status: "inactive" },
        });
        return json(res, 200, { deleted: true });
      } catch (error) {
        return json(res, 500, { error: "template_group_delete_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/template-groups/") && method === "PATCH") {
    return (async () => {
      try {
        const id = pathOnly.split("/")[3];
        if (!id) return json(res, 400, { error: "missing_group_id" });
        const body = await readJson(req);
        const role = String(body.role || "ADMIN");
        if (role !== "ADMIN") return json(res, 403, { error: "forbidden" });
        const name = body.name ? String(body.name).trim() : "";
        const rawItems = Array.isArray(body.items) ? body.items : [];
        if (!rawItems.length && !name) {
          return json(res, 400, { error: "missing_fields" });
        }

        const group = await prisma.templateGroup.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!group) return json(res, 404, { error: "group_not_found" });

        if (rawItems.length) {
          if (rawItems.length > 4) return json(res, 400, { error: "group_too_large" });
          const ids = rawItems.map((item) => String(item.templateId || "")).filter(Boolean);
          const uniqueIds = Array.from(new Set(ids));
          if (uniqueIds.length !== ids.length) {
            return json(res, 400, { error: "duplicate_templates" });
          }
          const templates = await prisma.template.findMany({
            where: { id: { in: uniqueIds }, organizationId: group.organizationId, status: "active" },
          });
          if (templates.length !== uniqueIds.length) {
            return json(res, 400, { error: "template_not_found" });
          }

          await prisma.templateGroupItem.deleteMany({ where: { groupId: id } });
          await prisma.templateGroupItem.createMany({
            data: rawItems.map((item, index) => ({
              groupId: id,
              templateId: String(item.templateId),
              order: Number(item.order ?? index) || 0,
            })),
          });
        }

        const data = {};
        if (name) data.name = name;
        const updated = await prisma.templateGroup.update({
          where: { id },
          data,
          include: {
            items: { include: { template: true }, orderBy: { order: "asc" } },
          },
        });

        return json(res, 200, { group: updated });
      } catch (error) {
        return json(res, 500, { error: "template_group_update_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/template-groups/") && pathOnly.endsWith("/excel") && method === "GET") {
    return (async () => {
      try {
        const id = pathOnly.split("/")[3];
        if (!id) return json(res, 400, { error: "missing_group_id" });
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = query.get("organizationId");
        const role = query.get("role");
        if (!organizationId && role !== "SUPER_ADMIN") {
          return json(res, 400, { error: "organization_required" });
        }
        const where = organizationId ? { id, organizationId, status: "active" } : { id, status: "active" };
        const group = await prisma.templateGroup.findFirst({
          where,
          include: { items: { include: { template: true }, orderBy: { order: "asc" } } },
        });
        if (!group) return json(res, 404, { error: "group_not_found" });
        const seen = new Set();
        const placeholders = [];
        for (const item of group.items || []) {
          const list = Array.isArray(item.template?.placeholders) ? item.template.placeholders : [];
          for (const ph of list) {
            if (seen.has(ph)) continue;
            seen.add(ph);
            placeholders.push(ph);
          }
        }
        if (!placeholders.length) return json(res, 400, { error: "no_placeholders" });
        const buffer = buildExcelBuffer(placeholders);
        const safeName = slugify(group.name || "grupo") || "grupo";
        res.writeHead(200, {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="${safeName}-carga.xlsx"`,
        });
        res.end(buffer);
      } catch (error) {
        return json(res, 500, { error: "group_excel_failed" });
      }
    })();
  }

  if (pathOnly === "/v1/template-groups" && method === "GET") {
    return (async () => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = query.get("organizationId");
        const role = query.get("role");
        if (!organizationId && role !== "SUPER_ADMIN") {
          return json(res, 400, { error: "organization_required" });
        }
        const where = organizationId ? { organizationId } : {};
        const groups = await prisma.templateGroup.findMany({
          where,
          orderBy: { createdAt: "desc" },
          include: {
            items: {
              include: { template: true },
              orderBy: { order: "asc" },
            },
          },
        });
        return json(res, 200, { items: groups });
      } catch (error) {
        return json(res, 500, { error: "template_groups_failed" });
      }
    })();
  }

  if (pathOnly === "/v1/rc-validations/run" && method === "POST") {
    return (async () => {
      try {
        const contentType = req.headers["content-type"] || "";
        if (!contentType.includes("multipart/form-data")) {
          return json(res, 400, { error: "expected_multipart" });
        }
        const boundaryMatch = /boundary=(.+)$/.exec(contentType);
        if (!boundaryMatch) return json(res, 400, { error: "missing_boundary" });

        const buffer = await readBuffer(req);
        const { fields, files } = parseMultipart(buffer, boundaryMatch[1]);
        const organizationId = String(fields.organizationId || "").trim();
        const file = files.find((item) => item.name === "excel");
        if (!organizationId || !file) {
          return json(res, 400, { error: "missing_fields" });
        }

        const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
        if (!organization) return json(res, 404, { error: "organization_not_found" });

        const run = await buildRcValidationRun({
          workbookBuffer: file.data,
          filename: file.filename || "archivo.xlsx",
        });

        const runId = crypto.randomUUID();
        const runDir = path.join(storagePath, "rc-validations", organizationId, runId);
        ensureDir(runDir);

        const sourceExtension = path.extname(file.filename || ".xlsx") || ".xlsx";
        const sourcePath = path.join(runDir, `original${sourceExtension}`);
        const correctedPath = path.join(runDir, `${path.parse(file.filename || "archivo").name}_validado.xlsx`);
        const summaryPath = path.join(runDir, "summary.json");

        fs.writeFileSync(sourcePath, file.data);
        fs.writeFileSync(correctedPath, run.correctedBuffer);
        fs.writeFileSync(
          summaryPath,
          JSON.stringify(
            {
              id: runId,
              organizationId,
              sourceFileName: run.sourceFileName,
              createdAt: new Date().toISOString(),
              detectedColumns: run.detectedColumns,
              summary: run.summary,
              results: run.results,
              correctedFileName: path.basename(correctedPath),
            },
            null,
            2
          )
        );

        return json(res, 201, {
          run: {
            id: runId,
            organizationId,
            sourceFileName: run.sourceFileName,
            createdAt: new Date().toISOString(),
            detectedColumns: run.detectedColumns,
            summary: run.summary,
            correctedFileName: path.basename(correctedPath),
            downloadUrl: `/v1/rc-validations/${encodeURIComponent(runId)}/download?organizationId=${encodeURIComponent(organizationId)}`,
          },
          items: run.results,
        });
      } catch (error) {
        console.error(error);
        return json(res, 500, { error: "rc_validation_run_failed", detail: String(error?.message || error) });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/rc-validations/") && pathOnly.endsWith("/download") && method === "GET") {
    return (async () => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = String(query.get("organizationId") || "").trim();
        const runId = pathOnly.split("/")[3];
        if (!organizationId || !runId) return json(res, 400, { error: "missing_fields" });

        const runDir = path.join(storagePath, "rc-validations", organizationId, runId);
        const summaryPath = path.join(runDir, "summary.json");
        if (!fs.existsSync(summaryPath)) return json(res, 404, { error: "rc_validation_not_found" });
        const summary = safeJsonParse(fs.readFileSync(summaryPath, "utf-8"), null);
        const correctedFileName = String(summary?.correctedFileName || "").trim();
        if (!correctedFileName) return json(res, 404, { error: "validated_file_not_found" });
        const filePath = path.join(runDir, correctedFileName);
        if (!fs.existsSync(filePath)) return json(res, 404, { error: "validated_file_not_found" });

        res.writeHead(200, {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="${path.basename(filePath)}"`,
        });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        console.error(error);
        return json(res, 500, { error: "rc_validation_download_failed" });
      }
    })();
  }

  if (pathOnly.startsWith("/v1/rc-validations/") && method === "GET") {
    return (async () => {
      try {
        const query = new URL(url, `http://${req.headers.host || "localhost"}`).searchParams;
        const organizationId = String(query.get("organizationId") || "").trim();
        const runId = pathOnly.split("/")[3];
        if (!organizationId || !runId) return json(res, 400, { error: "missing_fields" });

        const summaryPath = path.join(storagePath, "rc-validations", organizationId, runId, "summary.json");
        if (!fs.existsSync(summaryPath)) return json(res, 404, { error: "rc_validation_not_found" });
        const payload = safeJsonParse(fs.readFileSync(summaryPath, "utf-8"), null);
        if (!payload) return json(res, 500, { error: "rc_validation_read_failed" });
        return json(res, 200, {
          run: {
            id: payload.id,
            organizationId: payload.organizationId,
            sourceFileName: payload.sourceFileName,
            createdAt: payload.createdAt,
            detectedColumns: payload.detectedColumns,
            summary: payload.summary,
            correctedFileName: payload.correctedFileName,
            downloadUrl: `/v1/rc-validations/${encodeURIComponent(runId)}/download?organizationId=${encodeURIComponent(organizationId)}`,
          },
          items: Array.isArray(payload.results) ? payload.results : [],
        });
      } catch (error) {
        console.error(error);
        return json(res, 500, { error: "rc_validation_fetch_failed" });
      }
    })();
  }

  if (url === "/v1/uploads/excel" && method === "POST") {
    return json(res, 202, { status: "queued", message: "not_implemented" });
  }

  return json(res, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`API listening on :${port}`);
});
