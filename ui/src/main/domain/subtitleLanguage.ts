// Regras de dominio: reconhecer legendas em PT-BR e escolher a melhor faixa
// para pre-selecionar. Nenhuma dependencia de I/O.
import type { SubtitleTrack } from '@shared/types'

// Codigos de idioma (ISO 639-1/2/3 e variantes usadas por ferramentas de
// fansub) que identificam portugues do Brasil.
const PT_BR_LANG_CODES = new Set(['por', 'pt', 'ptbr', 'pob', 'ptb'])

// Palavras-chave (ja normalizadas: minusculas, sem acento, sem pontuacao)
// procuradas no nome da faixa para reconhecer legendas em PT-BR.
const PT_BR_NAME_KEYWORDS = [
  'portugues',
  'portuguese',
  'ptbr',
  'pt br',
  'brasil',
  'brazil',
  'brazilian',
  'br'
]

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
}

function normalizeForKeywordMatch(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, ' ').trim()
}

export function isPtBrTrack(language: string, trackName: string): boolean {
  const langNorm = normalize(language).replace(/[^a-z0-9]/g, '')
  if (PT_BR_LANG_CODES.has(langNorm)) return true

  const nameNorm = normalizeForKeywordMatch(trackName)
  if (!nameNorm) return false

  return PT_BR_NAME_KEYWORDS.some((keyword) => {
    const pattern = new RegExp(`\\b${keyword}\\b`)
    return pattern.test(nameNorm)
  })
}

export function pickBestTrackIndex(tracks: SubtitleTrack[]): number {
  if (tracks.length === 0) return -1
  let bestIndex = 0
  let bestScore = -1
  tracks.forEach((track, index) => {
    let score = 0
    if (track.isPtBr) score += 10
    if (track.isAss) score += 1
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}
