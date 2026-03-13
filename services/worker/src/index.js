import http from "node:http";

const port = process.env.PORT || 8081;
const apiBase = process.env.API_BASE_URL || "http://api:8080";
const omniSwitchMode = String(process.env.OMNISWITCH_MODE || "mock").trim().toLowerCase();

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
  if (omniSwitchMode !== "mock") return;
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
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
  console.log(`Worker listening on :${port}`);
});
