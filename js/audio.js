"use strict";
// 簡易合成音效。設定中可關閉。
class GameAudio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { this.enabled = false; }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }
  tone(freq, dur, type, vol, slide) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  jump()      { this.tone(320, 0.15, "square", 0.06, 260); }
  stomp()     { this.tone(200, 0.12, "square", 0.08, -120); }
  collect()   { this.tone(660, 0.1, "square", 0.07, 320); this.tone(990, 0.16, "square", 0.05, 200); }
  shoot()     { this.tone(520, 0.08, "sawtooth", 0.05, -200); }
  freeze()    { this.tone(900, 0.2, "sine", 0.06, -500); }
  shatter()   { this.tone(1400, 0.15, "sawtooth", 0.05, -900); }
  hurt()      { this.tone(220, 0.25, "sawtooth", 0.08, -150); }
  die()       { this.tone(300, 0.5, "square", 0.08, -260); }
  explode()   { this.tone(90, 0.5, "sawtooth", 0.12, -60); }
  ghostWarn() { this.tone(140, 0.6, "sine", 0.1, 60); }
  ghostGone() { this.tone(500, 0.4, "sine", 0.07, 300); }
  revive()    { this.tone(440, 0.15, "square", 0.07, 220); this.tone(880, 0.3, "square", 0.05, 220); }
  checkpoint(){ this.tone(560, 0.15, "square", 0.06, 180); }
  goal()      { this.tone(523, 0.14, "square", 0.07); this.tone(659, 0.14, "square", 0.07); this.tone(784, 0.3, "square", 0.07, 200); }
  door()      { this.tone(180, 0.3, "square", 0.06, 80); }
  teleport()  { this.tone(700, 0.25, "sine", 0.06, 500); }
}
const AUDIO = new GameAudio();
