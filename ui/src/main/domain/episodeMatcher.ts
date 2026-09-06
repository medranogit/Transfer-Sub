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

// Arquivos de abertura/encerramento/extras tem um numero no nome (ex:
// "Opening 2.mkv", "NCED 1.mkv") que o fallback acima confundiria com numero
// de episodio - colidindo com o episodio real de mesmo numero (ex: episodio
// 02 e "Ending 2" cairiam no mesmo balde em scanFolders, quebrando o
// pareamento 1-para-1 quando a temporada nao e detectavel dos dois lados).
// Tratados como "sem episodio identificado" em vez de participar do
// pareamento por numero.
const NON_EPISODE_TOKENS =
  /\b(nced|ncop|opening|ending|creditless|special|specials|ova|oad|pv|trailer|teaser)\b/i

export interface EpisodeMatch {
  season: number | null
  episode: number
  // Posicao do match dentro do nome (sem extensao) - usado pelo Renomeador
  // pra cortar o nome do anime antes da marcacao de episodio. Disponivel
  // tanto quando um EPISODE_PATTERNS bateu direto quanto no fallback (ver
  // stripNoise abaixo pra como isso fica confiavel nos dois casos).
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

// Troca cada trecho de ruido (resolucao, codec, crc...) por espacos do MESMO
// tamanho, em vez de colapsar tudo num unico espaco - assim qualquer numero
// que sobrar depois da limpeza mantem a mesma posicao que tinha no nome
// ORIGINAL, permitindo ao fallback abaixo tambem reportar matchStart/matchEnd
// utilizavel (antes so os EPISODE_PATTERNS tinham posicao confiavel).
function stripNoise(name: string): string {
  return name.replace(NOISE_TOKENS, (token) => ' '.repeat(token.length))
}

// Fallback: pega o ULTIMO numero isolado (nem colado a outro digito nem a
// uma letra) que sobrar depois de limpar ruido conhecido - comum em releases
// de anime que numeram o episodio sem nenhuma marcacao tipo "E01" (ex:
// "Erased - 01.mkv").
function matchFallbackNumber(name: string): EpisodeMatch | null {
  const cleaned = stripNoise(name)
  const matches = [...cleaned.matchAll(FALLBACK_NUMBER)]
  if (matches.length === 0) return null

  const last = matches[matches.length - 1]
  return { season: null, episode: parseInt(last[1], 10), matchStart: last.index!, matchEnd: last.index! + last[0].length }
}

// Tenta os EPISODE_PATTERNS primeiro (mais especificos, tem temporada); so
// cai no fallback quando nenhum bate.
function matchEpisode(name: string): EpisodeMatch | null {
  if (NON_EPISODE_TOKENS.test(name)) return null
  return matchEpisodePatterns(name) ?? matchFallbackNumber(name)
}

// Igual findEpisode, mas devolve tambem onde o episodio foi encontrado no
// nome - usado pelo Renomeador pra cortar o nome do anime antes dessa marcacao.
export function findEpisodeMatch(filename: string): EpisodeMatch | null {
  return matchEpisode(parse(filename).name)
}

export function findEpisode(filename: string): [number | null, number | null] {
  const match = matchEpisode(parse(filename).name)
  return match ? [match.season, match.episode] : [null, null]
}

export function episodeKey(season: number | null, episode: number | null): string | null {
  if (episode === null) return null
  if (season !== null) return `S${String(season).padStart(2, '0')}E${String(episode).padStart(3, '0')}`
  return `E${String(episode).padStart(3, '0')}`
}
