import { Router } from "express";
import MercadoPagoConfig, { Payment } from "mercadopago";
import { db } from "@workspace/db";
import { subscriptionsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createCheckout, type BillingPlan } from "../services/billing/mercadopagoProvider";
import { validateMpSignature } from "../services/billing/webhookValidator";
import { createLogger } from "../lib/logger";

const log = createLogger("billing");
const router = Router();

function getMpClient(): MercadoPagoConfig {
  const accessToken = process.env["MP_ACCESS_TOKEN"];
  if (!accessToken) throw new Error("MP_ACCESS_TOKEN não configurado");
  return new MercadoPagoConfig({ accessToken });
}

/** Calcula currentPeriodEnd conforme o plano. */
function computePeriodEnd(plan: BillingPlan): Date {
  if (plan === "pro_monthly") {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  const year = new Date().getFullYear();
  return new Date(year, 11, 7);
}

/**
 * POST /api/billing/checkout
 * Cria uma sessão de pagamento no Mercado Pago e retorna a URL de checkout.
 * Requer sessão autenticada.
 */
router.post("/billing/checkout", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const { plan } = req.body as { plan?: string };
  if (plan !== "pro_monthly" && plan !== "season_pass") {
    res.status(400).json({ error: "Plano inválido. Use 'pro_monthly' ou 'season_pass'." });
    return;
  }

  try {
    const checkoutUrl = await createCheckout(req.user.id, plan as BillingPlan);
    res.json({ checkoutUrl });
  } catch (err) {
    log.error("Erro ao criar checkout", { userId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Não foi possível criar o checkout. Tente novamente." });
  }
});

/**
 * POST /api/billing/webhook
 * Recebe notificações do Mercado Pago.
 * - Valida assinatura HMAC-SHA256
 * - Processa apenas eventos payment com status approved
 * - Faz upsert idempotente na subscriptionsTable
 */
router.post("/billing/webhook", async (req, res) => {
  let body: { type?: string; action?: string; data?: { id?: string | number } };
  try {
    const raw = req.body instanceof Buffer ? req.body.toString("utf8") : JSON.stringify(req.body);
    body = JSON.parse(raw) as typeof body;
  } catch {
    log.warn("Webhook com body inválido");
    res.status(400).json({ error: "Body inválido" });
    return;
  }

  const eventType = body?.type;
  const paymentId = String(body?.data?.id ?? "");

  log.info("Webhook recebido", { type: eventType, paymentId });

  if (eventType !== "payment" || !paymentId) {
    res.sendStatus(200);
    return;
  }

  try {
    validateMpSignature(req, paymentId);
  } catch (err) {
    log.warn("Assinatura de webhook rejeitada", { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ error: "Assinatura inválida" });
    return;
  }

  try {
    const mpClient = getMpClient();
    const paymentClient = new Payment(mpClient);
    const payment = await paymentClient.get({ id: Number(paymentId) });

    log.info("Pagamento buscado", { paymentId, status: payment.status, externalRef: payment.external_reference });

    if (payment.status !== "approved") {
      log.info("Pagamento não aprovado — ignorando", { paymentId, status: payment.status });
      res.sendStatus(200);
      return;
    }

    const externalRef = payment.external_reference ?? "";
    const [userIdStr, plan] = externalRef.split(":");
    const userId = parseInt(userIdStr ?? "", 10);

    if (isNaN(userId) || !plan) {
      log.error("external_reference inválido no pagamento", { paymentId, externalRef });
      res.sendStatus(200);
      return;
    }

    const existingByPayment = await db
      .select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.externalId, String(paymentId)))
      .limit(1);

    if (existingByPayment.length > 0) {
      log.info("Pagamento já processado — idempotente", { paymentId, userId });
      res.sendStatus(200);
      return;
    }

    const periodEnd = computePeriodEnd(plan as BillingPlan);

    const [existingSub] = await db
      .select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId))
      .limit(1);

    if (existingSub) {
      await db
        .update(subscriptionsTable)
        .set({
          plan: "pro",
          status: "active",
          provider: "mercadopago",
          externalId: String(paymentId),
          currentPeriodEnd: periodEnd,
          updatedAt: new Date(),
        })
        .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.id, existingSub.id)));
      log.info("Assinatura atualizada", { userId, plan, periodEnd, paymentId });
    } else {
      await db.insert(subscriptionsTable).values({
        userId,
        plan: "pro",
        status: "active",
        provider: "mercadopago",
        externalId: String(paymentId),
        currentPeriodEnd: periodEnd,
      });
      log.info("Assinatura criada", { userId, plan, periodEnd, paymentId });
    }

    res.sendStatus(200);
  } catch (err) {
    log.error("Erro ao processar webhook", { paymentId, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Erro interno ao processar pagamento" });
  }
});

/**
 * GET /api/billing/subscription
 * Retorna o estado atual da assinatura do usuário autenticado.
 */
router.get("/billing/subscription", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  try {
    const [sub] = await db
      .select({
        plan: subscriptionsTable.plan,
        status: subscriptionsTable.status,
        currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, req.user.id))
      .orderBy(desc(subscriptionsTable.updatedAt))
      .limit(1);

    if (!sub) {
      res.json({ plan: "free", status: "inactive", currentPeriodEnd: null });
      return;
    }

    res.json({
      plan: sub.plan ?? "free",
      status: sub.status ?? "inactive",
      currentPeriodEnd: sub.currentPeriodEnd ?? null,
    });
  } catch (err) {
    log.error("Erro ao buscar assinatura", { userId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Erro ao buscar assinatura" });
  }
});

export default router;
