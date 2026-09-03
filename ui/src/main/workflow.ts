import { tmpdir } from 'os'
import { mkdtemp, rm } from 'fs/promises'
import { join, basename } from 'path'
import { episodeKey, findEpisode } from './domain/episodeMatcher'
import { pickBestTrackIndex } from './domain/subtitleLanguage'
import { listVideoFiles } from './infra/videoFiles'
import { extractSubtitle, muxSubtitleInto, probeSubtitleTracks, subtitleExtension, uniqueOutputPath } from './infra/mkvProcess'
import type { EpisodeRow, LogEvent, RowStatus, ScanResult, SubtitleTrack, TransferSummary } from '@shared/types'

type LogFn = (event: LogEvent) => void

export async function scanFolders(
  mkvmergePath: string,
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
      selectedTrackId
    })
  }

  const unmatchedSource = [...sourceByKey.keys()]
    .filter((k) => !destByKey.has(k))
    .map((k) => basename(sourceByKey.get(k)!))

  onLog({ level: 'info', message: `Encontrados ${rows.length} episodios casados.` })

  return { rows, warnings, unmatchedSource }
}

export async function transferRows(
  mkvmergePath: string,
  mkvextractPath: string,
  rows: EpisodeRow[],
  outputDir: string,
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
    try {
      const subPath = join(tmpDir, `sub${subtitleExtension(track.codecId)}`)
      await extractSubtitle(mkvextractPath, row.sourcePath, track.trackId, subPath)

      const outputFile = uniqueOutputPath(row.destPath, outputDir)
      onProgress(row.id, 'muxing')
      onLog({ level: 'info', message: `[${row.episodeKey}] gerando ${basename(outputFile)}` })

      await muxSubtitleInto(mkvmergePath, row.destPath, subPath, outputFile, track.language, track.trackName)

      onProgress(row.id, 'done')
      success += 1
    } catch (err) {
      failed += 1
      onProgress(row.id, 'error', (err as Error).message)
      onLog({ level: 'error', message: `[${row.episodeKey}] ERRO: ${(err as Error).message}` })
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }

  const total = rows.length
  onLog({
    level: 'info',
    message: `Transferencia concluida: ${success}/${total} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total, success, failed }
}
