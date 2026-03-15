import http from "node:http";
import crypto from "node:crypto";

const port = process.env.PORT || 8081;
const apiBase = process.env.API_BASE_URL || "http://api:8080";
const serviceVersion = process.env.APP_VERSION || "dev";

async function processPendingBatches() {
  try {
    for (const status of ["QUEUED", "PENDING"]) {
      const res = await fetch(`${apiBase}/v1/batches?status=${status}`);
      const data = await res.json();
      if (!res.ok || !data.items) continue;
      for (const batch of data.items) {
        try {
          await fetch(`${apiBase}/v1/batches/${batch.id}/process`, { method: "POST" });
        } catch (error) {
          console.error("Batch process error:", error);
        }
      }
    }
  } catch (error) {
    console.error("Batch poll error:", error);
  }
}

async function processPendingBatchGroups() {
  try {
    for (const status of ["QUEUED", "PENDING"]) {
      const res = await fetch(`${apiBase}/v1/batch-groups?status=${status}`);
      const data = await res.json();
      if (!res.ok || !data.items) continue;
      for (const batch of data.items) {
        try {
          await fetch(`${apiBase}/v1/batch-groups/${batch.id}/process`, { method: "POST" });
        } catch (error) {
          console.error("Batch group process error:", error);
        }
      }
    }
  } catch (error) {
    console.error("Batch group poll error:", error);
  }
}

async function processPendingOmniRequests() {
  try {
    const res = await fetch(`${apiBase}/v1/omni-requests`);
    const data = await res.json();
    if (!res.ok || !Array.isArray(data.items)) return;
    for (const item of data.items) {
      if (!["SENT", "PARTIALLY_SIGNED"].includes(String(item.status || "").toUpperCase())) continue;
      try {
        await fetch(`${apiBase}/v1/omni-requests/${item.id}/poll`, { method: "POST" });
      } catch (error) {
        console.error("Omni request poll error:", error);
      }
    }
  } catch (error) {
    console.error("Omni requests sweep error:", error);
  }
}

setInterval(() => {
  processPendingBatches();
  processPendingBatchGroups();
  processPendingOmniRequests();
}, 3000);
processPendingBatches();
processPendingBatchGroups();
processPendingOmniRequests();

const server = http.createServer((req, res) => {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("x-request-id", requestId);

  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url === "/ready") {
    fetch(`${apiBase}/health`)
      .then((readyRes) => {
        if (!readyRes.ok) throw new Error("api_not_ready");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ready", checks: { api: "ok" } }));
      })
      .catch(() => {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "not_ready", checks: { api: "down" } }));
      });
    return;
  }

  if (req.url === "/version") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        service: "worker",
        version: serviceVersion,
        env: process.env.NODE_ENV || "unknown",
        now: new Date().toISOString(),
      })
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
  console.log(`Worker listening on :${port}`);
});
