// Minimal HTTP API skeleton for the MVP
import http from "node:http";

const port = process.env.PORT || 8080;

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const method = req.method || "GET";

  if (url === "/health") {
    return json(res, 200, { status: "ok" });
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
