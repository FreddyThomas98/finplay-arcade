(() => {
  'use strict';

  // Five distinct procedural arcade soundtracks synthesized via Web Audio API (zero external MP3s).
  // MIDI note helper -> frequency in Hz
  function midi(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  const TRACKS = {
    // 1. Flappy Finance — bright, bouncy C-major flight chiptune
    flappy: {
      bpm: 132,
      leadWave: 'triangle',
      bassWave: 'sine',
      leadGain: 0.045,
      bassGain: 0.04,
      lead: [72, 76, 79, 84, 79, 76, 74, 79, 77, 81, 84, 81, 79, 76, 74, 0,
             72, 76, 79, 86, 84, 81, 79, 76, 77, 74, 71, 74, 72, 0, 79, 0],
      bass: [48, 0, 55, 0, 52, 0, 55, 0, 53, 0, 60, 0, 55, 0, 50, 0,
             48, 0, 55, 0, 57, 0, 52, 0, 53, 0, 55, 0, 48, 0, 55, 0]
    },
    // 2. Finance Hangman — quirky detective mystery groove in A minor
    hangman: {
      bpm: 106,
      leadWave: 'sine',
      bassWave: 'triangle',
      leadGain: 0.048,
      bassGain: 0.042,
      lead: [69, 0, 72, 76, 75, 0, 72, 0, 71, 0, 74, 76, 72, 0, 69, 0,
             69, 72, 76, 81, 80, 0, 76, 0, 74, 72, 71, 68, 69, 0, 0, 0],
      bass: [45, 0, 52, 0, 45, 0, 48, 0, 47, 0, 52, 0, 45, 0, 40, 0,
             45, 0, 52, 0, 44, 0, 52, 0, 50, 0, 47, 0, 45, 0, 45, 0]
    },
    // 3. Finance Blaster — high-energy neon synthwave action pulse in E minor
    blaster: {
      bpm: 146,
      leadWave: 'sawtooth',
      bassWave: 'square',
      leadGain: 0.026,
      bassGain: 0.024,
      lead: [64, 67, 71, 76, 71, 67, 74, 71, 72, 76, 79, 76, 74, 71, 69, 67,
             64, 71, 76, 79, 78, 76, 74, 71, 72, 74, 76, 74, 71, 67, 64, 0],
      bass: [40, 40, 52, 40, 40, 40, 50, 40, 48, 48, 60, 48, 47, 47, 55, 47,
             40, 40, 52, 40, 43, 43, 55, 43, 48, 48, 50, 50, 47, 47, 40, 0]
    },
    // 4. Cash Collector — cheerful adventure platformer chiptune in G major
    collector: {
      bpm: 138,
      leadWave: 'square',
      bassWave: 'triangle',
      leadGain: 0.025,
      bassGain: 0.042,
      lead: [67, 71, 74, 79, 76, 74, 71, 0, 72, 76, 79, 76, 74, 0, 71, 0,
             67, 71, 74, 81, 79, 76, 74, 71, 72, 74, 76, 78, 79, 0, 0, 0],
      bass: [43, 0, 50, 0, 47, 0, 50, 0, 48, 0, 55, 0, 50, 0, 50, 0,
             43, 0, 50, 0, 52, 0, 47, 0, 48, 0, 50, 0, 43, 0, 50, 0]
    },
    // 5. Accounting Crossword — calm, crisp Lo-Fi puzzle synth in F major
    crossword: {
      bpm: 94,
      leadWave: 'sine',
      bassWave: 'sine',
      leadGain: 0.044,
      bassGain: 0.036,
      lead: [65, 69, 72, 77, 76, 72, 69, 0, 67, 70, 74, 79, 77, 74, 70, 0,
             69, 72, 76, 81, 79, 76, 72, 0, 70, 74, 72, 69, 65, 0, 0, 0],
      bass: [41, 0, 48, 0, 45, 0, 48, 0, 43, 0, 50, 0, 46, 0, 50, 0,
             45, 0, 52, 0, 48, 0, 52, 0, 46, 0, 48, 0, 41, 0, 48, 0]
    }
  };

  class ArcadeAudio {
    constructor(trackName) {
      this.trackName = TRACKS[trackName] ? trackName : 'flappy';
      this.ctx = null;
      this.muted = localStorage.getItem('finplay_muted') === '1';
      this.playingMusic = false;
      this.pausedMusic = false;
      this.step = 0;
      this.timer = null;
    }

    ensureCtx() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    tone(freq, duration = 0.12, wave = 'sine', vol = 0.04, delay = 0) {
      if (this.muted || !freq) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      } catch (_) {}
    }

    startMusic() {
      this.playingMusic = true;
      this.pausedMusic = false;
      this._scheduleLoop();
    }

    stopMusic() {
      this.playingMusic = false;
      this.pausedMusic = false;
      clearInterval(this.timer);
      this.timer = null;
    }

    pauseMusic() {
      this.pausedMusic = true;
      clearInterval(this.timer);
      this.timer = null;
    }

    resumeMusic() {
      if (!this.playingMusic) return;
      this.pausedMusic = false;
      this._scheduleLoop();
    }

    _scheduleLoop() {
      clearInterval(this.timer);
      if (this.muted || !this.playingMusic || this.pausedMusic) return;
      const t = TRACKS[this.trackName];
      const stepMs = Math.round((60000 / t.bpm) / 2); // eighth notes
      this.ensureCtx();
      this.timer = setInterval(() => {
        if (this.muted || !this.playingMusic || this.pausedMusic || document.hidden) return;
        const i = this.step % t.lead.length;
        const leadNote = t.lead[i];
        const bassNote = t.bass[i];
        if (leadNote) this.tone(midi(leadNote), (stepMs / 1000) * 0.9, t.leadWave, t.leadGain);
        if (bassNote) this.tone(midi(bassNote), (stepMs / 1000) * 1.1, t.bassWave, t.bassGain);
        this.step++;
      }, stepMs);
    }

    toggleMute() {
      this.muted = !this.muted;
      try { localStorage.setItem('finplay_muted', this.muted ? '1' : '0'); } catch (_) {}
      if (this.muted) {
        clearInterval(this.timer);
        this.timer = null;
      } else {
        this.ensureCtx();
        this._scheduleLoop();
        this.sfx('click');
      }
      return this.muted;
    }

    sfx(kind) {
      if (this.muted) return;
      switch (kind) {
        case 'flap':
          this.tone(440, 0.05, 'triangle', 0.045);
          break;
        case 'jump':
          this.tone(340, 0.06, 'square', 0.03);
          this.tone(520, 0.07, 'square', 0.028, 0.04);
          break;
        case 'shoot':
          this.tone(580, 0.05, 'sawtooth', 0.03);
          this.tone(260, 0.07, 'sawtooth', 0.025, 0.03);
          break;
        case 'good':
          this.tone(660, 0.08, 'triangle', 0.05);
          this.tone(880, 0.12, 'triangle', 0.05, 0.06);
          break;
        case 'levelup':
          this.tone(523, 0.08, 'triangle', 0.05);
          this.tone(659, 0.08, 'triangle', 0.05, 0.07);
          this.tone(784, 0.09, 'triangle', 0.05, 0.14);
          this.tone(1046, 0.16, 'triangle', 0.055, 0.21);
          break;
        case 'bad':
          this.tone(190, 0.14, 'sawtooth', 0.045);
          this.tone(140, 0.18, 'sawtooth', 0.04, 0.09);
          break;
        case 'hanged':
          // Dramatic descending cartoon-defeat cadence
          this.tone(330, 0.18, 'sawtooth', 0.045, 0);
          this.tone(294, 0.18, 'sawtooth', 0.045, 0.18);
          this.tone(262, 0.22, 'sawtooth', 0.045, 0.36);
          this.tone(196, 0.42, 'sawtooth', 0.05, 0.58);
          break;
        case 'win':
          this.tone(523, 0.1, 'triangle', 0.055, 0);
          this.tone(659, 0.1, 'triangle', 0.055, 0.09);
          this.tone(784, 0.12, 'triangle', 0.055, 0.18);
          this.tone(1046, 0.28, 'triangle', 0.06, 0.28);
          break;
        default:
          this.tone(540, 0.05, 'sine', 0.035);
      }
    }
  }

  window.FinPlayAudio = {
    create: trackName => new ArcadeAudio(trackName)
  };
})();
