---
name: MCP OAuth security and session continuity
description: Regra de autenticação individual do MCP e preservação da autorização pendente durante o login Google.
---

# Autenticação MCP individual

O MCP remoto deve usar OAuth individual com PKCE S256, nunca token fixo
compartilhado nem sessão Pro do operador. Persistir somente SHA-256 dos access
tokens; tokens antigos podem ser invalidados.

**Why:** O usuário pediu a remoção do modo legado sem uso e o armazenamento
seguro dos tokens, sem alterar as permissões individuais das contas.

**How to apply:** Não reintroduzir um bypass estático para facilitar integrações.
Clientes nativos podem não enviar `Origin`; isso não os dispensa de OAuth.

## Fluxo de sessão Google durante OAuth

Se o usuário não está logado quando bate em `/authorize`, os parâmetros OAuth são salvos em `req.session.mcpOauthPending`. O callback do Google (`/api/auth/google/callback` em `routes/auth.ts`) detecta essa flag e redireciona para `/authorize` em vez de `/`.

**Why:** O Passport regenera a sessão em `req.login`; sem capturar e restaurar os
parâmetros, o login Google funciona, mas o pedido de autorização MCP se perde.

**How to apply:** Capturar a autorização pendente antes de `req.login` e
restaurá-la na sessão regenerada antes de redirecionar ao consentimento.
