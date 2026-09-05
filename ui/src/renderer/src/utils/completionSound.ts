// Toque minimalista de conclusao (dois tons curtos em sequencia), gerado via
// Web Audio API - evita depender de um arquivo de audio embutido no app.
export function playCompletionSound(): void {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    ;[
      { freq: 880, start: 0 },
      { freq: 1320, start: 0.1 }
    ].forEach(({ freq, start }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + start)
      gain.gain.setValueAtTime(0.0001, now + start)
      gain.gain.exponentialRampToValueAtTime(0.2, now + start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + start)
      osc.stop(now + start + 0.25)
    })
    setTimeout(() => ctx.close(), 500)
  } catch {
    // ambiente sem suporte a Web Audio - ignora, som e so um extra
  }
}
