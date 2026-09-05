// Helpers puros de formatacao/apresentacao para dados de legenda e timing -
// sem estado, sem I/O, reaproveitados por EpisodeTable e SyncModal.
import type { EpisodeRow, SubtitleTrack } from '@shared/types'

export function trackLabel(track: SubtitleTrack): string {
  const name = track.trackName ? ` "${track.trackName}"` : ''
  return `#${track.trackId} [${track.language}]${name}`
}

// PGS/VobSub (S_HDMV/PGS, S_VOBSUB) sao legendas de imagem (bitmaps, sem
// texto codificado) - comuns em releases de Blu-ray. Nao da pra extrair
// falas delas pro auto-sync, so formatos baseados em texto (ASS/SSA/SRT).
const TEXT_SUBTITLE_CODECS = new Set(['S_TEXT/ASS', 'S_TEXT/SSA', 'S_TEXT/UTF8'])

export function isTextSubtitleCodec(codecId: string): boolean {
  return TEXT_SUBTITLE_CODECS.has(codecId)
}

// Resumo curto do ajuste de timing configurado numa linha, para exibir como
// indicador na tabela. Null quando a linha nao tem nenhum ajuste.
export function syncAdjustmentLabel(row: EpisodeRow): string | null {
  if (row.manualOffsetText) return `Ajuste: ${row.manualOffsetText}ms`
  if (row.firstLineTargetText) return `1a fala: ${row.firstLineTargetText}`
  return null
}

export function formatEventTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Mascara de digitacao: conforme o usuario digita numeros, monta
// progressivamente o formato MM:SS,mmm (ex: "0025130" vira "00:25,130").
export function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 7)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)},${digits.slice(4)}`
}

// Mascara de digitacao: mantem um "-" opcional no inicio (adianta) seguido
// so de digitos (sem sinal = atrasa), ex: "-500" ou "1200".
export function maskOffsetInput(raw: string): string {
  const negative = raw.trim().startsWith('-')
  const digits = raw.replace(/\D/g, '').slice(0, 6)
  if (!digits) return negative ? '-' : ''
  return (negative ? '-' : '') + digits
}
