// Minimal HTTP API skeleton for the MVP
import http from "node:http";
import { PrismaClient } from "@prisma/client";

const port = process.env.PORT || 8080;
const corsOrigin = process.env.CORS_ORIGIN || "*";
const prisma = new PrismaClient();

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

function setCors(res) {
  res.setHeader("access-control-allow-origin", corsOrigin);
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
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

  if (url === "/v1/uploads/excel" && method === "POST") {
    return json(res, 202, { status: "queued", message: "not_implemented" });
  }

  return json(res, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`API listening on :${port}`);
});
