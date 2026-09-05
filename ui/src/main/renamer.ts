// Caso de uso do Renomeador: pre-visualizar e aplicar a renomeacao em lote
// dos videos de uma pasta, a partir dos 3 campos (ver domain/renamePattern.ts).
import { existsSync } from 'fs'
import { basename, dirname, join } from 'path'
import { buildRenamedName } from './domain/renamePattern'
import { renameFile } from './infra/fileRename'
import { listVideoFiles } from './infra/videoFiles'
import type { LogEvent, RenameFields, RenamePreviewRow, RenameSummary } from '@shared/types'

type LogFn = (event: LogEvent) => void

export function previewRename(folder: string, fields: RenameFields): RenamePreviewRow[] {
  const rows: RenamePreviewRow[] = listVideoFiles(folder).map((path) => {
    const originalName = basename(path)
    const { name, reason } = buildRenamedName(originalName, fields)
    return { id: path, originalPath: path, originalName, newName: name, skipReason: reason }
  })

  // Dois arquivos gerando o mesmo novo nome corromperia um dos dois (a
  // renomeacao do segundo sobrescreveria o primeiro) - marca ambos como
  // conflito em vez de aplicar.
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
    } catch (err) {
      failed += 1
      onLog({ level: 'error', message: `${row.originalName}: ${(err as Error).message}` })
    }
  }

  onLog({
    level: failed ? 'warn' : 'success',
    message: `Renomeacao concluida: ${success}/${rows.filter((r) => r.newName).length} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total: rows.filter((r) => r.newName).length, success, failed }
}
