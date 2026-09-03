// Infraestrutura: chamadas de processo ao mkvmerge/mkvextract (probe,
// extracao e remux). Depende do dominio apenas para classificar cada
// faixa encontrada (isAss / isPtBr).
import { existsSync } from 'fs'
import { join, parse } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SubtitleTrack } from '@shared/types'
import { isPtBrTrack } from '../domain/subtitleLanguage'

const execFileAsync = promisify(execFile)

const ASS_CODEC_IDS = new Set(['S_TEXT/ASS', 'S_TEXT/SSA'])
const SUB_EXT_BY_CODEC: Record<string, string> = {
  'S_TEXT/ASS': '.ass',
  'S_TEXT/SSA': '.ssa',
  'S_TEXT/UTF8': '.srt'
}

interface MkvMergeTrackJson {
  id: number
  type: string
  properties?: {
    codec_id?: string
    language?: string
    language_ietf?: string
    track_name?: string
  }
}

export async function probeSubtitleTracks(mkvmergePath: string, videoFile: string): Promise<SubtitleTrack[]> {
  const { stdout } = await execFileAsync(mkvmergePath, ['-J', videoFile], {
    maxBuffer: 32 * 1024 * 1024
  })
  const data = JSON.parse(stdout) as { tracks: MkvMergeTrackJson[] }

  return data.tracks
    .filter((t) => t.type === 'subtitles')
    .map((t) => {
      const props = t.properties ?? {}
      const codecId = props.codec_id ?? ''
      const language = props.language_ietf || props.language || 'und'
      const trackName = props.track_name ?? ''
      return {
        trackId: t.id,
        codecId,
        language,
        trackName,
        isAss: ASS_CODEC_IDS.has(codecId),
        isPtBr: isPtBrTrack(language, trackName)
      }
    })
}

export function subtitleExtension(codecId: string): string {
  return SUB_EXT_BY_CODEC[codecId] ?? '.sub'
}

export async function extractSubtitle(
  mkvextractPath: string,
  videoFile: string,
  trackId: number,
  outPath: string
): Promise<void> {
  await execFileAsync(mkvextractPath, ['tracks', videoFile, `${trackId}:${outPath}`], {
    maxBuffer: 32 * 1024 * 1024
  })
}

export async function muxSubtitleInto(
  mkvmergePath: string,
  destVideo: string,
  subtitleFile: string,
  outputFile: string,
  language = 'und',
  trackName = ''
): Promise<void> {
  const args = [
    '-o',
    outputFile,
    destVideo,
    '--language',
    `0:${language}`,
    '--default-track-flag',
    '0:no'
  ]
  if (trackName) {
    args.push('--track-name', `0:${trackName}`)
  }
  args.push(subtitleFile)

  try {
    await execFileAsync(mkvmergePath, args, { maxBuffer: 32 * 1024 * 1024 })
  } catch (err) {
    const execErr = err as { code?: number; stderr?: string; stdout?: string }
    // mkvmerge usa codigo 1 para "concluido com avisos" - so 2+ e erro real.
    if (execErr.code && execErr.code >= 2) {
      throw new Error(execErr.stderr?.trim() || execErr.stdout?.trim() || 'mkvmerge falhou')
    }
  }
}

export function uniqueOutputPath(destVideo: string, outputFolder: string): string {
  const base = parse(destVideo).name + ' [legendado]'
  let candidate = join(outputFolder, `${base}.mkv`)
  let counter = 1
  while (existsSync(candidate)) {
    candidate = join(outputFolder, `${base} (${counter}).mkv`)
    counter += 1
  }
  return candidate
}
