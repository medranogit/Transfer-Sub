// Toque minimalista de aviso (dois tons curtos e graves, descendentes -
// diferente do som de conclusao, que e ascendente) - via Web Audio API,
// tocado quando um escaneamento traz algo novo pro sino de notificacoes
// (avisos/sem correspondencia).
export function playWarningSound(): void {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    ;[
      { freq: 620, start: 0 },
      { freq: 440, start: 0.11 }
    ].forEach(({ freq, start }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(freq, now + start)
      gain.gain.setValueAtTime(0.0001, now + start)
      gain.gain.exponentialRampToValueAtTime(0.12, now + start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + start)
      osc.stop(now + start + 0.22)
    })
    setTimeout(() => ctx.close(), 500)
  } catch {
    // ambiente sem suporte a Web Audio - ignora, som e so um extra
  }
}
