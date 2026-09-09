import { parse } from 'path'

const NOISE_TOKENS =
  /\[[0-9A-Fa-f]{8}\]|\b\d{3,4}x\d{3,4}\b|\b(2160|1080|720|480|360)p?\b|\b[xh]\.?26[45]\b|\bhevc\b|\bavc\b|\b(flac|aac|ac3|dts|opus)\b|\b(bdrip|bd|webrip|web-?dl|remux|hdtv)\b|\b\d{1,2}bit\b|\b(dual|multi)[\s._-]?audio\b/gi

const EPISODE_PATTERNS: RegExp[] = [
  /[Ss](\d{1,2})[Ee](\d{1,3})/, 
  /\b(\d{1,2})[xX](\d{1,3})\b/, 
  /\bEp(?:isod[ei]o?|isode)?\.?\s*(\d{1,3})\b/i, 
  /\bE(\d{1,3})\b/ 
]

const FALLBACK_NUMBER = /(?<!\w)(\d{1,3})(?!\w)/g

const NON_EPISODE_TOKENS =
  /\b(nced|ncop|opening|ending|creditless|special|specials|ova|oad|pv|trailer|teaser)\b/i

export interface EpisodeMatch {
  season: number | null
  episode: number
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

function stripNoise(name: string): string {
  return name.replace(NOISE_TOKENS, (token) => ' '.repeat(token.length))
}

function matchFallbackNumber(name: string): EpisodeMatch | null {
  const cleaned = stripNoise(name)
  const matches = [...cleaned.matchAll(FALLBACK_NUMBER)]
  if (matches.length === 0) return null

  const last = matches[matches.length - 1]
  return { season: null, episode: parseInt(last[1], 10), matchStart: last.index!, matchEnd: last.index! + last[0].length }
}

function normalizeSeparators(name: string): string {
  return name.replace(/_/g, ' ')
}

function matchEpisode(name: string): EpisodeMatch | null {
  const normalized = normalizeSeparators(name)
  if (NON_EPISODE_TOKENS.test(normalized)) return null
  return matchEpisodePatterns(normalized) ?? matchFallbackNumber(normalized)
}

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

export function findEpisodeGaps(episodes: number[]): number[] {
  const unique = [...new Set(episodes)].sort((a, b) => a - b)
  if (unique.length < 2) return []
  const present = new Set(unique)
  const gaps: number[] = []
  for (let e = unique[0]; e <= unique[unique.length - 1]; e++) {
    if (!present.has(e)) gaps.push(e)
  }
  return gaps
}

export function describeEpisodeGaps(episodes: number[]): string | null {
  const gaps = findEpisodeGaps(episodes)
  if (gaps.length === 0) return null
  const unique = [...new Set(episodes)].sort((a, b) => a - b)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `possivel episodio faltando entre ${pad(unique[0])} e ${pad(unique[unique.length - 1])}: ${gaps.map(pad).join(', ')}`
}
