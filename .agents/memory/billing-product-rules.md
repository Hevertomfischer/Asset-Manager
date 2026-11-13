---
name: Billing product rules
description: Commercial constraints for Mercado Pago, Founder Access, and legacy purchases.
---

Cobrança via Mercado Pago Checkout Pro é pagamento avulso, sem recorrência.
Não substitua esse modelo por assinatura com cobrança automática.

**Why:** O usuário definiu explicitamente esse modelo comercial.

**How to apply:** Preserve o modelo de compra e a comunicação de renovação manual
ao alterar checkout, planos ou integração com o provedor.

Uma compra não pode consumir os dias gratuitos ainda disponíveis no Founder Access,
nem reduzir dias pagos já adquiridos. A data de corte da campanha e o fim de uma
temporada são conceitos distintos; preserve o fuso explícito de cada um.

**Why:** O usuário relatou compras vencendo antes do fim do acesso gratuito.

**How to apply:** Considere campanha e saldo ativo em renovações, sem alterar
silenciosamente o instante do corte ao modificar a configuração de temporadas.

Não invente o tipo de compras históricas quando faltarem registros que permitam
identificá-lo.

**Why:** Dados antigos não distinguem com segurança mensal de passe de temporada;
uma classificação presumida poderia mudar os direitos do comprador.

**How to apply:** Preserve direitos e IDs de pagamentos antigos; registre o tipo
explicitamente nas novas compras.
