import type { EpisodeRow, SubtitleTrack } from '@shared/types'

export function trackLabel(track: SubtitleTrack): string {
  const name = track.trackName ? ` "${track.trackName}"` : ''
  return `#${track.trackId} [${track.language}]${name}`
}

const TEXT_SUBTITLE_CODECS = new Set(['S_TEXT/ASS', 'S_TEXT/SSA', 'S_TEXT/UTF8'])

export function isTextSubtitleCodec(codecId: string): boolean {
  return TEXT_SUBTITLE_CODECS.has(codecId)
}

const IMAGE_SYNC_CODECS = new Set(['S_HDMV/PGS'])

export function canSyncTrack(codecId: string): boolean {
  return isTextSubtitleCodec(codecId) || IMAGE_SYNC_CODECS.has(codecId)
}

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

export function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 7)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)},${digits.slice(4)}`
}

export function maskOffsetInput(raw: string): string {
  const negative = raw.trim().startsWith('-')
  const digits = raw.replace(/\D/g, '').slice(0, 6)
  if (!digits) return negative ? '-' : ''
  return (negative ? '-' : '') + digits
}
