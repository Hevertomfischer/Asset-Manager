---
name: Popularidade e cobertura parcial
description: Limiares aprovados, tratamento de ausência de dados e remoção dos fallbacks Globo autenticados.
---

Popularidade conhecida é uma fração real de escalações / total de times da mesma rodada. Desconhecida permanece `null`, sem atribuir 0%, 50% ou outro percentual.

O usuário aprovou diferencial abaixo de 15% e armadilha a partir de 60%, mantendo os critérios de risco e queda de forma. Destaques de diferenciais exigem pelo menos 5 pontos esperados e listas de destaques limitam-se a 5 jogadores.

Ausência comprovada numa lista consultada pode gerar diferencial com o selo **Fora dos mais escalados**, sem percentual. Uma resposta parcial não comprova ausência nas posições não cobertas.

**Why:** A fonte pública consultada trouxe apenas três atacantes, não uma distribuição representativa do mercado. O usuário aprovou os limiares como regra de produto, não como conclusão estatística.

**How to apply:** Usar as mesmas regras em projeções, notificações, simulação de trocas e páginas públicas/privadas. Não reinterpretar JSONs legados que usavam contagens ou defaults como percentuais válidos.

O usuário aprovou remover os dois fallbacks autenticados do Gato Mestre; manter somente fonte pública e cache.

**Why:** Os registros consultados mostraram tentativas sem nenhuma coleta autenticada bem-sucedida; o usuário escolheu remover ambos.

**How to apply:** Não reintroduzir requisições com cookies Globo nem pedir credenciais para buscar popularidade.
