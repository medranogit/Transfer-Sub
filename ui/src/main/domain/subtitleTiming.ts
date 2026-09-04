// Regras de dominio: converter texto de timecode ("MM:SS,mmm" ou
// "H:MM:SS,mmm") em milissegundos, encontrar o instante da primeira legenda
// num arquivo .ass/.ssa/.srt e formatar milissegundos de volta em texto.
// Nenhuma dependencia de I/O.

const TIME_CODE_PATTERN = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/

export function parseTimeCodeToMs(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const match = trimmed.match(TIME_CODE_PATTERN)
  if (!match) return null

  const [, hoursStr, minutesStr, secondsStr, fractionStr] = match
  const hours = hoursStr ? parseInt(hoursStr, 10) : 0
  const minutes = parseInt(minutesStr, 10)
  const seconds = parseInt(secondsStr, 10)
  const millis = parseInt(fractionStr.padEnd(3, '0'), 10)

  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis
}

export function formatMsAsTimeCode(ms: number): string {
  const sign = ms < 0 ? '-' : ''
  const abs = Math.abs(Math.round(ms))
  const millis = abs % 1000
  const totalSeconds = Math.floor(abs / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60)
  return `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

const ASS_DIALOGUE_START = /^Dialogue:\s*\d+,(\d+):(\d{2}):(\d{2})\.(\d{2})/gm
const SRT_TIMESTAMP = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/g

// Encontra o menor timestamp entre todos os eventos do arquivo de legenda -
// ou seja, o instante em que a primeira legenda aparece.
export function parseFirstEventStartMs(content: string, extension: string): number | null {
  const timesMs: number[] = []

  if (extension === '.srt') {
    for (const match of content.matchAll(SRT_TIMESTAMP)) {
      const [, h, m, s, ms] = match
      timesMs.push((parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10)) * 1000 + parseInt(ms, 10))
    }
  } else {
    for (const match of content.matchAll(ASS_DIALOGUE_START)) {
      const [, h, m, s, cs] = match
      timesMs.push((parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10)) * 1000 + parseInt(cs, 10) * 10)
    }
  }

  return timesMs.length > 0 ? Math.min(...timesMs) : null
}
