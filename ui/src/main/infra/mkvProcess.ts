import { join, parse } from 'path'
import { execFile } from 'child_process'
import type { ChildProcess } from 'child_process'
import { promisify } from 'util'
import type { NamingConfig, SubtitleTrack } from '@shared/types'
import { isPtBrTrack } from '../domain/subtitleLanguage'
import { CancellationToken, OperationAbortedError } from './cancellation'

const execFileAsync = promisify(execFile)

async function runMkvTool(execPath: string, args: string[], token?: CancellationToken): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = execFile(
      execPath,
      args,
      { maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        token?.untrackProcess(child)
        if (!err) {
          resolve()
          return
        }
        if (token?.aborted) {
          reject(new OperationAbortedError())
          return
        }
        const execErr = err as unknown as { code?: number; signal?: string }
        if (execErr.code === 1) {
          resolve()
          return
        }
        reject(
          new Error(
            execErr.signal
              ? `processo encerrado inesperadamente (sinal ${execErr.signal})`
              : stderr?.trim() || stdout?.trim() || 'mkvmerge falhou'
          )
        )
      }
    )
    token?.trackProcess(child)
  })
}

const ASS_CODEC_IDS = new Set(['S_TEXT/ASS', 'S_TEXT/SSA'])
const SUB_EXT_BY_CODEC: Record<string, string> = {
  'S_TEXT/ASS': '.ass',
  'S_TEXT/SSA': '.ssa',
  'S_TEXT/UTF8': '.srt',
  'S_HDMV/PGS': '.sup'
}

interface MkvMergeTrackJson {
  id: number
  type: string
  properties?: {
    codec_id?: string
    language?: string
    language_ietf?: string
    track_name?: string
    number?: number
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
        trackNumber: props.number ?? t.id + 1,
        codecId,
        language,
        trackName,
        isAss: ASS_CODEC_IDS.has(codecId),
        isPtBr: isPtBrTrack(language, trackName),
        isPtBrGuess: false
      }
    })
}

export async function setSubtitleTrackLabel(
  mkvpropeditPath: string,
  videoFile: string,
  trackNumber: number,
  name: string,
  language: string,
  token?: CancellationToken
): Promise<void> {
  await runMkvTool(
    mkvpropeditPath,
    [videoFile, '--edit', `track:@${trackNumber}`, '--set', `name=${name}`, '--set', `language=${language}`],
    token
  )
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

export interface SubtitleAttachment {
  id: number
  fileName: string
  contentType: string
}

export async function probeAttachments(mkvmergePath: string, videoFile: string): Promise<SubtitleAttachment[]> {
  const { stdout } = await execFileAsync(mkvmergePath, ['-J', videoFile], {
    maxBuffer: 32 * 1024 * 1024
  })
  const data = JSON.parse(stdout) as {
    attachments?: { id: number; file_name: string; content_type: string }[]
  }

  return (data.attachments ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    contentType: a.content_type
  }))
}

export interface ExtractedAttachment {
  fileName: string
  contentType: string
  path: string
}

export async function extractAttachments(
  mkvextractPath: string,
  videoFile: string,
  attachments: SubtitleAttachment[],
  outDir: string
): Promise<ExtractedAttachment[]> {
  if (attachments.length === 0) return []

  const withPath = attachments.map((a) => ({ ...a, path: join(outDir, `${a.id}_${a.fileName}`) }))
  const specs = withPath.map((a) => `${a.id}:${a.path}`)
  await execFileAsync(mkvextractPath, ['attachments', videoFile, ...specs], { maxBuffer: 32 * 1024 * 1024 })

  return withPath.map(({ fileName, contentType, path }) => ({ fileName, contentType, path }))
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
  clearDefaultSubtitleTrackIds?: number[],
  attachments?: ExtractedAttachment[],
  removeExtraSubtitles = false,
  token?: CancellationToken
): Promise<void> {
  const args = ['-o', outputFile]
  if (keepAudioTrackIds) {
    args.push('--audio-tracks', keepAudioTrackIds.join(','))
  }
  if (removeExtraSubtitles) {
    args.push('--no-subtitles')
  } else {
    clearDefaultSubtitleTrackIds?.forEach((trackId) => {
      args.push('--default-track-flag', `${trackId}:no`)
    })
  }
  attachments?.forEach((a) => {
    args.push('--attachment-name', a.fileName, '--attachment-mime-type', a.contentType, '--attach-file', a.path)
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

  await runMkvTool(mkvmergePath, args, token)
}

function withOptionalTag(name: string, tagWord?: string): string {
  return tagWord ? `${name} [${tagWord}]` : name
}

export const DEFAULT_RESULT_FOLDER_NAME = 'TS - Result'

export function resolveResultFolder(outputFolder: string, resultFolderName: string): string {
  return join(outputFolder, resultFolderName.trim() || DEFAULT_RESULT_FOLDER_NAME)
}

export function resolveOutputPath(
  destVideo: string,
  outputFolder: string,
  naming: NamingConfig,
  resultFolderName: string
): string {
  const base = withOptionalTag(parse(destVideo).name, naming.tagEnabled ? naming.tagWord.trim() : undefined)
  return join(resolveResultFolder(outputFolder, resultFolderName), `${base}.mkv`)
}

export interface ExternalSubtitleSpec {
  path: string
  language: string
  trackName: string
  offsetMs: number
  clearDefaultTrackIds: number[]
}

export async function cleanTracksInto(
  mkvmergePath: string,
  sourceFile: string,
  outputFile: string,
  keepSubtitleTrackId: number | null,
  keepAudioTrackIds: number[] | undefined,
  syncTrackId: number | null,
  offsetMs: number,
  externalSubtitle: ExternalSubtitleSpec | null,
  token?: CancellationToken
): Promise<void> {
  const args = ['-o', outputFile]
  if (keepAudioTrackIds) {
    args.push('--audio-tracks', keepAudioTrackIds.join(','))
  }
  if (keepSubtitleTrackId !== null) {
    args.push('--subtitle-tracks', String(keepSubtitleTrackId))
  }
  if (externalSubtitle) {
    externalSubtitle.clearDefaultTrackIds.forEach((trackId) => {
      args.push('--default-track-flag', `${trackId}:no`)
    })
  } else if (keepSubtitleTrackId !== null) {
    args.push('--default-track-flag', `${keepSubtitleTrackId}:yes`)
  }
  if (syncTrackId !== null && offsetMs !== 0) {
    args.push('--sync', `${syncTrackId}:${offsetMs}`)
  }
  args.push(sourceFile)

  if (externalSubtitle) {
    args.push('--language', `0:${externalSubtitle.language}`, '--default-track-flag', '0:yes')
    if (externalSubtitle.trackName) {
      args.push('--track-name', `0:${externalSubtitle.trackName}`)
    }
    if (externalSubtitle.offsetMs) {
      args.push('--sync', `0:${externalSubtitle.offsetMs}`)
    }
    args.push(externalSubtitle.path)
  }

  await runMkvTool(mkvmergePath, args, token)
}

export function resolveCleanOutputPath(
  sourceFile: string,
  outputFolder: string,
  naming: NamingConfig,
  resultFolderName: string
): string {
  const base = withOptionalTag(parse(sourceFile).name, naming.tagEnabled ? naming.tagWord.trim() : undefined)
  return join(resolveResultFolder(outputFolder, resultFolderName), `${base}.mkv`)
}

export async function convertToMkv(
  mkvmergePath: string,
  sourceFile: string,
  outputFile: string,
  token?: CancellationToken
): Promise<void> {
  await runMkvTool(mkvmergePath, ['-o', outputFile, sourceFile], token)
}

export function resolveConvertOutputPath(sourceFile: string, outputFolder: string, resultFolderName: string): string {
  return join(resolveResultFolder(outputFolder, resultFolderName), `${parse(sourceFile).name}.mkv`)
}
