---
name: MCP OAuth 2.0 Authorization Server
description: OAuth AS para conectar Claude Desktop ao endpoint MCP remoto — endpoints, fluxo, e como a sessão Google é reutilizada.
---

# MCP OAuth 2.0 Authorization Server

## Endpoints (montados fora de /api no app.ts, antes do SPA fallback)

- `GET /.well-known/oauth-authorization-server` — metadados RFC 8414
- `GET /authorize` — consent page ou redirect para Google
- `POST /authorize` — processa `decision=allow|deny`, emite auth code
- `POST /token` — PKCE S256, emite access_token

## Fluxo de sessão Google durante OAuth

Se o usuário não está logado quando bate em `/authorize`, os parâmetros OAuth são salvos em `req.session.mcpOauthPending`. O callback do Google (`/api/auth/google/callback` em `routes/auth.ts`) detecta essa flag e redireciona para `/authorize` em vez de `/`.

**Why:** O Google OAuth callback só pode redirecionar para uma URL registrada. Não dá para passar os params OAuth como state no Google flow sem expor o `redirect_uri` do Claude no state param.

## Tabelas no banco

`mcp_auth_codes` — codes de uso único, expiram em 5 min, com `code_challenge` para PKCE.
`mcp_access_tokens` — tokens Bearer, TTL configurável via `MCP_TOKEN_TTL_SECONDS` (default 3600s).

Migration: `lib/db/drizzle/0003_add_mcp_oauth.sql` (já aplicada em dev; precisa rodar em prod no deploy).

## Bearer token no /api/mcp

O middleware em `routes/mcp.ts` aceita três casos:
1. Token estático `MCP_ACCESS_TOKEN` (legado) — validação por igualdade
2. OAuth Bearer token — consulta `mcp_access_tokens` via `validateMcpBearerToken()` de `routes/mcpOauth.ts`
3. Sem token → 401 com `WWW-Authenticate: Bearer resource_metadata=.../.well-known/oauth-authorization-server`

O 401 com `resource_metadata` é o sinal que o Claude Desktop usa para descobrir onde autenticar.

## Session type

`express-session` SessionData foi estendida em `src/types/express.d.ts` com `mcpOauthPending`.
