import puppeteer from 'puppeteer';
import { launch, getStream } from 'puppeteer-stream';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// URL alvo configurável via env var para CI/CD (fallback: servidor do artefato Vite).
const TARGET_URL = process.env.TARGET_URL || 'http://localhost:18210/mitometro-video/';
const EXPORT_DIR = path.join(process.cwd(), 'exports');

// ---------------------------------------------------------------------------
// ESTRATÉGIA DE CAPTURA (substituição do vídeo congelado do puppeteer-stream)
// ---------------------------------------------------------------------------
// O track de VÍDEO do puppeteer-stream ficava congelado na Scene1 neste
// ambiente (só o áudio funcionava). Portanto NÃO reaproveitamos o vídeo dele.
//
// VÍDEO: capturado via DevTools Protocol (Page.startScreencast). Cada frame
//   chega como JPEG com um metadata.timestamp monotônico (segundos). O
//   screencast é VFR (só emite frame quando há mudança visual), então gravamos
//   cada JPEG em disco e montamos um arquivo de concat com a DURAÇÃO real de
//   cada frame (delta entre timestamps consecutivos). O ffmpeg reamostra esse
//   VFR para CFR 30fps exato — provando que os frames avançam de verdade.
//
// ÁUDIO: continua vindo do puppeteer-stream, porém em modo APENAS ÁUDIO
//   (audio:true, video:false). A música (music.wav autoPlay) só toca quando o
//   gate de export é liberado — o MESMO instante em que a timeline visual
//   começa —, então áudio e vídeo compartilham o t0 (release do gate) e ficam
//   sincronizados quadro-a-quadro pelo relógio de parede.
// ---------------------------------------------------------------------------

// Framerate final fixo — CFR (constant frame rate) padrão de 30 fps.
const TARGET_FPS = 30;

// Formato/qualidade dos frames do screencast. JPEG q80 é leve e suficiente
// para reencode H.264; a validação visual usa apenas luminância reduzida.
const SCREENCAST_FORMAT = 'jpeg';
const SCREENCAST_QUALITY = 90;

// Duração EXATA pretendida de cada clipe (soma das cenas configuradas em
// src/App.tsx CLIP_MODES). É a duração-alvo do MP4 final, usada tanto para
// aparar o excesso no ffmpeg quanto para validar o resultado com ffprobe.
//   full:            4000+4000+4500+4500+4500+6000 = 27500
//   positioning:     5000+5000                     = 10000
//   demonstration:   3000+7000+4000                = 14000
//   explainability:  8000+6000                     = 14000
//   comparison:      6000+4000                      = 10000
//   transparency:    3000+8000+4000                 = 15000
const CLIP_EXPECTED_MS = {
  full: 27500,
  positioning: 10000,
  demonstration: 14000,
  explainability: 14000,
  comparison: 10000,
  transparency: 15000,
};

// Sequência EXATA de cenas por modo (chave + duração em ms), espelhando
// src/App.tsx CLIP_MODES. Usado pela validação visual para saber quantas cenas
// distintas cada MP4 deve conter e em que instante cada cena está no ar. A soma
// das durações de cada modo bate com CLIP_EXPECTED_MS acima.
const CLIP_SCENE_SEQUENCE = {
  full: [
    ['scene1', 4000], ['scene2', 4000], ['scene3', 4500],
    ['scene4', 4500], ['scene5', 4500], ['scene6', 6000],
  ],
  positioning: [['scene1', 5000], ['scene6', 5000]],
  demonstration: [['scene1', 3000], ['scene3', 7000], ['scene6', 4000]],
  explainability: [['scene4', 8000], ['scene6', 6000]],
  comparison: [['scene2', 6000], ['scene6', 4000]],
  transparency: [['scene1', 3000], ['scene5', 8000], ['scene6', 4000]],
};

// Timeout de SEGURANÇA por clipe: só serve para não travar caso o sinal real
// de fim de playback ('mitometro:export-ended') nunca chegue. Damos folga
// generosa sobre a duração pretendida.
const SAFETY_MARGIN_MS = 6000;

// Pré-roll limpo determinístico: após configurar a captura, mantemos o frame
// preto limpo (o gate segura a timeline) por este intervalo ANTES de liberar a
// timeline. Isso garante que o stream/renderer/encoder já estejam "aquecidos"
// e produzindo frames quando o primeiro frame real aparece — nenhum frame
// inicial da timeline é perdido no arranque do stream. Aparamos exatamente
// este pré-roll no ffmpeg, de modo que o clipe final começa no primeiro frame
// real e vai até o CTA final.
const PREROLL_MS = 1200;

// Cauda de flush após o sinal real de fim: continuamos capturando por este
// intervalo para não cortar os últimos frames do CTA nem o rabo do áudio,
// dando tempo do muxer/encoder esvaziar seus buffers.
const FLUSH_TAIL_MS = 800;

// Tolerância de duração na validação (segundos). Agora o STREAM de vídeo é
// forçado a atingir exatamente o alvo (via tpad clonando o frame final + trim),
// então a duração do vídeo, do áudio e do container batem no alvo com folga
// mínima — apenas o arredondamento inerente ao encode/muxer.
const DURATION_TOLERANCE_S = 0.12;

// Tolerância de contagem de frames na validação (frames). O stream deve conter
// exatamente target_s × 30 frames; permitimos um pequeno desvio para absorver o
// arredondamento do encoder/muxer (ex.: 1–2 frames num keyframe de borda).
const FRAME_TOLERANCE = 2;

// Tolerância de fps na validação — precisa ser CFR ~30.
const FPS_TOLERANCE = 0.5;

// Seis modos (full + cinco clipes standalone) x duas proporções = 12 MP4s.
const CLIP_MODES = Object.keys(CLIP_EXPECTED_MS);

const RATIOS = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
};

function safeUnlink(file) {
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* ignore cleanup errors */
  }
}

/**
 * Aguarda o primeiro chunk real chegar do stream de captura do puppeteer-stream.
 * Isso confirma que o pipeline de captura/encoder já está produzindo frames
 * antes de liberarmos a timeline — parte do warm-up determinístico. Não consome
 * dados do stream (usa 'once' passivo); resolve por timeout como fallback para
 * nunca travar.
 */
function waitForFirstChunk(stream, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stream.removeListener('data', onData);
      resolve();
    };
    const onData = () => finish();
    const timer = setTimeout(finish, timeoutMs);
    // 'data' em modo passivo: o pipe para o arquivo continua recebendo tudo.
    stream.once('data', onData);
  });
}

/** Aguarda o stream de escrita terminar de fato (finish/close), com timeout. */
function awaitWritableClose(fileStream, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error('Timeout aguardando o fechamento do stream WebM.')),
      timeoutMs,
    );
    fileStream.on('finish', () => finish());
    fileStream.on('close', () => finish());
    fileStream.on('error', (err) => finish(err));
  });
}

/**
 * Destrói o stream puppeteer-stream de forma segura:
 *  1. Remove o pipe para o arquivo (evita writes após destroy).
 *  2. Chama destroy() e aguarda o evento 'close' com timeout.
 * Retorna sempre — nunca lança, para que o caminho de erro nunca trave.
 */
async function destroyStream(stream, fileStream) {
  if (!stream) return;
  try {
    if (fileStream) {
      try { stream.unpipe(fileStream); } catch { /* ignore */ }
    }
    // Sinaliza ao readable que não queremos mais dados.
    if (!stream.destroyed) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 5000); // máx 5 s para fechar
        stream.once('close', () => { clearTimeout(t); resolve(); });
        stream.once('error', () => { clearTimeout(t); resolve(); });
        try { stream.destroy(); } catch { clearTimeout(t); resolve(); }
      });
    }
  } catch {
    /* always swallow — cleanup must not throw */
  }
}

/** Converte "30/1" ou "30000/1001" em número de fps. */
function parseFrameRate(str) {
  if (!str || typeof str !== 'string') return NaN;
  const [num, den] = str.split('/');
  const n = Number(num);
  const d = den === undefined ? 1 : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return NaN;
  return n / d;
}

// ---------------------------------------------------------------------------
// Validação VISUAL real: prova que o MP4 preserva o avanço das cenas do React
// (não congela na Scene1). Amostra o quadro no MEIO de cada cena da sequência
// do modo, reduz para uma assinatura 16x16 em tons de cinza e exige que:
//   (1) cada quadro amostrado tenha conteúdo (não seja preto/quase-preto);
//   (2) cenas ADJACENTES sejam visualmente distintas (o avanço aconteceu);
//   (3) nenhuma cena da sequência apareça idêntica a outra cena diferente
//       (nenhuma cena "presa"/duplicada — captura do freeze histórico).
// Não depende de OCR (indisponível): usa apenas ffmpeg + comparação de bytes.
// ---------------------------------------------------------------------------

// Assinatura RGB NxN por quadro. RGB (não cinza) porque cenas escuras se parecem
// muito em tons de cinza de baixa resolução, mas têm ACENTOS DE COR distintos
// (vermelho "Palpite", verde do campo, laranja "transparência"), o que separa
// bem cenas legítimas de um freeze.
const SIG_DIM = 32; // assinatura NxN
const SIG_SAMPLE_FRAC = 0.62; // amostra a ~62% de cada cena: conteúdo já assentado,
//                               antes da transição de saída.
// Brilho médio mínimo (0-255) p/ o quadro "ter conteúdo". Cenas escuras legítimas
// medem ~17; um quadro preto/vazio mede ~0-2. 5 separa com folga.
const SIG_BLACK_MEAN_MIN = 5;
// Diferença média absoluta (MAD, 0-255) mínima entre quadros de cenas diferentes.
// Medição empírica: cenas que AVANÇAM ficam ≥ ~7 (par legítimo mais próximo:
// scene1↔scene2 ≈ 7,1); um vídeo CONGELADO mede ~0. 3,5 fica no meio, detectando
// o freeze com ~2× de margem sem reprovar avanço legítimo.
const SIG_DISTINCT_MAD_MIN = 3.5;
// Limiar (mais frouxo) da checagem informativa entre TODAS as cenas distintas:
// cenas escuras não-adjacentes podem se aproximar, então só avisamos (não falha)
// abaixo deste valor, reservando a FALHA para a checagem entre cenas adjacentes.
const SIG_ALLPAIRS_WARN_MAD = 3.5;

/**
 * Extrai a assinatura RGB SIG_DIM×SIG_DIM de um quadro no instante `atSec`.
 * Retorna um Uint8Array de SIG_DIM*SIG_DIM*3 bytes (pixel data do PPM P6).
 */
function frameSignature(file, atSec, tmpPpm) {
  execFileSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error',
      '-ss', String(atSec),
      '-i', file,
      '-frames:v', '1',
      '-vf', `scale=${SIG_DIM}:${SIG_DIM},format=rgb24`,
      '-f', 'image2', '-pix_fmt', 'rgb24',
      tmpPpm,
    ],
    { stdio: 'ignore' },
  );
  const buf = fs.readFileSync(tmpPpm);
  // PPM binário (P6): cabeçalho ASCII "P6\n<w> <h>\n<maxval>\n" seguido dos pixels.
  // Localiza o fim do cabeçalho após o terceiro token separado por whitespace.
  let pos = 0;
  let tokens = 0;
  while (pos < buf.length && tokens < 3) {
    while (pos < buf.length && /\s/.test(String.fromCharCode(buf[pos]))) pos++;
    while (pos < buf.length && !/\s/.test(String.fromCharCode(buf[pos]))) pos++;
    tokens++;
  }
  pos++; // pula o único whitespace após o maxval
  const pixels = buf.subarray(pos, pos + SIG_DIM * SIG_DIM * 3);
  return Uint8Array.from(pixels);
}

function signatureMean(sig) {
  let sum = 0;
  for (let i = 0; i < sig.length; i++) sum += sig[i];
  return sum / sig.length;
}

/** Diferença média absoluta (0-255) entre duas assinaturas do mesmo tamanho. */
function signatureMad(a, b) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

/**
 * Valida VISUALMENTE que o MP4 preserva o avanço das cenas.
 *
 * @param file       caminho do MP4 final
 * @param mode       modo do clipe (chave de CLIP_SCENE_SEQUENCE)
 * @param expectedMs duração-alvo do clipe (ms)
 * @returns { samples: [{ scene, atSec, mean }], boundaries: [...] }
 */
function validateSceneAdvancement(file, mode, expectedMs) {
  const seq = CLIP_SCENE_SEQUENCE[mode];
  if (!seq || seq.length === 0) {
    throw new Error(`Sem sequência de cenas conhecida para o modo "${mode}".`);
  }

  const totalSeqMs = seq.reduce((acc, [, d]) => acc + d, 0);
  const targetS = expectedMs / 1000;

  // Instante de amostragem = meio de cada cena, escalado para a duração real do
  // MP4 (que começa no primeiro quadro real após aparar o pré-roll).
  const scale = targetS / (totalSeqMs / 1000);
  const samples = [];
  let cursorMs = 0;
  for (const [scene, durMs] of seq) {
    const midMs = cursorMs + durMs / 2;
    // pequena folga p/ evitar sobreposição com transições de entrada/saída
    const atSec = Math.min(targetS - 0.1, Math.max(0.1, (midMs / 1000) * scale));
    samples.push({ scene, atSec: Number(atSec.toFixed(3)) });
    cursorMs += durMs;
  }

  const tmpPgm = path.join(EXPORT_DIR, `.sig_${mode}_${process.pid}.pgm`);
  const sigs = [];
  try {
    for (const s of samples) {
      const sig = frameSignature(file, s.atSec, tmpPgm);
      s.mean = Number(signatureMean(sig).toFixed(2));
      sigs.push(sig);
    }
  } finally {
    safeUnlink(tmpPgm);
  }

  // (1) Conteúdo: nenhum quadro amostrado pode ser preto/quase-preto.
  samples.forEach((s) => {
    if (s.mean < SIG_BLACK_MEAN_MIN) {
      throw new Error(
        `Validação visual falhou: cena "${s.scene}" @${s.atSec}s está preta/vazia ` +
          `(brilho médio ${s.mean} < ${SIG_BLACK_MEAN_MIN}).`,
      );
    }
  });

  // (2) Avanço: cenas ADJACENTES precisam diferir visualmente.
  const boundaries = [];
  for (let i = 1; i < samples.length; i++) {
    const mad = signatureMad(sigs[i - 1], sigs[i]);
    boundaries.push({ from: samples[i - 1].scene, to: samples[i].scene, mad: Number(mad.toFixed(2)) });
    if (mad < SIG_DISTINCT_MAD_MIN) {
      throw new Error(
        `Validação visual falhou: "${samples[i - 1].scene}" @${samples[i - 1].atSec}s e ` +
          `"${samples[i].scene}" @${samples[i].atSec}s são quase idênticas ` +
          `(MAD ${mad} < ${SIG_DISTINCT_MAD_MIN}) — o vídeo parece CONGELADO (freeze).`,
      );
    }
  }

  // (3) Nenhuma cena DISTINTA pode aparecer idêntica a outra cena distinta.
  //     (cenas repetidas na sequência — ex.: scene1 em modos diferentes — não
  //      se aplicam pois comparamos por instante/ocorrência, não por chave).
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      if (samples[i].scene === samples[j].scene) continue;
      const mad = signatureMad(sigs[i], sigs[j]);
      if (mad < SIG_DISTINCT_MAD_MIN) {
        throw new Error(
          `Validação visual falhou: cenas distintas "${samples[i].scene}" @${samples[i].atSec}s e ` +
            `"${samples[j].scene}" @${samples[j].atSec}s são quase idênticas (MAD ${mad}) — ` +
            `provável freeze: o vídeo não avançou.`,
        );
      }
    }
  }

  return { samples, boundaries };
}

/**
 * Valida o MP4 gerado com ffprobe: precisa de vídeo H.264, dimensões nativas,
 * áudio AAC, framerate CFR ~30 fps e duração próxima da pretendida.
 *
 * @param file          caminho do MP4
 * @param ratio         { width, height } dimensões nativas esperadas
 * @param expectedMs    duração pretendida em ms (para tolerância de duração)
 */
function validateMp4(file, ratio, expectedMs) {
  let raw;
  try {
    raw = execFileSync(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      { encoding: 'utf8' },
    );
  } catch (err) {
    throw new Error(`ffprobe falhou ao inspecionar ${path.basename(file)}: ${err.message}`);
  }

  const info = JSON.parse(raw);
  const streams = info.streams || [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');

  if (!video) throw new Error('MP4 inválido: nenhum stream de vídeo encontrado.');
  if (!audio) throw new Error('MP4 inválido: nenhum stream de áudio encontrado.');

  if (video.codec_name !== 'h264') {
    throw new Error(`MP4 inválido: vídeo esperado H.264, obtido "${video.codec_name}".`);
  }
  if (audio.codec_name !== 'aac') {
    throw new Error(`MP4 inválido: áudio esperado AAC, obtido "${audio.codec_name}".`);
  }

  const width = Number(video.width);
  const height = Number(video.height);
  if (!width || !height) throw new Error('MP4 inválido: dimensões de vídeo ausentes.');
  if (width !== ratio.width || height !== ratio.height) {
    throw new Error(
      `MP4 inválido: dimensões ${width}x${height} diferem do esperado ${ratio.width}x${ratio.height}.`,
    );
  }

  // Framerate: precisa ser CFR ~30. Num CFR verdadeiro r_frame_rate e
  // avg_frame_rate coincidem; exigimos ambos ~30 dentro da tolerância.
  const rFps = parseFrameRate(video.r_frame_rate);
  const avgFps = parseFrameRate(video.avg_frame_rate);
  if (!Number.isFinite(rFps) || Math.abs(rFps - TARGET_FPS) > FPS_TOLERANCE) {
    throw new Error(
      `MP4 inválido: r_frame_rate ${video.r_frame_rate} (~${rFps}) fora de ${TARGET_FPS}±${FPS_TOLERANCE} fps.`,
    );
  }
  if (!Number.isFinite(avgFps) || Math.abs(avgFps - TARGET_FPS) > FPS_TOLERANCE) {
    throw new Error(
      `MP4 inválido: avg_frame_rate ${video.avg_frame_rate} (~${avgFps}) fora de ${TARGET_FPS}±${FPS_TOLERANCE} fps (esperado CFR).`,
    );
  }

  const expectedS = expectedMs / 1000;
  const expectedFrames = Math.round(expectedS * TARGET_FPS);

  // Duração do CONTAINER (referência secundária).
  const duration = Number(info.format?.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0.5) {
    throw new Error(`MP4 inválido: duração de container muito curta ou ausente (${duration}s).`);
  }
  if (Math.abs(duration - expectedS) > DURATION_TOLERANCE_S) {
    throw new Error(
      `MP4 inválido: duração de container ${duration.toFixed(3)}s difere do alvo ${expectedS.toFixed(3)}s ` +
        `além da tolerância de ±${DURATION_TOLERANCE_S}s.`,
    );
  }

  // Duração do STREAM DE VÍDEO em si — este é o critério central do bug: o
  // stream de vídeo precisa alcançar o alvo, e não terminar antes do container.
  const videoDuration = Number(video.duration);
  if (!Number.isFinite(videoDuration) || videoDuration <= 0.5) {
    throw new Error(
      `MP4 inválido: duração do stream de vídeo ausente ou muito curta (${video.duration}).`,
    );
  }
  if (Math.abs(videoDuration - expectedS) > DURATION_TOLERANCE_S) {
    throw new Error(
      `MP4 inválido: stream de vídeo dura ${videoDuration.toFixed(3)}s, difere do alvo ` +
        `${expectedS.toFixed(3)}s além da tolerância de ±${DURATION_TOLERANCE_S}s ` +
        `(o vídeo estaria terminando antes do container/áudio).`,
    );
  }

  // Contagem de frames — precisa corresponder a target_s × 30 dentro da
  // tolerância mínima de frames. Garante que o stream de vídeo é longo o
  // suficiente (sem cauda curta/congelada) e é CFR verdadeiro a 30fps.
  const nbFrames = Number(video.nb_frames);
  if (!Number.isFinite(nbFrames) || nbFrames <= 0) {
    throw new Error(`MP4 inválido: nb_frames do vídeo ausente ou zero (${video.nb_frames}).`);
  }
  if (Math.abs(nbFrames - expectedFrames) > FRAME_TOLERANCE) {
    throw new Error(
      `MP4 inválido: nb_frames ${nbFrames} difere do esperado ${expectedFrames} ` +
        `(= ${expectedS.toFixed(3)}s × ${TARGET_FPS}fps) além da tolerância de ±${FRAME_TOLERANCE} frames.`,
    );
  }

  // Duração do STREAM DE ÁUDIO — precisa também estar perto do alvo, para não
  // haver descasamento áudio×vídeo nem cauda de áudio pendurada.
  const audioDuration = Number(audio.duration);
  if (!Number.isFinite(audioDuration) || audioDuration <= 0.5) {
    throw new Error(
      `MP4 inválido: duração do stream de áudio ausente ou muito curta (${audio.duration}).`,
    );
  }
  if (Math.abs(audioDuration - expectedS) > DURATION_TOLERANCE_S) {
    throw new Error(
      `MP4 inválido: stream de áudio dura ${audioDuration.toFixed(3)}s, difere do alvo ` +
        `${expectedS.toFixed(3)}s além da tolerância de ±${DURATION_TOLERANCE_S}s.`,
    );
  }

  return { width, height, duration, videoDuration, audioDuration, nbFrames, fps: rFps };
}

/**
 * Cria um browser (via puppeteer-stream launch, necessário para o track de
 * ÁUDIO) com a janela nativa exatamente no tamanho do ratio solicitado. O
 * screencast do CDP também respeita esse tamanho de renderer. Precisa ser um
 * browser NOVO por ratio, pois o Chrome não redimensiona a janela entre abas
 * de forma confiável.
 */
async function launchBrowserForRatio(ratio) {
  const execPath = await puppeteer.executablePath();
  return launch({
    executablePath: execPath,
    // defaultViewport deve corresponder exatamente ao window-size para que o
    // renderer e o capturador concordem nas dimensões.
    defaultViewport: { width: ratio.width, height: ratio.height, deviceScaleFactor: 1 },
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      // Define a janela nativa do Chrome para este ratio.
      `--window-size=${ratio.width},${ratio.height}`,
    ],
  });
}

// ---------------------------------------------------------------------------
// Captura de VÍDEO via CDP Page.startScreencast.
// ---------------------------------------------------------------------------

/**
 * Recorder de screencast. Grava cada frame JPEG em `dir` e mantém a lista
 * ordenada de { index, ts } (ts = metadata.timestamp em segundos). Faz o ACK
 * de cada frame (obrigatório: sem ACK o Chrome para de emitir frames).
 */
function createScreencastRecorder(client, dir) {
  const frames = []; // { file, ts }
  let handler = null;
  let stopped = false;

  const onFrame = async (ev) => {
    if (stopped) return;
    const { data, metadata, sessionId } = ev;
    const idx = frames.length;
    const file = path.join(dir, `f_${String(idx).padStart(6, '0')}.jpg`);
    try {
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      frames.push({ file, ts: metadata.timestamp });
    } catch {
      /* ignore write hiccup — frame simply skipped */
    }
    // ACK sempre, mesmo em erro de escrita, para não travar o pipeline.
    try {
      await client.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* session may be closing */
    }
  };

  return {
    frames,
    async start(ratio) {
      handler = onFrame;
      client.on('Page.screencastFrame', handler);
      await client.send('Page.startScreencast', {
        format: SCREENCAST_FORMAT,
        quality: SCREENCAST_QUALITY,
        everyNthFrame: 1,
        maxWidth: ratio.width,
        maxHeight: ratio.height,
      });
    },
    async stop() {
      stopped = true;
      try { await client.send('Page.stopScreencast'); } catch { /* ignore */ }
      if (handler) {
        try { client.off('Page.screencastFrame', handler); } catch { /* ignore */ }
        handler = null;
      }
    },
  };
}

/**
 * Constrói um vídeo H.264 CFR 30fps a partir dos frames do screencast.
 *
 * Recebe apenas os frames a partir de `t0Sec` (timestamp do release do gate),
 * de modo que o clipe comece no primeiro quadro real da timeline. A duração de
 * cada frame é o delta até o próximo timestamp (o último frame é clonado até
 * atingir a duração-alvo, estendendo o CTA já renderizado — nunca preto).
 *
 * @returns caminho de um arquivo .mp4 apenas-vídeo (sem áudio).
 */
function buildVideoFromFrames(frames, t0Sec, ratio, expectedMs, concatPath, videoOnlyMp4) {
  const targetS = expectedMs / 1000;

  // Seleciona os frames a partir do t0 (release do gate). Mantemos 1 frame
  // imediatamente anterior ao t0, se existir, para cobrir o instante exato do
  // release sem buraco no início.
  const kept = [];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].ts >= t0Sec) {
      if (kept.length === 0 && i > 0) kept.push(frames[i - 1]);
      kept.push(frames[i]);
    }
  }
  if (kept.length === 0) {
    // Fallback: sem frames após t0, usa todos os disponíveis.
    kept.push(...frames);
  }
  if (kept.length === 0) {
    throw new Error('Screencast não produziu nenhum frame de vídeo.');
  }

  // Normaliza os timestamps para começar em 0 no primeiro frame mantido.
  const base = kept[0].ts;
  const rel = kept.map((f) => ({ file: f.file, t: Math.max(0, f.ts - base) }));

  // Monta o arquivo de concat com a duração real de cada frame (delta até o
  // próximo). O último frame recebe duração suficiente para cobrir até o alvo
  // (clonagem do CTA final), depois o ffmpeg apara com -t exato.
  const MIN_DUR = 1 / (TARGET_FPS * 4); // evita duração zero em bursts
  const lines = [];
  for (let i = 0; i < rel.length; i++) {
    const cur = rel[i];
    let dur;
    if (i < rel.length - 1) {
      dur = Math.max(MIN_DUR, rel[i + 1].t - cur.t);
    } else {
      // Último frame: estende até ultrapassar o alvo com folga.
      dur = Math.max(MIN_DUR, targetS - cur.t + 1.0);
    }
    // O concat demuxer exige que o último arquivo seja repetido sem duration
    // final; emitimos duration em todos e repetimos o último file no fim.
    lines.push(`file '${cur.file.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${dur.toFixed(6)}`);
  }
  // Repetição do último arquivo (requisito do concat demuxer p/ honrar a
  // última duration).
  lines.push(`file '${rel[rel.length - 1].file.replace(/'/g, "'\\''")}'`);

  fs.writeFileSync(concatPath, lines.join('\n') + '\n');

  // VFR (concat) → CFR 30fps exato, aparado na duração-alvo. Sem áudio aqui.
  const durationSec = targetS.toFixed(3);
  execFileSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0',
      '-i', concatPath,
      '-vf', `fps=${TARGET_FPS},scale=${ratio.width}:${ratio.height}:flags=bicubic,setpts=PTS-STARTPTS`,
      '-t', durationSec,
      '-vsync', 'cfr',
      '-r', String(TARGET_FPS),
      '-an',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-video_track_timescale', String(TARGET_FPS * 1000),
      videoOnlyMp4,
    ],
    { stdio: 'ignore' },
  );

  return { keptCount: kept.length, spanSec: rel[rel.length - 1].t };
}

async function exportVideo(mode, ratioName, browser) {
  const ratio = RATIOS[ratioName];
  const safeRatioName = ratioName.replace(':', 'x');
  const audioWebm = path.join(EXPORT_DIR, `.audio_${mode}_${safeRatioName}.webm`);
  const videoOnlyMp4 = path.join(EXPORT_DIR, `.video_${mode}_${safeRatioName}.mp4`);
  const concatPath = path.join(EXPORT_DIR, `.concat_${mode}_${safeRatioName}.txt`);
  const framesDir = path.join(EXPORT_DIR, `.frames_${mode}_${safeRatioName}`);
  const mp4Filename = path.join(EXPORT_DIR, `${mode}_${safeRatioName}.mp4`);
  const expectedMs = CLIP_EXPECTED_MS[mode];
  const maxMs = expectedMs + SAFETY_MARGIN_MS;

  console.log(`\nIniciando renderização: ${mode} (${ratioName})`);

  // Limpa artefatos antigos deste clipe para nunca reaproveitar parciais.
  safeUnlink(audioWebm);
  safeUnlink(videoOnlyMp4);
  safeUnlink(concatPath);
  safeUnlink(mp4Filename);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  // O browser do puppeteer-stream carrega uma extensão que abre a própria
  // options page. Um newPage() pode, numa corrida, devolver justamente essa
  // aba de extensão (chrome-extension://…), fazendo o page.goto seguinte
  // falhar com ERR_BLOCKED_BY_CLIENT. Criamos páginas até obter uma que não
  // seja da extensão.
  let page = await browser.newPage();
  for (let attempt = 0; attempt < 5 && page.url().startsWith('chrome-extension://'); attempt++) {
    page = await browser.newPage();
  }
  let audioStream = null;
  let audioFile = null;
  let client = null;
  let recorder = null;

  try {
    await page.setViewport({ width: ratio.width, height: ratio.height, deviceScaleFactor: 1 });

    // Injeta o gate ANTES de qualquer script da página rodar, garantindo que
    // o React (export=true) não inicie a timeline/áudio até liberarmos.
    await page.evaluateOnNewDocument(() => {
      window.__MITOMETRO_EXPORT_START__ = false;
      window.__MITOMETRO_EXPORT_ENDED__ = false;
    });

    const url = `${TARGET_URL}?mode=${mode}&ratio=${ratioName}&export=true`;
    console.log(`Navegando para: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 500));

    // 1) ÁUDIO: puppeteer-stream em modo APENAS ÁUDIO (o vídeo dele congela).
    audioStream = await getStream(page, { audio: true, video: false, frameSize: 60 });
    audioFile = fs.createWriteStream(audioWebm);
    const streamErrored = new Promise((_, reject) => {
      audioStream.on('error', reject);
      audioFile.on('error', reject);
    });
    audioStream.pipe(audioFile);
    // Marca o instante em que o áudio começou a ser capturado (relógio de
    // parede). A música só toca no release do gate; medimos o offset para
    // aparar o silêncio inicial do áudio.
    const audioStartWall = Date.now();
    await waitForFirstChunk(audioStream, 5000);

    // 2) VÍDEO: sessão CDP + screencast. Frames chegam como JPEG com timestamp.
    client = await page.createCDPSession();
    await client.send('Page.enable');
    recorder = createScreencastRecorder(client, framesDir);
    await recorder.start(ratio);

    // 3) WARM-UP: garante que o screencast já está emitindo frames e o DOM
    //    pronto para pintar antes de liberar a timeline.
    await page
      .evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
      }))
      .catch(() => {});
    await new Promise((r) => setTimeout(r, PREROLL_MS));

    // 4) Libera o gate — t0 do vídeo E do áudio (music.wav autoPlay monta agora).
    const gateWall = Date.now();
    // Timestamp do CDP no momento do release: captura o metadata.timestamp do
    // último frame emitido; frames com ts >= este valor são a timeline real.
    const framesBeforeGate = recorder.frames.length;
    const t0Sec =
      framesBeforeGate > 0
        ? recorder.frames[framesBeforeGate - 1].ts
        : 0;
    await page.evaluate(() => {
      window.__MITOMETRO_EXPORT_START__ = true;
      window.dispatchEvent(new Event('mitometro:export-start'));
    });
    await page
      .evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
      }))
      .catch(() => {});
    console.log(
      `Screencast quente após pré-roll de ${PREROLL_MS}ms (${framesBeforeGate} frames de aquecimento); timeline liberada. Aguardando fim real do playback...`,
    );

    // 5) Aguarda o sinal REAL de fim de playback, com timeout de segurança.
    const playbackEnded = page
      .evaluate((timeout) => {
        return new Promise((resolve) => {
          if (window.__MITOMETRO_EXPORT_ENDED__ === true) return resolve('ended');
          const done = (v) => resolve(v);
          window.addEventListener('mitometro:export-ended', () => done('ended'), { once: true });
          const poll = setInterval(() => {
            if (window.__MITOMETRO_EXPORT_ENDED__ === true) {
              clearInterval(poll);
              done('ended');
            }
          }, 50);
          setTimeout(() => {
            clearInterval(poll);
            done('timeout');
          }, timeout);
        });
      }, maxMs)
      .then((reason) => {
        if (reason === 'timeout') {
          console.warn(`⚠️ Sinal de fim não recebido em ${maxMs}ms; encerrando por timeout de segurança.`);
        }
      });

    await Promise.race([playbackEnded, streamErrored]);

    // 6) CAUDA DE FLUSH — segura mais um instante para capturar os últimos
    //    frames do CTA e o rabo do áudio.
    await new Promise((r) => setTimeout(r, FLUSH_TAIL_MS));

    // 7) Encerra o screencast e o áudio.
    await recorder.stop();
    const capturedAudio = audioFile;
    await destroyStream(audioStream, capturedAudio);
    audioStream = null;
    capturedAudio.end();
    await awaitWritableClose(capturedAudio);
    audioFile = null;

    if (recorder.frames.length === 0) {
      throw new Error('Screencast não capturou nenhum frame — vídeo indisponível.');
    }
    if (!fs.existsSync(audioWebm) || fs.statSync(audioWebm).size === 0) {
      throw new Error('Áudio (puppeteer-stream) vazio ou não gerado.');
    }

    console.log(
      `Capturados ${recorder.frames.length} frames de screencast. Montando vídeo CFR ${TARGET_FPS}fps...`,
    );

    // 8) Monta o vídeo H.264 CFR a partir dos frames (VFR → CFR + trim exato).
    const build = buildVideoFromFrames(
      recorder.frames,
      t0Sec,
      ratio,
      expectedMs,
      concatPath,
      videoOnlyMp4,
    );
    console.log(
      `   → ${build.keptCount} frames pós-gate, span ${build.spanSec.toFixed(2)}s.`,
    );

    // 9) MUX: vídeo CFR (sem áudio) + áudio AAC do puppeteer-stream. O áudio é
    //    aparado a partir do offset gate−audioStart (elimina o silêncio inicial)
    //    e, com apad+atrim, termina exatamente na duração-alvo. Sincronizados
    //    porque ambos partem do release do gate.
    const durationSec = (expectedMs / 1000).toFixed(3);
    const audioOffsetSec = Math.max(0, (gateWall - audioStartWall) / 1000).toFixed(3);
    const audioFilter =
      `aresample=async=1:first_pts=0,` +
      `apad,` +
      `atrim=duration=${durationSec},` +
      `asetpts=PTS-STARTPTS`;
    execFileSync(
      'ffmpeg',
      [
        '-y', '-loglevel', 'error',
        '-i', videoOnlyMp4,
        '-fflags', '+genpts',
        '-ss', audioOffsetSec,
        '-i', audioWebm,
        '-af', audioFilter,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-shortest',
        '-movflags', '+faststart',
        mp4Filename,
      ],
      { stdio: 'ignore' },
    );

    // 10) Validação estrutural (dimensões, H.264/AAC, CFR ~30fps, duração/frames).
    const meta = validateMp4(mp4Filename, ratio, expectedMs);

    // 11) Validação VISUAL: prova que as cenas avançam (sem freeze na Scene1).
    const visual = validateSceneAdvancement(mp4Filename, mode, expectedMs);
    const sampleStr = visual.samples
      .map((s) => `${s.scene}@${s.atSec}s(μ${s.mean})`)
      .join(' → ');
    const minMad = visual.boundaries.length
      ? Math.min(...visual.boundaries.map((b) => b.mad))
      : Infinity;

    console.log(
      `✅ Salvo: ${path.basename(mp4Filename)} ` +
        `(${meta.width}x${meta.height}, container ${meta.duration.toFixed(3)}s, ` +
        `vídeo ${meta.videoDuration.toFixed(3)}s/${meta.nbFrames}f, áudio ${meta.audioDuration.toFixed(3)}s, ` +
        `${meta.fps.toFixed(2)}fps CFR, H.264/AAC)`,
    );
    console.log(
      `   🎬 Cenas OK (avanço preservado, sem freeze): ${sampleStr}` +
        (Number.isFinite(minMad) ? `  [MAD mín. entre cenas: ${minMad.toFixed(1)}]` : ''),
    );

    // Remove os temporários só após sucesso comprovado.
    safeUnlink(audioWebm);
    safeUnlink(videoOnlyMp4);
    safeUnlink(concatPath);
    fs.rmSync(framesDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`❌ Falha no clipe ${mode} (${ratioName}): ${err.message}`);
    try { if (recorder) await recorder.stop(); } catch { /* ignore */ }
    await destroyStream(audioStream, audioFile);
    audioStream = null;
    try { if (audioFile && !audioFile.destroyed) audioFile.destroy(); } catch { /* ignore */ }
    audioFile = null;
    safeUnlink(audioWebm);
    safeUnlink(videoOnlyMp4);
    safeUnlink(concatPath);
    safeUnlink(mp4Filename);
    fs.rmSync(framesDir, { recursive: true, force: true });
    throw err;
  } finally {
    try { if (client) await client.detach(); } catch { /* ignore */ }
    try { await page.close(); } catch { /* ignore */ }
  }
}

/**
 * Fecha o browser de forma robusta: tenta browser.close() com timeout de 10 s.
 * Se ainda assim travar, mata o processo Chrome via browser.process().kill().
 */
async function closeBrowser(browser) {
  if (!browser) return;
  const closeTimeout = new Promise((resolve) => setTimeout(resolve, 10000));
  try {
    await Promise.race([browser.close(), closeTimeout]);
  } catch { /* ignore */ }
  // Garantia final: matar o processo Chrome diretamente se ainda estiver vivo.
  try {
    const proc = browser.process();
    if (proc && !proc.killed) proc.kill('SIGKILL');
  } catch { /* ignore */ }
}

/**
 * Extrai a assinatura 16x16 de um instante e devolve também um md5 do PNG do
 * frame em resolução real, para prova adicional de que o conteúdo difere byte
 * a byte (não apenas na assinatura reduzida).
 */
function frameFullHash(file, atSec) {
  const raw = execFileSync(
    'ffmpeg',
    [
      '-loglevel', 'error',
      '-ss', String(atSec),
      '-i', file,
      '-frames:v', '1',
      '-f', 'md5', '-',
    ],
    { encoding: 'utf8' },
  );
  const m = raw.match(/MD5=([0-9a-f]+)/i);
  return m ? m[1] : raw.trim();
}

/**
 * Diagnóstico: captura um clipe e PROVA que o vídeo não é estático. Usa `full`
 * por padrão (contém scene1 seguido de scene2), de modo que possamos amostrar
 * explicitamente Scene 1 e Scene 2 e provar que diferem — não apenas nos
 * metadados, mas nos PIXELS (hash md5 do frame completo + MAD da assinatura).
 *
 * --diag           → diagnóstico completo em `full` 9:16.
 * --diag=short     → diagnóstico curto em `positioning` 9:16 (mais rápido).
 * --diag=<mode>    → diagnóstico em um modo específico.
 * Aceita também --ratio=9:16|16:9 para escolher a proporção.
 */
async function runDiagnostic() {
  const diagArg = getArg('diag');
  const ratioName = Object.keys(RATIOS).includes(getArg('ratio')) ? getArg('ratio') : '9:16';
  const ratio = RATIOS[ratioName];

  let mode;
  if (diagArg === 'short') mode = 'positioning';
  else if (diagArg && CLIP_MODES.includes(diagArg)) mode = diagArg;
  else mode = 'full'; // padrão: contém scene1 → scene2

  const expectedMs = CLIP_EXPECTED_MS[mode];

  console.log(
    `\n🔍 MODO DIAGNÓSTICO: capturando ${mode} (${ratioName}) para provar ${TARGET_FPS}fps CFR + ${ratio.width}x${ratio.height} + H.264/AAC + VÍDEO NÃO ESTÁTICO...`,
  );

  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const safeRatioName = ratioName.replace(':', 'x');
  const mp4Filename = path.join(EXPORT_DIR, `${mode}_${safeRatioName}.mp4`);

  let browser;
  let exitCode = 0;
  try {
    browser = await launchBrowserForRatio(ratio);
    await exportVideo(mode, ratioName, browser);

    // Propriedades exatas do output.
    try {
      const probe = execFileSync(
        'ffprobe',
        [
          '-v', 'error',
          '-print_format', 'json',
          '-show_entries',
          'stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration:format=duration',
          mp4Filename,
        ],
        { encoding: 'utf8' },
      );
      console.log('\n📋 Propriedades exatas do MP4 (ffprobe):');
      console.log(probe.trim());
    } catch (probeErr) {
      console.warn(`(não foi possível imprimir ffprobe detalhado: ${probeErr.message})`);
    }

    // Amostras visuais de fronteira de cena (avanço preservado).
    const visual = validateSceneAdvancement(mp4Filename, mode, expectedMs);
    console.log('\n🎬 Amostras visuais de cena (avanço preservado):');
    visual.samples.forEach((s) =>
      console.log(`   - ${s.scene} @ ${s.atSec}s  (brilho médio μ=${s.mean})`),
    );
    if (visual.boundaries.length) {
      console.log('   Distinção entre cenas adjacentes (MAD, quanto maior mais distinto):');
      visual.boundaries.forEach((b) =>
        console.log(`     ${b.from} → ${b.to}: MAD ${b.mad}`),
      );
    }

    // PROVA EXPLÍCITA "Scene 1 ≠ Scene 2": encontra as amostras das duas
    // primeiras cenas distintas da sequência, compara assinatura (MAD) E hash
    // md5 do frame completo em resolução nativa. Se ambas provarem diferença, o
    // vídeo demonstravelmente avança (não é o freeze histórico da Scene1).
    const s1 = visual.samples[0];
    const s2 = visual.samples.find((s) => s.scene !== s1.scene);
    if (s1 && s2) {
      const tmpPgm = path.join(EXPORT_DIR, `.diag_${process.pid}.pgm`);
      let mad;
      try {
        const sig1 = frameSignature(mp4Filename, s1.atSec, tmpPgm);
        const sig2 = frameSignature(mp4Filename, s2.atSec, tmpPgm);
        mad = signatureMad(sig1, sig2);
      } finally {
        safeUnlink(tmpPgm);
      }
      const h1 = frameFullHash(mp4Filename, s1.atSec);
      const h2 = frameFullHash(mp4Filename, s2.atSec);
      const distinct = mad >= SIG_DISTINCT_MAD_MIN && h1 !== h2;

      console.log('\n🧪 PROVA "vídeo não estático" (amostras reais do MP4):');
      console.log(`   ${s1.scene} @ ${s1.atSec}s → md5=${h1}`);
      console.log(`   ${s2.scene} @ ${s2.atSec}s → md5=${h2}`);
      console.log(`   Assinatura MAD entre elas: ${mad.toFixed(2)} (mín. exigido ${SIG_DISTINCT_MAD_MIN})`);
      console.log(`   Hash md5 dos frames completos: ${h1 === h2 ? 'IDÊNTICOS ❌' : 'DIFERENTES ✅'}`);

      if (!distinct) {
        throw new Error(
          `PROVA FALHOU: "${s1.scene}" e "${s2.scene}" parecem estáticos ` +
            `(MAD ${mad.toFixed(2)}, md5 ${h1 === h2 ? 'iguais' : 'diferentes'}). ` +
            `O vídeo pode estar congelado.`,
        );
      }
      console.log(
        `   ✅ ${s1.scene} e ${s2.scene} diferem em ASSINATURA e em PIXELS — o vídeo AVANÇA (não é freeze/metadata).`,
      );
    } else {
      console.warn('   (sequência do modo não tem duas cenas distintas para a prova; use --diag=full)');
    }

    console.log(
      `\n✅ Diagnóstico OK — MP4 é ${ratio.width}x${ratio.height}, ${TARGET_FPS}fps CFR, H.264/AAC, cenas avançam e Scene≠Scene comprovado. Prossiga com a exportação completa.`,
    );
  } catch (err) {
    console.error(`\n❌ Diagnóstico FALHOU: ${err.message}`);
    exitCode = 1;
  } finally {
    await closeBrowser(browser);
  }
  // Force-exit: puppeteer-stream pode manter handles CDP/WebSocket vivos.
  process.exit(exitCode);
}

async function run() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }

  const failures = [];
  // Seis modos x duas proporções = 12 combinações.
  // Para cada ratio, lançamos um browser dedicado com --window-size correto.
  for (const ratioName of Object.keys(RATIOS)) {
    const ratio = RATIOS[ratioName];
    console.log(`\nIniciando browser para ratio ${ratioName} (${ratio.width}x${ratio.height})...`);

    let browser;
    try {
      browser = await launchBrowserForRatio(ratio);
    } catch (error) {
      console.error('\n❌ ERRO FATAL: Falha ao iniciar o Puppeteer/Chrome Headless.');
      console.error('Verifique se as dependências de sistema do Chrome (bibliotecas gráficas/áudio)');
      console.error('e o FFmpeg/ffprobe estão instalados e acessíveis no PATH. Numa máquina local,');
      console.error('rode "npm install" para que o puppeteer baixe o Chrome antes de exportar.');
      console.error('\nDetalhe do erro original:');
      console.error(error.message);
      process.exit(1);
    }

    try {
      for (const mode of CLIP_MODES) {
        try {
          await exportVideo(mode, ratioName, browser);
        } catch (err) {
          failures.push(`${mode}_${ratioName}: ${err.message}`);
        }
      }
    } finally {
      await closeBrowser(browser);
    }
  }

  const total = CLIP_MODES.length * Object.keys(RATIOS).length;
  if (failures.length > 0) {
    console.error(`\n❌ Exportação concluída com ${failures.length}/${total} falha(s):`);
    failures.forEach((f) => console.error(`   - ${f}`));
    // Force-exit after all writes/ffprobe are done.
    process.exit(1);
  }

  console.log(`\n🎉 Exportação concluída: ${total} MP4s válidos (com áudio) na pasta /exports/.`);
  // Force-exit: puppeteer-stream pode manter handles CDP/WebSocket vivos
  // mesmo após browser.close(). Todos os arquivos já estão fechados aqui.
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * Returns the value of a --key=value flag from process.argv, or undefined.
 * Accepts both "--key=value" and "--key value" forms.
 */
function getArg(name) {
  const prefix = `--${name}=`;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith(prefix)) {
      return process.argv[i].slice(prefix.length);
    }
    if (process.argv[i] === `--${name}` && process.argv[i + 1] !== undefined) {
      return process.argv[i + 1];
    }
  }
  return undefined;
}

// Ponto de entrada: --diag (ou --diag=full|short|<modo>) para diagnóstico,
// sem args para exportação completa.
// Flags opcionais: --mode=<modo> e --ratio=<9:16|16:9> filtram o subconjunto a renderizar.
const wantsDiag =
  process.argv.includes('--diag') ||
  process.argv.some((a) => a.startsWith('--diag='));
if (wantsDiag) {
  runDiagnostic().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  // Validate and apply --mode / --ratio filters before handing off to run().
  const modeArg = getArg('mode');
  const ratioArg = getArg('ratio');

  if (modeArg !== undefined && !CLIP_MODES.includes(modeArg)) {
    console.error(`❌ --mode inválido: "${modeArg}". Valores aceitos: ${CLIP_MODES.join(', ')}`);
    process.exit(1);
  }
  if (ratioArg !== undefined && !Object.keys(RATIOS).includes(ratioArg)) {
    console.error(`❌ --ratio inválido: "${ratioArg}". Valores aceitos: ${Object.keys(RATIOS).join(', ')}`);
    process.exit(1);
  }

  // Narrow the global constants in-place so run() sees only the requested subset.
  if (modeArg !== undefined) {
    // Replace the array contents without breaking the reference used in run().
    CLIP_MODES.length = 0;
    CLIP_MODES.push(modeArg);
  }
  if (ratioArg !== undefined) {
    for (const key of Object.keys(RATIOS)) {
      if (key !== ratioArg) delete RATIOS[key];
    }
  }

  const modeLabel = modeArg ?? 'all';
  const ratioLabel = ratioArg ?? 'all';
  console.log(`Exportando: mode=${modeLabel}  ratio=${ratioLabel}`);

  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
