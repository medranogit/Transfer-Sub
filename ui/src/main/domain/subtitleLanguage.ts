import type { SubtitleTrack } from '@shared/types'

const PT_BR_LANG_CODES = new Set(['por', 'pt', 'ptbr', 'pob', 'ptb'])

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
    .replace(/[̀-ͯ]/g, '') 
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

export const DEFAULT_PT_BR_TRANSFER_TRACK_NAME = 'TS Portugues BR'

export function resolveTransferTrackName(track: SubtitleTrack, ptBrTrackName: string): string {
  return track.isPtBr || track.isPtBrGuess ? ptBrTrackName : track.trackName
}

export function resolveTransferLanguage(track: SubtitleTrack): string {
  return track.isPtBr || track.isPtBrGuess ? 'por' : track.language
}

export function pickBestTrackIndex(tracks: SubtitleTrack[]): number {
  if (tracks.length === 0) return -1
  let bestIndex = 0
  let bestScore = -1
  tracks.forEach((track, index) => {
    let score = 0
    if (track.isPtBr) score += 10
    if (track.isPtBrGuess) score += 5
    if (track.isAss) score += 1
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

const PT_CONTENT_WORDS = [
  'nao',
  'voce',
  'tambem',
  'entao',
  'isso',
  'muito',
  'coisa',
  'porem',
  'onde',
  'obrigad',
  'estao',
  'eles',
  'elas',
  'olhos',
  'mesmo',
  'ainda',
  'depois',
  'agora',
  'ficar',
  'ficou'
]

const PT_SUFFIX_PATTERN = /\w+c(ao|oes)\b/g

export function stripSubtitleMarkup(content: string): string {
  return content.replace(/\{[^}]*\}/g, ' ').replace(/\\[Nn]/g, ' ')
}

export function guessPtBrFromContent(content: string): boolean {
  const text = normalize(stripSubtitleMarkup(content))
  if (text.length < 200) return false

  const wordMatches = PT_CONTENT_WORDS.reduce((count, word) => {
    const pattern = new RegExp(`\\b${word}\\w*`, 'g')
    return count + (text.match(pattern)?.length ?? 0)
  }, 0)
  const suffixMatches = (text.match(PT_SUFFIX_PATTERN) ?? []).length

  return wordMatches + suffixMatches * 2 >= 6
}
