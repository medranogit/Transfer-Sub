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

// Numero isolado - nem colado a outro digito NEM a uma letra (\w cobre os
// dois). So checar "nao colado a outro digito" deixava passar coisas como
// "Top3" (titulo de episodio terminando em numero): o "3" ali nao tem digito
// vizinho, mas tem a letra "p" colada antes - nao e um numero de episodio,
// e o antigo regex pegava ele por engano quando aparecia depois do numero
// real (ex: "Blue Lock - 013 - Top3" virava episodio 3 em vez de 13, porque
// o fallback usa o ULTIMO numero isolado que encontrar).
const FALLBACK_NUMBER = /(?<!\w)(\d{1,3})(?!\w)/g

export interface EpisodeMatch {
  season: number | null
  episode: number
  // Posicao do match dentro do nome (sem extensao) - usado pelo Renomeador
  // pra cortar o nome do anime antes da marcacao de episodio. So disponivel
  // quando um dos EPISODE_PATTERNS bateu direto (nao no fallback - ai a
  // string usada pra achar o numero ja foi limpa de ruido e as posicoes nao
  // batem mais com o nome original).
  matchStart: number
  matchEnd: number
}

function matchEpisodePatterns(name: string): EpisodeMatch | null {
  for (const pattern of EPISODE_PATTERNS) {
    const match = pattern.exec(name)
    if (match) {
      const season = match.length === 3 ? parseInt(match[1], 10) : null
      const episode = match.length === 3 ? parseInt(match[2], 10) : parseInt(match[1], 10)
      return { season, episode, matchStart: match.index, matchEnd: match.index + match[0].length }
    }
  }
  return null
}

// Igual findEpisode, mas devolve tambem onde o episodio foi encontrado no
// nome - null quando so o fallback (ultimo numero isolado) identificou algo.
export function findEpisodeMatch(filename: string): EpisodeMatch | null {
  return matchEpisodePatterns(parse(filename).name)
}

export function findEpisode(filename: string): [number | null, number | null] {
  const name = parse(filename).name

  const match = matchEpisodePatterns(name)
  if (match) return [match.season, match.episode]

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
