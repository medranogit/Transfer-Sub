import { parse } from 'path'
import { findEpisode, findEpisodeMatch } from './episodeMatcher'
import type { DetectedRenameFields, RenameFields } from '@shared/types'

export interface RenameResult {
  name: string | null
  reason: string | null
}

const FANSUB_TAG = /^\[([^\]]+)\]/

function cleanDetectedText(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^-+\s*|\s*-+$/g, '')
    .trim()
}

export function formatSeasonEpisode(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}

export function buildRenamedName(originalFileName: string, fields: RenameFields): RenameResult {
  const fansub = fields.fansub.trim()
  const ext = parse(originalFileName).ext

  if (fields.movieMode) {
    const namePart = [fansub ? `[${fansub}]` : '', fields.animeName.trim()]
      .filter((part) => part.length > 0)
      .join(' ')
    const newBase = [namePart, fields.tags.trim()].filter((part) => part.length > 0).join(' - ')
    if (!newBase) return { name: null, reason: 'preencha ao menos o nome do filme' }
    return { name: `${newBase}${ext}`, reason: null }
  }

  const [, episode] = findEpisode(originalFileName)
  if (episode === null) return { name: null, reason: 'episodio nao detectado no nome original' }

  const seasonEpisode = formatSeasonEpisode(fields.season, episode)
  const middle = [fields.animeName.trim(), seasonEpisode].filter((part) => part.length > 0).join(' - ')
  const namePart = [fansub ? `[${fansub}]` : '', middle].filter((part) => part.length > 0).join(' ')
  const newBase = [namePart, fields.tags.trim()].filter((part) => part.length > 0).join(' - ')

  return { name: `${newBase}${ext}`, reason: null }
}

export function detectRenameFields(originalFileName: string): DetectedRenameFields {
  const name = parse(originalFileName).name

  const fansubMatch = name.match(FANSUB_TAG)
  const fansub = fansubMatch ? fansubMatch[1].trim() : ''
  const afterFansub = fansubMatch ? name.slice(fansubMatch[0].length) : name
  const fansubLen = fansubMatch ? fansubMatch[0].length : 0

  const episodeMatch = findEpisodeMatch(originalFileName)
  const season = episodeMatch?.season ?? 1

  let animeName = ''
  let tags = ''
  if (episodeMatch) {
    const cutPoint = episodeMatch.matchStart - fansubLen
    animeName = cleanDetectedText(afterFansub.slice(0, Math.max(0, cutPoint)))

    const tagsStart = episodeMatch.matchEnd - fansubLen
    tags = cleanDetectedText(afterFansub.slice(Math.max(0, tagsStart)))
  }

  return { fansub, animeName, season, tags }
}
