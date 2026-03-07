// Minimal HTTP API skeleton for the MVP
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import AdmZip from "adm-zip";

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
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
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

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const method = req.method || "GET";

  setCors(res);
  if (method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (url === "/health") {
    return json(res, 200, { status: "ok" });
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

  if (url === "/v1/users" && method === "POST") {
    return (async () => {
      try {
        const body = await readJson(req);
        const email = String(body.email || "").toLowerCase().trim();
        const role = String(body.role || "ADMIN");
        const organizationId = body.organizationId || null;
        const password = String(body.password || "ChristianReinaldo");

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

  if (url.startsWith("/v1/templates") && method === "GET") {
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
        const name = fields.name || "Plantilla";
        const file = files.find((f) => f.name === "file");

        if (!organizationId || !file) {
          return json(res, 400, { error: "missing_fields" });
        }
        if (role !== "ADMIN") {
          return json(res, 403, { error: "forbidden" });
        }

        const placeholders = extractPlaceholdersFromDocx(file.data);
        const requiredColumns = placeholders;
        const type = slugify(name || file.filename || "plantilla");

        const orgDir = path.join(storagePath, "templates", organizationId);
        ensureDir(orgDir);
        const filename = `${Date.now()}-${file.filename || "plantilla.docx"}`;
        const filePath = path.join(orgDir, filename);
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

  if (url === "/v1/uploads/excel" && method === "POST") {
    return json(res, 202, { status: "queued", message: "not_implemented" });
  }

  return json(res, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`API listening on :${port}`);
});
