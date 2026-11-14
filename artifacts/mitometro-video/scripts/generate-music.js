import fs from 'fs';

function writeWav(filename, sampleRate, samples) {
  const numSamples = samples.length;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;

  const buffer = Buffer.alloc(44 + numSamples * 2);
  
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); 
  buffer.writeUInt16LE(1, 20);  
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); 
  
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  
  for (let i = 0; i < numSamples; i++) {
    let val = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(val < 0 ? val * 0x8000 : val * 0x7FFF, 44 + i * 2);
  }
  
  fs.writeFileSync(filename, buffer);
}

const sampleRate = 44100;
let length = 30 * sampleRate;
let samples = new Float32Array(length);

// 120 BPM = 2 beats per second = 0.5s per beat
const beatLen = 0.5 * sampleRate;
for (let i=0; i<length; i++) {
  let beatTime = i % beatLen;
  let beatPhase = beatTime / beatLen;
  
  // Kick drum
  let kickEnv = Math.exp(-beatTime / (sampleRate * 0.1));
  let kickFreq = 150 * Math.exp(-beatTime / (sampleRate * 0.05));
  let kick = Math.sin(2 * Math.PI * kickFreq * beatTime / sampleRate) * kickEnv;
  
  // Off-beat hat
  let offBeatTime = (i + beatLen/2) % beatLen;
  let hatEnv = Math.exp(-offBeatTime / (sampleRate * 0.05));
  let hat = (Math.random() * 2 - 1) * hatEnv * 0.2;
  
  // Bass line (arpeggiator-like)
  let bassNote = (Math.floor(i / beatLen) % 4) === 0 ? 55 : 65; 
  let bassEnv = Math.exp(-(beatTime % (beatLen/2)) / (sampleRate * 0.2));
  let bass = Math.sin(2 * Math.PI * bassNote * i / sampleRate) * bassEnv * 0.4;
  
  samples[i] = (kick + hat + bass) * 0.3;
}

writeWav(new URL('../public/audio/music.wav', import.meta.url), sampleRate, samples);
console.log("Music generated");
