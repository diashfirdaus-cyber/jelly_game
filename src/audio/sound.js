/**
 * Jelly Jungle - Audio Synthesizer Module
 * Pure Web Audio API procedural sound effects and background music.
 * Completely zero-dependency, zero-asset, lightweight and instant.
 */

export class AudioManager {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.musicTimer = null;
    this.note = 0;
  }

  async toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.startMusic();
    } else {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    return this.enabled;
  }

  tone(freq = 440, duration = 0.12, type = 'sine', volume = 0.08, targetFreq = 0) {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (targetFreq > 0) {
        osc.frequency.exponentialRampToValueAtTime(targetFreq, now + duration);
      }

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // Audio node failure fallback
    }
  }

  play(type, data = 0) {
    if (!this.enabled || !this.ctx) return;

    switch (type) {
      case 'jump': {
        // Higher frequency for second and third jumps
        const base = 320 + data * 100;
        const target = 700 + data * 100;
        this.tone(base, 0.18, 'sine', 0.06, target);
        break;
      }
      case 'spring': {
        this.tone(180, 0.4, 'triangle', 0.1, 1000);
        setTimeout(() => this.tone(900, 0.22, 'sine', 0.04), 110);
        break;
      }
      case 'gem': {
        const pitch = 900 + (data % 4) * 120;
        this.tone(pitch, 0.18, 'sine', 0.045);
        setTimeout(() => this.tone(1500, 0.15, 'sine', 0.025), 50);
        break;
      }
      case 'land': {
        this.tone(95, 0.12, 'sine', 0.05, 55);
        break;
      }
      case 'hit': {
        this.tone(160, 0.24, 'triangle', 0.07, 70);
        break;
      }
      case 'respawn': {
        this.tone(330, 0.3, 'sine', 0.045, 120);
        break;
      }
      case 'checkpoint':
      case 'win': {
        const arpeggio = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        arpeggio.forEach((noteFreq, idx) => {
          setTimeout(() => this.tone(noteFreq, 0.5, 'sine', 0.045), idx * 100);
        });
        break;
      }
    }
  }

  startMusic() {
    clearInterval(this.musicTimer);
    // Relaxing C-major pentatonic melody
    const notes = [
      261.63, 329.63, 392.00, 523.25,
      440.00, 392.00, 329.63, 293.66,
      261.63, 392.00, 523.25, 587.33,
      523.25, 392.00, 329.63, 293.66
    ];

    this.musicTimer = setInterval(() => {
      if (document.hidden || !this.enabled) return;
      const idx = this.note++;
      const currentNote = notes[idx % notes.length];
      this.tone(currentNote, 1.1, 'sine', 0.011);
      // Soft bass note on every measure
      if (idx % 4 === 0) {
        this.tone(currentNote / 2, 1.6, 'triangle', 0.009);
      }
    }, 620);
  }
}
