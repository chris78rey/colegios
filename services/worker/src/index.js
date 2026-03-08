import http from "node:http";

const port = process.env.PORT || 8081;
const apiBase = process.env.API_BASE_URL || "http://api:8080";

async function processPendingBatches() {
  try {
    const res = await fetch(`${apiBase}/v1/batches?status=PENDING`);
    const data = await res.json();
    if (!res.ok || !data.items) return;
    for (const batch of data.items) {
      try {
        await fetch(`${apiBase}/v1/batches/${batch.id}/process`, { method: "POST" });
      } catch (error) {
        console.error("Batch process error:", error);
      }
    }
  } catch (error) {
    console.error("Batch poll error:", error);
  }
}

async function processPendingBatchGroups() {
  try {
    const res = await fetch(`${apiBase}/v1/batch-groups?status=PENDING`);
    const data = await res.json();
    if (!res.ok || !data.items) return;
    for (const batch of data.items) {
      try {
        await fetch(`${apiBase}/v1/batch-groups/${batch.id}/process`, { method: "POST" });
      } catch (error) {
        console.error("Batch group process error:", error);
      }
    }
  } catch (error) {
    console.error("Batch group poll error:", error);
  }
}

setInterval(processPendingBatches, 10000);
setInterval(processPendingBatchGroups, 10000);
processPendingBatches();
processPendingBatchGroups();

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
