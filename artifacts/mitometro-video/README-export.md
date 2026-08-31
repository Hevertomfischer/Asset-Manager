# Guia de Exportação de Vídeos

A exportação (gravação) do vídeo do React para MP4 com áudio sincronizado usa `puppeteer-stream` (Chrome Headless com captura simultânea de áudio WebRTC — canais `tts`, `music`, `sfx` — e vídeo) e o FFmpeg (para converter o WebM capturado em MP4 H.264/AAC). Após a instalação das dependências de sistema (Chrome Headless + bibliotecas gráficas/áudio) e do FFmpeg/`ffprobe`, **a exportação roda com sucesso dentro deste próprio ambiente** — não é mais necessário rodar apenas na máquina local. O mesmo comando funciona localmente, desde que Node.js e FFmpeg estejam disponíveis.

O script `export.js` reencoda o resultado para um **framerate constante (CFR) de exatamente 30 fps**. Isto corrige o bug histórico em que o WebM do `puppeteer-stream` trazia timestamps em milissegundos, que o FFmpeg interpretava como ~1000 fps. Cada clipe também é aparado para começar no **primeiro frame real da timeline** (descartando um pré-roll limpo conhecido) e vai até o CTA final, com a **duração exata pretendida** por modo.

Além disso, o script garante que o **próprio stream de vídeo** alcance exatamente a duração-alvo. Anteriormente, quando o encoder do `puppeteer-stream` parava de produzir frames antes do fim do container/áudio, o stream de vídeo terminava ~0,3–0,67 s antes do container (faixa de vídeo curta/cauda congelada). Agora, após reamostrar para 30 fps, o FFmpeg **clona o último frame real renderizado (o CTA final)** com `tpad=stop_mode=clone` e então recorta (`trim`) exatamente na duração pretendida — de modo que o stream de vídeo contém precisamente `duração_alvo × 30` frames e termina no CTA. **Não há padding com frames em branco/erro**: apenas o CTA já renderizado é estendido, e somente no fim da timeline pretendida. O áudio AAC recebe `apad`+`atrim` para terminar exatamente no mesmo alvo, evitando descasamento áudio×vídeo.

> **Nota sobre a contagem "10".** O brief original menciona "10 vídeos", mas esse número é aritmeticamente inconsistente: são **6 modos** (`full` + cinco clipes standalone) vezes **2 proporções** (`9:16` e `16:9`), o que dá **12** combinações. O `export.js` gera todas as **12** combinações, depositadas em `exports/`.

### Como Gerar os 12 Vídeos

**1. Requisitos:**
- Node.js
- **FFmpeg** (inclui `ffprobe`) acessível no `PATH`.
- Dependências de sistema do Chrome Headless (já instaladas neste ambiente; em uma máquina local o `puppeteer` cuida do download do Chrome).

**2. Execução:**
```bash
cd artifacts/mitometro-video

# (Local) instale as dependências, se ainda não instaladas
npm install

# Inicie o servidor frontend em um terminal, passando as variáveis exigidas pela build deste monorepo
PORT=5173 BASE_PATH=/mitometro-video/ npm run dev

# Em outro terminal, rode o script de exportação (gera as 12 combinações em exports/)
TARGET_URL=http://localhost:5173/mitometro-video/ node export.js

# Filtros opcionais para renderizar um subconjunto
node export.js --mode=positioning --ratio=9:16
node export.js --mode=full

# Diagnóstico rápido: gera apenas positioning 9:16 e imprime as propriedades
# exatas via ffprobe, provando 30fps CFR + dimensões nativas + H.264/AAC.
TARGET_URL=http://localhost:5173/mitometro-video/ node export.js --diag
```

### Validação automática (ffprobe)

Ao final de cada clipe, `export.js` valida o MP4 com `ffprobe` e **falha (exit code ≠ 0)** se qualquer critério não bater:

- vídeo **H.264** e áudio **AAC** presentes;
- dimensões nativas exatas (`1080x1920` para `9:16`, `1920x1080` para `16:9`);
- **CFR ~30 fps** (`r_frame_rate` e `avg_frame_rate` ambos ≈ 30);
- **duração do STREAM de vídeo** dentro de **±0,12 s** do alvo (não apenas a duração do container) — garante que o vídeo não termina antes do container/áudio;
- **`nb_frames` do vídeo** igual a `duração_alvo × 30` dentro de **±2 frames** (ex.: `positioning` = 10 s → **300** frames; `full` = 27,5 s → **825** frames);
- **duração do STREAM de áudio** dentro de **±0,12 s** do alvo;
- duração do **container** dentro de **±0,12 s** da duração pretendida do modo (ex.: `positioning` = 10 s, `full` = 27,5 s).

Exemplo de saída do `--diag` neste ambiente: `positioning_9x16.mp4` → `1080x1920`, `r_frame_rate=30/1`, `avg_frame_rate=30/1`, vídeo `nb_frames=300`/`duration=10.000000`, áudio `duration≈10.0`, container `duration≈10.0`, áudio AAC.

### Como funciona (handshake determinístico)

Para evitar perder o primeiro segundo do vídeo (ou capturar um final congelado), o `export.js` usa um handshake determinístico com a página em modo `?export=true`:

1. Injeta `window.__MITOMETRO_EXPORT_START__ = false` **antes** de qualquer script da página rodar, de modo que a timeline do React e o autoplay de áudio **não iniciam** ao carregar. A página mantém um frame preto **limpo** enquanto o gate está fechado.
2. Navega, deixa fontes/assets estabilizarem e **configura a captura de vídeo+áudio da aba primeiro**.
3. **Warm-up determinístico:** aguarda o primeiro chunk real do stream de captura e um paint estável da página, e então mantém o frame preto limpo por um **pré-roll conhecido** (`PREROLL_MS = 1200`) com o encoder já quente e gravando. Só depois libera o gate (`window.__MITOMETRO_EXPORT_START__ = true` + evento `mitometro:export-start`). Isso elimina a perda dos primeiros 1–2 s de frames no arranque do stream.
4. Aguarda o **sinal real de fim de playback** (`window.__MITOMETRO_EXPORT_ENDED__` / evento `mitometro:export-ended`), e não um timeout arbitrário — há apenas um timeout de segurança para não travar. Após o sinal, mantém uma **cauda de flush** (`FLUSH_TAIL_MS = 800`) para não cortar os últimos frames do CTA nem o rabo do áudio.
5. Aguarda o stream WebM ser **totalmente escrito e fechado** antes de rodar o FFmpeg; em caso de falha o clipe é abortado e os parciais são limpos.
6. **Reencode FFmpeg → CFR 30 fps + stream de vídeo no alvo exato:** apara o pré-roll limpo conhecido (`-ss`), reamostra para exatamente 30 fps (`fps=30` + `-vsync cfr -r 30`, timestamps normalizados), **clona o frame final do CTA** (`tpad=stop_mode=clone`) e recorta na duração pretendida (`trim=duration=alvo`), muxando H.264 + AAC (áudio com `apad`+`atrim` no mesmo alvo). Assim o *stream* de vídeo começa no primeiro frame real, termina no CTA e contém exatamente `alvo × 30` frames — sem faixa de vídeo curta nem cauda congelada.
7. Após a conversão, valida o MP4 com `ffprobe` (H.264/AAC, dimensões nativas, CFR ~30 fps, **duração do stream de vídeo e `nb_frames` correspondentes a `alvo × 30`**, e duração de áudio/container dentro da tolerância). Se algum clipe for inválido, o script sai com código de saída **diferente de zero**.

Fora do modo de exportação (uso interativo do site), o gate fica sempre aberto e nada muda no comportamento. A interface possui o recurso automático de esconder os seletores flutuantes ao detectar `?export=true`, assegurando um frame perfeitamente limpo. Todos os vídeos são muxados e depositados na pasta local `/exports/`.
