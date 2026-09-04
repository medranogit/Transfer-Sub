// Infraestrutura: chamadas de processo ao mkvmerge/mkvextract (probe,
// extracao e remux). Depende do dominio apenas para classificar cada
// faixa encontrada (isAss / isPtBr).
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

export interface AudioTrack {
  trackId: number
  language: string
}

export async function probeAudioTracks(mkvmergePath: string, videoFile: string): Promise<AudioTrack[]> {
  const { stdout } = await execFileAsync(mkvmergePath, ['-J', videoFile], {
    maxBuffer: 32 * 1024 * 1024
  })
  const data = JSON.parse(stdout) as { tracks: MkvMergeTrackJson[] }

  return data.tracks
    .filter((t) => t.type === 'audio')
    .map((t) => ({
      trackId: t.id,
      language: t.properties?.language_ietf || t.properties?.language || 'und'
    }))
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
  trackName = '',
  offsetMs = 0,
  keepAudioTrackIds?: number[],
  clearDefaultSubtitleTrackIds?: number[]
): Promise<void> {
  const args = ['-o', outputFile]
  if (keepAudioTrackIds) {
    args.push('--audio-tracks', keepAudioTrackIds.join(','))
  }
  // Zera a flag "padrao" de legendas ja existentes no destino, para a
  // legenda transferida ser a unica marcada como padrao no arquivo final.
  clearDefaultSubtitleTrackIds?.forEach((trackId) => {
    args.push('--default-track-flag', `${trackId}:no`)
  })
  args.push(
    destVideo,
    '--language',
    `0:${language}`,
    '--default-track-flag',
    '0:yes'
  )
  if (trackName) {
    args.push('--track-name', `0:${trackName}`)
  }
  if (offsetMs) {
    args.push('--sync', `0:${offsetMs}`)
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

// Nome fixo por episodio (sem sufixo de contador): se ja existir um arquivo
// com esse nome na pasta de saida, o mkvmerge sobrescreve - nao criamos
// duplicados "(1)", "(2)", etc.
export function resolveOutputPath(destVideo: string, outputFolder: string): string {
  const base = parse(destVideo).name + ' [legendado]'
  return join(outputFolder, `${base}.mkv`)
}

// Remuxa o proprio arquivo filtrando faixas: mantem so a legenda escolhida
// (null = mantem todas) e, opcionalmente, so as faixas de audio indicadas.
// Nao extrai/adiciona nada - e so uma remuxagem com filtro (modo "limpar").
export async function cleanTracksInto(
  mkvmergePath: string,
  sourceFile: string,
  outputFile: string,
  keepSubtitleTrackId: number | null,
  keepAudioTrackIds?: number[]
): Promise<void> {
  const args = ['-o', outputFile]
  if (keepAudioTrackIds) {
    args.push('--audio-tracks', keepAudioTrackIds.join(','))
  }
  if (keepSubtitleTrackId !== null) {
    args.push('--subtitle-tracks', String(keepSubtitleTrackId))
    args.push('--default-track-flag', `${keepSubtitleTrackId}:yes`)
  }
  args.push(sourceFile)

  try {
    await execFileAsync(mkvmergePath, args, { maxBuffer: 32 * 1024 * 1024 })
  } catch (err) {
    const execErr = err as { code?: number; stderr?: string; stdout?: string }
    if (execErr.code && execErr.code >= 2) {
      throw new Error(execErr.stderr?.trim() || execErr.stdout?.trim() || 'mkvmerge falhou')
    }
  }
}

// Mesmo esquema de nome fixo (sobrescreve por nome) do resolveOutputPath,
// mas com sufixo proprio para nao colidir com o modo transferencia.
export function resolveCleanOutputPath(sourceFile: string, outputFolder: string): string {
  const base = parse(sourceFile).name + ' [limpo]'
  return join(outputFolder, `${base}.mkv`)
}
