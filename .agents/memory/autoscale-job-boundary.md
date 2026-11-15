---
name: Autoscale background job limits
description: Escolha do usuário sobre Autoscale e limite de durabilidade dos jobs longos com HTTP 202.
---

O usuário escolheu **“Manter Autoscale por enquanto”** após ser informado de que
jobs longos podem ser interrompidos depois de uma resposta HTTP 202.

**Why:** Foi a escolha explícita do usuário; não presumir autorização para trocar
o modelo de publicação ou cobrança por Reserved VM.

**How to apply:** Preservar a distinção entre aceitar o disparo e confirmar sua
conclusão. Agendamento externo acorda o app, mas polling e advisory locks não
tornam a execução em segundo plano durável. Não prometer execução garantida no
Autoscale; uma futura garantia requer rever o executor com o usuário.
