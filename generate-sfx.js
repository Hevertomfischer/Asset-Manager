import fs from 'fs';

function writeWav(filename, sampleRate, samples) {
  const numSamples = samples.length;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;

  const buffer = Buffer.alloc(44 + numSamples * 2);
  
  // RIFF chunk descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  
  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20);  // AudioFormat (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  
  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  
  for (let i = 0; i < numSamples; i++) {
    // scale to 16-bit integer
    let val = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(val < 0 ? val * 0x8000 : val * 0x7FFF, 44 + i * 2);
  }
  
  fs.writeFileSync(filename, buffer);
}

// 1. Tick
const sampleRate = 44100;
let tickLen = 0.05 * sampleRate;
let tickSamples = new Float32Array(tickLen);
for (let i=0; i<tickLen; i++) {
  let env = Math.exp(-i / (sampleRate * 0.01));
  tickSamples[i] = Math.sin(2 * Math.PI * 1000 * i / sampleRate) * env * 0.5;
}
writeWav('artifacts/mitometro-video/public/audio/tick.wav', sampleRate, tickSamples);

// 2. Hit
let hitLen = 0.5 * sampleRate;
let hitSamples = new Float32Array(hitLen);
for (let i=0; i<hitLen; i++) {
  let env = Math.exp(-i / (sampleRate * 0.1));
  let freq = 100 * Math.exp(-i / (sampleRate * 0.05));
  hitSamples[i] = (Math.random() * 2 - 1) * env * 0.2 + Math.sin(2 * Math.PI * freq * i / sampleRate) * env * 0.6;
}
writeWav('artifacts/mitometro-video/public/audio/hit.wav', sampleRate, hitSamples);

// 3. Whoosh
let whooshLen = 0.6 * sampleRate;
let whooshSamples = new Float32Array(whooshLen);
for (let i=0; i<whooshLen; i++) {
  let env = Math.sin(Math.PI * i / whooshLen);
  // bandpass noise approx by modulating white noise
  let noise = Math.random() * 2 - 1;
  whooshSamples[i] = noise * env * env * 0.4;
}
writeWav('artifacts/mitometro-video/public/audio/whoosh.wav', sampleRate, whooshSamples);

console.log("SFX generated");
