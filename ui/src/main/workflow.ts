import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { join, basename } from 'path'
import { episodeKey, findEpisode } from './domain/episodeMatcher'
import {
  guessPtBrFromContent,
  pickBestTrackIndex,
  resolveTransferLanguage,
  resolveTransferTrackName
} from './domain/subtitleLanguage'
import { isEnglishAudio } from './domain/audioLanguage'
import { formatMsAsTimeCode, parseFirstEventStartMs, parseTimeCodeToMs } from './domain/subtitleTiming'
import { listVideoFiles } from './infra/videoFiles'
import {
  cleanTracksInto,
  extractAttachments,
  extractSubtitle,
  muxSubtitleInto,
  probeAttachments,
  probeAudioTracks,
  probeSubtitleTracks,
  resolveCleanOutputPath,
  resolveOutputPath,
  subtitleExtension
} from './infra/mkvProcess'
import { appendTransferLog } from './infra/transferLog'
import type { EpisodeRow, LogEvent, RowStatus, ScanResult, SubtitleTrack, TransferSummary } from '@shared/types'

type LogFn = (event: LogEvent) => void

// Quando nenhuma faixa foi reconhecida como PT-BR por idioma/nome, tenta
// como ultimo recurso extrair cada faixa e olhar o proprio texto - fansubs
// as vezes rotulam a faixa com o idioma errado. Para no primeiro palpite
// positivo para nao gastar tempo extraindo faixas a mais.
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
        const content = await readFile(tmpPath, 'utf-8')
        if (guessPtBrFromContent(content)) {
          track.isPtBrGuess = true
          onLog({
            level: 'warn',
            message: `[${episodeKeyForLog}] faixa #${track.trackId} esta rotulada como "${track.language}" mas o conteudo parece ser PT-BR - confira antes de transferir`
          })
          break
        }
      } catch {
        // faixa nao pode ser extraida/lida - ignora e tenta a proxima
      }
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

export async function scanFolders(
  mkvmergePath: string,
  mkvextractPath: string,
  sourceDir: string,
  destDir: string,
  onLog: LogFn
): Promise<ScanResult> {
  const sourceFiles = listVideoFiles(sourceDir)
  const destFiles = listVideoFiles(destDir)

  const sourceByKey = new Map<string, string>()
  const warnings: string[] = []

  for (const file of sourceFiles) {
    const [season, episode] = findEpisode(basename(file))
    const key = episodeKey(season, episode)
    if (key) {
      if (!sourceByKey.has(key)) sourceByKey.set(key, file)
    } else {
      warnings.push(`Nao identifiquei episodio em (origem): ${basename(file)}`)
    }
  }

  const destByKey = new Map<string, string>()
  for (const file of destFiles) {
    const [season, episode] = findEpisode(basename(file))
    const key = episodeKey(season, episode)
    if (key) {
      if (!destByKey.has(key)) destByKey.set(key, file)
    } else {
      warnings.push(`Nao identifiquei episodio em (destino): ${basename(file)}`)
    }
  }

  const commonKeys = [...sourceByKey.keys()].filter((k) => destByKey.has(k)).sort()
  const rows: EpisodeRow[] = []

  for (const key of commonKeys) {
    const sourcePath = sourceByKey.get(key)!
    const destPath = destByKey.get(key)!

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

    rows.push({
      id: key,
      episodeKey: key,
      sourcePath,
      sourceName: basename(sourcePath),
      destPath,
      destName: basename(destPath),
      tracks: usableTracks,
      selectedTrackId,
      firstLineTargetText: ''
    })
  }

  const unmatchedSource = [...sourceByKey.keys()]
    .filter((k) => !destByKey.has(k))
    .map((k) => basename(sourceByKey.get(k)!))

  onLog({ level: 'info', message: `Encontrados ${rows.length} episodios casados.` })

  return { rows, warnings, unmatchedSource }
}

// Modo "apenas limpar": nao ha par origem/destino, cada arquivo da pasta
// informada e tratado sozinho (sourcePath === destPath). O dropdown de
// legenda usa as proprias faixas do arquivo; selectedTrackId comeca em
// null (mantem todas as legendas) - o usuario escolhe manualmente qual
// faixa manter quando quiser remover as demais.
export async function scanForClean(mkvmergePath: string, folder: string, onLog: LogFn): Promise<ScanResult> {
  const files = listVideoFiles(folder)
  const rows: EpisodeRow[] = []
  const warnings: string[] = []

  for (const file of files) {
    let tracks: SubtitleTrack[]
    try {
      tracks = await probeSubtitleTracks(mkvmergePath, file)
    } catch (err) {
      onLog({ level: 'error', message: `Falha ao ler faixas de ${basename(file)}: ${(err as Error).message}` })
      tracks = []
    }

    const [season, episode] = findEpisode(basename(file))
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
      firstLineTargetText: ''
    })
  }

  onLog({ level: 'info', message: `Encontrados ${rows.length} arquivos na pasta.` })

  return { rows, warnings, unmatchedSource: [] }
}

// Se removeEnglishAudio estiver ligado, devolve a lista de IDs de faixas de
// audio a manter (todas menos as em ingles). Retorna undefined quando nao ha
// nada a filtrar (recurso desligado, sem faixas em ingles, ou remover as
// faixas em ingles deixaria o arquivo sem nenhum audio) - nesses casos o
// mkvmerge mantem todas as faixas de audio originais.
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
  if (keepIds.length === audioTracks.length) return undefined // nenhuma faixa em ingles encontrada
  if (keepIds.length === 0) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] todas as faixas de audio sao em ingles - mantendo todas por seguranca`
    })
    return undefined
  }
  return keepIds
}

// Calcula o deslocamento (ms) a aplicar via --sync, comparando o instante
// da primeira legenda extraida com o instante desejado (row.firstLineTargetText).
// Retorna 0 quando nao ha alvo definido ou quando algo nao pode ser
// interpretado (formato invalido, arquivo sem nenhum evento) - nesses casos
// a legenda mantem o timing original, sem travar a transferencia.
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

  const content = await readFile(subPath, 'utf-8')
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

export async function transferRows(
  mkvmergePath: string,
  mkvextractPath: string,
  rows: EpisodeRow[],
  outputDir: string,
  removeEnglishAudio: boolean,
  removeExtraSubtitles: boolean,
  onProgress: (rowId: string, status: RowStatus, message?: string) => void,
  onLog: LogFn
): Promise<TransferSummary> {
  let success = 0
  let failed = 0

  for (const row of rows) {
    const track = row.tracks.find((t) => t.trackId === row.selectedTrackId)
    if (!track) {
      onProgress(row.id, 'error', 'Nenhuma faixa selecionada')
      failed += 1
      continue
    }

    onProgress(row.id, 'extracting')
    onLog({ level: 'info', message: `[${row.episodeKey}] extraindo faixa ${track.trackId} de ${row.sourceName}` })

    const tmpDir = await mkdtemp(join(tmpdir(), 'transfer-sub-'))
    const outputFile = resolveOutputPath(row.destPath, outputDir)
    try {
      const extension = subtitleExtension(track.codecId)
      const subPath = join(tmpDir, `sub${extension}`)
      await extractSubtitle(mkvextractPath, row.sourcePath, track.trackId, subPath)

      // Legendas ASS costumam depender de fontes customizadas anexadas ao
      // mkv de origem - sem levar essas fontes junto, a legenda transferida
      // perde a formatacao (o player cai pra uma fonte generica).
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

      const offsetMs = await resolveOffsetMs(subPath, extension, row.firstLineTargetText, row.episodeKey, onLog)

      const keepAudioTrackIds = await resolveAudioTrackFilter(
        mkvmergePath,
        row.destPath,
        removeEnglishAudio,
        row.episodeKey,
        onLog
      )

      // Legendas que ja existem no destino (ex: signs/songs de um raw) nao
      // podem continuar marcadas como padrao, senao o arquivo final fica
      // com duas faixas de legenda "padrao" ao mesmo tempo. So precisa
      // disso quando elas vao ser mantidas - se removeExtraSubtitles esta
      // ligado, elas nem entram no arquivo final.
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
        resolveTransferTrackName(track),
        offsetMs,
        keepAudioTrackIds,
        destSubtitleTrackIds,
        attachments,
        removeExtraSubtitles
      )

      onProgress(row.id, 'done')
      success += 1
      onLog({ level: 'success', message: `[${row.episodeKey}] concluido: ${basename(outputFile)}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
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
      failed += 1
      const message = (err as Error).message
      onProgress(row.id, 'error', message)
      onLog({ level: 'error', message: `[${row.episodeKey}] ERRO: ${message}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
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

  const total = rows.length
  onLog({
    level: failed ? 'warn' : 'success',
    message: `Transferencia concluida: ${success}/${total} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total, success, failed }
}

// Modo "apenas limpar": remuxa cada arquivo (row.destPath) filtrando faixas -
// mantem so a legenda escolhida (ou todas, se null) e, opcionalmente, remove
// audio em ingles. Sem extracao/adicao de legenda externa.
export async function cleanRows(
  mkvmergePath: string,
  rows: EpisodeRow[],
  outputDir: string,
  removeEnglishAudio: boolean,
  onProgress: (rowId: string, status: RowStatus, message?: string) => void,
  onLog: LogFn
): Promise<TransferSummary> {
  let success = 0
  let failed = 0

  for (const row of rows) {
    const outputFile = resolveCleanOutputPath(row.destPath, outputDir)
    onProgress(row.id, 'muxing')

    try {
      const keepAudioTrackIds = await resolveAudioTrackFilter(
        mkvmergePath,
        row.destPath,
        removeEnglishAudio,
        row.episodeKey,
        onLog
      )

      const overwriteInfo = existsSync(outputFile) ? ' (sobrescrevendo arquivo existente)' : ''
      const audioInfo = keepAudioTrackIds ? ' (removendo audio em ingles)' : ''
      const subInfo =
        row.selectedTrackId !== null ? ` (mantendo somente legenda #${row.selectedTrackId})` : ''
      onLog({
        level: 'info',
        message: `[${row.episodeKey}] gerando ${basename(outputFile)}${overwriteInfo}${audioInfo}${subInfo}`
      })

      await cleanTracksInto(mkvmergePath, row.destPath, outputFile, row.selectedTrackId, keepAudioTrackIds)

      onProgress(row.id, 'done')
      success += 1
      onLog({ level: 'success', message: `[${row.episodeKey}] concluido: ${basename(outputFile)}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        episodeKey: row.episodeKey,
        sourceFile: row.sourcePath,
        destFile: row.destPath,
        outputFile,
        trackId: row.selectedTrackId,
        language: null,
        trackName: null,
        firstLineTargetText: '',
        appliedOffsetMs: null,
        status: 'done'
      })
    } catch (err) {
      failed += 1
      const message = (err as Error).message
      onProgress(row.id, 'error', message)
      onLog({ level: 'error', message: `[${row.episodeKey}] ERRO: ${message}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
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

  const total = rows.length
  onLog({
    level: failed ? 'warn' : 'success',
    message: `Limpeza concluida: ${success}/${total} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total, success, failed }
}
