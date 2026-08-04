# Mitometro MCP Server

Servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) que conecta assistentes de IA (Claude Desktop, Cursor, etc.) aos dados e ao otimizador do **Mitometro** — projeções, escalações e confrontos do Cartola FC.

## Ferramentas

| Ferramenta | O que faz | Exemplo de prompt |
|---|---|---|
| `get_round_projections` | Top projeções da rodada, com filtros por posição e preço | "Quais os 5 atacantes com maior projeção nesta rodada?" |
| `generate_lineup` | Escalação otimizada (orçamento, formação, estratégia) | "Monte o melhor time com 120 cartoletas no 4-3-3" |
| `get_player_details` | Histórico de projeções vs pontos reais de um jogador | "Como o Pedro vem performando contra as projeções?" |
| `list_matches` | Confrontos da rodada com xG, dificuldade e posições recomendadas | "Quais confrontos estão fáceis para escalar defesa?" |

## Configuração

Variáveis de ambiente:

| Variável | Descrição | Padrão |
|---|---|---|
| `MITOMETRO_API_URL` | URL base da API do Mitometro | `http://localhost:80/api` (dev) |
| `MITOMETRO_SESSION_TOKEN` | Cookie de sessão (`connect.sid`) opcional para recursos Pro (estratégias avançadas de escalação) | — |

Para apontar para produção: `MITOMETRO_API_URL=https://<seu-dominio-publicado>/api`.

> Sem token Pro, `generate_lineup` funciona apenas com a estratégia `safe`.

## Como rodar

```bash
# na raiz do monorepo
pnpm install

# desenvolvimento (direto do TypeScript)
pnpm --filter @workspace/mcp-server dev

# build de produção → dist/index.js
pnpm --filter @workspace/mcp-server build
```

## Conectar no Claude Desktop

1. Rode o build: `pnpm --filter @workspace/mcp-server build`
2. Edite o arquivo de configuração do Claude Desktop:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
3. Adicione o servidor:

```json
{
  "mcpServers": {
    "mitometro": {
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

### Outros clientes MCP

Qualquer cliente compatível com MCP via stdio funciona da mesma forma: comando `node`, argumento com o caminho do `dist/index.js` e as variáveis de ambiente acima.

## Verificação rápida (sem cliente)

```bash
(echo '{"jsonrpc":"2.0","method":"initialize","id":0,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}';
 echo '{"jsonrpc":"2.0","method":"notifications/initialized"}';
 echo '{"jsonrpc":"2.0","method":"tools/list","id":1}'; sleep 2) | node dist/index.js
```

Deve listar as 4 ferramentas na resposta com `"id":1`.
