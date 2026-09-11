import { existsSync } from 'fs'
import { basename, dirname, join } from 'path'
import { describeEpisodeGaps, findEpisode } from './domain/episodeMatcher'
import { buildRenamedName, detectRenameFields, formatSeasonEpisode } from './domain/renamePattern'
import { renameFile } from './infra/fileRename'
import { appendTransferLog } from './infra/transferLog'
import { listVideoFiles } from './infra/videoFiles'
import type { LogEvent, RenameFields, RenamePreviewResult, RenamePreviewRow, RenameSummary } from '@shared/types'

type LogFn = (event: LogEvent) => void

function buildPreviewRows(paths: string[], fields: RenameFields): RenamePreviewRow[] {
  const rows: RenamePreviewRow[] = paths.map((path) => {
    const originalName = basename(path)
    const { name, reason } = buildRenamedName(originalName, fields)
    let episodeKey: string | null = null
    if (!fields.movieMode) {
      const [, episode] = findEpisode(originalName)
      episodeKey = episode === null ? null : formatSeasonEpisode(fields.season, episode)
    }
    return { id: path, originalPath: path, originalName, newName: name, skipReason: reason, episodeKey }
  })

  const countByNewName = new Map<string, number>()
  rows.forEach((row) => {
    if (!row.newName) return
    countByNewName.set(row.newName, (countByNewName.get(row.newName) ?? 0) + 1)
  })

  return rows.map((row) => {
    if (row.newName && (countByNewName.get(row.newName) ?? 0) > 1) {
      return { ...row, newName: null, skipReason: 'conflito: mesmo novo nome que outro arquivo desta pasta' }
    }
    return row
  })
}

export function previewRename(folder: string, fields: RenameFields): RenamePreviewResult {
  const paths = listVideoFiles(folder)

  const detected = paths.length > 0 ? detectRenameFields(basename(paths[0])) : null
  const effectiveFields = detected
    ? {
        ...fields,
        fansub: detected.fansub,
        animeName: detected.animeName,
        season: detected.season,
        source: detected.source,
        codec: detected.codec,
        resolution: detected.resolution
      }
    : fields

  const rows = buildPreviewRows(paths, effectiveFields)

  const warnings: string[] = []
  if (!effectiveFields.movieMode) {
    const episodeNumbers = paths
      .map((p) => findEpisode(basename(p))[1])
      .filter((e): e is number => e !== null)
    const gaps = describeEpisodeGaps(episodeNumbers)
    if (gaps) warnings.push(`Pasta: ${gaps}`)
  }

  return { rows, detected, warnings }
}

export function recomputeRename(paths: string[], fields: RenameFields): RenamePreviewRow[] {
  return buildPreviewRows(paths, fields)
}

export async function applyRename(rows: RenamePreviewRow[], onLog: LogFn): Promise<RenameSummary> {
  let success = 0
  let failed = 0

  for (const row of rows) {
    if (!row.newName) continue

    const newPath = join(dirname(row.originalPath), row.newName)

    if (newPath === row.originalPath) {
      onLog({ level: 'info', message: `${row.originalName}: ja esta no formato certo, nada a fazer` })
      continue
    }
    if (existsSync(newPath)) {
      failed += 1
      onLog({ level: 'error', message: `${row.originalName}: ja existe um arquivo chamado ${row.newName}` })
      continue
    }

    try {
      await renameFile(row.originalPath, newPath)
      success += 1
      onLog({ level: 'success', message: `${row.originalName} -> ${row.newName}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'rename',
        episodeKey: row.episodeKey ?? row.originalName,
        sourceFile: row.originalPath,
        destFile: row.originalPath,
        outputFile: newPath,
        trackId: null,
        language: null,
        trackName: null,
        firstLineTargetText: '',
        appliedOffsetMs: null,
        status: 'done'
      })
    } catch (err) {
      failed += 1
      const message = (err as Error).message
      onLog({ level: 'error', message: `${row.originalName}: ${message}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'rename',
        episodeKey: row.episodeKey ?? row.originalName,
        sourceFile: row.originalPath,
        destFile: row.originalPath,
        outputFile: newPath,
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

  onLog({
    level: failed ? 'warn' : 'success',
    message: `Renomeacao concluida: ${success}/${rows.filter((r) => r.newName).length} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total: rows.filter((r) => r.newName).length, success, failed }
}
