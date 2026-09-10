import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { mkdir, mkdtemp, readFile, rm } from 'fs/promises'
import { join, basename, extname, resolve } from 'path'
import { describeEpisodeGaps, episodeKey, findEpisode } from './domain/episodeMatcher'
import {
  guessPtBrFromContent,
  pickBestTrackIndex,
  resolveTransferLanguage,
  resolveTransferTrackName
} from './domain/subtitleLanguage'
import { isEnglishAudio } from './domain/audioLanguage'
import { decodeSubtitleBuffer } from './domain/subtitleEncoding'
import { parsePgsSubtitle } from './domain/pgsSubtitle'
import {
  formatMsAsTimeCode,
  parseFirstEventStartMs,
  parseSubtitleEvents,
  parseTimeCodeToMs
} from './domain/subtitleTiming'
import { listMp4Files, listVideoFiles } from './infra/videoFiles'
import {
  cleanTracksInto,
  convertToMkv,
  extractAttachments,
  extractSubtitle,
  muxSubtitleInto,
  probeAttachments,
  probeAudioTracks,
  probeSubtitleTracks,
  resolveCleanOutputPath,
  resolveConvertOutputPath,
  resolveOutputPath,
  resolveResultFolder,
  setSubtitleTrackLabel,
  subtitleExtension
} from './infra/mkvProcess'
import { appendTransferLog } from './infra/transferLog'
import { CancellationToken, OperationAbortedError } from './infra/cancellation'
import type { ExternalSubtitleSpec } from './infra/mkvProcess'
import type {
  ConvertRow,
  ConvertScanResult,
  EpisodeRow,
  LogEvent,
  NamingConfig,
  RenameSummary,
  RowStatus,
  ScanResult,
  SubtitleEvent,
  SubtitleTrack,
  SyncPrepareResult,
  TransferSummary
} from '@shared/types'
import { EXTERNAL_SUBTITLE_TRACK_ID } from '@shared/types'

type LogFn = (event: LogEvent) => void

function samePath(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase()
}

async function tagPtBrGuesses(
  mkvextractPath: string,
  sourcePath: string,
  tracks: SubtitleTrack[],
  episodeKeyForLog: string,
  onLog: LogFn
): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'transfer-sub-guess-'))
  try {
    for (const track of tracks) {
      const tmpPath = join(tmpDir, `probe${subtitleExtension(track.codecId)}`)
      try {
        await extractSubtitle(mkvextractPath, sourcePath, track.trackId, tmpPath)
        const content = decodeSubtitleBuffer(await readFile(tmpPath))
        if (guessPtBrFromContent(content)) {
          track.isPtBrGuess = true
          onLog({
            level: 'warn',
            message: `[${episodeKeyForLog}] faixa #${track.trackId} esta rotulada como "${track.language}" mas o conteudo parece ser PT-BR - confira antes de transferir`
          })
          break
        }
      } catch {
      }
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

async function buildEpisodeRow(
  mkvmergePath: string,
  mkvextractPath: string,
  key: string,
  sourcePath: string,
  destPath: string,
  onLog: LogFn
): Promise<EpisodeRow> {
  let tracks: SubtitleTrack[]
  try {
    tracks = await probeSubtitleTracks(mkvmergePath, sourcePath)
  } catch (err) {
    onLog({ level: 'error', message: `Falha ao ler faixas de ${basename(sourcePath)}: ${(err as Error).message}` })
    tracks = []
  }

  const assTracks = tracks.filter((t) => t.isAss)
  const usableTracks = assTracks.length > 0 ? assTracks : tracks

  if (usableTracks.length > 0 && !usableTracks.some((t) => t.isPtBr)) {
    await tagPtBrGuesses(mkvextractPath, sourcePath, usableTracks, key, onLog)
  }

  const bestIndex = pickBestTrackIndex(usableTracks)
  const selectedTrackId = bestIndex >= 0 ? usableTracks[bestIndex].trackId : null

  return {
    id: key,
    episodeKey: key,
    sourcePath,
    sourceName: basename(sourcePath),
    destPath,
    destName: basename(destPath),
    tracks: usableTracks,
    selectedTrackId,
    firstLineTargetText: '',
    manualOffsetText: '',
    syncTrackId: null,
    externalSubtitlePath: null
  }
}

export async function scanFolders(
  mkvmergePath: string,
  mkvextractPath: string,
  sourceDir: string,
  destDir: string,
  onLog: LogFn,
  token?: CancellationToken
): Promise<ScanResult> {
  const sourceFiles = listVideoFiles(sourceDir)
  const destFiles = listVideoFiles(destDir)

  const warnings: string[] = []

  if (!existsSync(sourceDir)) {
    warnings.push(`Pasta de origem nao encontrada: ${sourceDir}`)
  } else if (sourceFiles.length === 0) {
    warnings.push(`Nenhum arquivo de video na pasta de origem: ${sourceDir}`)
  }
  if (!existsSync(destDir)) {
    warnings.push(`Pasta de destino nao encontrada: ${destDir}`)
  } else if (destFiles.length === 0) {
    warnings.push(`Nenhum arquivo de video na pasta de destino: ${destDir}`)
  }

  interface Candidate {
    file: string
    season: number | null
  }

  function indexByEpisode(files: string[], side: string): Map<number, Candidate[]> {
    const map = new Map<number, Candidate[]>()
    for (const file of files) {
      const [season, episode] = findEpisode(basename(file))
      if (episode === null) {
        warnings.push(`Nao identifiquei episodio em (${side}): ${basename(file)}`)
        continue
      }
      const list = map.get(episode) ?? []
      list.push({ file, season })
      map.set(episode, list)
    }
    return map
  }

  const sourceByEpisode = indexByEpisode(sourceFiles, 'origem')
  const destByEpisode = indexByEpisode(destFiles, 'destino')

  const sourceGaps = describeEpisodeGaps([...sourceByEpisode.keys()])
  if (sourceGaps) warnings.push(`Pasta de origem: ${sourceGaps}`)
  const destGaps = describeEpisodeGaps([...destByEpisode.keys()])
  if (destGaps) warnings.push(`Pasta de destino: ${destGaps}`)

  function pickPair(sourceCandidates: Candidate[], destCandidates: Candidate[]): [Candidate, Candidate] | null {
    if (sourceCandidates.length === 1 && destCandidates.length === 1) {
      return [sourceCandidates[0], destCandidates[0]]
    }
    for (const s of sourceCandidates) {
      for (const d of destCandidates) {
        if (s.season !== null && s.season === d.season) return [s, d]
      }
    }
    return null
  }

  const episodes = [...sourceByEpisode.keys()].filter((e) => destByEpisode.has(e)).sort((a, b) => a - b)
  const rows: EpisodeRow[] = []
  const matchedSourceFiles = new Set<string>()

  for (const episode of episodes) {
    if (token?.aborted) break

    const pair = pickPair(sourceByEpisode.get(episode)!, destByEpisode.get(episode)!)
    if (!pair) continue
    const [source, dest] = pair
    matchedSourceFiles.add(source.file)
    const sourcePath = source.file
    const destPath = dest.file
    const key = episodeKey(source.season ?? dest.season, episode)!

    rows.push(await buildEpisodeRow(mkvmergePath, mkvextractPath, key, sourcePath, destPath, onLog))
  }

  const unmatchedSource = [...sourceByEpisode.values()]
    .flat()
    .filter((c) => !matchedSourceFiles.has(c.file))
    .map((c) => basename(c.file))

  const aborted = token?.aborted ?? false
  onLog({
    level: 'info',
    message: aborted
      ? `Escaneamento abortado: ${rows.length} episodios casados antes de parar.`
      : `Encontrados ${rows.length} episodios casados.`
  })

  return { rows, warnings, unmatchedSource, aborted }
}

export async function scanMovie(
  mkvmergePath: string,
  mkvextractPath: string,
  sourceFile: string,
  destFile: string,
  onLog: LogFn
): Promise<ScanResult> {
  const key = basename(sourceFile, extname(sourceFile))
  const row = await buildEpisodeRow(mkvmergePath, mkvextractPath, key, sourceFile, destFile, onLog)
  onLog({ level: 'info', message: `Filme pronto para transferir: ${row.sourceName} -> ${row.destName}` })
  return { rows: [row], warnings: [], unmatchedSource: [], aborted: false }
}

export async function scanForClean(
  mkvmergePath: string,
  folder: string,
  onLog: LogFn,
  token?: CancellationToken
): Promise<ScanResult> {
  const files = listVideoFiles(folder)
  const rows: EpisodeRow[] = []
  const warnings: string[] = []

  if (!existsSync(folder)) {
    warnings.push(`Pasta nao encontrada: ${folder}`)
  } else if (files.length === 0) {
    warnings.push(`Nenhum arquivo de video na pasta: ${folder}`)
  }

  const episodeNumbers: number[] = []

  for (const file of files) {
    if (token?.aborted) break

    let tracks: SubtitleTrack[]
    try {
      tracks = await probeSubtitleTracks(mkvmergePath, file)
    } catch (err) {
      onLog({ level: 'error', message: `Falha ao ler faixas de ${basename(file)}: ${(err as Error).message}` })
      tracks = []
    }

    const [season, episode] = findEpisode(basename(file))
    if (episode !== null) episodeNumbers.push(episode)
    const key = episodeKey(season, episode) ?? basename(file)

    rows.push({
      id: file,
      episodeKey: key,
      sourcePath: file,
      sourceName: basename(file),
      destPath: file,
      destName: basename(file),
      tracks,
      selectedTrackId: null,
      firstLineTargetText: '',
      manualOffsetText: '',
      syncTrackId: tracks.find((t) => t.isPtBr)?.trackId ?? tracks.find((t) => t.isPtBrGuess)?.trackId ?? null,
      externalSubtitlePath: null
    })
  }

  const folderGaps = describeEpisodeGaps(episodeNumbers)
  if (folderGaps) warnings.push(`Pasta: ${folderGaps}`)

  const aborted = token?.aborted ?? false
  onLog({
    level: 'info',
    message: aborted
      ? `Escaneamento abortado: ${rows.length} arquivos lidos antes de parar.`
      : `Encontrados ${rows.length} arquivos na pasta.`
  })

  return { rows, warnings, unmatchedSource: [], aborted }
}

async function resolveAudioTrackFilter(
  mkvmergePath: string,
  destPath: string,
  removeEnglishAudio: boolean,
  episodeKeyForLog: string,
  onLog: LogFn
): Promise<number[] | undefined> {
  if (!removeEnglishAudio) return undefined

  let audioTracks
  try {
    audioTracks = await probeAudioTracks(mkvmergePath, destPath)
  } catch (err) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] falha ao ler faixas de audio de ${basename(destPath)}: ${(err as Error).message}`
    })
    return undefined
  }

  const keepIds = audioTracks.filter((t) => !isEnglishAudio(t.language)).map((t) => t.trackId)
  if (keepIds.length === audioTracks.length) return undefined 
  if (keepIds.length === 0) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] todas as faixas de audio sao em ingles - mantendo todas por seguranca`
    })
    return undefined
  }
  return keepIds
}

async function resolveOffsetMs(
  subPath: string,
  extension: string,
  firstLineTargetText: string,
  episodeKeyForLog: string,
  onLog: LogFn
): Promise<number> {
  if (!firstLineTargetText.trim()) return 0

  const targetMs = parseTimeCodeToMs(firstLineTargetText)
  if (targetMs === null) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] tempo "${firstLineTargetText}" invalido (use MM:SS,mmm) - mantendo timing original`
    })
    return 0
  }

  const content = decodeSubtitleBuffer(await readFile(subPath))
  const originalMs = parseFirstEventStartMs(content, extension)
  if (originalMs === null) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] nao encontrei nenhuma legenda no arquivo extraido - mantendo timing original`
    })
    return 0
  }

  const offsetMs = targetMs - originalMs
  onLog({
    level: 'info',
    message: `[${episodeKeyForLog}] primeira legenda original em ${formatMsAsTimeCode(originalMs)}, alvo ${formatMsAsTimeCode(targetMs)} (deslocamento de ${offsetMs}ms)`
  })
  return offsetMs
}

function resolveManualOffsetMs(text: string, episodeKeyForLog: string, onLog: LogFn): number {
  const value = Number(text.trim())
  if (!Number.isFinite(value)) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] deslocamento manual "${text}" invalido - mantendo timing original`
    })
    return 0
  }

  const offsetMs = Math.round(value)
  onLog({
    level: 'info',
    message: `[${episodeKeyForLog}] aplicando deslocamento manual de ${offsetMs}ms`
  })
  return offsetMs
}

export async function transferRows(
  mkvmergePath: string,
  mkvextractPath: string,
  rows: EpisodeRow[],
  outputDir: string,
  removeEnglishAudio: boolean,
  removeExtraSubtitles: boolean,
  onProgress: (rowId: string, status: RowStatus, message?: string) => void,
  onLog: LogFn,
  token: CancellationToken | undefined,
  naming: NamingConfig,
  ptBrTrackName: string,
  resultFolderName: string
): Promise<TransferSummary> {
  let success = 0
  let failed = 0

  await mkdir(resolveResultFolder(outputDir, resultFolderName), { recursive: true })

  for (const row of rows) {
    if (token?.aborted) break

    const track = row.tracks.find((t) => t.trackId === row.selectedTrackId)
    if (!track) {
      onProgress(row.id, 'error', 'Nenhuma faixa selecionada')
      failed += 1
      continue
    }

    onProgress(row.id, 'extracting')
    onLog({ level: 'info', message: `[${row.episodeKey}] extraindo faixa ${track.trackId} de ${row.sourceName}` })

    const tmpDir = await mkdtemp(join(tmpdir(), 'transfer-sub-'))
    const outputFile = resolveOutputPath(row.destPath, outputDir, naming, resultFolderName)
    if (samePath(outputFile, row.destPath)) {
      failed += 1
      onProgress(row.id, 'error', 'Pasta de saida igual a de destino geraria o mesmo nome de arquivo')
      onLog({
        level: 'error',
        message: `[${row.episodeKey}] pasta de saida resultaria no mesmo arquivo do destino (${basename(outputFile)}) - escolha uma pasta de saida diferente`
      })
      await rm(tmpDir, { recursive: true, force: true })
      continue
    }
    try {
      const extension = subtitleExtension(track.codecId)
      const subPath = join(tmpDir, `sub${extension}`)
      await extractSubtitle(mkvextractPath, row.sourcePath, track.trackId, subPath)

      let attachments: Awaited<ReturnType<typeof extractAttachments>> = []
      try {
        const sourceAttachments = await probeAttachments(mkvmergePath, row.sourcePath)
        attachments = await extractAttachments(mkvextractPath, row.sourcePath, sourceAttachments, tmpDir)
      } catch (err) {
        onLog({
          level: 'warn',
          message: `[${row.episodeKey}] falha ao copiar fontes anexadas: ${(err as Error).message}`
        })
      }

      const offsetMs = row.manualOffsetText.trim()
        ? resolveManualOffsetMs(row.manualOffsetText, row.episodeKey, onLog)
        : await resolveOffsetMs(subPath, extension, row.firstLineTargetText, row.episodeKey, onLog)

      const keepAudioTrackIds = await resolveAudioTrackFilter(
        mkvmergePath,
        row.destPath,
        removeEnglishAudio,
        row.episodeKey,
        onLog
      )

      let destSubtitleTrackIds: number[] = []
      if (!removeExtraSubtitles) {
        try {
          destSubtitleTrackIds = (await probeSubtitleTracks(mkvmergePath, row.destPath)).map((t) => t.trackId)
        } catch {
          destSubtitleTrackIds = []
        }
      }

      onProgress(row.id, 'muxing')
      const overwriteInfo = existsSync(outputFile) ? ' (sobrescrevendo arquivo existente)' : ''
      const audioInfo = keepAudioTrackIds ? ' (removendo audio em ingles)' : ''
      const fontsInfo = attachments.length > 0 ? ` (com ${attachments.length} fonte(s) anexada(s))` : ''
      const subsInfo = removeExtraSubtitles ? ' (removendo legendas extras do destino)' : ''
      onLog({
        level: 'info',
        message: `[${row.episodeKey}] gerando ${basename(outputFile)}${overwriteInfo}${audioInfo}${fontsInfo}${subsInfo}`
      })

      await muxSubtitleInto(
        mkvmergePath,
        row.destPath,
        subPath,
        outputFile,
        resolveTransferLanguage(track),
        resolveTransferTrackName(track, ptBrTrackName),
        offsetMs,
        keepAudioTrackIds,
        destSubtitleTrackIds,
        attachments,
        removeExtraSubtitles,
        token
      )

      onProgress(row.id, 'done')
      success += 1
      onLog({ level: 'success', message: `[${row.episodeKey}] concluido: ${basename(outputFile)}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'transfer',
        episodeKey: row.episodeKey,
        sourceFile: row.sourcePath,
        destFile: row.destPath,
        outputFile,
        trackId: track.trackId,
        language: track.language,
        trackName: track.trackName,
        firstLineTargetText: row.firstLineTargetText,
        appliedOffsetMs: offsetMs,
        status: 'done'
      })
    } catch (err) {
      if (err instanceof OperationAbortedError) {
        await rm(outputFile, { force: true }).catch(() => {})
        onProgress(row.id, 'idle')
        onLog({ level: 'warn', message: `[${row.episodeKey}] abortado pelo usuario` })
        break
      }
      failed += 1
      const message = (err as Error).message
      onProgress(row.id, 'error', message)
      onLog({ level: 'error', message: `[${row.episodeKey}] ERRO: ${message}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'transfer',
        episodeKey: row.episodeKey,
        sourceFile: row.sourcePath,
        destFile: row.destPath,
        outputFile,
        trackId: track.trackId,
        language: track.language,
        trackName: track.trackName,
        firstLineTargetText: row.firstLineTargetText,
        appliedOffsetMs: null,
        status: 'error',
        error: message
      })
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }

  const aborted = token?.aborted ?? false
  const total = rows.length
  onLog({
    level: aborted ? 'warn' : failed ? 'warn' : 'success',
    message: aborted
      ? `Transferencia abortada: ${success}/${total} processados antes de parar${failed ? `, ${failed} com erro` : ''}.`
      : `Transferencia concluida: ${success}/${total} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total, success, failed, aborted }
}

export async function cleanRows(
  mkvmergePath: string,
  mkvextractPath: string,
  rows: EpisodeRow[],
  outputDir: string,
  removeEnglishAudio: boolean,
  onProgress: (rowId: string, status: RowStatus, message?: string) => void,
  onLog: LogFn,
  token: CancellationToken | undefined,
  naming: NamingConfig,
  ptBrTrackName: string,
  resultFolderName: string
): Promise<TransferSummary> {
  let success = 0
  let failed = 0

  await mkdir(resolveResultFolder(outputDir, resultFolderName), { recursive: true })

  for (const row of rows) {
    if (token?.aborted) break

    const outputFile = resolveCleanOutputPath(row.destPath, outputDir, naming, resultFolderName)
    if (samePath(outputFile, row.destPath)) {
      failed += 1
      onProgress(row.id, 'error', 'Pasta de saida igual a de destino geraria o mesmo nome de arquivo')
      onLog({
        level: 'error',
        message: `[${row.episodeKey}] pasta de saida resultaria no mesmo arquivo do destino (${basename(outputFile)}) - escolha uma pasta de saida diferente`
      })
      continue
    }
    onProgress(row.id, 'muxing')

    try {
      const keepAudioTrackIds = await resolveAudioTrackFilter(
        mkvmergePath,
        row.destPath,
        removeEnglishAudio,
        row.episodeKey,
        onLog
      )

      const usingExternalSync = row.syncTrackId === EXTERNAL_SUBTITLE_TRACK_ID && row.externalSubtitlePath !== null
      const syncTrack = !usingExternalSync ? row.tracks.find((t) => t.trackId === row.syncTrackId) : undefined
      let offsetMs = 0
      if (usingExternalSync || syncTrack) {
        if (row.manualOffsetText.trim()) {
          offsetMs = resolveManualOffsetMs(row.manualOffsetText, row.episodeKey, onLog)
        } else if (row.firstLineTargetText.trim()) {
          if (usingExternalSync) {
            offsetMs = await resolveOffsetMs(
              row.externalSubtitlePath!,
              extname(row.externalSubtitlePath!),
              row.firstLineTargetText,
              row.episodeKey,
              onLog
            )
          } else if (syncTrack) {
            const tmpDir = await mkdtemp(join(tmpdir(), 'transfer-sub-sync-'))
            try {
              const extension = subtitleExtension(syncTrack.codecId)
              const subPath = join(tmpDir, `sync${extension}`)
              await extractSubtitle(mkvextractPath, row.destPath, syncTrack.trackId, subPath)
              offsetMs = await resolveOffsetMs(subPath, extension, row.firstLineTargetText, row.episodeKey, onLog)
            } finally {
              await rm(tmpDir, { recursive: true, force: true })
            }
          }
        }
      }

      const externalSubtitle: ExternalSubtitleSpec | null = row.externalSubtitlePath
        ? {
            path: row.externalSubtitlePath,
            language: 'por',
            trackName: ptBrTrackName,
            offsetMs: usingExternalSync ? offsetMs : 0,
            clearDefaultTrackIds:
              row.selectedTrackId !== null ? [row.selectedTrackId] : row.tracks.map((t) => t.trackId)
          }
        : null

      const overwriteInfo = existsSync(outputFile) ? ' (sobrescrevendo arquivo existente)' : ''
      const audioInfo = keepAudioTrackIds ? ' (removendo audio em ingles)' : ''
      const subInfo =
        row.selectedTrackId !== null ? ` (mantendo somente legenda #${row.selectedTrackId})` : ''
      const externalInfo = row.externalSubtitlePath ? ' (adicionando legenda externa)' : ''
      const syncInfo =
        offsetMs !== 0
          ? ` (sincronizando ${usingExternalSync ? 'legenda externa' : `faixa #${syncTrack?.trackId}`} em ${offsetMs}ms)`
          : ''
      onLog({
        level: 'info',
        message: `[${row.episodeKey}] gerando ${basename(outputFile)}${overwriteInfo}${audioInfo}${subInfo}${externalInfo}${syncInfo}`
      })

      await cleanTracksInto(
        mkvmergePath,
        row.destPath,
        outputFile,
        row.selectedTrackId,
        keepAudioTrackIds,
        usingExternalSync ? null : (syncTrack?.trackId ?? null),
        usingExternalSync ? 0 : offsetMs,
        externalSubtitle,
        token
      )

      onProgress(row.id, 'done')
      success += 1
      onLog({ level: 'success', message: `[${row.episodeKey}] concluido: ${basename(outputFile)}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'clean',
        episodeKey: row.episodeKey,
        sourceFile: row.sourcePath,
        destFile: row.destPath,
        outputFile,
        trackId: row.selectedTrackId,
        language: null,
        trackName: null,
        firstLineTargetText: row.firstLineTargetText,
        appliedOffsetMs: offsetMs || null,
        status: 'done'
      })
    } catch (err) {
      if (err instanceof OperationAbortedError) {
        await rm(outputFile, { force: true }).catch(() => {})
        onProgress(row.id, 'idle')
        onLog({ level: 'warn', message: `[${row.episodeKey}] abortado pelo usuario` })
        break
      }
      failed += 1
      const message = (err as Error).message
      onProgress(row.id, 'error', message)
      onLog({ level: 'error', message: `[${row.episodeKey}] ERRO: ${message}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'clean',
        episodeKey: row.episodeKey,
        sourceFile: row.sourcePath,
        destFile: row.destPath,
        outputFile,
        trackId: row.selectedTrackId,
        language: null,
        trackName: null,
        firstLineTargetText: '',
        appliedOffsetMs: null,
        status: 'error',
        error: message
      })
    }
  }

  const aborted = token?.aborted ?? false
  const total = rows.length
  onLog({
    level: aborted ? 'warn' : failed ? 'warn' : 'success',
    message: aborted
      ? `Processamento abortado: ${success}/${total} processados antes de parar${failed ? `, ${failed} com erro` : ''}.`
      : `Processamento concluido: ${success}/${total} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total, success, failed, aborted }
}

export async function scanForConvert(folder: string, onLog: LogFn): Promise<ConvertScanResult> {
  const files = listMp4Files(folder)
  const warnings: string[] = []

  if (!existsSync(folder)) {
    warnings.push(`Pasta nao encontrada: ${folder}`)
  } else if (files.length === 0) {
    warnings.push(`Nenhum arquivo .mp4 na pasta: ${folder}`)
  }

  const rows: ConvertRow[] = files.map((file) => ({
    id: file,
    sourcePath: file,
    sourceName: basename(file)
  }))

  onLog({ level: 'info', message: `Encontrados ${rows.length} arquivo(s) .mp4 na pasta.` })

  return { rows, warnings }
}

export async function convertRows(
  mkvmergePath: string,
  rows: ConvertRow[],
  outputDir: string,
  onProgress: (rowId: string, status: RowStatus, message?: string) => void,
  onLog: LogFn,
  token: CancellationToken | undefined,
  resultFolderName: string
): Promise<TransferSummary> {
  let success = 0
  let failed = 0

  await mkdir(resolveResultFolder(outputDir, resultFolderName), { recursive: true })

  for (const row of rows) {
    if (token?.aborted) break

    const outputFile = resolveConvertOutputPath(row.sourcePath, outputDir, resultFolderName)
    if (samePath(outputFile, row.sourcePath)) {
      failed += 1
      onProgress(row.id, 'error', 'Pasta de saida igual a de origem geraria o mesmo arquivo')
      onLog({
        level: 'error',
        message: `[${row.sourceName}] pasta de saida resultaria no mesmo arquivo de origem (${basename(outputFile)}) - escolha uma pasta de saida diferente`
      })
      continue
    }

    onProgress(row.id, 'muxing')
    const overwriteInfo = existsSync(outputFile) ? ' (sobrescrevendo arquivo existente)' : ''
    onLog({
      level: 'info',
      message: `[${row.sourceName}] convertendo para ${basename(outputFile)}${overwriteInfo}`
    })

    try {
      await convertToMkv(mkvmergePath, row.sourcePath, outputFile, token)

      onProgress(row.id, 'done')
      success += 1
      onLog({ level: 'success', message: `[${row.sourceName}] concluido: ${basename(outputFile)}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'convert',
        episodeKey: row.sourceName,
        sourceFile: row.sourcePath,
        destFile: row.sourcePath,
        outputFile,
        trackId: null,
        language: null,
        trackName: null,
        firstLineTargetText: '',
        appliedOffsetMs: null,
        status: 'done'
      })
    } catch (err) {
      if (err instanceof OperationAbortedError) {
        await rm(outputFile, { force: true }).catch(() => {})
        onProgress(row.id, 'idle')
        onLog({ level: 'warn', message: `[${row.sourceName}] abortado pelo usuario` })
        break
      }
      failed += 1
      const message = (err as Error).message
      onProgress(row.id, 'error', message)
      onLog({ level: 'error', message: `[${row.sourceName}] ERRO: ${message}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'convert',
        episodeKey: row.sourceName,
        sourceFile: row.sourcePath,
        destFile: row.sourcePath,
        outputFile,
        trackId: null,
        language: null,
        trackName: null,
        firstLineTargetText: '',
        appliedOffsetMs: null,
        status: 'error',
        error: message
      })
    }
  }

  const aborted = token?.aborted ?? false
  const total = rows.length
  onLog({
    level: aborted ? 'warn' : failed ? 'warn' : 'success',
    message: aborted
      ? `Conversao abortada: ${success}/${total} processados antes de parar${failed ? `, ${failed} com erro` : ''}.`
      : `Conversao concluida: ${success}/${total} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total, success, failed, aborted }
}

async function extractSubtitleEvents(
  mkvextractPath: string,
  filePath: string,
  track: SubtitleTrack
): Promise<SubtitleEvent[]> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'transfer-sub-events-'))
  try {
    const extension = subtitleExtension(track.codecId)
    const tmpPath = join(tmpDir, `evt${extension}`)
    await extractSubtitle(mkvextractPath, filePath, track.trackId, tmpPath)
    if (track.codecId === 'S_HDMV/PGS') {
      return parsePgsSubtitle(await readFile(tmpPath))
    }
    const content = decodeSubtitleBuffer(await readFile(tmpPath))
    return parseSubtitleEvents(content, extension)
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

export async function prepareSync(
  mkvmergePath: string,
  mkvextractPath: string,
  sourcePath: string,
  sourceTrackId: number,
  destPath: string,
  preferredEnTrackId: number | null
): Promise<SyncPrepareResult> {
  const [ptEvents, destResult] = await Promise.all([
    (async () => {
      const sourceTracks = await probeSubtitleTracks(mkvmergePath, sourcePath)
      const ptTrack = sourceTracks.find((t) => t.trackId === sourceTrackId)
      return ptTrack ? extractSubtitleEvents(mkvextractPath, sourcePath, ptTrack) : []
    })(),
    (async () => {
      const destTracks = await probeSubtitleTracks(mkvmergePath, destPath)
      const suggested = destTracks.find((t) => isEnglishAudio(t.language))
      const chosen =
        preferredEnTrackId !== null && destTracks.some((t) => t.trackId === preferredEnTrackId)
          ? destTracks.find((t) => t.trackId === preferredEnTrackId)!
          : suggested
      const enEvents = chosen ? await extractSubtitleEvents(mkvextractPath, destPath, chosen) : []
      return {
        destTracks,
        suggestedEnTrackId: suggested?.trackId ?? null,
        chosenEnTrackId: chosen?.trackId ?? null,
        enEvents
      }
    })()
  ])

  return { ptEvents, ...destResult }
}

export async function getTrackEvents(
  mkvmergePath: string,
  mkvextractPath: string,
  filePath: string,
  trackId: number
): Promise<SubtitleEvent[]> {
  const tracks = await probeSubtitleTracks(mkvmergePath, filePath)
  const track = tracks.find((t) => t.trackId === trackId)
  return track ? extractSubtitleEvents(mkvextractPath, filePath, track) : []
}

export async function getExternalSubtitleEvents(filePath: string): Promise<SubtitleEvent[]> {
  const content = decodeSubtitleBuffer(await readFile(filePath))
  return parseSubtitleEvents(content, extname(filePath))
}

export async function renameSubtitleTracks(
  mkvmergePath: string,
  mkvextractPath: string,
  mkvpropeditPath: string,
  paths: string[],
  ptBrTrackName: string,
  onLog: LogFn,
  token?: CancellationToken
): Promise<RenameSummary> {
  let success = 0
  let failed = 0
  const total = paths.length

  for (const filePath of paths) {
    if (token?.aborted) break
    const label = basename(filePath)

    let tracks: SubtitleTrack[]
    try {
      tracks = await probeSubtitleTracks(mkvmergePath, filePath)
    } catch (err) {
      failed += 1
      onLog({ level: 'error', message: `${label}: falha ao ler faixas (${(err as Error).message})` })
      continue
    }

    const assTracks = tracks.filter((t) => t.isAss)
    const usableTracks = assTracks.length > 0 ? assTracks : tracks
    if (usableTracks.length > 0 && !usableTracks.some((t) => t.isPtBr)) {
      await tagPtBrGuesses(mkvextractPath, filePath, usableTracks, label, onLog)
    }

    const ptTrack = usableTracks.find((t) => t.isPtBr || t.isPtBrGuess)
    if (!ptTrack) {
      onLog({ level: 'warn', message: `${label}: nenhuma faixa em PT-BR encontrada, pulado` })
      continue
    }

    if (ptTrack.trackName === ptBrTrackName && ptTrack.isPtBr) {
      onLog({ level: 'info', message: `${label}: faixa ja rotulada como "${ptBrTrackName}", nada a fazer` })
      continue
    }

    try {
      await setSubtitleTrackLabel(mkvpropeditPath, filePath, ptTrack.trackNumber, ptBrTrackName, 'por', token)
      success += 1
      onLog({
        level: 'success',
        message: `${label}: faixa #${ptTrack.trackId} rotulada como "${ptBrTrackName}" (por)`
      })
    } catch (err) {
      if (err instanceof OperationAbortedError) throw err
      failed += 1
      onLog({ level: 'error', message: `${label}: falha ao rotular a faixa (${(err as Error).message})` })
    }
  }

  onLog({
    level: failed ? 'warn' : 'success',
    message: `Rotulagem de faixas concluida: ${success}/${total} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total, success, failed }
}
