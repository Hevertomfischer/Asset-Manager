import { createHmac, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { createLogger } from "../../lib/logger";

const log = createLogger("billing");

/**
 * Valida a assinatura HMAC-SHA256 de uma notificação do Mercado Pago.
 *
 * O MP envia o header `x-signature` no formato "ts=<timestamp>,v1=<hash>".
 * A string assinada é: "id:<paymentId>;request-id:<x-request-id>;ts:<ts>;"
 * A chave é MP_WEBHOOK_SECRET.
 *
 * Lança Error se a assinatura for inválida ou se o secret não estiver configurado.
 */
export function validateMpSignature(req: Request, paymentId: string): void {
  const secret = process.env["MP_WEBHOOK_SECRET"];
  if (!secret) throw new Error("MP_WEBHOOK_SECRET não configurado");

  const xSignature = req.headers["x-signature"] as string | undefined;
  const xRequestId = req.headers["x-request-id"] as string | undefined;

  if (!xSignature) {
    log.warn("Webhook recebido sem x-signature", { paymentId });
    throw new Error("Assinatura ausente");
  }

  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => part.split("=", 2) as [string, string])
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];

  if (!ts || !v1) {
    log.warn("Formato de x-signature inválido", { xSignature });
    throw new Error("Formato de assinatura inválido");
  }

  const signedString = `id:${paymentId};request-id:${xRequestId ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(signedString).digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(v1, "utf8");

  const signaturesMatch =
    expectedBuf.length === receivedBuf.length &&
    timingSafeEqual(expectedBuf, receivedBuf);

  if (!signaturesMatch) {
    log.warn("Assinatura de webhook inválida", { paymentId, ts });
    throw new Error("Assinatura inválida");
  }
}
