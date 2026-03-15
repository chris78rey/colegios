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

function encodePdfBase64(filePath) {
  return fs.readFileSync(filePath).toString("base64");
}

async function omniPost(baseUrl, endpoint, auth, payload) {
  const requestPayload = {
    ...auth,
    ...payload,
  };
  console.log(`\n==> ${endpoint}`);
  console.log(
    toJson({
      ...payload,
      DocumentoBase64: payload.DocumentoBase64 ? `[base64:${payload.DocumentoBase64.length} chars]` : undefined,
    })
  );

  const response = await fetch(`${baseUrl}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestPayload),
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
    const error = new Error(`HTTP ${response.status} on ${endpoint}`);
    error.payload = parsed;
    throw error;
  }
  if (parsed && typeof parsed === "object" && Object.prototype.hasOwnProperty.call(parsed, "resultCode")) {
    const resultCode = Number(parsed.resultCode);
    if (Number.isFinite(resultCode) && resultCode !== 0) {
      const error = new Error(parsed.resultText || `Provider error on ${endpoint}`);
      error.payload = parsed;
      throw error;
    }
  }
  return parsed;
}

const args = process.argv.slice(2);
if (args.length < 2) {
  fail(
    [
      "Uso:",
      "  node services/api/scripts/omni-send-debug.mjs <pdf1> <pdf2>",
      "",
      "Ejemplo:",
      "  node services/api/scripts/omni-send-debug.mjs \"G:\\\\ruta\\\\preview.pdf\" \"G:\\\\ruta\\\\Sin titulo 7.pdf\"",
    ].join("\n")
  );
}

const pdfPaths = args.slice(0, 2).map((input) => path.resolve(input));
for (const pdfPath of pdfPaths) {
  if (!fs.existsSync(pdfPath)) {
    fail(`No existe el PDF: ${pdfPath}`);
  }
}

const apiUrl = String(
  process.env.OMNISWITCH_API_URL || process.env.FIRMALO_URL_BASE || "https://wsrest.firmalo.ai/api/v1"
)
  .trim()
  .replace(/\/+$/, "");
const user = String(process.env.OMNISWITCH_USER || process.env.FIRMALO_USER || "").trim();
const password = resolvePassword();

if (!user) fail("Falta OMNISWITCH_USER o FIRMALO_USER");
if (!password) fail("Falta OMNISWITCH_PASSWORD/FIRMALO_PASSWORD o su variante *_B64");

const auth = {
  UserName: user,
  Password: password,
};

const signer = {
  Cedula: "1712730132",
  PrimerNombre: "CHRISTIAN",
  SegunNombre: "REINALDO",
  PrimerApellido: "RUIZ",
  SegApellido: "BUITRON",
  Celular: "0969019242",
  Email: "christian19782013@gmail.com",
  Direccion: "San Fernando",
  IdPais: 19,
  IdProvincia: 17,
  IdCiudad: 1701,
  FirmaPrincipal: 1,
};

const createPayload = {
  IdProcess: Number(process.env.OMNISWITCH_DEBUG_PROCESS_ID || 10),
  PaymentRequired: Number(process.env.OMNISWITCH_DEBUG_PAYMENT_REQUIRED || 1),
  amount: String(process.env.OMNISWITCH_DEBUG_AMOUNT || "1"),
  BiometricRequired: String(process.env.OMNISWITCH_DEBUG_BIOMETRIC_REQUIRED || "1"),
};

console.log("Configuracion usada:");
console.log(
  toJson({
    apiUrl,
    user,
    passwordLength: password.length,
    pdfPaths,
    createPayload,
    signer,
  })
);

try {
  const created = await omniPost(apiUrl, "SolicitudeCreate", auth, createPayload);
  const idSolicitud = String(created.IdSolicitud || created.IDSolicitud || "").trim();
  if (!idSolicitud) fail("No llego IdSolicitud en SolicitudeCreate");

  for (let index = 0; index < pdfPaths.length; index += 1) {
    const pdfPath = pdfPaths[index];
    await omniPost(apiUrl, "SolicitudeCreateDocument", auth, {
      IDSolicitud: Number(idSolicitud),
      NombreDocumento: path.basename(pdfPath),
      DocumentoBase64: encodePdfBase64(pdfPath),
      numeroPagina: String(process.env.OMNISWITCH_DEBUG_PAGE || "1"),
      Coordenadas: process.env.OMNISWITCH_DEBUG_COORDS || (index === 0 ? "50,75" : "245,75"),
    });
  }

  await omniPost(apiUrl, "SolicitudeCreateSignatory", auth, {
    IDSolicitud: Number(idSolicitud),
    ...signer,
  });

  await omniPost(apiUrl, "SolicitudeSend", auth, {
    IDSolicitud: Number(idSolicitud),
  });

  console.log("\nFlujo completado.");
  console.log(`IDSolicitud: ${idSolicitud}`);
} catch (error) {
  console.error("\nFallo en flujo Omni debug.");
  console.error(error.message);
  if (error?.payload) {
    console.error(toJson(error.payload));
  }
  process.exit(1);
}
