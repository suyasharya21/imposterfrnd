/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled: boolean = false;
  private bgmInterval: any = null;

  private init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.35;
    this.masterGain.connect(this.ctx.destination);
    this.enabled = true;
  }

  private createOscillator(freq: number, type: OscillatorType = 'sine'): { osc: OscillatorNode, gain: GainNode } {
    this.init();
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx!.currentTime);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    return { osc, gain };
  }

  playLaser() {
    if (!this.enabled && this.ctx?.state !== 'suspended') this.init();
    if (this.ctx?.state === 'suspended') return;
    const { osc, gain } = this.createOscillator(880, 'square');
    const now = this.ctx!.currentTime;

    osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  playHit() {
    if (!this.enabled) this.init();
    if (this.ctx?.state === 'suspended') return;
    const { osc, gain } = this.createOscillator(150, 'sawtooth');
    const now = this.ctx!.currentTime;

    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  playPlayerDisabled() {
    if (!this.enabled) this.init();
    if (this.ctx?.state === 'suspended') return;
    const { osc, gain } = this.createOscillator(220, 'square');
    const now = this.ctx!.currentTime;

    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.5);
    
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  playJoin() {
    if (!this.enabled) this.init();
    if (this.ctx?.state === 'suspended') return;
    const { osc, gain } = this.createOscillator(440, 'triangle');
    const now = this.ctx!.currentTime;

    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  playLeave() {
    if (!this.enabled) this.init();
    if (this.ctx?.state === 'suspended') return;
    const { osc, gain } = this.createOscillator(880, 'triangle');
    const now = this.ctx!.currentTime;

    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  playCollect() {
    if (!this.enabled) this.init();
    if (this.ctx?.state === 'suspended') return;
    const { osc, gain } = this.createOscillator(660, 'sine');
    const now = this.ctx!.currentTime;

    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  playHover() {
    if (!this.enabled) this.init();
    if (this.ctx?.state === 'suspended') return;
    const { osc, gain } = this.createOscillator(1400, 'sine');
    const now = this.ctx!.currentTime;

    gain.gain.setValueAtTime(0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  playClick() {
    if (!this.enabled) this.init();
    if (this.ctx?.state === 'suspended') return;
    const { osc, gain } = this.createOscillator(600, 'square');
    const now = this.ctx!.currentTime;

    osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  playIntroBoom() {
    if (!this.enabled) this.init();
    if (this.ctx?.state === 'suspended') return;
    const now = this.ctx!.currentTime;
    
    // Deep sub bass boom
    const sub = this.createOscillator(55, 'sawtooth');
    sub.osc.frequency.exponentialRampToValueAtTime(20, now + 1.8);
    sub.gain.gain.setValueAtTime(0.7, now);
    sub.gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
    sub.osc.start(now);
    sub.osc.stop(now + 1.8);

    // High frequency cyber swoosh
    const swoosh = this.createOscillator(1000, 'sine');
    swoosh.osc.frequency.exponentialRampToValueAtTime(100, now + 0.8);
    swoosh.gain.gain.setValueAtTime(0.2, now);
    swoosh.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    swoosh.osc.start(now);
    swoosh.osc.stop(now + 0.8);
  }

  startMenuBGM() {
    this.init();
    if (this.bgmInterval) return;

    let beat = 0;
    const notes = [110, 110, 110, 110, 130, 130, 146, 146]; // A2, C3, D3 notes

    this.bgmInterval = setInterval(() => {
      if (this.ctx?.state === 'suspended') return;
      const note = notes[beat % notes.length];
      
      const { osc, gain } = this.createOscillator(note, 'triangle');
      const now = this.ctx!.currentTime;
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      
      osc.start(now);
      osc.stop(now + 0.5);
      beat++;
    }, 500); // 120 BPM
  }

  stopMenuBGM() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  resume() {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

export const sounds = new SoundManager();
