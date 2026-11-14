# Mitometro MCP Server

Servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) que conecta assistentes de IA (Claude Desktop, Cursor, etc.) aos dados e ao otimizador do **Mitometro** — projeções, escalações e confrontos do Cartola FC.

## Ferramentas

| Ferramenta | O que faz | Exemplo de prompt |
|---|---|---|
| `get_round_projections` | Top projeções da rodada, com filtros por posição e preço | "Quais os 5 atacantes com maior projeção nesta rodada?" |
| `generate_lineup` | Escalação otimizada (orçamento, formação, estratégia) | "Monte o melhor time com 120 cartoletas no 4-3-3" |
| `get_player_details` | Histórico de projeções vs pontos reais de um jogador | "Como o Pedro vem performando contra as projeções?" |
| `list_matches` | Confrontos da rodada com xG, dificuldade e posições recomendadas | "Quais confrontos estão fáceis para escalar defesa?" |

---

## Opção 1 — Servidor remoto (sem instalação)

A maneira mais simples: conecte diretamente ao servidor já hospedado do Mitometro.
Nenhuma instalação, nenhum build necessário.

### Claude Desktop

Edite `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) ou `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mitometro": {
      "type": "http",
      "url": "https://SEU_DOMINIO_PUBLICADO/api/mcp"
    }
  }
}
```

Substitua `SEU_DOMINIO_PUBLICADO` pelo domínio onde o Mitometro está publicado.

### Autenticação OAuth obrigatória

Use um cliente compatível com OAuth 2.0 e PKCE S256. Ao conectar, ele descobre
os endpoints pelo `WWW-Authenticate`, abre o login Google e pede autorização.
Tokens estáticos e cookies compartilhados do operador não são aceitos no MCP remoto.
Não configure manualmente um cabeçalho `Authorization` fixo.

### Estratégias Pro via servidor remoto

As permissões são as da conta que autorizou o cliente OAuth. Estratégias avançadas
exigem acesso Pro dessa conta; não existe sessão Pro compartilhada do operador.

---

## Opção 2 — Servidor local (stdio)

Para rodar localmente conectado ao seu próprio ambiente de desenvolvimento.

### Configuração

Variáveis de ambiente:

| Variável | Descrição | Padrão |
|---|---|---|
| `MITOMETRO_API_URL` | URL base da API do Mitometro | `http://localhost:80/api` (dev) |
| `MITOMETRO_SESSION_TOKEN` | Cookie de sessão (`connect.sid`) opcional para recursos Pro | — |

Para apontar para produção: `MITOMETRO_API_URL=https://<seu-dominio-publicado>/api`.

> Sem token Pro, `generate_lineup` funciona apenas com a estratégia `safe`.

### Como rodar

```bash
# na raiz do monorepo
pnpm install

# desenvolvimento (direto do TypeScript)
pnpm --filter @workspace/mcp-server dev

# build de produção → dist/index.js
pnpm --filter @workspace/mcp-server build
```

### Conectar no Claude Desktop (local)

1. Rode o build: `pnpm --filter @workspace/mcp-server build`
2. Edite o arquivo de configuração do Claude Desktop:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
3. Adicione o servidor:

```json
{
  "mcpServers": {
    "mitometro-local": {
      "command": "node",
      "args": ["/caminho/para/workspace/artifacts/mcp-server/dist/index.js"],
      "env": {
        "MITOMETRO_API_URL": "https://<seu-dominio-publicado>/api"
      }
    }
  }
}
```

4. Reinicie o Claude Desktop. As 4 ferramentas do Mitometro aparecem no ícone de ferramentas.

---

## Variáveis de ambiente do servidor remoto (operador)

| Variável | Descrição |
|---|---|
| `ALLOWED_ORIGINS` | Secret obrigatório em produção: origens web permitidas, separadas por vírgula; clientes nativos sem Origin continuam funcionando |
| `MCP_TOKEN_TTL_SECONDS` | Duração do access token OAuth em segundos (default: 3600) |
| `MCP_RATE_LIMIT` | Requisições permitidas por IP por minuto (default: 30) |

---

## Verificação rápida (sem cliente, servidor local)

```bash
(echo '{"jsonrpc":"2.0","method":"initialize","id":0,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}';
 echo '{"jsonrpc":"2.0","method":"notifications/initialized"}';
 echo '{"jsonrpc":"2.0","method":"tools/list","id":1}'; sleep 2) | node dist/index.js
```

Deve listar as 4 ferramentas na resposta com `"id":1`.
