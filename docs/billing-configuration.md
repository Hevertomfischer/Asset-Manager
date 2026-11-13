# Cobrança avulsa e configuração dos planos

O Checkout Pro do Mercado Pago continua sendo **pagamento avulso, sem cobrança recorrente**.
Nenhuma alteração é publicada automaticamente.

## Publicação e banco

1. A migração SQL `lib/db/drizzle/0004_subscription_billing_plan.sql` foi aplicada somente no banco de desenvolvimento, sem `drizzle-kit push`.
2. A migração SQL `lib/db/drizzle/0005_subscription_period_start.sql` acrescenta o início do período pago nas novas compras. Publique a versão e confira no fluxo de publicação as colunas `subscriptions.billing_plan` e `subscriptions.current_period_start`. Em banco gerenciado pelo Replit, a publicação aplica a diferença de schema; não adicione SQL de migração no startup.
3. Desenvolvimento e produção têm dados independentes. Os valores de `admin_config` definidos em desenvolvimento **não são copiados** para produção.
4. Novas compras gravam `pro_monthly` ou `season_pass`; concessões administrativas usam `grant`, contas de teste usam `dev`. Compras antigas sem tipo conhecido permanecem `NULL`: não é seguro deduzir qual passe foi vendido.

## Alterar preços e datas em produção

Use uma sessão administrativa no app publicado ou um script com o header `x-admin-secret` já suportado pelo projeto. Não coloque credenciais no código, em `.replit`, no corpo da configuração ou no histórico de comandos. Credenciais ficam em **Secrets**.

Leia `GET /api/admin/config` e envie um JSON parcial para `POST /api/admin/config`, no **domínio publicado**. Por exemplo:

```json
{
  "seasonPassYear": 2027,
  "seasonPassEndsAt": "2028-01-01T02:59:00.000Z",
  "proMonthlyPrice": 19.90,
  "seasonPassPrice": 99.90,
  "founderSeasonPassPrice": 79.90
}
```

É possível fazer isso no console do navegador, já autenticado como administrador no app publicado:

```js
const response = await fetch("/api/admin/config", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    seasonPassYear: 2027,
    proMonthlyPrice: 19.90,
    seasonPassPrice: 99.90,
    founderSeasonPassPrice: null
  })
});
console.log(response.status, await response.json());
```

- Preços são números positivos, em reais, com no máximo duas casas decimais. Campos desconhecidos são recusados.
- `founderSeasonPassPrice: null` remove o desconto. O desconto só vale **antes** de `FOUNDER_ACCESS_CUTOFF`.
- Ao enviar apenas `seasonPassYear`, o vencimento é ajustado automaticamente para 31/12 daquele ano, às **23:59 de São Paulo**. Envie também `seasonPassEndsAt` para escolher outra data.
- `2028-01-01T02:59:00.000Z` corresponde a **31/12/2027 às 23:59 em São Paulo**.
- Sem configuração persistida, o ano padrão é o atual de janeiro a outubro; em novembro/dezembro é o seguinte, conforme o fuso de São Paulo. Configuração explícita não avança automaticamente: atualize-a na virada da temporada.
- Configuração de passe vencida pode ser salva, mas o checkout daquele passe retorna **409**. O mensal continua disponível.
- Confira `GET /api/billing/config` sem login e a página `/planos`: devem mostrar os mesmos preços efetivos. `seasonPassPrice` é o preço vigente, e `regularSeasonPassPrice` é o preço sem desconto.
- O formulário antigo de configuração no painel administrativo continua editando somente os dias de validade de xG; os novos campos são administrados pela API acima.

## Founder Access e validade adquirida

`FOUNDER_ACCESS_CUTOFF_DATE` continua sendo configurado via **Secrets**, se precisar substituir o fallback. Reinicie/republique para carregar uma alteração dessa variável.
O fallback existente foi mantido: **2026-12-31T23:59:59Z** (UTC). Isso não é 23:59 em São Paulo; para esse horário local, use um ISO com `-03:00`.

- Mensal: soma 30 dias ao maior entre agora, o fim futuro da campanha e o maior vencimento Pro ativo.
- Passe: usa o vencimento configurado, preservando uma data de acesso maior já existente.
- A temporada de uma preferência nova é preservada nos metadados do pagamento. Alterações posteriores de configuração valem para novos checkouts.
- Renovações registram pagamentos separados e serializam o cálculo por usuário; reentregas do mesmo webhook não acrescentam dias novamente.
- A conta distingue o plano real do benefício Fundador e mostra o maior prazo de acesso. Novas compras registram o início do período pago para mostrar a data quando for futura. Datas históricas desconhecidas ficam sem estimativa.
- Webhook aprovado de uma temporada que já encerrou não cria uma assinatura vencida: retorna erro e registra o ocorrido para análise operacional.

## Verificação sem cobrar clientes

Os testes automatizados simulam o Mercado Pago, inclusive criação da preferência e webhook. Não fazem cobranças reais.
Para homologação externa, use credenciais e compradores de teste do Mercado Pago antes de aceitar pagamentos reais.
