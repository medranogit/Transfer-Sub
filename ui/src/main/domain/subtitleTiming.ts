import type { SubtitleEvent, SyncMode, SyncPoint } from '@shared/types'
import { stripSubtitleMarkup } from './subtitleLanguage'

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

export function formatEventTime(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const sign = ms < 0 ? '-' : ''
  return `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatMsToAssTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms))
  const cs = Math.floor((clamped % 1000) / 10)
  const totalSeconds = Math.floor(clamped / 1000)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function parseAssTimeToMs(timeStr: string): number | null {
  const match = timeStr.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2,3})$/)
  if (!match) return null
  const [, h, m, s, cs] = match
  const csMs = cs.length === 2 ? parseInt(cs, 10) * 10 : parseInt(cs.slice(0, 3).padEnd(3, '0'), 10)
  return (parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10)) * 1000 + csMs
}

export function formatMsToSrtTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms))
  const millis = clamped % 1000
  const totalSeconds = Math.floor(clamped / 1000)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

export function parseSrtTimeToMs(timeStr: string): number | null {
  const match = timeStr.trim().match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/)
  if (!match) return null
  const [, h, m, s, ms] = match
  return (parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10)) * 1000 + parseInt(ms, 10)
}

export function calculateOffsetForTime(
  timeMs: number,
  points: SyncPoint[],
  mode: SyncMode
): number {
  if (points.length === 0) return 0
  if (points.length === 1) return points[0].offsetMs

  const sorted = [...points].sort((a, b) => a.sourceMs - b.sourceMs)

  if (mode === 'step') {
    if (timeMs < sorted[0].sourceMs) {
      return sorted[0].offsetMs
    }
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (timeMs >= sorted[i].sourceMs) {
        return sorted[i].offsetMs
      }
    }
    return sorted[0].offsetMs
  } else {
    if (timeMs <= sorted[0].sourceMs) {
      return sorted[0].offsetMs
    }
    if (timeMs >= sorted[sorted.length - 1].sourceMs) {
      return sorted[sorted.length - 1].offsetMs
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      const p1 = sorted[i]
      const p2 = sorted[i + 1]
      if (timeMs >= p1.sourceMs && timeMs <= p2.sourceMs) {
        const span = p2.sourceMs - p1.sourceMs
        if (span <= 0) return p1.offsetMs
        const factor = (timeMs - p1.sourceMs) / span
        return Math.round(p1.offsetMs + factor * (p2.offsetMs - p1.offsetMs))
      }
    }
    return sorted[sorted.length - 1].offsetMs
  }
}

export function adjustAssSubtitleContent(
  content: string,
  points: SyncPoint[],
  mode: SyncMode
): string {
  if (points.length === 0) return content

  const lines = content.split(/\r?\n/)
  const isCrlf = content.includes('\r\n')
  const newline = isCrlf ? '\r\n' : '\n'

  const adjustedLines = lines.map((line) => {
    const match = line.match(/^((?:Dialogue|Comment):\s*)(.*)$/)
    if (!match) return line

    const prefix = match[1]
    const rest = match[2]
    const fields = splitAssFields(rest)
    if (fields.length < 10) return line

    const startMs = parseAssTimeToMs(fields[1])
    const endMs = parseAssTimeToMs(fields[2])
    if (startMs === null || endMs === null) return line

    const offset = calculateOffsetForTime(startMs, points, mode)
    const newStart = formatMsToAssTime(startMs + offset)
    const newEnd = formatMsToAssTime(endMs + offset)

    fields[1] = newStart
    fields[2] = newEnd

    return `${prefix}${fields.join(',')}`
  })

  return adjustedLines.join(newline)
}

export function adjustSrtSubtitleContent(
  content: string,
  points: SyncPoint[],
  mode: SyncMode
): string {
  if (points.length === 0) return content

  return content.replace(
    /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/g,
    (match, startStr, endStr) => {
      const startMs = parseSrtTimeToMs(startStr)
      const endMs = parseSrtTimeToMs(endStr)
      if (startMs === null || endMs === null) return match

      const offset = calculateOffsetForTime(startMs, points, mode)
      const newStart = formatMsToSrtTime(startMs + offset)
      const newEnd = formatMsToSrtTime(endMs + offset)
      return `${newStart} --> ${newEnd}`
    }
  )
}

export function adjustSubtitleContent(
  content: string,
  extension: string,
  points: SyncPoint[],
  mode: SyncMode
): string {
  if (extension.toLowerCase() === '.srt') {
    return adjustSrtSubtitleContent(content, points, mode)
  }
  return adjustAssSubtitleContent(content, points, mode)
}

const ASS_DIALOGUE_START = /^Dialogue:\s*\d+,(\d+):(\d{2}):(\d{2})\.(\d{2})/gm
const SRT_TIMESTAMP = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/g

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

const SRT_BLOCK_TIMESTAMP = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/

function parseSrtEvents(content: string): SubtitleEvent[] {
  const events: SubtitleEvent[] = []
  for (const block of content.split(/\r?\n\r?\n+/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== '')
    const timeLineIndex = lines.findIndex((l) => SRT_BLOCK_TIMESTAMP.test(l))
    if (timeLineIndex === -1) continue

    const match = lines[timeLineIndex].match(SRT_BLOCK_TIMESTAMP)!
    const [, h, m, s, ms] = match
    const startMs = (parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10)) * 1000 + parseInt(ms, 10)
    const text = lines
      .slice(timeLineIndex + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) events.push({ startMs, text })
  }
  return events
}

function splitAssFields(rest: string): string[] {
  const parts: string[] = []
  let idx = 0
  for (let i = 0; i < 9; i++) {
    const commaIdx = rest.indexOf(',', idx)
    if (commaIdx === -1) return []
    parts.push(rest.slice(idx, commaIdx))
    idx = commaIdx + 1
  }
  parts.push(rest.slice(idx))
  return parts
}

const ASS_DIALOGUE_LINE = /^Dialogue:\s*(.*)$/gm
const ASS_START_PATTERN = /^(\d+):(\d{2}):(\d{2})\.(\d{2})$/

function parseAssEvents(content: string): SubtitleEvent[] {
  const events: SubtitleEvent[] = []
  for (const match of content.matchAll(ASS_DIALOGUE_LINE)) {
    const fields = splitAssFields(match[1])
    if (fields.length < 10) continue

    const startMatch = fields[1].trim().match(ASS_START_PATTERN)
    if (!startMatch) continue

    const [, h, m, s, cs] = startMatch
    const startMs = (parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10)) * 1000 + parseInt(cs, 10) * 10
    const text = stripSubtitleMarkup(fields[9]).replace(/\s+/g, ' ').trim()
    if (text) events.push({ startMs, text })
  }
  return events
}

export function parseSubtitleEvents(content: string, extension: string): SubtitleEvent[] {
  const events = extension === '.srt' ? parseSrtEvents(content) : parseAssEvents(content)
  return events.sort((a, b) => a.startMs - b.startMs)
}
