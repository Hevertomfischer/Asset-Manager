# Cartola Intel

**Inteligência analítica para o Cartola FC.** Motor de projeção estatística + otimizador de escalação + backtest de desempenho. Tudo em tempo real, sem IA generativa, baseado em dados reais do mercado.

---

## Visão do Produto

O Cartola Intel ajuda você a:

- **Projetar pontuações** com base em forma recente (janelas de 3/5/8 rodadas), volatilidade individual e desempenho por posição
- **Montar a escalação ideal** com 4 estratégias: Seguro, Agressivo, Custo-Benefício e Antimassa (diferencial)
- **Analisar confrontos** — força ofensiva/defensiva dos clubes, dificuldade da partida e posições a explorar
- **Avaliar histórico** — comparação entre projeção e realidade, erro médio absoluto, piores/melhores previsões por posição e rodada
- **Identificar armadilhas** — jogadores populares com queda de forma e alto risco

---

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces |
| Runtime | Node.js 24, TypeScript 5.9 |
| Backend | Express 5, Drizzle ORM, PostgreSQL |
| Validação | Zod v4, drizzle-zod |
| API codegen | Orval (OpenAPI → React Query hooks) |
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
| Agendamento | node-cron |
| HTTP | Axios + Cheerio (scraping) |

---

## Arquitetura

```
artifacts/
├── api-server/          # Express API
│   └── src/
│       ├── app.ts              # Express + middleware global
│       ├── routes/             # Handlers HTTP por domínio
│       ├── engines/            # projectionEngine, availabilityEngine, IProjectionEngine
│       ├── optimizers/         # lineupOptimizer (4 estratégias)
│       ├── providers/          # Fontes de dados externas
│       ├── etl/                # Pipeline ETL orquestrado
│       ├── jobs/               # Cron jobs (sync + market check)
│       ├── repositories/       # Camada de acesso ao DB
│       ├── middlewares/        # adminAuth, futura expansão
│       ├── lib/                # logger, circuitBreaker, featureExtractor
│       └── config/             # Pesos de projeção, formações
└── cartola-intel/       # React + Vite SPA
    └── src/
        ├── pages/              # Dashboard, Jogadores, Escalação, Confrontos, Histórico, Admin
        ├── components/         # AppLayout, Pitch (campo visual)
        └── hooks/              # Hooks React Query customizados

lib/
├── api-spec/            # OpenAPI spec + Orval config
├── api-client-react/    # Hooks gerados (useGetPlayers, useGenerateLineup…)
├── api-zod/             # Schemas Zod gerados
└── db/                  # Schema Drizzle + conexão PostgreSQL
```

---

## Fluxo ETL

```
Cron (6h) → runCurrentRoundETL()
  ├── cartolaApiProvider     → players, clubs, market status
  ├── cartolaStatusProvider  → disponibilidade por status_id
  ├── historicalCartolaProvider → scouts das últimas rodadas
  ├── geProbablesProvider    → prováveis titulares (scraping HTML)
  └── gatoMestreProvider     → estatísticas adicionais
        ↓
  availabilityEngine         → playProbability, riskScore, expectedMinutes
  projectionEngine           → expectedPoints, floor/ceiling, differentialScore, isTrap
        ↓
  playerProjectionTable      → salvo no PostgreSQL para consulta
```

Cada provider:
1. Faz o fetch externo
2. Valida com Zod
3. Salva snapshot no DB (para fallback)
4. Faz upsert dos dados normalizados
5. Registra log de coleta

---

## Providers

| Provider | Fonte | Dados |
|---|---|---|
| `cartolaApiProvider` | api.cartola.globo.com/atletas/mercado | Jogadores, clubes, preços, média |
| `cartolaStatusProvider` | api.cartola.globo.com/atletas/mercado | Status de disponibilidade (Provável, Dúvida, Contundido…) |
| `historicalCartolaProvider` | api.cartola.globo.com/atletas/pontuados | Scouts históricos por rodada |
| `geProbablesProvider` | ge.globo.com | Prováveis titulares (HTML scraping) |
| `gatoMestreProvider` | gatomestre.com.br | Estatísticas detalhadas |

**Resiliência**: Todos os providers são protegidos por `withCircuitBreaker()`. Se um provider falhar N vezes consecutivas, o circuito abre e usa o último snapshot salvo. Após `openDurationMs` o circuito tenta recuperar (half-open).

---

## Motor de Projeção

O `projectionEngine` calcula para cada jogador:

| Campo | Descrição |
|---|---|
| `expectedPoints` | Média ponderada das janelas 3/5/8 rodadas (40/35/25%) |
| `floorPoints` | Projeção pessimista (−volatilidade) |
| `ceilingPoints` | Projeção otimista (+volatilidade) |
| `formScore` | Tendência de alta/baixa recente |
| `valueScore` | Pontos por cartoleta (eficiência de preço) |
| `differentialScore` | Alta projeção × baixa popularidade |
| `isTrap` | Jogador popular com queda de forma e alto risco |
| `recommendationScore` | Score composto para ranking geral |

**Pesos por posição** (configuráveis no Admin):
- **GOL**: defesas e clean sheet
- **ZAG**: desarmes e clean sheet
- **LAT**: assistências e desarmes
- **MEI**: gols e assistências
- **ATA**: gols e finalizações

---

## Motor de Disponibilidade

O `availabilityEngine` calcula:

- `playProbability`: 0.0–1.0 com base em status, lista de prováveis e histórico de minutos
- `expectedMinutes`: estimativa de minutos que o jogador irá jogar
- `riskScore`: combinação de lesão, suspensão, baixa probabilidade de jogo

---

## Otimizador de Escalação

4 estratégias:

| Estratégia | Lógica |
|---|---|
| `safe` | Maximiza o piso — jogadores consistentes e confiáveis |
| `aggressive` | Maximiza o teto — aceita volatilidade por pontuação máxima |
| `cost-benefit` | Maximiza pontos por cartoleta — eficiência de preço |
| `antimassa` | Maximiza `expectedPoints × (1 − popularidade_norm)` — fuga dos populares |

Restrições respeitadas: orçamento, formação, máximo 5 por clube, 1 goleiro, 1 técnico.

A seleção do capitão também é sensível à estratégia:
- `safe` → maior `floorPoints`
- `aggressive` → maior `ceilingPoints`
- `antimassa` → maior `expectedPoints × (1 − pop × 0.5)`

---

## Análise de Confrontos

O endpoint `/api/matches/confrontos` computa por partida:

- **Força ofensiva**: média de gols marcados nas últimas 5 rodadas
- **Força defensiva**: média de gols sofridos (invertida)
- **Expectativa de gols**: base × força × (1 / defesa adversária)
- **Dificuldade**: `fácil / médio / difícil` com base em thresholds
- **Posições a explorar**: ATA/MEI para ataque, GOL/ZAG para clean sheet

---

## Backtest

O endpoint `/api/history/backtest` cruza:
- `playerProjection.expectedPoints` (projeção gerada antes da rodada)
- `playerScoutRound.points` (pontuação real após a rodada)

Calcula: MAE global, MAE por posição, MAE por rodada, % de superestimação, melhores e piores previsões.

---

## Páginas

| Rota | Página |
|---|---|
| `/` | Dashboard — status, diferenciais, armadilhas, riscos, pipeline |
| `/jogadores` | Tabela de jogadores com filtros |
| `/escalacao` | Gerador de escalação com campo visual |
| `/confrontos` | Análise de partidas — força e dificuldade por clube |
| `/historico` | Backtest — projeção vs. realidade |
| `/admin` | Controles de sync, pesos de projeção, logs |

---

## APIs

Todos os endpoints sob `/api`:

### Públicos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/healthz` | Health check |
| GET | `/round/current` | Rodada atual + status do mercado |
| GET | `/players` | Jogadores com filtros |
| GET | `/players/projections/current` | Projeções da rodada atual |
| GET | `/matches/confrontos` | Análise de confrontos da rodada |
| GET | `/availability` | Disponibilidade dos jogadores |
| POST | `/lineup/generate` | Gerar escalação |
| GET | `/lineup` | Escalações salvas |
| GET | `/history/backtest` | Comparação projeção × real |
| GET | `/history/rounds` | Rodadas com dados históricos |

### Admin (opcional: protegido por `ADMIN_SECRET`)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/admin/providers/status` | Status dos providers e circuit breakers |
| POST | `/admin/sync/full` | Sync completo do ETL |
| POST | `/admin/sync/market` | Sync só do mercado |
| GET | `/admin/projection-weights` | Pesos de projeção |
| POST | `/admin/projection-weights` | Atualizar pesos |
| POST | `/admin/recalculate-projections` | Recalcular projeções |
| GET | `/admin/logs` | Logs de coleta |

---

## Configuração no Replit

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | PostgreSQL — provisionado automaticamente pelo Replit |
| `CARTOLA_EMAIL` | Sim | Email da conta Cartola FC |
| `CARTOLA_PASSWORD` | Sim | Senha da conta Cartola FC |
| `ADMIN_SECRET` | Não | Se definido, protege as rotas `/admin` com `x-admin-secret` header |
| `LOG_LEVEL` | Não | `debug / info / warn / error` (padrão: `info`) |
| `CARTOLA_FULL_SYNC_CRON` | Não | Cron do sync completo (padrão: `0 */6 * * *`) |
| `CARTOLA_MARKET_CHECK_CRON` | Não | Cron do market check (padrão: `0 */2 * * *`) |

### Workflows

| Workflow | Comando |
|---|---|
| API Server | `pnpm --filter @workspace/api-server run dev` |
| Frontend | `pnpm --filter @workspace/cartola-intel run dev` |

---

## Comandos Úteis

```bash
# Sincronizar dados da rodada atual
curl -X POST http://localhost:8080/api/admin/sync/full

# Recalcular projeções
curl -X POST http://localhost:8080/api/admin/recalculate-projections

# Ver backtest
curl http://localhost:8080/api/history/backtest

# Ver status dos providers
curl http://localhost:8080/api/admin/providers/status

# Ver confrontos
curl http://localhost:8080/api/matches/confrontos

# Typecheck completo
pnpm run typecheck

# Push de schema no DB (desenvolvimento)
pnpm --filter @workspace/db run push
```

---

## Observabilidade

O logger central (`artifacts/api-server/src/lib/logger.ts`) emite logs estruturados com:
- Timestamp ISO
- Nível: `DEBUG / INFO / WARN / ERROR`
- Tag: `[sync-job]`, `[history]`, `[circuit-breaker]`, `[admin-auth]`, etc.

Controle de nível via `LOG_LEVEL=debug`.

---

## Preparação para Machine Learning

A interface `IProjectionEngine` (`artifacts/api-server/src/engines/IProjectionEngine.ts`) define o contrato que qualquer motor de projeção precisa implementar. O `featureExtractor.ts` padroniza a extração de features para facilitar a troca por um modelo ML no futuro:

```typescript
// Para trocar o motor de projeção, implemente IProjectionEngine
// e injete no projectionEngine.ts
```

---

## Autenticação

A rota `/admin` é protegida por `adminAuthMiddleware`. Se `ADMIN_SECRET` não estiver definido, o middleware passa transparente. Para habilitar:

```bash
# Define no Replit Secrets
ADMIN_SECRET=sua-senha-segura

# Uso nas chamadas
curl -H "x-admin-secret: sua-senha-segura" http://localhost:8080/api/admin/sync/full
```

---

## Limitações Conhecidas

- **geProbablesProvider e gatoMestreProvider**: dependentes de scraping HTML e URLs externas que podem mudar. Têm fallback para último snapshot.
- **Sem login por usuário**: o app é mono-usuário. Multi-usuário exigiria adicionar tabela `users` e sessões.
- **Projections dependem do sync**: sem ao menos uma rodada sincronizada, projeções e histórico ficam vazios.
- **Backtest só funciona após rodadas concluídas**: pontuações reais (`playerScoutRound.points`) precisam ser coletadas após o fechamento da rodada.
- **Sem dados de odds/mercado externo**: expectativas de gols são calculadas puramente com base em dados históricos do Cartola.

---

## Próximos Passos

### Curto prazo
- [ ] Autenticação completa por usuário (Replit Auth ou JWT)
- [ ] Notificações por email/webhook na abertura do mercado
- [ ] Comparação de escalações salvas com resultados reais
- [ ] Retry com backoff exponencial em todos os providers

### Médio prazo
- [ ] Modelo de ML (regressão) para substituir o motor estatístico
- [ ] Feature store persistida no DB para treino incremental
- [ ] Dashboard de performance de estratégias por rodada
- [ ] Versão mobile (Expo React Native)

### Longo prazo
- [ ] Múltiplos usuários + times diferentes
- [ ] Integração com API oficial do Cartola (quando disponível)
- [ ] Análise de transferências (valorização/desvalorização)
- [ ] Modo liga: rankeamento de escalações dentro de ligas privadas
