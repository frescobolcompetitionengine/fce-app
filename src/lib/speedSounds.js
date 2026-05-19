/**
 * Speed-based sound system using Web Audio API
 * Zones: <50, 50-59, 60-69, 70-79, 80-89, 90-99, 100+
 */

let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    const AudioCtor = window['AudioContext'] || window['webkitAudioContext'];
    if (!AudioCtor) {
      throw new Error('Web Audio API is not supported in this browser.');
    }
    audioContext = new AudioCtor();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

function playTone({ frequency, duration = 0.18, volume = 0.5, type = 'sine', secondFreq = null }) {
  const ctx = getAudioContext();

  const gainNode = ctx.createGain();
  gainNode.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  osc.connect(gainNode);

  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);

  if (secondFreq) {
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(secondFreq, ctx.currentTime);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    gain2.gain.setValueAtTime(0, ctx.currentTime);
    gain2.gain.linearRampToValueAtTime(volume * 0.4, ctx.currentTime + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc2.start(ctx.currentTime);
    osc2.stop(ctx.currentTime + duration);
  }
}

/** Clique neutro — primeiro press sem par */
export function playClickSound() {
  playTone({ frequency: 440, duration: 0.08, volume: 0.25, type: 'square' });
}

/**
 * Som baseado na velocidade em km/h
 * Faixas de 10 em 10 km/h entre 50 e 100+
 */
export function playSpeedSound(speedKmh) {
  if (speedKmh < 50) {
    // Lento — som grave
    playTone({ frequency: 180, duration: 0.25, volume: 0.4, type: 'triangle' });
  } else if (speedKmh < 60) {
    // 50 km/h — bip neutro
    playTone({ frequency: 330, duration: 0.18, volume: 0.45, type: 'sine' });
  } else if (speedKmh < 70) {
    // 60 km/h — tom médio
    playTone({ frequency: 440, duration: 0.17, volume: 0.5, type: 'sine', secondFreq: 550 });
  } else if (speedKmh < 80) {
    // 70 km/h — tom alto
    playTone({ frequency: 550, duration: 0.16, volume: 0.55, type: 'sine', secondFreq: 660 });
  } else if (speedKmh < 90) {
    // 80 km/h — agudo
    playTone({ frequency: 660, duration: 0.15, volume: 0.6, type: 'sawtooth', secondFreq: 880 });
  } else if (speedKmh < 100) {
    // 90 km/h — muito agudo
    playTone({ frequency: 880, duration: 0.18, volume: 0.65, type: 'sawtooth', secondFreq: 1100 });
  } else {
    // 100+ km/h — acorde triunfante único
    playTone({ frequency: 1047, duration: 0.3, volume: 0.7, type: 'sine', secondFreq: 1319 });
    setTimeout(() => playTone({ frequency: 1568, duration: 0.25, volume: 0.65, type: 'sine' }), 150);
  }
}

export function playWarmupEndSound() {
  playTone({ frequency: 659, duration: 0.18, volume: 0.6, type: 'sine', secondFreq: 784 });
  setTimeout(() => playTone({ frequency: 988, duration: 0.24, volume: 0.7, type: 'sine', secondFreq: 1319 }), 140);
}
