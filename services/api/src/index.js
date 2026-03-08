// Minimal HTTP API skeleton for the MVP
import http from "node:http";
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

function safeResolvePath(baseDir, targetPath) {
  const resolved = path.resolve(baseDir, targetPath);
  if (!resolved.startsWith(baseDir)) {
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
  return "application/octet-stream";
}

function sanitizePhone(value) {
  return String(value || "").replace(/[^0-9]+/g, "");
}

function buildExcelBuffer(headers) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.book_append_sheet(workbook, sheet, "plantilla");
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

function buildPrefixedSignatory(row, prefix) {
  const idNumber = pickRowValue(row, [`${prefix}cedula`, `${prefix}id`, `${prefix}documento`]);
  const firstName = pickRowValue(row, [`${prefix}nombre`]);
  const lastName = pickRowValue(row, [`${prefix}apellido`]);
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || pickRowValue(row, [`${prefix}nombre_completo`]);
  const email = pickRowValue(row, [`${prefix}email`, `${prefix}correo`]);
  const phone = pickRowValue(row, [`${prefix}celular`, `${prefix}telefono`]);
  const sanitizedPhone = sanitizePhone(phone);
  if (!idNumber && !fullName && !email && !phone) return null;
  return { idNumber, fullName, phone, email, sanitizedPhone };
}

function buildSignatoriesForTemplate(placeholders, row) {
  const list = [];
  const hasPersona1 = placeholders.some((p) => p.startsWith("persona1_"));
  const hasPersona2 = placeholders.some((p) => p.startsWith("persona2_"));

  if (hasPersona1 || hasPersona2) {
    if (hasPersona1) {
      const signer1 = buildPrefixedSignatory(row, "persona1_");
      if (signer1) list.push(signer1);
    }
    if (hasPersona2) {
      const signer2 = buildPrefixedSignatory(row, "persona2_");
      if (signer2) list.push(signer2);
    }
  }

  if (list.length) return list;

  const idNumber = pickRowValue(row, ["id_number", "idNumber", "cedula_representante", "cedula", "cedula_estudiante"]);
  const fullName = pickRowValue(row, ["full_name", "fullName", "representante", "nombre_estudiante"]);
  const email = pickRowValue(row, ["email", "correo", "parent_email"]);
  const phone = pickRowValue(row, ["phone", "celular", "parent_phone"]);
  const sanitizedPhone = sanitizePhone(phone);
  if (!idNumber && !fullName && !email && !phone) return [];
  return [{ idNumber, fullName, phone, email, sanitizedPhone }];
}

async function processBatch(batchId) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) return;
  if (batch.status === "PROCESSING") return;

  await prisma.batch.update({
    where: { id: batch.id },
    data: { status: "PROCESSING" },
  });

  const template = await prisma.template.findUnique({ where: { id: batch.templateId } });
  if (!template) {
    await prisma.batch.update({ where: { id: batch.id }, data: { status: "ERROR" } });
    return;
  }

  const batchDir = path.join(storagePath, "batches", batch.organizationId, batch.id);
  const inputPath = path.join(batchDir, "input.json");
  if (!fs.existsSync(inputPath)) {
    await prisma.batch.update({ where: { id: batch.id }, data: { status: "ERROR" } });
    return;
  }
  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const requests = await prisma.request.findMany({
    where: { batchId: batch.id },
    orderBy: { createdAt: "asc" },
  });

  const docxDir = path.join(batchDir, "docx");
  const htmlDir = path.join(batchDir, "html");
  const pdfDir = path.join(batchDir, "pdf");
  ensureDir(docxDir);
  ensureDir(htmlDir);
  ensureDir(pdfDir);

  const total = Math.min(rows.length, requests.length);
  for (let i = 0; i < total; i += 1) {
    const row = rows[i];
    const request = requests[i];
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
  }

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
    for (const file of pdfFiles) {
      const inputPath = path.join(pdfDir, file);
      const outputPath = path.join(optimizedDir, file);
      try {
        await optimizePdf(inputPath, outputPath);
      } catch (error) {
        console.error(`Ghostscript failed for ${file}:`, error);
        fs.copyFileSync(inputPath, outputPath);
      }
    }
    pdfZip.addLocalFolder(optimizedDir);
    pdfZip.writeZip(pdfZipPath);
  }

  for (const request of requests) {
    const optimizedPath = path.join(optimizedDir, `${request.id}.pdf`);
    const pdfPath = path.join(pdfDir, `${request.id}.pdf`);
    const finalPath = fs.existsSync(optimizedPath) ? optimizedPath : fs.existsSync(pdfPath) ? pdfPath : null;
    if (finalPath) {
      await prisma.request.update({
        where: { id: request.id },
        data: { pdfPath: finalPath },
      });
      }
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
  if (batchGroup.status === "PROCESSING") return;

  await prisma.batchGroup.update({
    where: { id: batchGroup.id },
    data: { status: "PROCESSING" },
  });

  const items = batchGroup.group?.items || [];
  if (!items.length) {
    await prisma.batchGroup.update({ where: { id: batchGroup.id }, data: { status: "ERROR" } });
    return;
  }

  const batchDir = path.join(storagePath, "batch-groups", batchGroup.organizationId, batchGroup.id);
  const inputPath = path.join(batchDir, "input.json");
  if (!fs.existsSync(inputPath)) {
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

  const docxDir = path.join(batchDir, "docx");
  const htmlDir = path.join(batchDir, "html");
  const pdfDir = path.join(batchDir, "pdf");
  ensureDir(docxDir);
  ensureDir(htmlDir);
  ensureDir(pdfDir);

  const templateMap = new Map(items.map((item) => [item.templateId, item.template]));

  for (const groupRow of requestGroups) {
    const row = rows[groupRow.rowIndex] || {};
    for (const request of groupRow.requests) {
      const template = templateMap.get(request.templateId);
      if (!template) continue;
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
    }
  }

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
    for (const file of pdfFiles) {
      const inputPath = path.join(pdfDir, file);
      const outputPath = path.join(optimizedDir, file);
      try {
        await optimizePdf(inputPath, outputPath);
      } catch (error) {
        console.error(`Ghostscript failed for ${file}:`, error);
        fs.copyFileSync(inputPath, outputPath);
      }
    }
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
    if (finalPath) {
      await prisma.request.update({
        where: { id: request.id },
        data: { pdfPath: finalPath },
      });
    }
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

  setCors(res);
  if (method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (url === "/health") {
    return json(res, 200, { status: "ok" });
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
        if (batch.status !== "PENDING") {
          return json(res, 409, { error: "batch_not_pending" });
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
          select: { id: true, pdfPath: true, docxPath: true },
        });
        const items = requests.map((reqItem, index) => ({
          index,
          row: rows[index] || {},
          request: {
            id: reqItem.id,
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
        if (batch.status !== "PENDING") {
          return json(res, 409, { error: "batch_not_pending" });
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
        const templateId = String(body.templateId || "");
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (!organizationId || !templateId || !rows.length) {
          return json(res, 400, { error: "missing_batch_payload" });
        }
        const template = await prisma.template.findFirst({ where: { id: templateId, status: "active" } });
        if (!template) return json(res, 404, { error: "template_not_found" });
        const placeholders = Array.isArray(template.placeholders) ? template.placeholders : [];
        const columns = Array.isArray(body.columns) ? body.columns.map((c) => String(c).trim()) : Object.keys(rows[0] || {});
        const missing = placeholders.filter((ph) => !columns.includes(ph));
        if (missing.length) {
          return json(res, 400, { error: "missing_placeholders", missing });
        }

        const batch = await prisma.batch.create({
          data: {
            organizationId,
            templateId,
            status: "PENDING",
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
            status: "PENDING",
            ...(signatories.length ? { signatories: { create: signatories } } : {}),
          });
        }

        for (const data of requestCreates) {
          await prisma.request.create({ data });
        }

        return json(res, 201, { batchId: batch.id, total: rows.length });
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

        return json(res, 201, { template });
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
        const inGroup = await prisma.templateGroupItem.findFirst({ where: { templateId: id } });
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
        return json(res, 200, { items: templates });
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

  if (url === "/v1/uploads/excel" && method === "POST") {
    return json(res, 202, { status: "queued", message: "not_implemented" });
  }

  return json(res, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`API listening on :${port}`);
});
