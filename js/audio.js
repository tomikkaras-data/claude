// ---------------------------------------------------------------------------
// Tiny procedural sound effects (Web Audio, no asset files)
// ---------------------------------------------------------------------------

const Sound = {
  ctx: null,
  muted: false,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.ctx = null;
    }
  },

  _noise(duration, freq, volume) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  },

  _tone(type, f1, f2, duration, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  },

  play(name, size = 1) {
    if (this.muted || !this.ctx) return;
    try {
      switch (name) {
        case 'explosion': this._noise(0.35 + size * 0.5, 600 + size * 500, 0.5 + size * 0.3); break;
        case 'launch': this._tone('sawtooth', 220, 80, 0.25, 0.12); break;
        case 'throw': this._tone('triangle', 400, 200, 0.15, 0.15); break;
        case 'shot': this._noise(0.15, 3000, 0.5); break;
        case 'jump': this._tone('square', 300, 600, 0.12, 0.06); break;
        case 'splash': this._noise(0.5, 1200, 0.35); break;
        case 'teleport': this._tone('sine', 300, 1600, 0.4, 0.15); break;
        case 'tick': this._tone('square', 900, 880, 0.05, 0.05); break;
        case 'turn': this._tone('triangle', 520, 780, 0.2, 0.12); break;
        case 'rope': this._tone('sawtooth', 900, 300, 0.12, 0.06); break;
        case 'hook': this._tone('square', 1400, 1200, 0.05, 0.08); break;
        case 'beep': this._tone('square', 1200, 1200, 0.18, 0.1); break;
        case 'win': this._tone('triangle', 400, 1200, 0.9, 0.18); break;
      }
    } catch (e) { /* ignore audio errors */ }
  },
};
