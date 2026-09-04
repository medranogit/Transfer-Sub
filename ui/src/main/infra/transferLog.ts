// Infraestrutura: log em JSON de cada transferencia, gravado dentro do
// projeto (mesma pasta do README/package.json), nao na pasta de destino
// escolhida pelo usuario - entradas acumuladas entre execucoes.
import { app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export interface TransferLogEntry {
  timestamp: string
  episodeKey: string
  sourceFile: string
  destFile: string
  outputFile: string
  trackId: number | null
  language: string | null
  trackName: string | null
  firstLineTargetText: string
  appliedOffsetMs: number | null
  status: 'done' | 'error'
  error?: string
}

const LOG_FILE_NAME = 'transfer-log.json'

// Em desenvolvimento, app.getAppPath() aponta para a raiz do projeto (onde
// ficam package.json e README.md). Empacotado, essa pasta vira o .asar
// (somente leitura), entao usamos a pasta do executavel instalado.
function logPath(): string {
  const dir = app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
  return join(dir, LOG_FILE_NAME)
}

async function readLog(): Promise<TransferLogEntry[]> {
  try {
    const raw = await readFile(logPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function appendTransferLog(entry: TransferLogEntry): Promise<void> {
  const entries = await readLog()
  entries.push(entry)
  await writeFile(logPath(), JSON.stringify(entries, null, 2), 'utf-8')
}
