import "server-only";
import https from "node:https";
import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { VINCUE_INTERMEDIATE } from "./vincue-ca";
let visitorAgent: https.Agent | undefined;

function getVisitorAgent() {
  if (visitorAgent) return visitorAgent;
  const intermediate = new X509Certificate(VINCUE_INTERMEDIATE);
  const now = Date.now();
  if (!intermediate.ca || now < Date.parse(intermediate.validFrom) || now > Date.parse(intermediate.validTo) ||
    !rootCertificates.some(pem => {
      const root = new X509Certificate(pem);
      return intermediate.checkIssued(root) && intermediate.verify(root.publicKey);
    })) throw new Error("Invalid visitor certificate chain");
  // Supply the missing issuer; retain trusted roots, hostname verification,
  // certificate expiration checks, and rejectUnauthorized's true default.
  visitorAgent = new https.Agent({ ca: [...rootCertificates, VINCUE_INTERMEDIATE] });
  return visitorAgent;
}

export const fetchVinCue: typeof fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "vbc.vincue.com") return fetch(input, init);
  if (url.origin !== "https://vbc.vincue.com" || url.pathname !== "/vc.js" || url.username || url.password ||
    (init.method && init.method !== "GET") || init.redirect !== "manual") throw new Error("Unexpected visitor request");
  return new Promise<Response>((resolve, reject) => {
    const request = https.get(url, {
      agent: getVisitorAgent(), signal: init.signal || undefined,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 256 * 1024) { response.destroy(new Error("Visitor response too large")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
          else if (value !== undefined) headers.set(name, value);
        }
        const status = response.statusCode || 502;
        resolve(new Response([204, 205, 304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks)), { status, headers }));
      });
    });
    request.on("error", reject);
  });
};
