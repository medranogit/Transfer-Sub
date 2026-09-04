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
    if (track.isPtBrGuess) score += 5
    if (track.isAss) score += 1
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

// Palavras bem caracteristicas do portugues (ja sem acento, pra comparar
// com o texto normalizado) - usadas so como ultimo recurso, quando nenhuma
// faixa foi reconhecida por idioma/nome. Fansubs as vezes rotulam a faixa
// com o idioma errado (ex: uma faixa "italiano" que na verdade e PT-BR).
// Ficam de fora palavras identicas ou quase identicas em espanhol/italiano
// (ex: "aqui", "nunca", "sempre", "quando", "vamos", "esta") - testado
// contra faixas reais em ingles/alemao/espanhol/frances/italiano para
// garantir que nao dao falso positivo.
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

// Terminacao "-cao"/"-coes" (de "-ção"/"-ções", apos remover acento) e
// quase exclusiva do portugues entre as linguas latinas - espanhol usa
// "-cion", italiano "-zione", frances "-tion". Conta em dobro por ser um
// sinal bem mais forte que uma palavra isolada.
const PT_SUFFIX_PATTERN = /\w+c(ao|oes)\b/g

// Remove tags de formatacao do ASS/SSA ({\...}) e quebras de linha (\N)
// pra nao poluir a contagem de palavras com codigo de estilo.
function stripSubtitleMarkup(content: string): string {
  return content.replace(/\{[^}]*\}/g, ' ').replace(/\\[Nn]/g, ' ')
}

// Heuristica rapida, nao uma deteccao de idioma de verdade: conta quantas
// vezes palavras/padroes bem tipicos do portugues aparecem no texto da
// legenda. So e chamada como fallback (ver workflow.ts), entao um falso
// positivo ocasional so gera um aviso a mais pro usuario conferir - nao
// trava nada.
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
