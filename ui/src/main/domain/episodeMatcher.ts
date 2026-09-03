// Regras de dominio: identificar (temporada, episodio) a partir de um nome
// de arquivo. Nenhuma dependencia de I/O — puramente funcoes de texto.
import { parse } from 'path'

const NOISE_TOKENS =
  /\[[0-9A-Fa-f]{8}\]|\b\d{3,4}x\d{3,4}\b|\b(2160|1080|720|480|360)p?\b|\b[xh]\.?26[45]\b|\bhevc\b|\bavc\b|\b(flac|aac|ac3|dts|opus)\b|\b(bdrip|bd|webrip|web-?dl|remux|hdtv)\b|\b\d{1,2}bit\b|\b(dual|multi)[\s._-]?audio\b/gi

const EPISODE_PATTERNS: RegExp[] = [
  /[Ss](\d{1,2})[Ee](\d{1,3})/, // S01E05
  /\b(\d{1,2})[xX](\d{1,3})\b/, // 1x05
  /\bEp(?:isod[ei]o?|isode)?\.?\s*(\d{1,3})\b/i, // Episodio 05 / Ep 05
  /\bE(\d{1,3})\b/ // E05
]

const FALLBACK_NUMBER = /(?<!\d)(\d{1,3})(?!\d)/g

export function findEpisode(filename: string): [number | null, number | null] {
  const name = parse(filename).name

  for (const pattern of EPISODE_PATTERNS) {
    const match = name.match(pattern)
    if (match) {
      if (match.length === 3) {
        return [parseInt(match[1], 10), parseInt(match[2], 10)]
      }
      return [null, parseInt(match[1], 10)]
    }
  }

  // fallback: remove ruido conhecido (resolucao, codec, crc...) e pega o
  // ultimo numero isolado que sobrar - comum em releases de anime.
  const cleaned = name.replace(NOISE_TOKENS, ' ')
  const numbers = [...cleaned.matchAll(FALLBACK_NUMBER)].map((m) => parseInt(m[1], 10))
  if (numbers.length > 0) {
    return [null, numbers[numbers.length - 1]]
  }

  return [null, null]
}

export function episodeKey(season: number | null, episode: number | null): string | null {
  if (episode === null) return null
  if (season !== null) return `S${String(season).padStart(2, '0')}E${String(episode).padStart(3, '0')}`
  return `E${String(episode).padStart(3, '0')}`
}
