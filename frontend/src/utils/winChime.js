// A short, pleasant two-note chime for the bid-win notification — marked
// "(optional)" in the brief, so kept deliberately minimal: synthesized with
// the Web Audio API rather than shipping/hosting an audio file, and it only
// ever plays for this one rare, celebratory event, not as a recurring alert.
export function playWinChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return; // unsupported browser — fail silently, never block the toast
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25]; // C5, E5 — a simple, pleasant major third

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    // Never let a sound glitch break the actual notification.
  }
}
