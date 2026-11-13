import { Router } from "express";
import MercadoPagoConfig, { Payment } from "mercadopago";
import { db } from "@workspace/db";
import { subscriptionsTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { createCheckout } from "../services/billing/mercadopagoProvider";
import { validateMpSignature } from "../services/billing/webhookValidator";
import { createLogger } from "../lib/logger";
import { getPlanConfig, planConfigSchema, publicPlanConfig } from "../services/billing/planConfig";
import { computePeriodEnd, ExpiredSeasonError } from "../services/billing/periodEnd";

const log = createLogger("billing");
const router = Router();

function getMpClient(): MercadoPagoConfig {
  const accessToken = process.env["MP_ACCESS_TOKEN"];
  if (!accessToken) throw new Error("MP_ACCESS_TOKEN não configurado");
  return new MercadoPagoConfig({ accessToken });
}

router.get("/billing/config", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    res.json(publicPlanConfig(await getPlanConfig()));
  } catch (err) {
    log.error("Erro ao carregar preços", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Não foi possível carregar os preços." });
  }
});

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
    const config = await getPlanConfig();
    await computePeriodEnd(plan, req.user.id, config);
    const checkoutUrl = await createCheckout(req.user.id, plan, config);
    res.json({ checkoutUrl });
  } catch (err) {
    if (err instanceof ExpiredSeasonError) {
      log.warn("Checkout de temporada encerrada recusado", { userId: req.user.id, plan });
      res.status(409).json({ error: err.message });
      return;
    }
    log.error("Erro ao criar checkout", { userId: req.user.id, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Não foi possível criar o checkout. Tente novamente." });
  }
});

/**
 * POST /api/billing/webhook
 * Recebe notificações do Mercado Pago.
 * - Valida assinatura HMAC-SHA256
 * - Processa apenas eventos payment com status approved
 * - Registra um lançamento por pagamento, com aplicação idempotente
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

    if (!Number.isSafeInteger(userId) || userId <= 0 || (plan !== "pro_monthly" && plan !== "season_pass")) {
      log.error("external_reference inválido no pagamento", { paymentId, externalRef });
      res.sendStatus(200);
      return;
    }

    // Preferências novas preservam a configuração vendida; pagamentos antigos
    // (sem metadata) continuam compatíveis com a configuração vigente.
    const snapshot = payment.metadata?.["billing_config"];
    const config = snapshot ? planConfigSchema.parse(snapshot) : await getPlanConfig();
    await db.transaction(async (tx) => {
      // Serializa renovações simultâneas e reentregas do webhook por comprador.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7261, ${userId})`);
      const existingByPayment = await tx.select({ id: subscriptionsTable.id })
        .from(subscriptionsTable).where(eq(subscriptionsTable.externalId, paymentId)).limit(1);
      if (existingByPayment.length > 0) {
        log.info("Pagamento já processado — idempotente", { paymentId, userId });
        return;
      }
      const periodEnd = await computePeriodEnd(plan, userId, config, tx);
      // Uma linha por pagamento conserva os IDs antigos para idempotência.
      await tx.insert(subscriptionsTable).values({
        userId,
        plan: "pro",
        billingPlan: plan,
        status: "active",
        provider: "mercadopago",
        externalId: paymentId,
        currentPeriodEnd: periodEnd,
      });
      log.info("Pagamento aplicado à assinatura", { userId, plan, periodEnd, paymentId });
    });

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
      .orderBy(
        desc(sql`${subscriptionsTable.status} = 'active' AND ${subscriptionsTable.currentPeriodEnd} > now()`),
        desc(subscriptionsTable.currentPeriodEnd),
        desc(subscriptionsTable.updatedAt),
      )
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
