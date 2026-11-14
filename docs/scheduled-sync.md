# Agendamento da sincronização

## Estado e limites

- A publicação continua **Autoscale**, conforme a escolha do usuário.
- `ENABLE_IN_PROCESS_CRON=true` somente no desenvolvimento; produção usa `false`.
- Os dois POSTs exigem `x-cron-secret`. Cadastre **CRON_SECRET nos Secrets** do
  app e do agendador com o mesmo valor. Nunca coloque esse valor em `.replit`,
  URLs, argumentos de linha de comando ou arquivos versionados.
- `full-sync` e a sincronização automática das rodadas encerradas compartilham
  a trava PostgreSQL do reparo histórico. A checagem de mercado tem uma trava
  própria para não esperar um ETL longo. Cada trava usa uma conexão dedicada.
- Disparo concorrente do mesmo recurso: `200`, `status: skipped`.
- Job rápido: `200`, `status: completed`. Após **20 segundos de orçamento de
  resposta**, o endpoint responde `202`, `status: running`, e continua em segundo
  plano. Esses 20 segundos são uma escolha da aplicação, não um timeout
  documentado da plataforma.
- **202 não é conclusão nem fila durável.** Uma instância Autoscale pode ser
  encerrada. O cliente acompanha o status e acusa interrupções, mas isso não
  garante que o processo original permaneça vivo. Para garantia de execução
  longa, será necessário um worker durável ou Reserved VM, não habilitados aqui.

## Duração

Os logs mais recentes de produção registraram início do ETL às
`2026-11-14T02:35:29.488Z` e conclusão às `2026-11-14T02:51:10.301Z`:
**15 min 40,813 s** na execução observada, sem erros. Não é um SLA.
Uma consulta anterior mostrou uma janela de 24 min 27 s entre etapas e uma
conclusão, mas essa janela não permite correlacionar com precisão execuções
concorrentes e não deve ser tratada como duração exata.

Agora cada ETL mede e grava `lastFullSyncDurationMs`; apenas ETL bem-sucedido
atualiza `lastFullSyncAt`. Confira ambos no `GET /api/sync/status`.
`degraded=true` indica ausência de sucesso ou último sucesso há mais de 2 horas.
`isRunning` consulta as travas globais do banco, não apenas o processo local.

## Opção A: Scheduled Deployment do Replit

Use **dois projetos de agendamento separados**, preservando a publicação web
Autoscale. Assim o acompanhamento de um full sync longo não atrasa os próximos
disparos de mercado, mesmo se o agendador impedir sobreposição de execuções.

1. Crie dois projetos Node.js e copie `ops/cron-client.mjs` para cada um.
2. Nos Secrets de ambos, cadastre `CRON_SECRET` com o mesmo valor do app.
3. Configure a variável não secreta `MITOMETRO_BASE_URL=https://mitometro.com.br`.
4. Em Publishing, escolha **Scheduled Deployment**.
5. No projeto de mercado, configure `node cron-client.mjs market-check`,
   expressão `*/15 * * * *` e limite de execução de 2 minutos.
6. No projeto de full sync, configure `node cron-client.mjs full-sync`,
   expressão `0 * * * *` e limite de execução de 45 minutos.
7. Selecione o fuso `America/Sao_Paulo` nos dois. O acompanhamento de cada
   script tem limite próprio de 40 minutos; reveja o limite do full sync se a
   duração medida exigir mais tempo.
8. Publique os agendadores. Verifique nos logs `completed`, `skipped` ou `error`.
   Ative o mecanismo de alerta de falhas disponível no agendador.

O agendador faz tráfego mesmo sem visitantes, acordando a aplicação web.
Isso não remove a limitação de durabilidade do trabalho em segundo plano.

## Opção B: agendador externo

Configure dois jobs HTTPS com o cabeçalho secreto no cofre do agendador:

| Job | Cron | Método e URL |
|---|---|---|
| Mercado | `*/15 * * * *` | POST `https://mitometro.com.br/api/internal/cron/market-check` |
| Full sync | `0 * * * *` | POST `https://mitometro.com.br/api/internal/cron/full-sync` |

Cabeçalho: `x-cron-secret` obtido do cofre do serviço, nunca na URL.
Não confunda uma resposta `202` com sucesso do ETL: monitore
`GET https://mitometro.com.br/api/sync/status` e alerte por `degraded=true`.
Se o serviço permitir executar Node, use o mesmo script com o argumento
`market-check` ou `full-sync`, respectivamente.

## Verificação após publicação

1. Sem o cabeçalho secreto: o POST deve retornar `401` (ou `503` se ainda não
   configurado). Não envie o segredo pelo navegador ou pela conversa.
2. Dispare o mesmo job duas vezes enquanto o primeiro ainda executa: somente
   um deve executar; o outro deve retornar `skipped`.
3. Sem abrir o app, acompanhe os registros do agendador e confirme que
   `lastFullSyncAt` avança após conclusão bem-sucedida.
4. Confira `lastMarketCheckAt` a cada 15 minutos. A detecção do fechamento depende
   da disponibilidade da API oficial, da execução pontual do agendador e da
   publicação do endpoint; o código não pode garantir a fonte externa.

Referência oficial:
https://docs.replit.com/features/publishing/deployment-types
