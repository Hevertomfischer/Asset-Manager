/**
 * Mercado Pago billing provider — Checkout Pro com Pix prioritário.
 *
 * ─────────────────────────────────────────────────────────────
 * CONFIGURAÇÃO OPERACIONAL
 * ─────────────────────────────────────────────────────────────
 * Secrets a adicionar no Replit (Secrets tab):
 *
 *   MP_ACCESS_TOKEN   →  Painel MP → Credenciais → Access Token (produção)
 *                        Para sandbox: usar o Access Token de TESTE disponível
 *                        em Credenciais → Modo Teste.
 *
 *   MP_WEBHOOK_SECRET →  Painel MP → Suas integrações → Webhooks → Segredo
 *                        (gerado ao salvar a URL de webhook).
 *
 * URL de webhook a cadastrar no painel do Mercado Pago:
 *   https://<seu-domínio>.replit.app/api/billing/webhook
 *   Em desenvolvimento local: use o domínio de preview do Replit ou ngrok.
 *   Eventos a assinar: apenas "Pagamentos" (payment).
 *
 * ─────────────────────────────────────────────────────────────
 * COMO TESTAR EM SANDBOX ANTES DE IR PARA PRODUÇÃO
 * ─────────────────────────────────────────────────────────────
 * 1. Defina MP_ACCESS_TOKEN com o token de TESTE do painel MP.
 * 2. Crie um checkout via POST /api/billing/checkout (autenticado).
 * 3. Abra a init_point retornada e complete o pagamento com os
 *    cartões/CPFs de teste documentados em:
 *    https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/cards
 * 4. Para Pix em sandbox: após criar um pagamento, acesse o painel MP →
 *    Suas integrações → Modo Teste e clique em "Simular pagamento".
 * 5. O webhook disparará para a URL cadastrada. Use o domínio de preview do
 *    Replit (https://<repl>.replit.app) — ele é público e acessível pelo MP.
 * 6. Para passar para produção: troque MP_ACCESS_TOKEN pelo token real e
 *    recadastre o webhook com o domínio de produção (*.replit.app ou custom).
 */

import MercadoPagoConfig, { Preference } from "mercadopago";
import { createLogger } from "../../lib/logger";
import { getPlanConfig, seasonPrice, type PlanConfig } from "./planConfig";
import type { BillingPlan } from "./planConfig";

const log = createLogger("billing");

export type { BillingPlan } from "./planConfig";

function getMpClient(): MercadoPagoConfig {
  const accessToken = process.env["MP_ACCESS_TOKEN"];
  if (!accessToken) throw new Error("MP_ACCESS_TOKEN não configurado");
  return new MercadoPagoConfig({ accessToken });
}

function getBaseUrl(): string {
  const domain = process.env["REPLIT_DEV_DOMAIN"] ?? process.env["REPLIT_DOMAINS"]?.split(",")[0];
  return domain ? `https://${domain}` : "http://localhost:3000";
}

/** Base path do frontend — "/cartola-intel" em dev, "" em produção se a raiz for "/". */
const frontendPath = (process.env["FRONTEND_BASE_PATH"] ?? "/cartola-intel").replace(/\/$/, "");

/**
 * Cria uma Preference no Mercado Pago e retorna a URL de checkout (init_point).
 * external_reference = "<userId>:<plan>" para identificar o comprador no webhook.
 */
export async function createCheckout(
  userId: number,
  plan: BillingPlan,
  planConfig?: PlanConfig,
): Promise<string> {
  const config = getMpClient();
  const preference = new Preference(config);
  const plans = planConfig ?? await getPlanConfig();
  const planCfg = plan === "pro_monthly"
    ? { title: "Mitometro Pro - Mensal", price: plans.proMonthlyPrice }
    : { title: `Mitometro Pro - Season Pass ${plans.seasonPassYear}`, price: seasonPrice(plans) };
  const baseUrl = getBaseUrl();
  const externalRef = `${userId}:${plan}`;

  log.info("Criando checkout", { userId, plan, externalRef });

  const result = await preference.create({
    body: {
      items: [
        {
          id: plan,
          title: planCfg.title,
          quantity: 1,
          unit_price: planCfg.price,
          currency_id: "BRL",
        },
      ],
      payer: {},
      external_reference: externalRef,
      // O webhook usa a temporada vendida, mesmo que o administrador altere a configuração.
      metadata: { billing_config: plans },
      payment_methods: {
        default_payment_method_id: "pix",
      },
      back_urls: {
        success: `${baseUrl}${frontendPath}/planos?billing=success`,
        failure: `${baseUrl}${frontendPath}/planos?billing=failure`,
        pending: `${baseUrl}${frontendPath}/planos?billing=pending`,
      },
      auto_return: "approved",
    },
  });

  const checkoutUrl = result.init_point;
  if (!checkoutUrl) throw new Error("Mercado Pago não retornou init_point");

  log.info("Checkout criado", { userId, plan, preferenceId: result.id });
  return checkoutUrl;
}
