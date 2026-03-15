import fs from "node:fs";
import path from "node:path";

function decodeEnvBase64(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return Buffer.from(raw, "base64").toString("utf-8").trim();
  } catch {
    return "";
  }
}

function resolvePassword() {
  return (
    decodeEnvBase64(process.env.OMNISWITCH_PASSWORD_B64 || process.env.FIRMALO_PASSWORD_B64) ||
    String(process.env.OMNISWITCH_PASSWORD || process.env.FIRMALO_PASSWORD || "").trim()
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function toJson(value) {
  return JSON.stringify(value, null, 2);
}

async function proxyPost(baseUrl, endpoint, payload) {
  console.log(`\n==> ${endpoint} (Proxy)`);
  console.log(toJson(payload));

  const response = await fetch(`${baseUrl}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  const raw = await response.text();
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = { raw };
  }

  console.log(`<== ${endpoint} [HTTP ${response.status}]`);
  console.log(toJson(parsed));

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} en ${endpoint}`);
    error.payload = parsed;
    throw error;
  }
  
  // For QueryRC specifically, we expect resultCode to be "0" for success.
  if (parsed && typeof parsed === "object" && Object.prototype.hasOwnProperty.call(parsed, "resultCode")) {
    const resultCode = String(parsed.resultCode);
    if (resultCode !== "0") {
      const error = new Error(parsed.resultText || `Provider error on ${endpoint}`);
      error.payload = parsed;
      throw error;
    }
  }
  
  return parsed;
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.log([
    "Uso:",
    "  npm run omni:rc-debug <cedula> [codigo_dactilar] [email] [celular]",
    "",
    "Ejemplo basico (solo cedula, consulta demografica):",
    "  npm run omni:rc-debug 1712730132",
    "",
    "Ejemplo avanzado (biometria y validacion de email/celular):",
    "  npm run omni:rc-debug 1712730132 V5432I christian19782013@gmail.com 0969019242"
  ].join("\n"));
  process.exit(1);
}

const cedula = args[0];
const codigoDactilar = args[1] || "";
const email = args[2] || "";
const celular = args[3] || "";

const apiUrl = String(
  process.env.PROXY_API_URL || "https://firma.da-tica.com/v1"
)
  .trim()
  .replace(/\/+$/, "");

const payload = {
  Cedula: cedula,
};

if (codigoDactilar) payload.CodigoDactilar = codigoDactilar;
if (email) payload.Email = email;
if (celular) payload.Celular = celular;

console.log("Configuracion usada:");
console.log(
  toJson({
    proxyUrl: apiUrl,
    payload,
  })
);

try {
  await proxyPost(apiUrl, "test/query-rc", payload);
  console.log("\nConsulta QueryRC (Proxy) completada.");
} catch (error) {
  console.error("\nFallo en consulta QueryRC via Proxy.");
  console.error(error.message);
  if (error?.payload) {
    console.error(toJson(error.payload));
  }
  process.exit(1);
}
