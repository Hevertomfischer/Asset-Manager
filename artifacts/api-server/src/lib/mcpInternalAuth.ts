/**
 * Utilitário para propagação segura de identidade de usuário em chamadas
 * internas do MCP ao servidor Express — sem criar sessão de banco.
 *
 * O header X-Mcp-Internal-User: <userId>.<hmac> é assinado com SESSION_SECRET
 * e só é aceito por middleware confiante que verifica a assinatura antes de
 * populaor req.user. Nunca deve ser aceito de origens externas.
 */

import { createHmac, timingSafeEqual } from "crypto";

const CONTEXT = "mcp-internal-user-v1";

function secret(): string {
  return process.env["SESSION_SECRET"] ?? "fallback";
}

export function signInternalUserId(userId: number): string {
  const payload = String(userId);
  const sig = createHmac("sha256", secret()).update(`${CONTEXT}:${payload}`).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyInternalUserId(header: string): number | null {
  const dot = header.lastIndexOf(".");
  if (dot === -1) return null;

  const payload = header.slice(0, dot);
  const providedSig = header.slice(dot + 1);
  const expectedSig = createHmac("sha256", secret()).update(`${CONTEXT}:${payload}`).digest("hex");

  try {
    const expectedBuf = Buffer.from(expectedSig, "hex");
    const providedBuf = Buffer.from(providedSig, "hex");
    if (expectedBuf.length !== providedBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, providedBuf)) return null;
  } catch {
    return null;
  }

  const id = parseInt(payload, 10);
  return isNaN(id) ? null : id;
}
